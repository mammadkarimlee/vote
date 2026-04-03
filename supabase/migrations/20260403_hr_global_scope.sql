begin;

create or replace function public.is_hr()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()::text
      and role::text = 'hr'
  )
$$;

grant execute on function public.is_hr() to authenticated;

alter policy branches_select on public.branches
using (
  public.is_superadmin()
  or (public.current_org_id() = org_id and public.current_branch_id() = id)
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy users_select on public.users
using (
  id = auth.uid()::text
  or public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy departments_select on public.departments
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy teachers_select on public.teachers
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and (
      public.current_branch_id() = branch_id
      or public.current_branch_id() = any(branch_ids)
    )
  )
  or (public.is_hr() and public.current_org_id() = org_id)
  or exists (
    select 1 from public.tasks t
    where t.rater_id = auth.uid()::text
      and t.target_id = teachers.id
      and t.org_id = teachers.org_id
  )
);

alter policy teaching_assignments_select on public.teaching_assignments
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy questions_select on public.questions
using (
  public.is_superadmin()
  or (public.is_hr() and public.current_org_id() = org_id)
  or exists (
    select 1
      from public.question_sets qs
      join public.tasks t
        on t.cycle_id = qs.cycle_id
     where t.rater_id = auth.uid()::text
       and t.org_id = qs.org_id
       and questions.org_id = qs.org_id
       and questions.id = any(qs.question_ids)
       and (
        (t.rater_role = 'student' and t.target_type = 'teacher' and qs.target_flow = 'student_teacher')
        or (t.rater_role = 'teacher' and t.target_type = 'manager' and qs.target_flow = 'teacher_management')
        or (t.rater_role = 'teacher' and t.target_type = 'teacher' and qs.target_flow = 'teacher_self')
        or (t.rater_role = 'manager' and t.target_type = 'teacher' and qs.target_flow = 'management_teacher')
       )
  )
);

alter policy survey_cycles_select on public.survey_cycles
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and (
      branch_ids is null
      or array_length(branch_ids, 1) is null
      or public.current_branch_id() = any(branch_ids)
    )
  )
  or (public.is_hr() and public.current_org_id() = org_id)
  or exists (
    select 1
      from public.tasks t
     where t.rater_id = auth.uid()::text
       and t.cycle_id = survey_cycles.id
       and t.org_id = survey_cycles.org_id
  )
);

alter policy tasks_select_branch on public.tasks
using (
  (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy submissions_select_branch on public.submissions
using (
  (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy answers_select_branch on public.answers
using (
  (
    public.is_branch_staff()
    and public.current_org_id() = answers.org_id
    and exists (
      select 1
        from public.submissions s
       where s.task_id = answers.submission_id
         and s.org_id = answers.org_id
         and s.branch_id = public.current_branch_id()
    )
  )
  or (public.is_hr() and public.current_org_id() = answers.org_id)
);

alter policy biq_class_results_select on public.biq_class_results
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_teacher_biq_results_select on public.pkpd_teacher_biq_results
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_self_reviews_select on public.pkpd_self_reviews
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_self_reviews_insert on public.pkpd_self_reviews
with check (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_self_reviews_update on public.pkpd_self_reviews
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
)
with check (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_self_reviews_delete on public.pkpd_self_reviews
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

commit;
