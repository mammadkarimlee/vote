-- Prevent lower leadership roles from evaluating an active branch manager.
-- The branch manager may still evaluate deputy teachers covered by the campus scope.

create or replace function public.eligible_leadership_evaluators(
  p_teacher_id text,
  p_cycle_id text default null
)
returns table (
  campus_leadership_id text,
  evaluator_id text,
  evaluator_role text,
  coverage_type text
)
language sql
security definer
set search_path = public, auth
stable
as $$
  with target as (
    select t.*, c.year as cycle_year
      from public.teachers t
      left join public.survey_cycles c
        on c.id = p_cycle_id
       and c.org_id = t.org_id
     where t.id = p_teacher_id
       and t.deleted_at is null
  ),
  matching as (
    select cl.id,
           cl.user_id,
           cl.role,
           cl.coverage_type,
           case cl.role
             when 'BRANCH_MANAGER' then 1
             when 'DEPUTY_DIRECTOR' then 2
             when 'SUBJECT_DEPUTY' then 3
             when 'CAMBRIDGE_DEPUTY' then 4
             else 5
           end as precedence
      from target t
      join public.campus_leadership cl
        on cl.org_id = t.org_id
       and cl.campus_id = t.branch_id
       and cl.deleted_at is null
       and cl.is_active = true
       and cl.can_evaluate_teachers = true
       and cl.coverage_type <> 'PENDING'
       and (cl.starts_at is null or cl.starts_at <= now())
       and (cl.ends_at is null or cl.ends_at >= now())
       and cl.user_id is distinct from t.user_id
       and not (
         cl.role <> 'BRANCH_MANAGER'
         and exists (
           select 1
             from public.campus_leadership target_manager
            where target_manager.org_id = t.org_id
              and target_manager.user_id = t.user_id
              and target_manager.role = 'BRANCH_MANAGER'
              and target_manager.deleted_at is null
              and target_manager.is_active = true
              and target_manager.coverage_type <> 'PENDING'
              and (target_manager.starts_at is null or target_manager.starts_at <= now())
              and (target_manager.ends_at is null or target_manager.ends_at >= now())
         )
       )
     where (
       (cl.role = 'BRANCH_MANAGER' and cl.coverage_type = 'ALL_CAMPUS_TEACHERS')
       or (
         cl.role <> 'BRANCH_MANAGER'
         and (
           cl.coverage_type = 'ALL_CAMPUS_TEACHERS'
           or (
             cl.coverage_type = 'DEPARTMENT_BASED'
             and cl.department_id = t.department_id
           )
           or (
             cl.coverage_type = 'CUSTOM_TEACHERS'
             and exists (
               select 1
                 from public.campus_leadership_teacher_scope scope
                where scope.org_id = cl.org_id
                  and scope.campus_leadership_id = cl.id
                  and scope.teacher_id = t.id
             )
           )
           or (
             cl.coverage_type = 'GRADE_RANGE'
             and exists (
               select 1
                 from public.teaching_assignments ta
                 join public.groups g on g.id = ta.group_id
                where ta.org_id = t.org_id
                  and ta.teacher_id = t.id
                  and ta.branch_id = t.branch_id
                  and ta.deleted_at is null
                  and (t.cycle_year is null or ta.year = t.cycle_year)
                  and substring(g.class_level from '^[0-9]+') is not null
                  and substring(g.class_level from '^[0-9]+')::integer
                    between cl.grade_from and cl.grade_to
             )
           )
         )
       )
     )
  )
  select distinct on (m.user_id)
         m.id, m.user_id, m.role, m.coverage_type
    from matching m
   order by m.user_id, m.precedence, m.id
$$;

grant execute on function public.eligible_leadership_evaluators(text, text) to authenticated;
