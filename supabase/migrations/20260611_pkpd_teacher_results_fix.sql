-- Follow-up fixes for teacher-result visibility and bulk review generation.
-- Avoid direct PostgREST table access from the UI and remove PL/pgSQL output
-- column ambiguity around teacher_id.

create or replace function public.get_pkpd_result_visibility(p_cycle_id text)
returns table (is_visible_to_teachers boolean)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_visible boolean := false;
begin
  if not public.is_superadmin() then
    raise exception 'PKPD netice gorunurluyunu oxumaq ucun icazeniz yoxdur';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = public.current_org_id()
  ) then
    raise exception 'Sorqu tapilmadi';
  end if;

  select coalesce(setting_row.is_visible_to_teachers, false)
    into v_visible
    from public.pkpd_result_visibility_settings setting_row
   where setting_row.org_id = public.current_org_id()
     and setting_row.cycle_id = p_cycle_id;

  return query select coalesce(v_visible, false);
end;
$$;

create or replace function public.set_pkpd_result_visibility(
  p_cycle_id text,
  p_is_visible boolean
)
returns table (is_visible_to_teachers boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id text := public.current_org_id();
  v_visible boolean := coalesce(p_is_visible, false);
begin
  if not public.is_superadmin() then
    raise exception 'PKPD netice gorunurluyunu deyismek ucun icazeniz yoxdur';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = v_org_id
  ) then
    raise exception 'Sorqu tapilmadi';
  end if;

  insert into public.pkpd_result_visibility_settings (
    org_id,
    cycle_id,
    is_visible_to_teachers,
    updated_by,
    updated_at
  )
  values (
    v_org_id,
    p_cycle_id,
    v_visible,
    auth.uid()::text,
    now()
  )
  on conflict (org_id, cycle_id)
  do update set
    is_visible_to_teachers = excluded.is_visible_to_teachers,
    updated_by = auth.uid()::text,
    updated_at = now();

  return query select v_visible;
end;
$$;

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
      'Müəllim profili tapılmadı.'::text,
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
    ) subject_scope;

  select least(greatest(exam_result.score, 0), 30)
    into v_exam_score
    from public.pkpd_exam_results exam_result
   where exam_result.org_id = v_teacher.org_id
     and exam_result.cycle_id = v_cycle.id
     and exam_result.teacher_id = v_teacher.id
   limit 1;

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
end;
$$;

drop function if exists public.bulk_save_pkpd_final_reviews(text, jsonb);

create function public.bulk_save_pkpd_final_reviews(
  p_cycle_id text,
  p_reviews jsonb
)
returns table (
  review_id text,
  result_teacher_id text,
  success boolean,
  error_message text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_item jsonb;
  v_teacher public.teachers%rowtype;
  v_saved public.pkpd_final_reviews%rowtype;
  v_generated_at timestamptz;
begin
  if not public.is_superadmin() then
    raise exception 'Bulk PKPD rey emeliyyati yalniz superadmin ucundur';
  end if;

  if jsonb_typeof(coalesce(p_reviews, '[]'::jsonb)) <> 'array' then
    raise exception 'Bulk PKPD rey payload array olmalidir';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = public.current_org_id()
  ) then
    raise exception 'Sorqu tapilmadi';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_reviews, '[]'::jsonb))
  loop
    begin
      select teacher_row.*
        into v_teacher
        from public.teachers teacher_row
       where teacher_row.id = v_item->>'teacher_id'
         and teacher_row.org_id = public.current_org_id()
         and teacher_row.deleted_at is null
       limit 1;

      if not found or v_teacher.branch_id is null then
        raise exception 'Muellim kampusu tapilmadi';
      end if;

      v_generated_at := coalesce((v_item->>'generated_at')::timestamptz, now());

      insert into public.pkpd_final_reviews (
        org_id,
        branch_id,
        cycle_id,
        teacher_id,
        review_text,
        recommendation_text,
        generated_by,
        generated_at,
        updated_by,
        updated_at,
        is_manual_edited
      )
      values (
        v_teacher.org_id,
        v_teacher.branch_id,
        p_cycle_id,
        v_teacher.id,
        coalesce(v_item->>'review_text', ''),
        coalesce(v_item->>'recommendation_text', ''),
        auth.uid()::text,
        v_generated_at,
        auth.uid()::text,
        now(),
        false
      )
      on conflict (org_id, cycle_id, teacher_id)
      do update set
        branch_id = excluded.branch_id,
        review_text = excluded.review_text,
        recommendation_text = excluded.recommendation_text,
        generated_by = excluded.generated_by,
        generated_at = excluded.generated_at,
        updated_by = excluded.updated_by,
        updated_at = now(),
        is_manual_edited = false
      returning * into v_saved;

      insert into public.audit_logs (
        org_id,
        actor_id,
        action,
        table_name,
        row_id,
        after
      )
      values (
        v_teacher.org_id,
        auth.uid()::text,
        'BULK_GENERATED',
        'pkpd_final_reviews',
        v_teacher.id,
        jsonb_build_object(
          'cycle_id', p_cycle_id,
          'teacher_id', v_teacher.id,
          'review_id', v_saved.id
        )
      );

      review_id := v_saved.id;
      result_teacher_id := v_teacher.id;
      success := true;
      error_message := null;
      return next;
    exception when others then
      review_id := null;
      result_teacher_id := coalesce(v_item->>'teacher_id', '-');
      success := false;
      error_message := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

grant execute on function public.get_pkpd_result_visibility(text) to authenticated;
grant execute on function public.set_pkpd_result_visibility(text, boolean) to authenticated;
grant execute on function public.get_my_latest_pkpd_result() to authenticated;
grant execute on function public.bulk_save_pkpd_final_reviews(text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
