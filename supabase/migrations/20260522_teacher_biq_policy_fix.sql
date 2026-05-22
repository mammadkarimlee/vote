alter table public.teachers
  add column if not exists is_biq_teacher boolean not null default true;

alter policy teachers_update on public.teachers
  using (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        public.current_branch_id() = branch_id
        or public.current_branch_id() = any(branch_ids)
      )
    )
  )
  with check (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        public.current_branch_id() = branch_id
        or public.current_branch_id() = any(branch_ids)
      )
      and (
        department_id is null
        or exists (
          select 1
            from public.departments d
           where d.id = department_id
             and d.org_id = org_id
             and d.branch_id = branch_id
        )
      )
    )
  );
