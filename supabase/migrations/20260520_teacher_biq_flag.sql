alter table public.teachers
  add column if not exists is_biq_teacher boolean not null default true;

update public.teachers
   set is_biq_teacher = false
 where teacher_category <> 'standard'
   and is_biq_teacher is true;

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

alter policy pkpd_exam_results_select on public.pkpd_exam_results
  using (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

alter policy pkpd_exam_results_insert on public.pkpd_exam_results
  with check (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

alter policy pkpd_exam_results_update on public.pkpd_exam_results
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

alter policy pkpd_exam_results_delete on public.pkpd_exam_results
  using (
    public.is_superadmin()
    or (public.is_hr() and public.current_org_id() = org_id)
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'pkpd_exam_results_score_miq_check'
       and conrelid = 'public.pkpd_exam_results'::regclass
  ) then
    alter table public.pkpd_exam_results
      add constraint pkpd_exam_results_score_miq_check
      check (score >= 0 and score <= 30) not valid;
  end if;
end $$;
