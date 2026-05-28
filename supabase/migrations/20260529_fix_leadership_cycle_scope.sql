begin;

create table if not exists public.leadership_evaluation_cycle_repairs (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  leadership_evaluation_id text not null,
  old_cycle_id text not null references public.survey_cycles (id) on delete cascade,
  new_cycle_id text references public.survey_cycles (id) on delete set null,
  teacher_id text not null references public.teachers (id) on delete cascade,
  evaluator_id text not null references public.users (id) on delete cascade,
  reason text not null,
  original_row jsonb not null,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (leadership_evaluation_id, old_cycle_id, new_cycle_id)
);

with mis_scoped as (
  select e.*,
         t.branch_id as teacher_branch_id,
         coalesce(e.submitted_at, e.updated_at) as effective_at
    from public.leadership_evaluations e
    join public.teachers t
      on t.id = e.teacher_id
     and t.org_id = e.org_id
     and t.deleted_at is null
    join public.survey_cycles c
      on c.id = e.cycle_id
     and c.org_id = e.org_id
   where t.branch_id is not null
     and c.branch_ids is not null
     and array_length(c.branch_ids, 1) is not null
     and not (t.branch_id = any(c.branch_ids))
),
resolved as (
  select m.*,
         candidate.new_cycle_id
    from mis_scoped m
    join lateral (
      select array_agg(c2.id order by c2.start_at desc, c2.id) as candidate_ids
        from public.survey_cycles c2
       where c2.org_id = m.org_id
         and c2.id <> m.cycle_id
         and c2.branch_ids is not null
         and array_length(c2.branch_ids, 1) is not null
         and m.teacher_branch_id = any(c2.branch_ids)
         and (c2.start_at is null or m.effective_at is null or c2.start_at <= m.effective_at)
         and (c2.end_at is null or m.effective_at is null or c2.end_at >= m.effective_at)
    ) candidates on array_length(candidates.candidate_ids, 1) = 1
    cross join lateral (
      select candidates.candidate_ids[1] as new_cycle_id
    ) candidate
)
insert into public.leadership_evaluation_cycle_repairs (
  org_id,
  leadership_evaluation_id,
  old_cycle_id,
  new_cycle_id,
  teacher_id,
  evaluator_id,
  reason,
  original_row
)
select r.org_id,
       r.id,
       r.cycle_id,
       r.new_cycle_id,
       r.teacher_id,
       r.evaluator_id,
       'leadership evaluation was submitted under a cycle whose branch_ids did not include the teacher campus',
       to_jsonb(r)
  from resolved r
on conflict (leadership_evaluation_id, old_cycle_id, new_cycle_id) do nothing;

with mis_scoped as (
  select e.*,
         t.branch_id as teacher_branch_id,
         coalesce(e.submitted_at, e.updated_at) as effective_at
    from public.leadership_evaluations e
    join public.teachers t
      on t.id = e.teacher_id
     and t.org_id = e.org_id
     and t.deleted_at is null
    join public.survey_cycles c
      on c.id = e.cycle_id
     and c.org_id = e.org_id
   where t.branch_id is not null
     and c.branch_ids is not null
     and array_length(c.branch_ids, 1) is not null
     and not (t.branch_id = any(c.branch_ids))
),
resolved as (
  select m.*,
         candidate.new_cycle_id
    from mis_scoped m
    join lateral (
      select array_agg(c2.id order by c2.start_at desc, c2.id) as candidate_ids
        from public.survey_cycles c2
       where c2.org_id = m.org_id
         and c2.id <> m.cycle_id
         and c2.branch_ids is not null
         and array_length(c2.branch_ids, 1) is not null
         and m.teacher_branch_id = any(c2.branch_ids)
         and (c2.start_at is null or m.effective_at is null or c2.start_at <= m.effective_at)
         and (c2.end_at is null or m.effective_at is null or c2.end_at >= m.effective_at)
    ) candidates on array_length(candidates.candidate_ids, 1) = 1
    cross join lateral (
      select candidates.candidate_ids[1] as new_cycle_id
    ) candidate
),
safe_moves as (
  select r.*
    from resolved r
   where not exists (
     select 1
       from public.leadership_evaluations existing
      where existing.org_id = r.org_id
        and existing.cycle_id = r.new_cycle_id
        and existing.teacher_id = r.teacher_id
        and existing.evaluator_id = r.evaluator_id
        and existing.id <> r.id
   )
),
updated as (
  update public.leadership_evaluations e
     set cycle_id = s.new_cycle_id
    from safe_moves s
   where e.id = s.id
     and e.org_id = s.org_id
  returning e.id, s.cycle_id as old_cycle_id, s.new_cycle_id
)
update public.leadership_evaluation_cycle_repairs repair
   set applied = true
  from updated u
 where repair.leadership_evaluation_id = u.id
   and repair.old_cycle_id = u.old_cycle_id
   and repair.new_cycle_id = u.new_cycle_id;

create or replace function public.submit_leadership_evaluation(
  p_cycle_id text,
  p_teacher_id text,
  p_discipline_score numeric,
  p_teamwork_score numeric,
  p_communication_score numeric,
  p_professional_development_score numeric,
  p_platform_usage_score numeric,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id text := public.current_org_id();
  v_campus_id text;
  v_role text;
  v_coverage text;
begin
  if auth.uid() is null then
    raise exception 'istifadəçi təsdiqlənməyib';
  end if;

  if not exists (
    select 1
      from public.survey_cycles c
      join public.teachers t
        on t.id = p_teacher_id
       and t.org_id = c.org_id
       and t.deleted_at is null
     where c.id = p_cycle_id
       and c.org_id = v_org_id
       and c.status = 'OPEN'
       and (c.start_at is null or now() >= c.start_at)
       and (c.end_at is null or now() <= c.end_at)
       and (
         c.branch_ids is null
         or array_length(c.branch_ids, 1) is null
         or t.branch_id = any(c.branch_ids)
       )
  ) then
    raise exception 'seçilmiş sorğu dövrü müəllimin campusuna uyğun deyil';
  end if;

  select t.branch_id, eligible.evaluator_role, eligible.coverage_type
    into v_campus_id, v_role, v_coverage
    from public.teachers t
    join public.eligible_leadership_evaluators(p_teacher_id, p_cycle_id) eligible
      on eligible.evaluator_id = auth.uid()::text
   where t.id = p_teacher_id
     and t.org_id = v_org_id
     and t.deleted_at is null
   limit 1;
  if not found then
    raise exception 'bu müəllimi qiymətləndirmək üçün səlahiyyət yoxdur';
  end if;

  insert into public.leadership_evaluations (
    org_id, cycle_id, teacher_id, evaluator_id, campus_id,
    evaluator_role, coverage_type, discipline_score, teamwork_score,
    communication_score, professional_development_score, platform_usage_score,
    total_score, comment, submitted_at, is_submitted
  ) values (
    v_org_id, p_cycle_id, p_teacher_id, auth.uid()::text, v_campus_id,
    v_role, v_coverage, p_discipline_score, p_teamwork_score,
    p_communication_score, p_professional_development_score, p_platform_usage_score,
    p_discipline_score + p_teamwork_score +
      p_communication_score + p_professional_development_score +
      p_platform_usage_score,
    nullif(trim(p_comment), ''), now(), true
  )
  on conflict (org_id, cycle_id, teacher_id, evaluator_id) do update
     set discipline_score = excluded.discipline_score,
         teamwork_score = excluded.teamwork_score,
         communication_score = excluded.communication_score,
         professional_development_score = excluded.professional_development_score,
         platform_usage_score = excluded.platform_usage_score,
         total_score = excluded.total_score,
         comment = excluded.comment,
         is_submitted = true,
         submitted_at = now();
end;
$$;

grant execute on function public.submit_leadership_evaluation(text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

create or replace function public.leadership_score_summary(
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
  department_head_submitted boolean
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
         coalesce(votes.department_head_submitted, false)
    from public.teachers t
    join public.survey_cycles c
      on c.id = p_cycle_id
     and c.org_id = t.org_id
    left join lateral (
      select count(*) as eligible_count
        from public.eligible_leadership_evaluators(t.id, p_cycle_id)
    ) eligible on true
    left join lateral (
      select avg(e.total_score) as score,
             count(*) as submitted_count,
             bool_or(e.evaluator_role = 'BRANCH_MANAGER') as branch_manager_submitted,
             bool_or(e.evaluator_role in ('DEPUTY_DIRECTOR', 'SUBJECT_DEPUTY', 'CAMBRIDGE_DEPUTY')) as deputy_submitted,
             bool_or(e.evaluator_role = 'DEPARTMENT_HEAD') as department_head_submitted
        from public.leadership_evaluations e
        join public.eligible_leadership_evaluators(t.id, p_cycle_id) eligible_vote
          on eligible_vote.evaluator_id = e.evaluator_id
       where e.org_id = t.org_id
         and e.cycle_id = p_cycle_id
         and e.teacher_id = t.id
         and e.is_submitted = true
    ) votes on true
    left join public.leadership_completion_overrides override_row
      on override_row.org_id = t.org_id
     and override_row.cycle_id = p_cycle_id
     and override_row.teacher_id = t.id
   where t.org_id = public.current_org_id()
     and t.deleted_at is null
     and (p_campus_id is null or t.branch_id = p_campus_id)
     and (
       c.branch_ids is null
       or array_length(c.branch_ids, 1) is null
       or t.branch_id = any(c.branch_ids)
     );
end;
$$;

grant execute on function public.leadership_score_summary(text, text) to authenticated;

create or replace function public.leadership_targets(p_cycle_id text)
returns table (
  teacher_id text,
  teacher_name text,
  campus_id text,
  campus_name text,
  department_name text,
  grade_scope text,
  evaluator_role text,
  coverage_type text,
  submitted_count bigint,
  eligible_count bigint,
  is_complete boolean,
  total_score numeric,
  discipline_score numeric,
  teamwork_score numeric,
  communication_score numeric,
  professional_development_score numeric,
  platform_usage_score numeric,
  comment text,
  is_submitted boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select t.id,
         t.name,
         t.branch_id,
         b.name,
         coalesce(d.name, '-'),
         coalesce(grades.grade_scope, '-'),
         own_scope.evaluator_role,
         own_scope.coverage_type,
         coalesce(votes.submitted_count, 0),
         coalesce(eligible.eligible_count, 0),
         coalesce(eligible.eligible_count, 0) > 0
           and (
             coalesce(votes.submitted_count, 0) >= coalesce(eligible.eligible_count, 0)
             or (override_row.id is not null and coalesce(votes.submitted_count, 0) > 0)
           ),
         own_vote.total_score,
         own_vote.discipline_score,
         own_vote.teamwork_score,
         own_vote.communication_score,
         own_vote.professional_development_score,
         own_vote.platform_usage_score,
         own_vote.comment,
         coalesce(own_vote.is_submitted, false),
         own_vote.updated_at
    from public.teachers t
    join public.survey_cycles c
      on c.id = p_cycle_id
     and c.org_id = t.org_id
    join public.branches b on b.id = t.branch_id
    join public.eligible_leadership_evaluators(t.id, p_cycle_id) own_scope
      on own_scope.evaluator_id = auth.uid()::text
    left join public.departments d on d.id = t.department_id
    left join lateral (
      select string_agg(distinct g.class_level, ', ' order by g.class_level) as grade_scope
        from public.teaching_assignments ta
        join public.groups g on g.id = ta.group_id
        join public.survey_cycles c2 on c2.id = p_cycle_id and c2.year = ta.year
       where ta.teacher_id = t.id and ta.deleted_at is null
    ) grades on true
    left join lateral (
      select count(*) as eligible_count
        from public.eligible_leadership_evaluators(t.id, p_cycle_id)
    ) eligible on true
    left join lateral (
      select count(*) as submitted_count
        from public.leadership_evaluations e
        join public.eligible_leadership_evaluators(t.id, p_cycle_id) eligible_vote
          on eligible_vote.evaluator_id = e.evaluator_id
       where e.cycle_id = p_cycle_id
         and e.teacher_id = t.id
         and e.is_submitted = true
    ) votes on true
    left join public.leadership_evaluations own_vote
      on own_vote.org_id = t.org_id
     and own_vote.cycle_id = p_cycle_id
     and own_vote.teacher_id = t.id
     and own_vote.evaluator_id = auth.uid()::text
    left join public.leadership_completion_overrides override_row
      on override_row.org_id = t.org_id
     and override_row.cycle_id = p_cycle_id
     and override_row.teacher_id = t.id
   where t.org_id = public.current_org_id()
     and t.deleted_at is null
     and (
       c.branch_ids is null
       or array_length(c.branch_ids, 1) is null
       or t.branch_id = any(c.branch_ids)
     )
   order by t.name;
$$;

grant execute on function public.leadership_targets(text) to authenticated;

notify pgrst, 'reload schema';

commit;
