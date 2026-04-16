begin;

create or replace function public.can_access_question(
  p_org_id text,
  p_question_id text
)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    public.is_superadmin()
    or exists (
      select 1
        from public.tasks t
        join public.question_sets qs
          on qs.org_id = t.org_id
         and qs.cycle_id = t.cycle_id
       where t.rater_id = auth.uid()::text
         and t.org_id = p_org_id
         and p_question_id = any(qs.question_ids)
         and (
          (t.rater_role = 'student' and t.target_type = 'teacher' and qs.target_flow = 'student_teacher')
          or (t.rater_role = 'teacher' and t.target_type = 'manager' and qs.target_flow = 'teacher_management')
          or (t.rater_role = 'teacher' and t.target_type = 'teacher' and qs.target_flow = 'teacher_self')
          or (t.rater_role = 'manager' and t.target_type = 'teacher' and qs.target_flow = 'management_teacher')
         )
    )
$$;

grant execute on function public.can_access_question(text, text) to authenticated;

alter policy questions_select on public.questions
using (
  public.can_access_question(org_id, id)
);

commit;
