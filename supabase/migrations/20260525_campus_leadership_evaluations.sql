begin;

create table if not exists public.campus_leadership (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  campus_id text not null references public.branches (id) on delete cascade,
  user_id text not null references public.users (id) on delete cascade,
  role text not null check (role in (
    'BRANCH_MANAGER',
    'DEPUTY_DIRECTOR',
    'DEPARTMENT_HEAD',
    'SUBJECT_DEPUTY',
    'CAMBRIDGE_DEPUTY'
  )),
  coverage_type text not null check (coverage_type in (
    'ALL_CAMPUS_TEACHERS',
    'GRADE_RANGE',
    'DEPARTMENT_BASED',
    'CUSTOM_TEACHERS',
    'PENDING'
  )),
  grade_from integer,
  grade_to integer,
  department_id text references public.departments (id) on delete set null,
  is_active boolean not null default true,
  can_evaluate_teachers boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  note text,
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text references public.users (id) on delete set null,
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (grade_from is null or grade_from >= 0),
  check (grade_to is null or grade_to >= grade_from)
);

create table if not exists public.campus_leadership_teacher_scope (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  campus_leadership_id text not null references public.campus_leadership (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (org_id, campus_leadership_id, teacher_id)
);

create table if not exists public.leadership_evaluations (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  evaluator_id text not null references public.users (id) on delete cascade,
  campus_id text not null references public.branches (id) on delete cascade,
  evaluator_role text not null check (evaluator_role in (
    'BRANCH_MANAGER',
    'DEPUTY_DIRECTOR',
    'DEPARTMENT_HEAD',
    'SUBJECT_DEPUTY',
    'CAMBRIDGE_DEPUTY'
  )),
  coverage_type text not null check (coverage_type in (
    'ALL_CAMPUS_TEACHERS',
    'GRADE_RANGE',
    'DEPARTMENT_BASED',
    'CUSTOM_TEACHERS',
    'PENDING'
  )),
  discipline_score numeric not null check (discipline_score between 0 and 2),
  teamwork_score numeric not null check (teamwork_score between 0 and 2),
  communication_score numeric not null check (communication_score between 0 and 2),
  professional_development_score numeric not null check (professional_development_score between 0 and 2),
  platform_usage_score numeric not null check (platform_usage_score between 0 and 2),
  total_score numeric not null check (total_score between 0 and 10),
  comment text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  is_submitted boolean not null default false,
  unique (org_id, cycle_id, teacher_id, evaluator_id),
  check (
    total_score =
      discipline_score +
      teamwork_score +
      communication_score +
      professional_development_score +
      platform_usage_score
  )
);

create table if not exists public.leadership_completion_overrides (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  campus_id text not null references public.branches (id) on delete cascade,
  finalized_by text not null references public.users (id) on delete cascade,
  finalized_at timestamptz not null default now(),
  note text,
  unique (org_id, cycle_id, teacher_id)
);

create index if not exists campus_leadership_campus_idx
  on public.campus_leadership (org_id, campus_id)
  where deleted_at is null;
create index if not exists campus_leadership_user_idx
  on public.campus_leadership (org_id, user_id)
  where deleted_at is null;
create unique index if not exists campus_leadership_active_branch_manager_uidx
  on public.campus_leadership (org_id, campus_id)
  where role = 'BRANCH_MANAGER' and is_active = true and deleted_at is null;
create index if not exists leadership_evaluations_teacher_idx
  on public.leadership_evaluations (org_id, cycle_id, teacher_id);
create index if not exists leadership_evaluations_evaluator_idx
  on public.leadership_evaluations (org_id, cycle_id, evaluator_id);

create or replace function public.can_manage_campus_leadership(p_campus_id text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select public.is_superadmin()
    or exists (
      select 1
        from public.users u
       where u.id = auth.uid()::text
         and u.org_id = public.current_org_id()
         and u.role::text = 'branch_admin'
         and u.branch_id = p_campus_id
         and u.deleted_at is null
    )
$$;

grant execute on function public.can_manage_campus_leadership(text) to authenticated;

create or replace function public.validate_campus_leadership()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.branches b
     where b.id = new.campus_id
       and b.org_id = new.org_id
       and b.deleted_at is null
  ) then
    raise exception 'campus etibarsızdır';
  end if;

  if not exists (
    select 1 from public.users u
     where u.id = new.user_id
       and u.org_id = new.org_id
       and u.deleted_at is null
  ) then
    raise exception 'rəhbərlik istifadəçisi tapılmadı';
  end if;

  if new.role = 'BRANCH_MANAGER' then
    new.coverage_type := 'ALL_CAMPUS_TEACHERS';
    new.grade_from := null;
    new.grade_to := null;
    new.department_id := null;
  elsif new.coverage_type = 'GRADE_RANGE' then
    if new.grade_from is null or new.grade_to is null or new.grade_from > new.grade_to then
      raise exception 'sinif aralığı tam və düzgün daxil edilməlidir';
    end if;
    new.department_id := null;
  elsif new.coverage_type = 'DEPARTMENT_BASED' then
    if new.department_id is null or not exists (
      select 1 from public.departments d
       where d.id = new.department_id
         and d.org_id = new.org_id
         and d.branch_id = new.campus_id
         and d.deleted_at is null
    ) then
      raise exception 'kafedra kurasiyası etibarsızdır';
    end if;
    new.grade_from := null;
    new.grade_to := null;
  else
    new.grade_from := null;
    new.grade_to := null;
    new.department_id := null;
  end if;

  if new.role = 'DEPARTMENT_HEAD' and new.coverage_type <> 'PENDING'
     and new.coverage_type <> 'DEPARTMENT_BASED' then
    raise exception 'kafedra müdiri kafedra əsasında qiymətləndirməlidir';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campus_leadership_validate on public.campus_leadership;
create trigger campus_leadership_validate
  before insert or update on public.campus_leadership
  for each row execute function public.validate_campus_leadership();

create or replace function public.validate_campus_leadership_scope()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_scope public.campus_leadership%rowtype;
begin
  select * into v_scope
    from public.campus_leadership
   where id = new.campus_leadership_id
     and org_id = new.org_id
     and deleted_at is null;
  if not found or v_scope.coverage_type <> 'CUSTOM_TEACHERS' then
    raise exception 'manual müəllim kurasiyası üçün rəhbərlik təyinatı etibarsızdır';
  end if;
  if not exists (
    select 1 from public.teachers t
     where t.id = new.teacher_id
       and t.org_id = new.org_id
       and t.branch_id = v_scope.campus_id
       and t.deleted_at is null
  ) then
    raise exception 'manual müəllim kurasiyası campusa uyğun deyil';
  end if;
  return new;
end;
$$;

drop trigger if exists campus_leadership_teacher_scope_validate on public.campus_leadership_teacher_scope;
create trigger campus_leadership_teacher_scope_validate
  before insert or update on public.campus_leadership_teacher_scope
  for each row execute function public.validate_campus_leadership_scope();

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

create or replace function public.validate_leadership_evaluation()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_campus text;
  v_role text;
  v_coverage text;
begin
  select t.branch_id into v_campus
    from public.teachers t
   where t.id = new.teacher_id
     and t.org_id = new.org_id
     and t.deleted_at is null;
  if not found then
    raise exception 'müəllim tapılmadı';
  end if;

  if exists (
    select 1 from public.teachers t
     where t.id = new.teacher_id
       and t.user_id = new.evaluator_id
  ) then
    raise exception 'rəhbərlik şəxsi özünü qiymətləndirə bilməz';
  end if;

  select e.evaluator_role, e.coverage_type
    into v_role, v_coverage
    from public.eligible_leadership_evaluators(new.teacher_id, new.cycle_id) e
   where e.evaluator_id = new.evaluator_id
   limit 1;
  if not found then
    raise exception 'bu müəllimi qiymətləndirmək üçün səlahiyyət yoxdur';
  end if;

  new.campus_id := v_campus;
  new.evaluator_role := v_role;
  new.coverage_type := v_coverage;
  new.total_score :=
    new.discipline_score +
    new.teamwork_score +
    new.communication_score +
    new.professional_development_score +
    new.platform_usage_score;
  new.updated_at := now();
  if new.is_submitted then
    new.submitted_at := coalesce(new.submitted_at, now());
  else
    new.submitted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists leadership_evaluations_validate on public.leadership_evaluations;
create trigger leadership_evaluations_validate
  before insert or update on public.leadership_evaluations
  for each row execute function public.validate_leadership_evaluation();

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
    select 1 from public.survey_cycles c
     where c.id = p_cycle_id
       and c.org_id = v_org_id
       and c.status = 'OPEN'
  ) then
    raise exception 'aktiv sorğu dövrü tapılmadı';
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
    p_discipline_score + p_teamwork_score + p_communication_score +
      p_professional_development_score + p_platform_usage_score,
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
     and (p_campus_id is null or t.branch_id = p_campus_id);
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
    join public.branches b on b.id = t.branch_id
    join public.eligible_leadership_evaluators(t.id, p_cycle_id) own_scope
      on own_scope.evaluator_id = auth.uid()::text
    left join public.departments d on d.id = t.department_id
    left join lateral (
      select string_agg(distinct g.class_level, ', ' order by g.class_level) as grade_scope
        from public.teaching_assignments ta
        join public.groups g on g.id = ta.group_id
        join public.survey_cycles c on c.id = p_cycle_id and c.year = ta.year
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
   order by t.name;
$$;

grant execute on function public.leadership_targets(text) to authenticated;

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

drop trigger if exists audit_campus_leadership on public.campus_leadership;
create trigger audit_campus_leadership
  after insert or update or delete on public.campus_leadership
  for each row execute function public.log_audit();
drop trigger if exists audit_campus_leadership_teacher_scope on public.campus_leadership_teacher_scope;
create trigger audit_campus_leadership_teacher_scope
  after insert or update or delete on public.campus_leadership_teacher_scope
  for each row execute function public.log_audit();
drop trigger if exists audit_leadership_evaluations on public.leadership_evaluations;
create trigger audit_leadership_evaluations
  after insert or update or delete on public.leadership_evaluations
  for each row execute function public.log_audit();
drop trigger if exists audit_leadership_completion_overrides on public.leadership_completion_overrides;
create trigger audit_leadership_completion_overrides
  after insert or update or delete on public.leadership_completion_overrides
  for each row execute function public.log_audit();

alter table public.campus_leadership enable row level security;
alter table public.campus_leadership_teacher_scope enable row level security;
alter table public.leadership_evaluations enable row level security;
alter table public.leadership_completion_overrides enable row level security;

create policy campus_leadership_select on public.campus_leadership
  for select using (
    public.can_manage_campus_leadership(campus_id)
    or user_id = auth.uid()::text
    or exists (
      select 1 from public.users u
       where u.id = auth.uid()::text
         and u.org_id = org_id
         and u.role::text = 'hr'
    )
  );
create policy campus_leadership_insert on public.campus_leadership
  for insert with check (public.can_manage_campus_leadership(campus_id));
create policy campus_leadership_update on public.campus_leadership
  for update using (public.can_manage_campus_leadership(campus_id))
  with check (public.can_manage_campus_leadership(campus_id));

create policy campus_leadership_teacher_scope_select on public.campus_leadership_teacher_scope
  for select using (
    exists (
      select 1 from public.campus_leadership cl
       where cl.id = campus_leadership_id
         and cl.org_id = org_id
         and (
           public.can_manage_campus_leadership(cl.campus_id)
           or cl.user_id = auth.uid()::text
         )
    )
  );
create policy campus_leadership_teacher_scope_insert on public.campus_leadership_teacher_scope
  for insert with check (
    exists (
      select 1 from public.campus_leadership cl
       where cl.id = campus_leadership_id
         and cl.org_id = org_id
         and public.can_manage_campus_leadership(cl.campus_id)
    )
  );
create policy campus_leadership_teacher_scope_delete on public.campus_leadership_teacher_scope
  for delete using (
    exists (
      select 1 from public.campus_leadership cl
       where cl.id = campus_leadership_id
         and cl.org_id = org_id
         and public.can_manage_campus_leadership(cl.campus_id)
    )
  );

create policy leadership_evaluations_select on public.leadership_evaluations
  for select using (
    evaluator_id = auth.uid()::text
    or public.can_manage_campus_leadership(campus_id)
    or exists (
      select 1 from public.users u
       where u.id = auth.uid()::text
         and u.org_id = org_id
         and u.role::text = 'hr'
    )
  );

create policy leadership_completion_overrides_select on public.leadership_completion_overrides
  for select using (
    public.can_manage_campus_leadership(campus_id)
    or exists (
      select 1 from public.users u
       where u.id = auth.uid()::text
         and u.org_id = org_id
         and u.role::text = 'hr'
    )
  );

create policy survey_cycles_select_leadership on public.survey_cycles
  for select using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.campus_leadership cl
       where cl.org_id = survey_cycles.org_id
         and cl.user_id = auth.uid()::text
         and cl.is_active = true
         and cl.can_evaluate_teachers = true
         and cl.coverage_type <> 'PENDING'
         and cl.deleted_at is null
         and (
           survey_cycles.branch_ids is null
           or array_length(survey_cycles.branch_ids, 1) is null
           or cl.campus_id = any(survey_cycles.branch_ids)
         )
    )
  );

grant select, insert, update, delete on public.campus_leadership to authenticated;
grant select, insert, delete on public.campus_leadership_teacher_scope to authenticated;
grant select on public.leadership_evaluations to authenticated;
grant select on public.leadership_completion_overrides to authenticated;

notify pgrst, 'reload schema';

commit;
