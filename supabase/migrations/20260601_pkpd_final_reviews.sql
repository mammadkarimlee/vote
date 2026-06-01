-- Saved PKPD final reviews and review-generation audit events.
-- Additive only: existing PKPD scoring tables and source data are untouched.

create table if not exists public.pkpd_final_reviews (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  cycle_id text not null references public.survey_cycles(id) on delete cascade,
  teacher_id text not null references public.teachers(id) on delete cascade,
  review_text text not null default '',
  recommendation_text text not null default '',
  generated_by text references public.users(id) on delete set null,
  generated_at timestamptz,
  updated_by text references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  is_manual_edited boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, cycle_id, teacher_id)
);

create index if not exists pkpd_final_reviews_cycle_idx
  on public.pkpd_final_reviews (org_id, cycle_id);
create index if not exists pkpd_final_reviews_teacher_idx
  on public.pkpd_final_reviews (teacher_id);

create or replace function public.can_write_pkpd_final_review(p_branch_id text)
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
      public.is_branch_staff()
      and public.current_branch_id() = p_branch_id
    )
    or exists (
      select 1
      from public.campus_leadership leadership_row
      where leadership_row.org_id = public.current_org_id()
        and leadership_row.campus_id = p_branch_id
        and leadership_row.user_id = auth.uid()::text
        and leadership_row.role = 'BRANCH_MANAGER'
        and leadership_row.is_active = true
        and leadership_row.can_evaluate_teachers = true
        and leadership_row.deleted_at is null
        and (leadership_row.starts_at is null or leadership_row.starts_at <= now())
        and (leadership_row.ends_at is null or leadership_row.ends_at >= now())
    );
$$;

grant execute on function public.can_write_pkpd_final_review(text) to authenticated;

alter table public.pkpd_final_reviews enable row level security;

drop policy if exists pkpd_final_reviews_select on public.pkpd_final_reviews;
create policy pkpd_final_reviews_select on public.pkpd_final_reviews
  for select
  using (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.can_write_pkpd_final_review(branch_id)
      and public.current_org_id() = org_id
    )
    or exists (
      select 1
      from public.teachers teacher_row
      where teacher_row.id = pkpd_final_reviews.teacher_id
        and teacher_row.org_id = pkpd_final_reviews.org_id
        and teacher_row.user_id = auth.uid()::text
        and teacher_row.deleted_at is null
    )
  );

drop policy if exists pkpd_final_reviews_insert on public.pkpd_final_reviews;
create policy pkpd_final_reviews_insert on public.pkpd_final_reviews
  for insert
  with check (
    public.current_org_id() = org_id
    and public.can_write_pkpd_final_review(branch_id)
  );

drop policy if exists pkpd_final_reviews_update on public.pkpd_final_reviews;
create policy pkpd_final_reviews_update on public.pkpd_final_reviews
  for update
  using (
    public.current_org_id() = org_id
    and public.can_write_pkpd_final_review(branch_id)
  )
  with check (
    public.current_org_id() = org_id
    and public.can_write_pkpd_final_review(branch_id)
  );

create or replace function public.validate_pkpd_final_review_scope()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.teachers teacher_row
    where teacher_row.id = new.teacher_id
      and teacher_row.org_id = new.org_id
      and teacher_row.branch_id = new.branch_id
      and teacher_row.deleted_at is null
  ) then
    raise exception 'Yekun rey ucun muellim kampusu etibarsizdir';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = new.cycle_id
      and cycle_row.org_id = new.org_id
  ) then
    raise exception 'Yekun rey ucun sorqu etibarsizdir';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_pkpd_final_review_scope on public.pkpd_final_reviews;
create trigger validate_pkpd_final_review_scope
  before insert or update on public.pkpd_final_reviews
  for each row execute function public.validate_pkpd_final_review_scope();

create or replace function public.log_pkpd_final_review_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.audit_logs (
    org_id,
    actor_id,
    action,
    table_name,
    row_id,
    before,
    after
  )
  values (
    new.org_id,
    auth.uid()::text,
    case when tg_op = 'INSERT' then 'SAVED' else 'EDITED' end,
    'pkpd_final_reviews',
    new.teacher_id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists audit_pkpd_final_reviews on public.pkpd_final_reviews;
create trigger audit_pkpd_final_reviews
  after insert or update on public.pkpd_final_reviews
  for each row execute function public.log_pkpd_final_review_change();

create or replace function public.log_pkpd_final_review_generation(
  p_cycle_id text,
  p_teacher_id text,
  p_action text,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_teacher public.teachers%rowtype;
begin
  if p_action not in ('GENERATED', 'REGENERATED') then
    raise exception 'Yekun rey audit emeliyyati etibarsizdir';
  end if;

  select teacher_row.*
  into v_teacher
  from public.teachers teacher_row
  where teacher_row.id = p_teacher_id
    and teacher_row.org_id = public.current_org_id()
    and teacher_row.deleted_at is null;

  if not found or not public.can_write_pkpd_final_review(v_teacher.branch_id) then
    raise exception 'Yekun rey hazirlamaq ucun icazeniz yoxdur';
  end if;

  if not exists (
    select 1
    from public.survey_cycles cycle_row
    where cycle_row.id = p_cycle_id
      and cycle_row.org_id = v_teacher.org_id
  ) then
    raise exception 'Sorqu tapilmadi';
  end if;

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
    p_action,
    'pkpd_final_reviews',
    p_teacher_id,
    jsonb_build_object(
      'cycle_id', p_cycle_id,
      'teacher_id', p_teacher_id,
      'draft', coalesce(p_after, '{}'::jsonb)
    )
  );
end;
$$;

grant select, insert, update on table public.pkpd_final_reviews to authenticated;
grant execute on function public.log_pkpd_final_review_generation(text, text, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
