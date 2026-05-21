create table if not exists public.pkpd_teacher_biq_averages (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  score numeric not null,
  note text,
  created_at timestamptz not null default now(),
  check (score >= 0 and score <= 100),
  unique (org_id, cycle_id, teacher_id)
);

create index if not exists pkpd_teacher_biq_averages_org_idx
  on public.pkpd_teacher_biq_averages (org_id);
create index if not exists pkpd_teacher_biq_averages_branch_idx
  on public.pkpd_teacher_biq_averages (branch_id);
create index if not exists pkpd_teacher_biq_averages_cycle_idx
  on public.pkpd_teacher_biq_averages (cycle_id);
create index if not exists pkpd_teacher_biq_averages_teacher_idx
  on public.pkpd_teacher_biq_averages (teacher_id);

alter table public.pkpd_teacher_biq_averages enable row level security;

drop policy if exists pkpd_teacher_biq_averages_select
  on public.pkpd_teacher_biq_averages;
drop policy if exists pkpd_teacher_biq_averages_insert
  on public.pkpd_teacher_biq_averages;
drop policy if exists pkpd_teacher_biq_averages_update
  on public.pkpd_teacher_biq_averages;
drop policy if exists pkpd_teacher_biq_averages_delete
  on public.pkpd_teacher_biq_averages;

create policy pkpd_teacher_biq_averages_select
  on public.pkpd_teacher_biq_averages
  for select
  using (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_teacher_biq_averages_insert
  on public.pkpd_teacher_biq_averages
  for insert
  with check (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_teacher_biq_averages_update
  on public.pkpd_teacher_biq_averages
  for update
  using (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

drop trigger if exists audit_pkpd_teacher_biq_averages
  on public.pkpd_teacher_biq_averages;
create trigger audit_pkpd_teacher_biq_averages
  after insert or update or delete on public.pkpd_teacher_biq_averages
  for each row execute function public.log_audit();
