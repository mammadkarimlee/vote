-- Read-optimized PKPD teacher summaries.
-- This cache is derived from source tables and can be rebuilt at any time.
-- Apply after 20260601_leadership_role_summary_with_legacy_votes.sql.

create table if not exists public.pkpd_teacher_summaries (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs(id) on delete cascade,
  cycle_id text not null references public.survey_cycles(id) on delete cascade,
  teacher_id text not null references public.teachers(id) on delete cascade,
  branch_id text references public.branches(id) on delete set null,
  teacher_name text not null,
  first_name text,
  last_name text,
  department_name text,
  branch_name text,
  category text not null,
  is_biq_teacher boolean,
  student_avg numeric,
  management_avg numeric,
  self_avg numeric,
  self_declared_score numeric,
  academic_indicator numeric,
  teacher_criteria_total numeric,
  hr_evaluation_score numeric,
  biq_avg numeric,
  computed_biq_avg numeric,
  manual_biq_avg numeric,
  biq_average_source text not null default 'none'
    check (biq_average_source in ('none', 'computed', 'manual')),
  student_weighted_score numeric,
  management_weighted_score numeric,
  leadership_submitted_count bigint not null default 0,
  leadership_eligible_count bigint not null default 0,
  leadership_complete boolean not null default false,
  leadership_overridden boolean not null default false,
  branch_manager_submitted boolean not null default false,
  deputy_submitted boolean not null default false,
  department_head_submitted boolean not null default false,
  branch_manager_eligible boolean not null default false,
  deputy_eligible boolean not null default false,
  department_head_eligible boolean not null default false,
  self_weighted_score numeric,
  biq_weighted_score numeric,
  exam_score numeric,
  portfolio_score numeric,
  bonus_score numeric not null default 0,
  current_entered_score numeric not null default 0,
  is_complete boolean not null default false,
  base_total_score numeric,
  final_score_with_extra numeric,
  final_score numeric,
  survey_submission_count bigint not null default 0,
  student_count bigint not null default 0,
  student_class_count bigint not null default 0,
  student_class_scores jsonb not null default '[]'::jsonb,
  management_count bigint not null default 0,
  self_count bigint not null default 0,
  refreshed_at timestamptz not null default now(),
  unique (org_id, cycle_id, teacher_id)
);

create index if not exists idx_pkpd_teacher_summaries_cycle_branch
  on public.pkpd_teacher_summaries (org_id, cycle_id, branch_id);
create index if not exists idx_pkpd_teacher_summaries_teacher
  on public.pkpd_teacher_summaries (teacher_id);

alter table public.pkpd_teacher_summaries enable row level security;
revoke all on table public.pkpd_teacher_summaries from anon, authenticated;

create or replace function public.pkpd_summary_access_allowed(p_campus_id text default null)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select
    public.is_superadmin()
    or public.is_hr()
    or (
      p_campus_id is not null
      and public.is_branch_staff()
      and public.current_branch_id() = p_campus_id
    );
$$;

create or replace function public.get_pkpd_teacher_summaries(
  p_cycle_id text,
  p_campus_id text default null
)
returns setof public.pkpd_teacher_summaries
language plpgsql
security definer
stable
set search_path = public, auth
as $$
begin
  if not public.pkpd_summary_access_allowed(p_campus_id) then
    raise exception 'PKPD yekunlarini oxumaq ucun icazeniz yoxdur';
  end if;

  return query
  select summary_row.*
  from public.pkpd_teacher_summaries summary_row
  join public.teachers teacher_row
    on teacher_row.id = summary_row.teacher_id
   and teacher_row.org_id = summary_row.org_id
   and teacher_row.deleted_at is null
   and teacher_row.branch_id is not distinct from summary_row.branch_id
  join public.survey_cycles cycle_row
    on cycle_row.id = summary_row.cycle_id
   and cycle_row.org_id = summary_row.org_id
  where summary_row.org_id = public.current_org_id()
    and summary_row.cycle_id = p_cycle_id
    and (p_campus_id is null or summary_row.branch_id = p_campus_id)
    and (
      cycle_row.branch_ids is null
      or cardinality(cycle_row.branch_ids) = 0
      or summary_row.branch_id = any(cycle_row.branch_ids)
    )
  order by summary_row.teacher_name;
end;
$$;

create or replace function public.refresh_pkpd_teacher_summaries(
  p_cycle_id text,
  p_campus_id text default null
)
returns setof public.pkpd_teacher_summaries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id text := public.current_org_id();
begin
  if not public.pkpd_summary_access_allowed(p_campus_id) then
    raise exception 'PKPD yekunlarini yenilemek ucun icazeniz yoxdur';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = v_org_id
  ) then
    raise exception 'Sorqu tapilmadi';
  end if;

  with
  cycle_scope as (
    select cycle_row.id, cycle_row.org_id, cycle_row.year, cycle_row.branch_ids
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = v_org_id
  ),
  teacher_scope as (
    select
      teacher_row.id,
      teacher_row.org_id,
      teacher_row.branch_id,
      teacher_row.name,
      teacher_row.first_name,
      teacher_row.last_name,
      teacher_row.department_id,
      coalesce(teacher_row.teacher_category::text, 'standard') as category,
      teacher_row.is_biq_teacher
    from public.teachers teacher_row
    cross join cycle_scope
    where teacher_row.org_id = cycle_scope.org_id
      and teacher_row.deleted_at is null
      and (
        p_campus_id is not null and teacher_row.branch_id = p_campus_id
        or p_campus_id is null
          and (
            cycle_scope.branch_ids is null
            or cardinality(cycle_scope.branch_ids) = 0
            or teacher_row.branch_id = any(cycle_scope.branch_ids)
          )
      )
  ),
  submission_scores as (
    select
      task_row.target_id as teacher_id,
      task_row.rater_role::text as rater_role,
      task_row.group_id,
      task_row.group_name,
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
    join teacher_scope
      on teacher_scope.id = task_row.target_id
    join public.answers answer_row
      on answer_row.submission_id = submission_row.task_id
    join public.questions question_row
      on question_row.id = answer_row.question_id
     and question_row.org_id = answer_row.org_id
    where task_row.org_id = v_org_id
      and task_row.cycle_id = p_cycle_id
      and task_row.target_type::text = 'teacher'
      and question_row.type::text = 'scale'
      and jsonb_typeof(answer_row.value) = 'number'
    group by
      task_row.target_id,
      task_row.rater_role,
      task_row.group_id,
      task_row.group_name,
      submission_row.task_id
  ),
  submission_counts as (
    select task_row.target_id as teacher_id, count(*)::bigint as submission_count
    from public.submissions submission_row
    join public.tasks task_row
      on task_row.id = submission_row.task_id
    join teacher_scope
      on teacher_scope.id = task_row.target_id
    where task_row.org_id = v_org_id
      and task_row.cycle_id = p_cycle_id
      and task_row.target_type::text = 'teacher'
    group by task_row.target_id
  ),
  student_scores as (
    select
      submission_scores.teacher_id,
      avg(submission_scores.score) as student_avg,
      count(*)::bigint as student_count
    from submission_scores
    where submission_scores.rater_role = 'student'
    group by submission_scores.teacher_id
  ),
  self_scores as (
    select
      submission_scores.teacher_id,
      avg(submission_scores.score) as self_declared_score,
      count(*)::bigint as self_count
    from submission_scores
    where submission_scores.rater_role = 'teacher'
    group by submission_scores.teacher_id
  ),
  student_class_averages as (
    select
      submission_scores.teacher_id,
      submission_scores.group_id,
      coalesce(submission_scores.group_name, submission_scores.group_id, '-') as group_name,
      avg(submission_scores.score) as class_avg,
      count(*)::bigint as submission_count
    from submission_scores
    where submission_scores.rater_role = 'student'
    group by
      submission_scores.teacher_id,
      submission_scores.group_id,
      coalesce(submission_scores.group_name, submission_scores.group_id, '-')
  ),
  student_classes as (
    select
      student_class_averages.teacher_id,
      count(*)::bigint as student_class_count,
      jsonb_agg(
        jsonb_build_object(
          'groupId', student_class_averages.group_id,
          'groupName', student_class_averages.group_name,
          'avg', student_class_averages.class_avg,
          'submissionCount', student_class_averages.submission_count
        )
        order by student_class_averages.group_name
      ) as student_class_scores
    from student_class_averages
    group by student_class_averages.teacher_id
  ),
  assignment_biq_scores as (
    select
      assignment_row.teacher_id,
      coalesce(teacher_biq.score, class_biq.score) as score
    from public.teaching_assignments assignment_row
    cross join cycle_scope
    left join public.pkpd_teacher_biq_results teacher_biq
      on teacher_biq.org_id = assignment_row.org_id
      and teacher_biq.cycle_id = p_cycle_id
      and teacher_biq.teacher_id = assignment_row.teacher_id
      and teacher_biq.branch_id = assignment_row.branch_id
      and teacher_biq.group_id = assignment_row.group_id
      and teacher_biq.subject_id = assignment_row.subject_id
    left join public.biq_class_results class_biq
      on class_biq.org_id = assignment_row.org_id
      and class_biq.cycle_id = p_cycle_id
      and class_biq.branch_id = assignment_row.branch_id
      and class_biq.group_id = assignment_row.group_id
      and class_biq.subject_id = assignment_row.subject_id
    where assignment_row.org_id = v_org_id
      and assignment_row.year = cycle_scope.year
      and assignment_row.deleted_at is null
      and exists (
        select 1
        from teacher_scope
        where teacher_scope.id = assignment_row.teacher_id
      )
  ),
  computed_biq_scores as (
    select
      assignment_biq_scores.teacher_id,
      avg(assignment_biq_scores.score) as computed_biq_avg
    from assignment_biq_scores
    where assignment_biq_scores.score is not null
    group by assignment_biq_scores.teacher_id
  ),
  self_review_scores as (
    select
      review_row.teacher_id,
      review_values.academic_indicator,
      review_values.teacher_criteria_total,
      review_row.score as hr_evaluation_score
    from public.pkpd_self_reviews review_row
    left join lateral (
      select
        avg((question_score.value)::numeric) as academic_indicator,
        sum((question_score.value)::numeric) as teacher_criteria_total
      from jsonb_each_text(coalesce(review_row.question_scores, '{}'::jsonb)) question_score
      where question_score.value ~ '^-?[0-9]+([.][0-9]+)?$'
    ) review_values on true
    where review_row.org_id = v_org_id
      and review_row.cycle_id = p_cycle_id
  ),
  achievement_scores as (
    select
      achievement_row.teacher_id,
      coalesce(sum(achievement_row.points), 0)::numeric as bonus_score
    from public.pkpd_achievements achievement_row
    where achievement_row.org_id = v_org_id
      and achievement_row.cycle_id = p_cycle_id
    group by achievement_row.teacher_id
  ),
  base_values as (
    select
      teacher_scope.id as teacher_id,
      teacher_scope.org_id,
      teacher_scope.branch_id,
      teacher_scope.name as teacher_name,
      teacher_scope.first_name,
      teacher_scope.last_name,
      department_row.name as department_name,
      branch_row.name as branch_name,
      teacher_scope.category,
      teacher_scope.is_biq_teacher,
      student_scores.student_avg,
      leadership_values.leadership_evaluation_score as management_avg,
      self_scores.self_declared_score,
      self_review_scores.academic_indicator,
      self_review_scores.teacher_criteria_total,
      self_review_scores.hr_evaluation_score,
      case
        when teacher_scope.is_biq_teacher
        then coalesce(manual_biq.score, computed_biq_scores.computed_biq_avg)
        else null
      end as biq_avg,
      computed_biq_scores.computed_biq_avg,
      manual_biq.score as manual_biq_avg,
      case
        when not teacher_scope.is_biq_teacher then 'none'
        when manual_biq.score is not null then 'manual'
        when computed_biq_scores.computed_biq_avg is not null then 'computed'
        else 'none'
      end as biq_average_source,
      coalesce(leadership_values.submitted_count, 0) as leadership_submitted_count,
      coalesce(leadership_values.eligible_count, 0) as leadership_eligible_count,
      coalesce(leadership_values.is_complete, false) as leadership_complete,
      coalesce(leadership_values.is_overridden, false) as leadership_overridden,
      coalesce(leadership_values.branch_manager_submitted, false) as branch_manager_submitted,
      coalesce(leadership_values.deputy_submitted, false) as deputy_submitted,
      coalesce(leadership_values.department_head_submitted, false) as department_head_submitted,
      coalesce(leadership_values.branch_manager_eligible, false) as branch_manager_eligible,
      coalesce(leadership_values.deputy_eligible, false) as deputy_eligible,
      coalesce(leadership_values.department_head_eligible, false) as department_head_eligible,
      case
        when teacher_scope.is_biq_teacher then least(greatest(exam_result.score, 0), 30)
        else null
      end as exam_score,
      portfolio_values.portfolio_score,
      coalesce(achievement_scores.bonus_score, 0) as bonus_score,
      coalesce(submission_counts.submission_count, 0) as survey_submission_count,
      coalesce(student_scores.student_count, 0) as student_count,
      coalesce(student_classes.student_class_count, 0) as student_class_count,
      coalesce(student_classes.student_class_scores, '[]'::jsonb) as student_class_scores,
      coalesce(leadership_values.submitted_count, 0) as management_count,
      coalesce(self_scores.self_count, 0) as self_count
    from teacher_scope
    left join public.branches branch_row
      on branch_row.id = teacher_scope.branch_id
    left join public.departments department_row
      on department_row.id = teacher_scope.department_id
    left join student_scores
      on student_scores.teacher_id = teacher_scope.id
    left join self_scores
      on self_scores.teacher_id = teacher_scope.id
    left join student_classes
      on student_classes.teacher_id = teacher_scope.id
    left join submission_counts
      on submission_counts.teacher_id = teacher_scope.id
    left join public.leadership_score_summary(p_cycle_id, p_campus_id) leadership_values
      on leadership_values.teacher_id = teacher_scope.id
    left join computed_biq_scores
      on computed_biq_scores.teacher_id = teacher_scope.id
    left join public.pkpd_teacher_biq_averages manual_biq
      on manual_biq.org_id = teacher_scope.org_id
      and manual_biq.cycle_id = p_cycle_id
      and manual_biq.teacher_id = teacher_scope.id
    left join public.pkpd_exam_results exam_result
      on exam_result.org_id = teacher_scope.org_id
      and exam_result.cycle_id = p_cycle_id
      and exam_result.teacher_id = teacher_scope.id
    left join public.pkpd_portfolios portfolio_row
      on portfolio_row.org_id = teacher_scope.org_id
      and portfolio_row.cycle_id = p_cycle_id
      and portfolio_row.teacher_id = teacher_scope.id
    left join lateral (
      select
        case
          when portfolio_row.teacher_id is null
            or num_nonnulls(
              portfolio_row.education_score,
              portfolio_row.attendance_score,
              portfolio_row.training_score,
              portfolio_row.olympiad_score,
              portfolio_row.events_score
            ) = 0
          then null
          else
            least(greatest(coalesce(portfolio_row.education_score, 0), 0), 3)
            + least(greatest(coalesce(portfolio_row.attendance_score, 0), 0), 3)
            + least(
              greatest(coalesce(portfolio_row.training_score, 0), 0),
              case
                when teacher_scope.is_biq_teacher = false
                  or teacher_scope.category in ('drama_gym', 'chess')
                then 9
                else 4
              end
            )
            + least(
              greatest(coalesce(portfolio_row.olympiad_score, 0), 0),
              case
                when teacher_scope.is_biq_teacher = false
                  or teacher_scope.category in ('drama_gym', 'chess')
                then 20
                else 4
              end
            )
            + least(
              greatest(coalesce(portfolio_row.events_score, 0), 0),
              case
                when teacher_scope.is_biq_teacher = false
                  or teacher_scope.category in ('drama_gym', 'chess')
                then 25
                else 6
              end
            )
        end as portfolio_score
    ) portfolio_values on true
    left join self_review_scores
      on self_review_scores.teacher_id = teacher_scope.id
    left join achievement_scores
      on achievement_scores.teacher_id = teacher_scope.id
  ),
  weighted_values as (
    select
      base_values.*,
      case
        when num_nonnulls(base_values.self_declared_score, base_values.academic_indicator) = 0 then null
        else (
          coalesce(base_values.self_declared_score, 0)
          + coalesce(base_values.academic_indicator, 0)
        ) / num_nonnulls(base_values.self_declared_score, base_values.academic_indicator)
      end as self_avg,
      case
        when base_values.student_avg is null then null
        else base_values.student_avg * case when base_values.is_biq_teacher then 15 else 20 end / 10
      end as student_weighted_score,
      base_values.management_avg as management_weighted_score,
      base_values.self_declared_score as self_weighted_score,
      case
        when base_values.is_biq_teacher and base_values.biq_avg is not null
        then base_values.biq_avg * 15 / 100
        else null
      end as biq_weighted_score
    from base_values
  ),
  completed_values as (
    select
      weighted_values.*,
      (
        coalesce(weighted_values.student_weighted_score, 0)
        + coalesce(weighted_values.management_weighted_score, 0)
        + coalesce(weighted_values.self_weighted_score, 0)
        + case
            when weighted_values.is_biq_teacher then
              coalesce(weighted_values.biq_weighted_score, 0)
              + coalesce(weighted_values.exam_score, 0)
            else 0
          end
        + coalesce(weighted_values.portfolio_score, 0)
      ) as current_entered_score,
      (
        weighted_values.student_weighted_score is not null
        and weighted_values.management_weighted_score is not null
        and weighted_values.self_weighted_score is not null
        and weighted_values.portfolio_score is not null
        and weighted_values.leadership_complete
        and (
          not weighted_values.is_biq_teacher
          or (
            weighted_values.biq_weighted_score is not null
            and weighted_values.exam_score is not null
          )
        )
      ) as is_complete
    from weighted_values
  )
  insert into public.pkpd_teacher_summaries (
    org_id,
    cycle_id,
    teacher_id,
    branch_id,
    teacher_name,
    first_name,
    last_name,
    department_name,
    branch_name,
    category,
    is_biq_teacher,
    student_avg,
    management_avg,
    self_avg,
    self_declared_score,
    academic_indicator,
    teacher_criteria_total,
    hr_evaluation_score,
    biq_avg,
    computed_biq_avg,
    manual_biq_avg,
    biq_average_source,
    student_weighted_score,
    management_weighted_score,
    leadership_submitted_count,
    leadership_eligible_count,
    leadership_complete,
    leadership_overridden,
    branch_manager_submitted,
    deputy_submitted,
    department_head_submitted,
    branch_manager_eligible,
    deputy_eligible,
    department_head_eligible,
    self_weighted_score,
    biq_weighted_score,
    exam_score,
    portfolio_score,
    bonus_score,
    current_entered_score,
    is_complete,
    base_total_score,
    final_score_with_extra,
    final_score,
    survey_submission_count,
    student_count,
    student_class_count,
    student_class_scores,
    management_count,
    self_count,
    refreshed_at
  )
  select
    completed_values.org_id,
    p_cycle_id,
    completed_values.teacher_id,
    completed_values.branch_id,
    completed_values.teacher_name,
    completed_values.first_name,
    completed_values.last_name,
    completed_values.department_name,
    completed_values.branch_name,
    completed_values.category,
    completed_values.is_biq_teacher,
    completed_values.student_avg,
    completed_values.management_avg,
    completed_values.self_avg,
    completed_values.self_declared_score,
    completed_values.academic_indicator,
    completed_values.teacher_criteria_total,
    completed_values.hr_evaluation_score,
    completed_values.biq_avg,
    completed_values.computed_biq_avg,
    completed_values.manual_biq_avg,
    completed_values.biq_average_source,
    completed_values.student_weighted_score,
    completed_values.management_weighted_score,
    completed_values.leadership_submitted_count,
    completed_values.leadership_eligible_count,
    completed_values.leadership_complete,
    completed_values.leadership_overridden,
    completed_values.branch_manager_submitted,
    completed_values.deputy_submitted,
    completed_values.department_head_submitted,
    completed_values.branch_manager_eligible,
    completed_values.deputy_eligible,
    completed_values.department_head_eligible,
    completed_values.self_weighted_score,
    completed_values.biq_weighted_score,
    completed_values.exam_score,
    completed_values.portfolio_score,
    completed_values.bonus_score,
    completed_values.current_entered_score,
    completed_values.is_complete,
    case when completed_values.is_complete then completed_values.current_entered_score else null end,
    case
      when completed_values.is_complete
      then completed_values.current_entered_score + completed_values.bonus_score
      else null
    end,
    case
      when completed_values.is_complete
      then completed_values.current_entered_score
      else null
    end,
    completed_values.survey_submission_count,
    completed_values.student_count,
    completed_values.student_class_count,
    completed_values.student_class_scores,
    completed_values.management_count,
    completed_values.self_count,
    now()
  from completed_values
  on conflict (org_id, cycle_id, teacher_id)
  do update set
    branch_id = excluded.branch_id,
    teacher_name = excluded.teacher_name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    department_name = excluded.department_name,
    branch_name = excluded.branch_name,
    category = excluded.category,
    is_biq_teacher = excluded.is_biq_teacher,
    student_avg = excluded.student_avg,
    management_avg = excluded.management_avg,
    self_avg = excluded.self_avg,
    self_declared_score = excluded.self_declared_score,
    academic_indicator = excluded.academic_indicator,
    teacher_criteria_total = excluded.teacher_criteria_total,
    hr_evaluation_score = excluded.hr_evaluation_score,
    biq_avg = excluded.biq_avg,
    computed_biq_avg = excluded.computed_biq_avg,
    manual_biq_avg = excluded.manual_biq_avg,
    biq_average_source = excluded.biq_average_source,
    student_weighted_score = excluded.student_weighted_score,
    management_weighted_score = excluded.management_weighted_score,
    leadership_submitted_count = excluded.leadership_submitted_count,
    leadership_eligible_count = excluded.leadership_eligible_count,
    leadership_complete = excluded.leadership_complete,
    leadership_overridden = excluded.leadership_overridden,
    branch_manager_submitted = excluded.branch_manager_submitted,
    deputy_submitted = excluded.deputy_submitted,
    department_head_submitted = excluded.department_head_submitted,
    branch_manager_eligible = excluded.branch_manager_eligible,
    deputy_eligible = excluded.deputy_eligible,
    department_head_eligible = excluded.department_head_eligible,
    self_weighted_score = excluded.self_weighted_score,
    biq_weighted_score = excluded.biq_weighted_score,
    exam_score = excluded.exam_score,
    portfolio_score = excluded.portfolio_score,
    bonus_score = excluded.bonus_score,
    current_entered_score = excluded.current_entered_score,
    is_complete = excluded.is_complete,
    base_total_score = excluded.base_total_score,
    final_score_with_extra = excluded.final_score_with_extra,
    final_score = excluded.final_score,
    survey_submission_count = excluded.survey_submission_count,
    student_count = excluded.student_count,
    student_class_count = excluded.student_class_count,
    student_class_scores = excluded.student_class_scores,
    management_count = excluded.management_count,
    self_count = excluded.self_count,
    refreshed_at = excluded.refreshed_at;

  return query
  select summary_row.*
  from public.pkpd_teacher_summaries summary_row
  join public.teachers teacher_row
    on teacher_row.id = summary_row.teacher_id
   and teacher_row.org_id = summary_row.org_id
   and teacher_row.deleted_at is null
   and teacher_row.branch_id is not distinct from summary_row.branch_id
  join public.survey_cycles cycle_row
    on cycle_row.id = summary_row.cycle_id
   and cycle_row.org_id = summary_row.org_id
  where summary_row.org_id = v_org_id
    and summary_row.cycle_id = p_cycle_id
    and (p_campus_id is null or summary_row.branch_id = p_campus_id)
    and (
      cycle_row.branch_ids is null
      or cardinality(cycle_row.branch_ids) = 0
      or summary_row.branch_id = any(cycle_row.branch_ids)
    )
  order by summary_row.teacher_name;
end;
$$;

grant execute on function public.pkpd_summary_access_allowed(text) to authenticated;
grant execute on function public.get_pkpd_teacher_summaries(text, text) to authenticated;
grant execute on function public.refresh_pkpd_teacher_summaries(text, text) to authenticated;

notify pgrst, 'reload schema';
