-- Teacher-facing PKPD results are still self-only, but the owner should see
-- the full score breakdown instead of only the final score and final review.

create table if not exists public.pkpd_teacher_result_settings (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  cycle_id text not null references public.survey_cycles(id) on delete cascade,
  teacher_id text not null references public.teachers(id) on delete cascade,
  final_max_score integer not null check (final_max_score in (70, 100)),
  updated_by text references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, cycle_id, teacher_id)
);

create index if not exists pkpd_teacher_result_settings_cycle_idx
  on public.pkpd_teacher_result_settings (org_id, cycle_id, branch_id);
create index if not exists pkpd_teacher_result_settings_teacher_idx
  on public.pkpd_teacher_result_settings (teacher_id);

alter table public.pkpd_teacher_result_settings enable row level security;
revoke all on table public.pkpd_teacher_result_settings from anon, authenticated;

drop policy if exists pkpd_teacher_result_settings_select
  on public.pkpd_teacher_result_settings;
create policy pkpd_teacher_result_settings_select
  on public.pkpd_teacher_result_settings
  for select
  using (
    public.current_org_id() = org_id
    and (
      public.is_superadmin()
      or public.is_hr()
      or public.can_write_pkpd_final_review(branch_id)
      or exists (
        select 1
        from public.teachers teacher_row
        where teacher_row.id = pkpd_teacher_result_settings.teacher_id
          and teacher_row.org_id = pkpd_teacher_result_settings.org_id
          and teacher_row.user_id = auth.uid()::text
          and teacher_row.deleted_at is null
      )
    )
  );

drop policy if exists pkpd_teacher_result_settings_insert
  on public.pkpd_teacher_result_settings;
create policy pkpd_teacher_result_settings_insert
  on public.pkpd_teacher_result_settings
  for insert
  with check (
    public.current_org_id() = org_id
    and public.can_write_pkpd_final_review(branch_id)
  );

drop policy if exists pkpd_teacher_result_settings_update
  on public.pkpd_teacher_result_settings;
create policy pkpd_teacher_result_settings_update
  on public.pkpd_teacher_result_settings
  for update
  using (
    public.current_org_id() = org_id
    and public.can_write_pkpd_final_review(branch_id)
  )
  with check (
    public.current_org_id() = org_id
    and public.can_write_pkpd_final_review(branch_id)
  );

create or replace function public.get_pkpd_teacher_final_max_scores(
  p_cycle_id text,
  p_campus_id text default null
)
returns table (
  teacher_id text,
  final_max_score integer
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
begin
  if not public.pkpd_summary_access_allowed(p_campus_id) then
    raise exception 'PKPD yekun maksimum bal ayarlarını oxumaq üçün icazəniz yoxdur';
  end if;

  return query
  select setting_row.teacher_id, setting_row.final_max_score
  from public.pkpd_teacher_result_settings setting_row
  where setting_row.org_id = public.current_org_id()
    and setting_row.cycle_id = p_cycle_id
    and (p_campus_id is null or setting_row.branch_id = p_campus_id);
end;
$$;

create or replace function public.set_pkpd_teacher_final_max_score(
  p_cycle_id text,
  p_teacher_id text,
  p_final_max_score integer
)
returns table (
  teacher_id text,
  final_max_score integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_teacher public.teachers%rowtype;
begin
  if p_final_max_score not in (70, 100) then
    raise exception 'Yekun maksimum bal yalnız 70 və ya 100 ola bilər';
  end if;

  select teacher_row.*
    into v_teacher
    from public.teachers teacher_row
   where teacher_row.id = p_teacher_id
     and teacher_row.org_id = public.current_org_id()
     and teacher_row.deleted_at is null
   limit 1;

  if not found or v_teacher.branch_id is null then
    raise exception 'Müəllim tapılmadı';
  end if;

  if not public.can_write_pkpd_final_review(v_teacher.branch_id) then
    raise exception 'PKPD yekun maksimum balını dəyişmək üçün icazəniz yoxdur';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = v_teacher.org_id
      and (
        cycle_row.branch_ids is null
        or cardinality(cycle_row.branch_ids) = 0
        or v_teacher.branch_id = any(cycle_row.branch_ids)
      )
  ) then
    raise exception 'Sorğu və müəllim eyni PKPD dövrünə aid deyil';
  end if;

  insert into public.pkpd_teacher_result_settings (
    org_id,
    branch_id,
    cycle_id,
    teacher_id,
    final_max_score,
    updated_by,
    updated_at
  )
  values (
    v_teacher.org_id,
    v_teacher.branch_id,
    p_cycle_id,
    p_teacher_id,
    p_final_max_score,
    auth.uid()::text,
    now()
  )
  on conflict (org_id, cycle_id, teacher_id)
  do update set
    branch_id = excluded.branch_id,
    final_max_score = excluded.final_max_score,
    updated_by = excluded.updated_by,
    updated_at = now();

  teacher_id := p_teacher_id;
  final_max_score := p_final_max_score;
  return next;
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
  v_portfolio_details jsonb := null;
  v_exam_score numeric;
  v_is_exam_exempt boolean := false;
  v_base_score numeric;
  v_final_score numeric;
  v_final_score_with_extra numeric;
  v_final_max_score numeric;
  v_final_max_score_override integer;
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
      coalesce(v_subjects, '[]'::jsonb);
    return;
  end if;

  select review_row.*
    into v_review
    from public.pkpd_final_reviews review_row
   where review_row.org_id = v_teacher.org_id
     and review_row.cycle_id = v_cycle.id
     and review_row.teacher_id = v_teacher.id
   limit 1;

  select jsonb_build_object(
      'educationScore', portfolio_row.education_score,
      'education_score', portfolio_row.education_score,
      'attendanceScore', portfolio_row.attendance_score,
      'attendance_score', portfolio_row.attendance_score,
      'trainingScore', portfolio_row.training_score,
      'training_score', portfolio_row.training_score,
      'olympiadScore', portfolio_row.olympiad_score,
      'olympiad_score', portfolio_row.olympiad_score,
      'eventsScore', portfolio_row.events_score,
      'events_score', portfolio_row.events_score,
      'note', portfolio_row.note
    )
    into v_portfolio_details
    from public.pkpd_portfolios portfolio_row
   where portfolio_row.org_id = v_teacher.org_id
     and portfolio_row.cycle_id = v_cycle.id
     and portfolio_row.teacher_id = v_teacher.id
   limit 1;

  select least(greatest(exam_result.score, 0), 30)
    into v_exam_score
    from public.pkpd_exam_results exam_result
   where exam_result.org_id = v_teacher.org_id
     and exam_result.cycle_id = v_cycle.id
     and exam_result.teacher_id = v_teacher.id
   limit 1;

  select setting_row.final_max_score
    into v_final_max_score_override
    from public.pkpd_teacher_result_settings setting_row
   where setting_row.org_id = v_teacher.org_id
     and setting_row.cycle_id = v_cycle.id
     and setting_row.teacher_id = v_teacher.id
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

  v_base_score := coalesce(
    v_summary.final_score,
    v_summary.base_total_score,
    v_summary.current_entered_score
  );
  v_final_score_with_extra := v_summary.final_score_with_extra;
  v_final_score := case
    when v_final_score_with_extra is not null
      and (v_base_score is null or v_final_score_with_extra > v_base_score)
    then v_final_score_with_extra
    else v_base_score
  end;
  v_final_max_score := coalesce(
    v_final_max_score_override,
    case
      when v_is_exam_exempt then 70
      else 100
    end
  );
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
    to_jsonb(v_summary)
      || jsonb_build_object(
        'academicYear', v_cycle.year,
        'finalScore', v_final_score,
        'baseScore', v_base_score,
        'baseTotalScore', v_base_score,
        'finalScoreWithExtra', v_final_score_with_extra,
        'finalMaxScore', v_final_max_score,
        'final_max_score', v_final_max_score,
        'finalMaxScoreOverride', v_final_max_score_override,
        'final_max_score_override', v_final_max_score_override,
        'finalPercentage', v_final_percentage,
        'final_percentage', v_final_percentage,
        'status', v_status,
        'isBiqTeacher', v_summary.is_biq_teacher,
        'isExamExempt', v_is_exam_exempt,
        'is_exam_exempt', v_is_exam_exempt,
        'is_pkpd_non_participant', v_is_exam_exempt,
        'exam_score', case when v_is_exam_exempt then null else v_exam_score end,
        'portfolioDetails', v_portfolio_details,
        'portfolio_details', v_portfolio_details,
        'subjects', coalesce(v_subjects, '[]'::jsonb)
      ),
    case
      when v_review.id is null then null
      else jsonb_build_object(
        'reviewText', v_review.review_text,
        'review_text', v_review.review_text,
        'recommendationText', v_review.recommendation_text,
        'recommendation_text', v_review.recommendation_text
      )
    end,
    coalesce(v_subjects, '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_latest_pkpd_result() to authenticated;
grant select, insert, update on table public.pkpd_teacher_result_settings to authenticated;
grant execute on function public.get_pkpd_teacher_final_max_scores(text, text) to authenticated;
grant execute on function public.set_pkpd_teacher_final_max_score(text, text, integer)
  to authenticated;

notify pgrst, 'reload schema';
