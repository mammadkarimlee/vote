-- Xətai Campusu: subjects + teaching assignments import
-- Generated at: 2026-02-19T13:38:36.221Z
-- Source: seed/Xətai dərs cədvəli I gün II gün.ini

begin;

create temporary table tmp_xetai_subjects (
  name text not null,
  code text
) on commit drop;

insert into tmp_xetai_subjects (name, code)
values
  ('Azərbaycan dili və ədəbiyyat', 'azerbaycan-dili-ve-edebiyyat'),
  ('Coğrafiya', 'cografiya'),
  ('Fizika', 'fizika'),
  ('İnformatika', 'informatika'),
  ('İngilis dili', 'ingilis-dili'),
  ('Kimya', 'kimya'),
  ('Riyaziyyat', 'riyaziyyat'),
  ('Rus dili və ədəbiyyat', 'rus-dili-ve-edebiyyat'),
  ('Tarix', 'tarix');

create temporary table tmp_xetai_assignments (
  teacher_id text not null,
  group_name text not null,
  subject_name text not null,
  year integer not null
) on commit drop;

insert into tmp_xetai_assignments (teacher_id, group_name, subject_name, year)
values
  ('xetai-teacher-elizade-samire-elxan', '10R-I+IV', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('xetai-teacher-abbasova-siyale-ilqar', '10R-I+IV', 'Fizika', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '10R-I+IV', 'İnformatika', 2026),
  ('xetai-teacher-mehraliyeva-safura-vuqar', '10R-I+IV', 'İngilis dili', 2026),
  ('xetai-teacher-ehmedova-leman-rafiq', '10R-I+IV', 'Kimya', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '10R-I+IV', 'Riyaziyyat', 2026),
  ('xetai-teacher-kazimova-gunel-faiq', '10R-I+IV', 'Rus dili və ədəbiyyat', 2026),
  ('xetai-teacher-elizade-samire-elxan', '10R-II+III', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('xetai-teacher-musayeva-medine-receb', '10R-II+III', 'Coğrafiya', 2026),
  ('xetai-teacher-mehraliyeva-safura-vuqar', '10R-II+III', 'İngilis dili', 2026),
  ('xetai-teacher-mahmudova-naile-rovsen', '10R-II+III', 'Riyaziyyat', 2026),
  ('xetai-teacher-memmedova-irade-mobil', '10R-II+III', 'Rus dili və ədəbiyyat', 2026),
  ('xetai-teacher-abdullayeva-vefa-gunduz', '10R-II+III', 'Tarix', 2026),
  ('xetai-teacher-abbasova-siyale-ilqar', '11A', 'Fizika', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '11A', 'İnformatika', 2026),
  ('xetai-teacher-mehraliyeva-safura-vuqar', '11A', 'İngilis dili', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '11A', 'Riyaziyyat', 2026),
  ('xetai-teacher-kazimova-gunel-faiq', '11A', 'Rus dili və ədəbiyyat', 2026),
  ('xetai-teacher-musayeva-medine-receb', '11R', 'Coğrafiya', 2026),
  ('xetai-teacher-mehraliyeva-safura-vuqar', '11R', 'İngilis dili', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '11R', 'Riyaziyyat', 2026),
  ('xetai-teacher-kazimova-gunel-faiq', '11R', 'Rus dili və ədəbiyyat', 2026),
  ('xetai-teacher-abdullayeva-vefa-gunduz', '11R', 'Tarix', 2026),
  ('xetai-teacher-elizade-samire-elxan', '8-9R-A', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('xetai-teacher-abbasova-siyale-ilqar', '8-9R-A', 'Fizika', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '8-9R-A', 'İnformatika', 2026),
  ('xetai-teacher-elizade-jale-nazim', '8-9R-A', 'İngilis dili', 2026),
  ('xetai-teacher-ehmedova-leman-rafiq', '8-9R-A', 'Kimya', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '8-9R-A', 'Riyaziyyat', 2026),
  ('xetai-teacher-memmedova-irade-mobil', '8-9R-A', 'Rus dili və ədəbiyyat', 2026),
  ('xetai-teacher-elizade-samire-elxan', '8-9R-B', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('xetai-teacher-abbasova-siyale-ilqar', '8-9R-B', 'Fizika', 2026),
  ('xetai-teacher-hesenova-sehane-sediyevna', '8-9R-B', 'İnformatika', 2026),
  ('xetai-teacher-elizade-jale-nazim', '8-9R-B', 'İngilis dili', 2026),
  ('xetai-teacher-ehmedova-leman-rafiq', '8-9R-B', 'Kimya', 2026),
  ('xetai-teacher-mahmudova-naile-rovsen', '8-9R-B', 'Riyaziyyat', 2026),
  ('xetai-teacher-seferova-aytac-yasef', '8-9R-B', 'Rus dili və ədəbiyyat', 2026);

do $$
declare
  v_branch_id text;
  v_department_id text;
  v_missing_teachers integer;
  v_missing_groups integer;
  v_missing_subjects integer;
begin
  select b.id
    into v_branch_id
    from public.branches b
   where b.org_id = 'default'
     and b.code = 'XET'
   limit 1;

  if v_branch_id is null then
    raise exception 'Xətai branch (code XET) not found.';
  end if;

  select d.id
    into v_department_id
    from public.departments d
   where d.org_id = 'default'
     and d.branch_id = v_branch_id
     and d.name = 'Umumi'
   limit 1;

  if v_department_id is null then
    insert into public.departments (id, org_id, branch_id, name)
    values (gen_random_uuid()::text, 'default', v_branch_id, 'Umumi')
    returning id into v_department_id;
  end if;

  insert into public.subjects (
    id,
    org_id,
    name,
    code,
    department_id,
    deleted_at,
    archived_at
  )
  select
    coalesce((
      select s.id
        from public.subjects s
       where s.org_id = 'default'
         and s.department_id = v_department_id
         and lower(s.name) = lower(ts.name)
       limit 1
    ), gen_random_uuid()::text),
    'default',
    ts.name,
    nullif(ts.code, ''),
    v_department_id,
    null,
    null
  from tmp_xetai_subjects ts
  on conflict (org_id, department_id, name) do update
  set code = coalesce(excluded.code, public.subjects.code),
      deleted_at = null,
      archived_at = null;

  select count(*) into v_missing_teachers
    from tmp_xetai_assignments a
   where not exists (
     select 1
       from public.teachers t
      where t.id = a.teacher_id
        and t.org_id = 'default'
        and t.deleted_at is null
   );

  select count(*) into v_missing_groups
    from tmp_xetai_assignments a
   where not exists (
     select 1
       from public.groups g
      where g.org_id = 'default'
        and g.branch_id = v_branch_id
        and g.deleted_at is null
        and lower(g.name) = lower(a.group_name)
   );

  select count(*) into v_missing_subjects
    from tmp_xetai_assignments a
   where not exists (
     select 1
       from public.subjects s
      where s.org_id = 'default'
        and s.department_id = v_department_id
        and s.deleted_at is null
        and lower(s.name) = lower(a.subject_name)
   );

  if v_missing_teachers > 0 or v_missing_groups > 0 or v_missing_subjects > 0 then
    raise exception
      'Import stopped. Missing -> teacher: %, group: %, subject: %',
      v_missing_teachers,
      v_missing_groups,
      v_missing_subjects;
  end if;

  insert into public.teaching_assignments (
    org_id,
    teacher_id,
    group_id,
    subject_id,
    branch_id,
    year,
    deleted_at,
    archived_at
  )
  select
    'default',
    a.teacher_id,
    g.id,
    s.id,
    v_branch_id,
    a.year,
    null,
    null
  from tmp_xetai_assignments a
  join public.groups g
    on g.org_id = 'default'
   and g.branch_id = v_branch_id
   and g.deleted_at is null
   and lower(g.name) = lower(a.group_name)
  join public.subjects s
    on s.org_id = 'default'
   and s.department_id = v_department_id
   and s.deleted_at is null
   and lower(s.name) = lower(a.subject_name)
  on conflict (org_id, teacher_id, group_id, subject_id, branch_id, year) do update
  set deleted_at = null,
      archived_at = null;
end $$;

commit;
