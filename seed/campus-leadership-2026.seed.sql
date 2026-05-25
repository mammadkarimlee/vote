-- Campus leadership initial assignments for leadership evaluation.
-- Run after branches and the named users have been provisioned.
-- Missing users/branches are skipped and can be added from Campus -> Rəhbərlik.
-- user_match accounts for full profile names and known spelling variants in imported user data.

begin;

with requested(campus_match, requested_name, user_match, role, coverage_type, grade_from, grade_to) as (
  values
    ('%Azadlıq%', 'Zülfiyyə Sadiqova', 'Zülfiyyə Sadıqova%', 'BRANCH_MANAGER', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Azadlıq%', 'Yaşar Zeynalov', 'Yaşar Zeynalov%', 'DEPUTY_DIRECTOR', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Nəsimi%', 'Vəli Vəlizadə', 'Vəli Vəlizadə%', 'BRANCH_MANAGER', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Nəsimi%', 'Ayşən Tarverdiyeva', 'Ayşən Tariverdiyeva%', 'DEPUTY_DIRECTOR', 'GRADE_RANGE', 1, 4),
    ('%Nəsimi%', 'Alcan Hacıyev', 'Alcan Haciyev%', 'DEPUTY_DIRECTOR', 'GRADE_RANGE', 5, 8),
    ('%Stars%', 'Fatimə Kərimli', 'Fatimə Kərimli%', 'BRANCH_MANAGER', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Stars%', 'Zamilə Mustafayeva', 'Zamilə Mustafayeva%', 'DEPUTY_DIRECTOR', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Stars%', 'Nərmin Səlimova', 'Nərmin Səlimova%', 'DEPUTY_DIRECTOR', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Qurtuluş%', 'Məmmədli Məmməd', 'Məmməd Məmmədli%', 'BRANCH_MANAGER', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer),
    ('%Qurtuluş%', 'Mətanət Hüseynova', 'Mətanət Hüseynova%', 'DEPUTY_DIRECTOR', 'GRADE_RANGE', 1, 4),
    ('%Qurtuluş%', 'Elmar Əliyev', 'Elmar Əliyev%', 'DEPUTY_DIRECTOR', 'GRADE_RANGE', 5, 8),
    ('%Xətai%', 'Elmin Yaqubbəyli', 'Elmin Yaqubbəyli%', 'BRANCH_MANAGER', 'ALL_CAMPUS_TEACHERS', null::integer, null::integer)
),
resolved as (
  select b.org_id,
         b.id as campus_id,
         u.id as user_id,
         r.role,
         r.coverage_type,
         r.grade_from,
         r.grade_to
    from requested r
    join public.branches b
      on b.org_id = 'default'
     and b.name ilike r.campus_match
     and b.deleted_at is null
    cross join lateral (
      select candidate.id
        from public.users candidate
       where candidate.org_id = b.org_id
         and candidate.display_name ilike r.user_match
         and candidate.deleted_at is null
       order by (candidate.branch_id = b.id) desc, candidate.id
       limit 1
    ) u
)
insert into public.campus_leadership (
  org_id, campus_id, user_id, role, coverage_type, grade_from, grade_to,
  is_active, can_evaluate_teachers, note
)
select r.org_id, r.campus_id, r.user_id, r.role, r.coverage_type,
       r.grade_from, r.grade_to, true, true, '2026 ilkin rəhbərlik siyahısı'
  from resolved r
 where not exists (
   select 1 from public.campus_leadership cl
    where cl.org_id = r.org_id
      and cl.campus_id = r.campus_id
      and cl.user_id = r.user_id
      and cl.role = r.role
      and cl.deleted_at is null
 );

-- These assignments stay visible in structure but cannot enter voting until activated.
with pending(requested_name, user_match, role) as (
  values
    ('Eren Kancılar', 'Eren Kancilar%', 'CAMBRIDGE_DEPUTY'),
    ('Nərgiz Quliyeva', 'Nərgiz Quliyeva%', 'SUBJECT_DEPUTY')
),
resolved as (
  select u.org_id, u.branch_id as campus_id, u.id as user_id, p.role
    from pending p
    cross join lateral (
      select candidate.org_id, candidate.branch_id, candidate.id
        from public.users candidate
       where candidate.org_id = 'default'
         and candidate.display_name ilike p.user_match
         and candidate.branch_id is not null
         and candidate.deleted_at is null
       order by candidate.id
       limit 1
    ) u
)
insert into public.campus_leadership (
  org_id, campus_id, user_id, role, coverage_type,
  is_active, can_evaluate_teachers, note
)
select r.org_id, r.campus_id, r.user_id, r.role, 'PENDING',
       false, false, 'Hələlik aktiv səsverməyə daxil edilmir'
  from resolved r
 where not exists (
   select 1 from public.campus_leadership cl
    where cl.org_id = r.org_id
      and cl.campus_id = r.campus_id
      and cl.user_id = r.user_id
      and cl.role = r.role
      and cl.deleted_at is null
 );

commit;
