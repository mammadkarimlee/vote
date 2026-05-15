create table if not exists public.student_assignment_overrides (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  user_id text references public.users (id) on delete set null,
  assignment_id text not null references public.teaching_assignments (id) on delete cascade,
  year integer not null,
  action text not null check (action in ('include', 'exclude')),
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by text references public.users (id) on delete set null,
  deleted_at timestamptz
);

create unique index if not exists student_assignment_overrides_active_unique
  on public.student_assignment_overrides (org_id, branch_id, student_id, assignment_id, year, action)
  where deleted_at is null;

create index if not exists student_assignment_overrides_student_idx
  on public.student_assignment_overrides (student_id, year)
  where deleted_at is null;

create index if not exists student_assignment_overrides_user_idx
  on public.student_assignment_overrides (user_id, year)
  where deleted_at is null;

create index if not exists student_assignment_overrides_assignment_idx
  on public.student_assignment_overrides (assignment_id, year)
  where deleted_at is null;

alter table public.student_assignment_overrides enable row level security;

drop policy if exists student_assignment_overrides_select on public.student_assignment_overrides;
drop policy if exists student_assignment_overrides_insert on public.student_assignment_overrides;
drop policy if exists student_assignment_overrides_update on public.student_assignment_overrides;
drop policy if exists student_assignment_overrides_delete on public.student_assignment_overrides;

create policy student_assignment_overrides_select on public.student_assignment_overrides
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy student_assignment_overrides_insert on public.student_assignment_overrides
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy student_assignment_overrides_update on public.student_assignment_overrides
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy student_assignment_overrides_delete on public.student_assignment_overrides
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

create policy tasks_insert on public.tasks
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy tasks_update on public.tasks
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy tasks_delete on public.tasks
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

notify pgrst, 'reload schema';
