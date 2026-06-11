-- Teacher result page must show the teacher's current PKPD view even when the
-- Fix Postgres' 100-argument function call limit in the source-backed fallback
-- summary by building the JSON payload in smaller jsonb_build_object chunks.

create or replace function public.get_my_latest_pkpd_result()
returns table (
  visibility_enabled boolean,
  disabled_reason text,
  cycle_id text,
  cycle_year integer,
  summary jsonb,
  final_review jsonb,
  subjects jsonb
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_user public.users%rowtype;
  v_teacher public.teachers%rowtype;
  v_cycle public.survey_cycles%rowtype;
  v_summary public.pkpd_teacher_summaries%rowtype;
  v_review public.pkpd_final_reviews%rowtype;
  v_subjects jsonb := '[]'::jsonb;
  v_exam_score numeric;
  v_is_exam_exempt boolean := false;
  v_final_max_score numeric := 100;
  v_final_score numeric;
  v_final_percentage numeric;
  v_summary_json jsonb;
  v_has_summary boolean := false;
begin
  select user_row.*
    into v_user
    from public.users user_row
   where user_row.id = auth.uid()::text
     and user_row.org_id = public.current_org_id()
   limit 1;

  select teacher_row.*
    into v_teacher
    from public.teachers teacher_row
   where teacher_row.org_id = public.current_org_id()
     and teacher_row.deleted_at is null
     and (
       teacher_row.user_id = auth.uid()::text
       or (
         v_user.login is not null
         and teacher_row.login = v_user.login
       )
     )
   order by
     case when teacher_row.user_id = auth.uid()::text then 0 else 1 end,
     teacher_row.created_at desc
   limit 1;

  if not found then
    return query select
      false,
      'Sizin üçün PKPD nəticəsi tapılmadı'::text,
      null::text,
      null::integer,
      null::jsonb,
      null::jsonb,
      '[]'::jsonb;
    return;
  end if;

  select cycle_row.*
    into v_cycle
    from public.survey_cycles cycle_row
    join public.pkpd_result_visibility_settings setting_row
      on setting_row.org_id = cycle_row.org_id
     and setting_row.cycle_id = cycle_row.id
     and setting_row.is_visible_to_teachers = true
   where cycle_row.org_id = v_teacher.org_id
     and (
       cycle_row.branch_ids is null
       or cardinality(cycle_row.branch_ids) = 0
       or v_teacher.branch_id = any(cycle_row.branch_ids)
     )
   order by
     exists (
       select 1
       from public.pkpd_teacher_summaries summary_row
       where summary_row.org_id = cycle_row.org_id
         and summary_row.cycle_id = cycle_row.id
         and summary_row.teacher_id = v_teacher.id
     ) desc,
     cycle_row.year desc,
     cycle_row.created_at desc
   limit 1;

  if not found then
    return query select
      false,
      'PKPD nəticələrinin müəllimlər üçün görünməsi hazırda bağlıdır.'::text,
      null::text,
      null::integer,
      null::jsonb,
      null::jsonb,
      '[]'::jsonb;
    return;
  end if;

  select review_row.*
    into v_review
    from public.pkpd_final_reviews review_row
   where review_row.org_id = v_teacher.org_id
     and review_row.cycle_id = v_cycle.id
     and review_row.teacher_id = v_teacher.id
   limit 1;

  select coalesce(jsonb_agg(subject_name order by subject_name), '[]'::jsonb)
    into v_subjects
    from (
      select distinct subject_row.name as subject_name
      from public.teaching_assignments assignment_row
      join public.subjects subject_row
        on subject_row.id = assignment_row.subject_id
       and subject_row.org_id = assignment_row.org_id
      where assignment_row.org_id = v_teacher.org_id
        and assignment_row.teacher_id = v_teacher.id
        and assignment_row.year = v_cycle.year
        and assignment_row.deleted_at is null
      union
      select distinct task_row.subject_name as subject_name
      from public.tasks task_row
      where task_row.org_id = v_teacher.org_id
        and task_row.cycle_id = v_cycle.id
        and task_row.target_id = v_teacher.id
        and nullif(trim(task_row.subject_name), '') is not null
    ) subject_scope;

  select summary_row.*
    into v_summary
    from public.pkpd_teacher_summaries summary_row
   where summary_row.org_id = v_teacher.org_id
     and summary_row.cycle_id = v_cycle.id
     and summary_row.teacher_id = v_teacher.id
   limit 1;
  v_has_summary := found;

  select least(greatest(exam_result.score, 0), 30)
    into v_exam_score
    from public.pkpd_exam_results exam_result
   where exam_result.org_id = v_teacher.org_id
     and exam_result.cycle_id = v_cycle.id
     and exam_result.teacher_id = v_teacher.id
   limit 1;

  if v_has_summary then
    v_is_exam_exempt := coalesce(v_exam_score, 0) <= 0;
    v_final_max_score := case when v_is_exam_exempt then 70 else 100 end;
    v_final_score := coalesce(
      v_summary.final_score,
      v_summary.base_total_score,
      v_summary.current_entered_score
    );
    v_final_percentage := case
      when v_final_score is null then null
      else (v_final_score / v_final_max_score) * 100
    end;
    v_summary_json := to_jsonb(v_summary)
      || jsonb_build_object(
        'exam_score', case when v_is_exam_exempt then null else v_exam_score end,
        'is_exam_exempt', v_is_exam_exempt,
        'is_pkpd_non_participant', v_is_exam_exempt,
        'final_max_score', v_final_max_score,
        'final_score', v_final_score,
        'base_total_score', v_final_score,
        'final_percentage', v_final_percentage,
        'final_score_label',
          case
            when v_final_score is null then '-'
            else to_char(v_final_score, 'FM999999990.00') || ' / ' || v_final_max_score::text
          end
      );

    return query select
      true,
      null::text,
      v_cycle.id,
      v_cycle.year,
      v_summary_json,
      case when v_review.id is null then null else to_jsonb(v_review) end,
      coalesce(v_subjects, '[]'::jsonb);
    return;
  end if;

  with
  submission_scores as (
    select
      task_row.rater_role::text as rater_role,
      task_row.group_id,
      coalesce(task_row.group_name, task_row.group_id, '-') as group_name,
      submission_row.task_id as submission_id,
      avg(
        case
          when coalesce(question_row.scale_min, 1) = 1
            and coalesce(question_row.scale_max, 10) = 10 then
            (answer_row.value::text)::numeric
          when coalesce(question_row.scale_max, 10) <= coalesce(question_row.scale_min, 1) then
            (answer_row.value::text)::numeric
          else (
            ((answer_row.value::text)::numeric - coalesce(question_row.scale_min, 1))
            / (coalesce(question_row.scale_max, 10) - coalesce(question_row.scale_min, 1))
          ) * 10
        end
      ) as score
    from public.submissions submission_row
    join public.tasks task_row
      on task_row.id = submission_row.task_id
     and task_row.org_id = submission_row.org_id
    join public.answers answer_row
      on answer_row.submission_id = submission_row.task_id
     and answer_row.org_id = submission_row.org_id
    join public.questions question_row
      on question_row.id = answer_row.question_id
     and question_row.org_id = answer_row.org_id
    where submission_row.org_id = v_teacher.org_id
      and submission_row.cycle_id = v_cycle.id
      and task_row.target_type::text = 'teacher'
      and task_row.target_id = v_teacher.id
      and question_row.type::text = 'scale'
      and jsonb_typeof(answer_row.value) = 'number'
    group by
      task_row.rater_role,
      task_row.group_id,
      task_row.group_name,
      submission_row.task_id
  ),
  student_stats as (
    select avg(score) as avg_score, count(*)::bigint as score_count
    from submission_scores
    where rater_role = 'student'
  ),
  self_stats as (
    select avg(score) as avg_score, count(*)::bigint as score_count
    from submission_scores
    where rater_role = 'teacher'
  ),
  management_stats as (
    select avg(score) as avg_score, count(*)::bigint as score_count
    from submission_scores
    where rater_role = 'manager'
  ),
  student_classes as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'groupId', class_scope.group_id,
          'groupName', class_scope.group_name,
          'avg', class_scope.avg_score,
          'submissionCount', class_scope.score_count
        )
        order by class_scope.group_name
      ),
      '[]'::jsonb
    ) as class_scores,
    coalesce(count(*), 0)::bigint as class_count
    from (
      select
        coalesce(group_id, 'no-group') as group_id,
        coalesce(group_name, 'no-group') as group_name,
        avg(score) as avg_score,
        count(*)::bigint as score_count
      from submission_scores
      where rater_role = 'student'
      group by coalesce(group_id, 'no-group'), coalesce(group_name, 'no-group')
    ) class_scope
  ),
  biq_direct as (
    select avg(least(greatest(score, 0), 100)) as avg_score
    from public.pkpd_teacher_biq_results result_row
    where result_row.org_id = v_teacher.org_id
      and result_row.cycle_id = v_cycle.id
      and result_row.teacher_id = v_teacher.id
  ),
  biq_assignment as (
    select avg(least(greatest(class_result.score, 0), 100)) as avg_score
    from public.teaching_assignments assignment_row
    join public.biq_class_results class_result
      on class_result.org_id = assignment_row.org_id
     and class_result.cycle_id = v_cycle.id
     and class_result.branch_id = assignment_row.branch_id
     and class_result.group_id = assignment_row.group_id
     and class_result.subject_id = assignment_row.subject_id
    where assignment_row.org_id = v_teacher.org_id
      and assignment_row.teacher_id = v_teacher.id
      and assignment_row.year = v_cycle.year
      and assignment_row.deleted_at is null
  ),
  biq_manual as (
    select least(greatest(avg_row.score, 0), 100) as score
    from public.pkpd_teacher_biq_averages avg_row
    where avg_row.org_id = v_teacher.org_id
      and avg_row.cycle_id = v_cycle.id
      and avg_row.teacher_id = v_teacher.id
    limit 1
  ),
  portfolio_values as (
    select
      portfolio_row.teacher_id,
      least(greatest(portfolio_row.education_score, 0), 3) as education_score,
      least(greatest(portfolio_row.attendance_score, 0), 3) as attendance_score,
      least(
        greatest(portfolio_row.training_score, 0),
        case
          when v_teacher.is_biq_teacher is false
            or coalesce(v_teacher.teacher_category::text, 'standard') in ('drama_gym', 'chess')
          then 9 else 4
        end
      ) as training_score,
      least(
        greatest(portfolio_row.olympiad_score, 0),
        case
          when v_teacher.is_biq_teacher is false
            or coalesce(v_teacher.teacher_category::text, 'standard') in ('drama_gym', 'chess')
          then 20 else 4
        end
      ) as olympiad_score,
      least(
        greatest(portfolio_row.events_score, 0),
        case
          when v_teacher.is_biq_teacher is false
            or coalesce(v_teacher.teacher_category::text, 'standard') in ('drama_gym', 'chess')
          then 25 else 6
        end
      ) as events_score
    from public.pkpd_portfolios portfolio_row
    where portfolio_row.org_id = v_teacher.org_id
      and portfolio_row.cycle_id = v_cycle.id
      and portfolio_row.teacher_id = v_teacher.id
    limit 1
  ),
  achievement_values as (
    select coalesce(sum(points), 0) as bonus_score
    from public.pkpd_achievements achievement_row
    where achievement_row.org_id = v_teacher.org_id
      and achievement_row.cycle_id = v_cycle.id
      and achievement_row.teacher_id = v_teacher.id
  ),
  base_values as (
    select
      student_stats.avg_score as student_avg,
      self_stats.avg_score as self_declared_score,
      management_stats.avg_score as management_avg,
      student_stats.score_count as student_count,
      self_stats.score_count as self_count,
      management_stats.score_count as management_count,
      student_classes.class_scores,
      student_classes.class_count,
      coalesce(biq_manual.score, biq_direct.avg_score, biq_assignment.avg_score) as biq_avg,
      biq_direct.avg_score as computed_biq_avg,
      biq_manual.score as manual_biq_avg,
      case
        when v_teacher.is_biq_teacher is false then 'none'
        when biq_manual.score is not null then 'manual'
        when coalesce(biq_direct.avg_score, biq_assignment.avg_score) is not null then 'computed'
        else 'none'
      end as biq_average_source,
      case
        when portfolio_values.teacher_id is null then null
        else
          coalesce(portfolio_values.education_score, 0)
          + coalesce(portfolio_values.attendance_score, 0)
          + coalesce(portfolio_values.training_score, 0)
          + coalesce(portfolio_values.olympiad_score, 0)
          + coalesce(portfolio_values.events_score, 0)
      end as portfolio_score,
      achievement_values.bonus_score
    from student_stats
    cross join self_stats
    cross join management_stats
    cross join student_classes
    cross join biq_direct
    cross join biq_assignment
    left join biq_manual on true
    left join portfolio_values on true
    cross join achievement_values
  ),
  weighted_values as (
    select
      *,
      case
        when student_avg is null then null
        else student_avg * case when v_teacher.is_biq_teacher then 15 else 20 end / 10
      end as student_weighted_score,
      management_avg as management_weighted_score,
      self_declared_score as self_weighted_score,
      case
        when v_teacher.is_biq_teacher and biq_avg is not null then biq_avg * 15 / 100
        else null
      end as biq_weighted_score,
      coalesce(v_exam_score, 0) <= 0 as is_exam_exempt
    from base_values
  ),
  final_values as (
    select
      *,
      case when is_exam_exempt then null else v_exam_score end as effective_exam_score,
      case when is_exam_exempt then 70 else 100 end as final_max_score,
      case
        when v_teacher.is_biq_teacher is false and not is_exam_exempt then
          (
            coalesce(student_weighted_score, 0)
            + coalesce(management_weighted_score, 0)
            + coalesce(self_weighted_score, 0)
            + coalesce(portfolio_score, 0)
            + coalesce(v_exam_score, 0)
          ) * 100 / 130
        else
          coalesce(student_weighted_score, 0)
          + coalesce(management_weighted_score, 0)
          + coalesce(self_weighted_score, 0)
          + coalesce(biq_weighted_score, 0)
          + coalesce(portfolio_score, 0)
          + case when v_teacher.is_biq_teacher and not is_exam_exempt then coalesce(v_exam_score, 0) else 0 end
      end as current_entered_score
    from weighted_values
  )
  select jsonb_build_object(
    'teacher_id', v_teacher.id,
    'branch_id', v_teacher.branch_id,
    'teacher_name', coalesce(nullif(trim(v_teacher.name), ''), v_user.display_name, v_teacher.id),
    'first_name', v_teacher.first_name,
    'last_name', v_teacher.last_name,
    'department_name', department_row.name,
    'branch_name', branch_row.name,
    'category', coalesce(v_teacher.teacher_category::text, 'standard'),
    'is_biq_teacher', coalesce(v_teacher.is_biq_teacher, true),
    'student_avg', final_values.student_avg,
    'management_avg', final_values.management_avg,
    'self_avg', final_values.self_declared_score,
    'self_declared_score', final_values.self_declared_score,
    'academic_indicator', null,
    'teacher_criteria_total', null,
    'hr_evaluation_score', null,
    'biq_avg', case when coalesce(v_teacher.is_biq_teacher, true) then final_values.biq_avg else null end,
    'computed_biq_avg', final_values.computed_biq_avg,
    'manual_biq_avg', final_values.manual_biq_avg,
    'biq_average_source', final_values.biq_average_source
  )
  || jsonb_build_object(
    'student_weighted_score', final_values.student_weighted_score,
    'management_weighted_score', final_values.management_weighted_score,
    'leadership_submitted_count', final_values.management_count,
    'leadership_eligible_count', greatest(final_values.management_count, 3),
    'leadership_complete', final_values.management_count >= 3,
    'leadership_overridden', false,
    'branch_manager_submitted', final_values.management_count > 0,
    'deputy_submitted', final_values.management_count > 1,
    'department_head_submitted', final_values.management_count > 2,
    'branch_manager_eligible', true,
    'deputy_eligible', true,
    'department_head_eligible', true,
    'self_weighted_score', final_values.self_weighted_score,
    'biq_weighted_score', final_values.biq_weighted_score,
    'exam_score', final_values.effective_exam_score,
    'portfolio_score', final_values.portfolio_score,
    'bonus_score', final_values.bonus_score,
    'current_entered_score', final_values.current_entered_score,
    'is_complete', false,
    'base_total_score', final_values.current_entered_score
  )
  || jsonb_build_object(
    'final_score_with_extra', final_values.current_entered_score + coalesce(final_values.bonus_score, 0),
    'final_score', final_values.current_entered_score,
    'final_max_score', final_values.final_max_score,
    'final_score_label',
      to_char(final_values.current_entered_score, 'FM999999990.00')
      || ' / '
      || final_values.final_max_score::text,
    'final_percentage',
      case
        when final_values.final_max_score > 0
        then final_values.current_entered_score / final_values.final_max_score * 100
        else null
      end,
    'is_pkpd_non_participant', final_values.is_exam_exempt,
    'is_exam_exempt', final_values.is_exam_exempt,
    'survey_submission_count',
      final_values.student_count + final_values.self_count + final_values.management_count,
    'student_count', final_values.student_count,
    'student_class_count', final_values.class_count,
    'student_class_scores', final_values.class_scores,
    'management_count', final_values.management_count,
    'self_count', final_values.self_count,
    'refreshed_at', now()
  )
    into v_summary_json
    from final_values
    left join public.branches branch_row
      on branch_row.id = v_teacher.branch_id
     and branch_row.org_id = v_teacher.org_id
    left join public.departments department_row
      on department_row.id = v_teacher.department_id
     and department_row.org_id = v_teacher.org_id;

  return query select
    true,
    null::text,
    v_cycle.id,
    v_cycle.year,
    v_summary_json,
    case when v_review.id is null then null else to_jsonb(v_review) end,
    coalesce(v_subjects, '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_latest_pkpd_result() to authenticated;

notify pgrst, 'reload schema';
