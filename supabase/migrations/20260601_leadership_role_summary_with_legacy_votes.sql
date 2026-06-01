begin;

-- PKPD leadership scoring has exactly three business roles. Other leadership
-- assignments may stay in the structure, but they must not affect the score.
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
             else 3
           end as precedence
      from target t
      join public.campus_leadership cl
        on cl.org_id = t.org_id
       and cl.campus_id = t.branch_id
       and cl.deleted_at is null
       and cl.is_active = true
       and cl.can_evaluate_teachers = true
       and cl.role in ('BRANCH_MANAGER', 'DEPUTY_DIRECTOR', 'DEPARTMENT_HEAD')
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

drop function if exists public.leadership_score_summary(text, text);

create function public.leadership_score_summary(
  p_cycle_id text,
  p_campus_id text default null
)
returns table (
  teacher_id text,
  leadership_evaluation_score numeric,
  submitted_count bigint,
  eligible_count bigint,
  is_complete boolean,
  is_overridden boolean,
  branch_manager_submitted boolean,
  deputy_submitted boolean,
  department_head_submitted boolean,
  branch_manager_eligible boolean,
  deputy_eligible boolean,
  department_head_eligible boolean
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if not (
    public.is_superadmin()
    or exists (
      select 1 from public.users u
       where u.id = auth.uid()::text
         and u.org_id = public.current_org_id()
         and u.role::text = 'hr'
    )
    or (
      p_campus_id is not null
      and (
        public.can_manage_campus_leadership(p_campus_id)
        or (
          public.is_branch_staff()
          and public.current_branch_id() = p_campus_id
        )
      )
    )
  ) then
    raise exception 'icazə yoxdur';
  end if;

  return query
  with teacher_scope as (
    select t.id, t.org_id, t.branch_id, t.department_id
      from public.teachers t
      join public.survey_cycles c
        on c.id = p_cycle_id
       and c.org_id = t.org_id
     where t.org_id = public.current_org_id()
       and t.deleted_at is null
       and (p_campus_id is null or t.branch_id = p_campus_id)
       and (
         c.branch_ids is null
         or array_length(c.branch_ids, 1) is null
         or t.branch_id = any(c.branch_ids)
       )
  ),
  current_evaluator_roles as (
    select t.id as teacher_id,
           eligible.evaluator_id,
           eligible.evaluator_role
      from teacher_scope t
      cross join lateral public.eligible_leadership_evaluators(t.id, p_cycle_id) eligible
     where eligible.evaluator_role in ('BRANCH_MANAGER', 'DEPUTY_DIRECTOR', 'DEPARTMENT_HEAD')
  ),
  legacy_task_roles as (
    select t.id as teacher_id,
           task.id as task_id,
           task.rater_id as evaluator_id,
           case
             when t.department_id is not null
              and right(task.id, length('management-department-' || t.department_id))
                    = 'management-department-' || t.department_id
               then 'DEPARTMENT_HEAD'
             else assigned_role.evaluator_role
           end as evaluator_role
      from teacher_scope t
      join public.tasks task
        on task.org_id = t.org_id
       and task.cycle_id = p_cycle_id
       and task.target_type::text = 'teacher'
       and task.target_id = t.id
       and task.rater_role::text = 'manager'
      left join current_evaluator_roles assigned_role
        on assigned_role.teacher_id = t.id
       and assigned_role.evaluator_id = task.rater_id
       and assigned_role.evaluator_role in ('BRANCH_MANAGER', 'DEPUTY_DIRECTOR')
     where (
       t.department_id is not null
       and right(task.id, length('management-department-' || t.department_id))
             = 'management-department-' || t.department_id
     )
     or (
       right(task.id, length('management-branch-' || t.branch_id))
         = 'management-branch-' || t.branch_id
       and assigned_role.evaluator_role in ('BRANCH_MANAGER', 'DEPUTY_DIRECTOR')
     )
  ),
  eligible_roles as (
    select assigned_role.teacher_id, assigned_role.evaluator_role
      from current_evaluator_roles assigned_role
    union
    select legacy_role.teacher_id, legacy_role.evaluator_role
      from legacy_task_roles legacy_role
     where legacy_role.evaluator_role is not null
  ),
  modern_role_scores as (
    select assigned_role.teacher_id,
           assigned_role.evaluator_role,
           avg(e.total_score) as score
      from current_evaluator_roles assigned_role
      join public.leadership_evaluations e
        on e.cycle_id = p_cycle_id
       and e.teacher_id = assigned_role.teacher_id
       and e.evaluator_id = assigned_role.evaluator_id
       and e.evaluator_role = assigned_role.evaluator_role
       and e.is_submitted = true
     group by assigned_role.teacher_id, assigned_role.evaluator_role
  ),
  legacy_task_scores as (
    select legacy_role.teacher_id,
           legacy_role.evaluator_role,
           legacy_role.task_id,
           avg(
             case
               when jsonb_typeof(a.value) <> 'number' then null
               when coalesce(q.scale_min, 1) = 1 and coalesce(q.scale_max, 10) = 10
                 then (a.value::text)::numeric
               when coalesce(q.scale_max, 10) <= coalesce(q.scale_min, 1)
                 then (a.value::text)::numeric
               else (
                 ((a.value::text)::numeric - coalesce(q.scale_min, 1))
                 / (coalesce(q.scale_max, 10) - coalesce(q.scale_min, 1))
               ) * 10
             end
           ) as score
      from legacy_task_roles legacy_role
      join public.submissions s
        on s.task_id = legacy_role.task_id
      join public.answers a
        on a.submission_id = s.task_id
      join public.questions q
        on q.id = a.question_id
       and q.org_id = a.org_id
       and q.type::text = 'scale'
     where legacy_role.evaluator_role is not null
     group by legacy_role.teacher_id, legacy_role.evaluator_role, legacy_role.task_id
  ),
  legacy_role_scores as (
    select legacy_score.teacher_id,
           legacy_score.evaluator_role,
           avg(legacy_score.score) as score
      from legacy_task_scores legacy_score
     where legacy_score.score is not null
     group by legacy_score.teacher_id, legacy_score.evaluator_role
  ),
  candidate_role_scores as (
    select modern_score.teacher_id,
           modern_score.evaluator_role,
           modern_score.score,
           1 as priority
      from modern_role_scores modern_score
    union all
    select legacy_score.teacher_id,
           legacy_score.evaluator_role,
           legacy_score.score,
           2 as priority
      from legacy_role_scores legacy_score
  ),
  resolved_role_scores as (
    select distinct on (candidate.teacher_id, candidate.evaluator_role)
           candidate.teacher_id,
           candidate.evaluator_role,
           candidate.score
      from candidate_role_scores candidate
     order by candidate.teacher_id, candidate.evaluator_role, candidate.priority
  ),
  eligible_aggregate as (
    select eligible_role.teacher_id,
           count(*) as eligible_count,
           bool_or(eligible_role.evaluator_role = 'BRANCH_MANAGER') as branch_manager_eligible,
           bool_or(eligible_role.evaluator_role = 'DEPUTY_DIRECTOR') as deputy_eligible,
           bool_or(eligible_role.evaluator_role = 'DEPARTMENT_HEAD') as department_head_eligible
      from eligible_roles eligible_role
     group by eligible_role.teacher_id
  ),
  vote_aggregate as (
    select vote.teacher_id,
           avg(vote.score) as score,
           count(*) as submitted_count,
           bool_or(vote.evaluator_role = 'BRANCH_MANAGER') as branch_manager_submitted,
           bool_or(vote.evaluator_role = 'DEPUTY_DIRECTOR') as deputy_submitted,
           bool_or(vote.evaluator_role = 'DEPARTMENT_HEAD') as department_head_submitted
      from resolved_role_scores vote
     group by vote.teacher_id
  )
  select t.id,
         votes.score,
         coalesce(votes.submitted_count, 0),
         coalesce(eligible.eligible_count, 0),
         coalesce(eligible.eligible_count, 0) > 0
           and (
             coalesce(votes.submitted_count, 0) >= coalesce(eligible.eligible_count, 0)
             or (override_row.id is not null and coalesce(votes.submitted_count, 0) > 0)
           ),
         override_row.id is not null,
         coalesce(votes.branch_manager_submitted, false),
         coalesce(votes.deputy_submitted, false),
         coalesce(votes.department_head_submitted, false),
         coalesce(eligible.branch_manager_eligible, false),
         coalesce(eligible.deputy_eligible, false),
         coalesce(eligible.department_head_eligible, false)
    from teacher_scope t
    left join eligible_aggregate eligible
      on eligible.teacher_id = t.id
    left join vote_aggregate votes
      on votes.teacher_id = t.id
    left join public.leadership_completion_overrides override_row
      on override_row.org_id = t.org_id
     and override_row.cycle_id = p_cycle_id
     and override_row.teacher_id = t.id;
end;
$$;

grant execute on function public.leadership_score_summary(text, text) to authenticated;

create or replace function public.set_leadership_completion_override(
  p_cycle_id text,
  p_teacher_id text,
  p_enabled boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_teacher public.teachers%rowtype;
begin
  select * into v_teacher
    from public.teachers
   where id = p_teacher_id
     and org_id = public.current_org_id()
     and deleted_at is null;
  if not found or not public.can_manage_campus_leadership(v_teacher.branch_id) then
    raise exception 'icazə yoxdur';
  end if;

  if p_enabled then
    if not exists (
      select 1 from public.leadership_evaluations e
       where e.org_id = v_teacher.org_id
         and e.cycle_id = p_cycle_id
         and e.teacher_id = p_teacher_id
         and e.is_submitted = true
    ) and not exists (
      select 1
        from public.tasks task
        join public.submissions s on s.task_id = task.id
       where task.org_id = v_teacher.org_id
         and task.cycle_id = p_cycle_id
         and task.target_type::text = 'teacher'
         and task.target_id = p_teacher_id
         and task.rater_role::text = 'manager'
         and (
           right(task.id, length('management-branch-' || v_teacher.branch_id))
             = 'management-branch-' || v_teacher.branch_id
           or (
             v_teacher.department_id is not null
             and right(task.id, length('management-department-' || v_teacher.department_id))
               = 'management-department-' || v_teacher.department_id
           )
         )
    ) then
      raise exception 'yekunlaşdırmaq üçün ən azı bir rəhbərlik səsi olmalıdır';
    end if;
    insert into public.leadership_completion_overrides (
      org_id, cycle_id, teacher_id, campus_id, finalized_by, note
    ) values (
      v_teacher.org_id, p_cycle_id, p_teacher_id, v_teacher.branch_id,
      auth.uid()::text, nullif(trim(p_note), '')
    )
    on conflict (org_id, cycle_id, teacher_id) do update
       set finalized_by = excluded.finalized_by,
           finalized_at = now(),
           note = excluded.note;
  else
    delete from public.leadership_completion_overrides
     where org_id = v_teacher.org_id
       and cycle_id = p_cycle_id
       and teacher_id = p_teacher_id;
  end if;
end;
$$;

grant execute on function public.set_leadership_completion_override(text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';

commit;
