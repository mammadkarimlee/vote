begin;

create table if not exists public.student_group_memberships (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  user_id text references public.users (id) on delete set null,
  group_id text not null references public.groups (id) on delete cascade,
  year integer not null,
  membership_type text not null default 'block'
    check (membership_type in ('class', 'block')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, branch_id, student_id, group_id, year, membership_type)
);

create index if not exists student_group_memberships_student_idx
  on public.student_group_memberships (student_id, year)
  where deleted_at is null;

create index if not exists student_group_memberships_user_idx
  on public.student_group_memberships (user_id, year)
  where deleted_at is null;

create index if not exists student_group_memberships_group_idx
  on public.student_group_memberships (group_id, year)
  where deleted_at is null;

alter table public.student_group_memberships enable row level security;

drop policy if exists student_group_memberships_select on public.student_group_memberships;
drop policy if exists student_group_memberships_insert on public.student_group_memberships;
drop policy if exists student_group_memberships_update on public.student_group_memberships;
drop policy if exists student_group_memberships_delete on public.student_group_memberships;

create policy student_group_memberships_select on public.student_group_memberships
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy student_group_memberships_insert on public.student_group_memberships
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy student_group_memberships_update on public.student_group_memberships
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

create policy student_group_memberships_delete on public.student_group_memberships
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

commit;
