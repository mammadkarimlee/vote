-- Teacher-facing PKPD results must not expose score breakdowns.
-- Admin/leadership RPCs and tables remain unchanged; this only narrows the
-- self-service teacher result response.

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
  v_exam_score numeric;
  v_is_exam_exempt boolean := false;
  v_final_score numeric;
  v_final_max_score numeric;
  v_final_percentage numeric;
  v_status text := 'calculating';
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

  select summary_row.*
    into v_summary
    from public.pkpd_teacher_summaries summary_row
   where summary_row.org_id = v_teacher.org_id
     and summary_row.cycle_id = v_cycle.id
     and summary_row.teacher_id = v_teacher.id
   limit 1;

  if not found then
    return query select
      true,
      null::text,
      v_cycle.id,
      v_cycle.year,
      jsonb_build_object(
        'finalScore', null,
        'finalMaxScore', null,
        'finalPercentage', null,
        'status', 'calculating',
        'academicYear', v_cycle.year,
        'isBiqTeacher', null,
        'isExamExempt', null
      ),
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

  select least(greatest(exam_result.score, 0), 30)
    into v_exam_score
    from public.pkpd_exam_results exam_result
   where exam_result.org_id = v_teacher.org_id
     and exam_result.cycle_id = v_cycle.id
     and exam_result.teacher_id = v_teacher.id
   limit 1;

  v_is_exam_exempt :=
    coalesce(v_summary.is_biq_teacher, true) is true
    and coalesce(v_exam_score, 0) <= 0
    and v_teacher.id not in (
      'abseron-teacher-gunel-ceferova-nizami-qizi',
      'abseron-teacher-seyrane-eliyeva-intiqam-qizi',
      'abseron-teacher-cemile-pirmetova-cahangir-qizi',
      'nesimi-teacher-xumar-mustafayeva-mahir-qizi',
      'nesimi-teacher-aydan-kerimli-etibar-qizi',
      'nesimi-teacher-lale-bayramova-elsad-qizi',
      'nesimi-teacher-naile-hesenova-nadir-qizi',
      'nesimi-teacher-tunzale-cendirli-ali-qizi',
      'nesimi-teacher-sukufe-huseynli-arif-qizi',
      'stars-teacher-esref-memmedov-zaur-oglu',
      'stars-teacher-hemide-seyidova-asiman-qizi',
      'stars-teacher-gulsen-esedova-gulaga-qizi',
      'stars-teacher-larisa-huseynova-andreyevna',
      'stars-teacher-zamile-mustafayeva-meherrem-qizi',
      'stars-teacher-govher-meherremova-selahaddin-qizi',
      'azadliq-teacher-nermin-emirova-eldar-qizi'
    );

  v_final_score := case
    when v_summary.final_score_with_extra is not null
      and v_summary.final_score is not null
      and v_summary.final_score_with_extra > v_summary.final_score
    then v_summary.final_score_with_extra
    else v_summary.final_score
  end;
  v_final_max_score := case
    when v_is_exam_exempt then 70
    else 100
  end;
  v_final_percentage := case
    when v_final_score is null or v_final_max_score <= 0 then null
    else v_final_score / v_final_max_score * 100
  end;
  v_status := case
    when v_final_score is not null then 'completed'
    when coalesce(v_summary.is_complete, false) then 'incomplete'
    else 'calculating'
  end;

  return query select
    true,
    null::text,
    v_cycle.id,
    v_cycle.year,
    jsonb_build_object(
      'finalScore', v_final_score,
      'finalMaxScore', v_final_max_score,
      'finalPercentage', v_final_percentage,
      'status', v_status,
      'academicYear', v_cycle.year,
      'isBiqTeacher', v_summary.is_biq_teacher,
      'isExamExempt', v_is_exam_exempt
    ),
    case
      when v_review.id is null then null
      else jsonb_build_object(
        'reviewText', v_review.review_text,
        'recommendationText', v_review.recommendation_text
      )
    end,
    '[]'::jsonb;
end;
$$;

grant execute on function public.get_my_latest_pkpd_result() to authenticated;

notify pgrst, 'reload schema';
