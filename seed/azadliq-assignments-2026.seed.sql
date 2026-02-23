-- Azadl?q Campusu: subjects + teaching assignments import
-- Generated at: 2026-02-19T10:44:43.907Z
-- Source CSVs:
--   seed\import-templates\assignments-azadliq-2026.csv
--   seed\import-templates\subjects-azadliq-2026.csv

begin;

create temporary table tmp_azadliq_subjects (
  name text not null,
  code text
) on commit drop;

insert into tmp_azadliq_subjects (name, code)
values
  ('Azərbaycan dili və ədəbiyyat', 'az-dili-edebiyyat'),
  ('Biologiya', 'biologiya'),
  ('Coğrafiya', 'cografiya'),
  ('Fizika', 'fizika'),
  ('İngilis dili', 'ingilis-dili'),
  ('İnformatika', 'informatika'),
  ('Kimya', 'kimya'),
  ('Riyaziyyat', 'riyaziyyat'),
  ('Rus dili və ədəbiyyat', 'rus-dili-edebiyyat'),
  ('Tarix', 'tarix');

create temporary table tmp_azadliq_assignments (
  teacher_id text not null,
  group_name text not null,
  subject_name text not null,
  year integer not null
) on commit drop;

insert into tmp_azadliq_assignments (teacher_id, group_name, subject_name, year)
values
  ('azadliq-teacher-oktay-babayev-ezizaga-oglu', '11A1', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-oktay-babayev-ezizaga-oglu', '11A2', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-xeyal-esedov-huseyinaga-oglu', '11A2', 'Riyaziyyat', 2026),
  ('azadliq-teacher-xeyal-esedov-huseyinaga-oglu', '10A1', 'Riyaziyyat', 2026),
  ('azadliq-teacher-xeyal-esedov-huseyinaga-oglu', '11A1', 'Riyaziyyat', 2026),
  ('azadliq-teacher-zerengiz-memisova-sahin-qizi', '10A1', 'İngilis dili', 2026),
  ('azadliq-teacher-zerengiz-memisova-sahin-qizi', '10A2', 'İngilis dili', 2026),
  ('azadliq-teacher-zerengiz-memisova-sahin-qizi', '11A1', 'İngilis dili', 2026),
  ('azadliq-teacher-aysel-haciyeva-elvan-qizi', '11A1', 'Fizika', 2026),
  ('azadliq-teacher-aysel-haciyeva-elvan-qizi', '10A1', 'Fizika', 2026),
  ('azadliq-teacher-aysel-haciyeva-elvan-qizi', '9A1', 'Fizika', 2026),
  ('azadliq-teacher-elsen-quliyev-meqsud-oglu', '9A1', 'Kimya', 2026),
  ('azadliq-teacher-elsen-quliyev-meqsud-oglu', '10A1', 'Kimya', 2026),
  ('azadliq-teacher-elsen-quliyev-meqsud-oglu', '11A1', 'Kimya', 2026),
  ('azadliq-teacher-ayten-memmedova-ilham-qizi', '11A2', 'İngilis dili', 2026),
  ('azadliq-teacher-ayten-memmedova-ilham-qizi', '9A1', 'İngilis dili', 2026),
  ('azadliq-teacher-ayten-memmedova-ilham-qizi', '9A2', 'İngilis dili', 2026),
  ('azadliq-teacher-natiq-mazanov-ferrux-oglu', '9A1', 'Biologiya', 2026),
  ('azadliq-teacher-natiq-mazanov-ferrux-oglu', '10A1', 'Biologiya', 2026),
  ('azadliq-teacher-natiq-mazanov-ferrux-oglu', '11A1', 'Biologiya', 2026),
  ('azadliq-teacher-balli-memmedli-elcin-qizi', '9A1', 'İnformatika', 2026),
  ('azadliq-teacher-balli-memmedli-elcin-qizi', '10A1', 'İnformatika', 2026),
  ('azadliq-teacher-balli-memmedli-elcin-qizi', '11A1', 'İnformatika', 2026),
  ('azadliq-teacher-cinare-bedelova-nazim-qizi', '10A2', 'Coğrafiya', 2026),
  ('azadliq-teacher-cinare-bedelova-nazim-qizi', '11A2', 'Coğrafiya', 2026),
  ('azadliq-teacher-cinare-bedelova-nazim-qizi', '9A2', 'Coğrafiya', 2026),
  ('azadliq-teacher-pervane-resulova-davud-qizi', '9A2', 'Tarix', 2026),
  ('azadliq-teacher-pervane-resulova-davud-qizi', '11A2', 'Tarix', 2026),
  ('azadliq-teacher-aysel-huseynli-novruz-qizi', '9A1', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-aysel-huseynli-novruz-qizi', '9A2', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-aysel-huseynli-novruz-qizi', '10A2', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-bextiyar-huseynov-davud-oglu', '9A1', 'Riyaziyyat', 2026),
  ('azadliq-teacher-bextiyar-huseynov-davud-oglu', '9A2', 'Riyaziyyat', 2026),
  ('azadliq-teacher-bextiyar-huseynov-davud-oglu', '10A2', 'Riyaziyyat', 2026),
  ('azadliq-teacher-nermin-emirova-eldar-qizi', '10A1', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-resul-ferzeliyev-huseyn-oglu', '10A2', 'Tarix', 2026),
  ('azadliq-teacher-husniyye-elesgerova-gulaga-qizi', '9R', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-husniyye-elesgerova-gulaga-qizi', '10R', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-husniyye-elesgerova-gulaga-qizi', '11R', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-husniyye-elesgerova-gulaga-qizi', '10A2', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-husniyye-elesgerova-gulaga-qizi', '9A2', 'Azərbaycan dili və ədəbiyyat', 2026),
  ('azadliq-teacher-nusabe-qayayeva-elyar-qizi', '9R', 'Rus dili və ədəbiyyat', 2026),
  ('azadliq-teacher-nusabe-qayayeva-elyar-qizi', '10R', 'Rus dili və ədəbiyyat', 2026),
  ('azadliq-teacher-nusabe-qayayeva-elyar-qizi', '11R', 'Rus dili və ədəbiyyat', 2026),
  ('azadliq-teacher-aybeniz-memmedova-rufet-qizi', '9R', 'Riyaziyyat', 2026),
  ('azadliq-teacher-aybeniz-memmedova-rufet-qizi', '10R', 'Riyaziyyat', 2026),
  ('azadliq-teacher-aybeniz-memmedova-rufet-qizi', '11R', 'Riyaziyyat', 2026),
  ('azadliq-teacher-leman-agayeva-ferhad-qizi', '9R', 'İngilis dili', 2026),
  ('azadliq-teacher-leman-agayeva-ferhad-qizi', '10R', 'İngilis dili', 2026),
  ('azadliq-teacher-leman-agayeva-ferhad-qizi', '11R', 'İngilis dili', 2026),
  ('azadliq-teacher-sevinc-esedova-rufet-qizi', '11R', 'Kimya', 2026),
  ('azadliq-teacher-sevinc-esedova-rufet-qizi', '9R', 'Kimya', 2026),
  ('azadliq-teacher-sevinc-esedova-rufet-qizi', '10R', 'Kimya', 2026),
  ('azadliq-teacher-irade-memmedova-mayil-qizi', '9R', 'Tarix', 2026),
  ('azadliq-teacher-irade-memmedova-mayil-qizi', '10R', 'Tarix', 2026),
  ('azadliq-teacher-irade-memmedova-mayil-qizi', '11R', 'Tarix', 2026),
  ('azadliq-teacher-raisa-siraliyeva-maksudovna', '9R', 'Coğrafiya', 2026),
  ('azadliq-teacher-raisa-siraliyeva-maksudovna', '10R', 'Coğrafiya', 2026),
  ('azadliq-teacher-raisa-siraliyeva-maksudovna', '11R', 'Coğrafiya', 2026),
  ('azadliq-teacher-esmira-qubadova-rovsen-qizi', '9R', 'İnformatika', 2026),
  ('azadliq-teacher-esmira-qubadova-rovsen-qizi', '10R', 'İnformatika', 2026),
  ('azadliq-teacher-esmira-qubadova-rovsen-qizi', '11R', 'İnformatika', 2026),
  ('azadliq-teacher-ibrahimova-fatime-vidadiyevna', '9R', 'Fizika', 2026),
  ('azadliq-teacher-ibrahimova-fatime-vidadiyevna', '10R', 'Fizika', 2026),
  ('azadliq-teacher-ibrahimova-fatime-vidadiyevna', '11R', 'Fizika', 2026);

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
     and b.code = 'AZA'
   limit 1;

  if v_branch_id is null then
    raise exception 'Azadliq branch (code AZA) not found. Run branches seed first.';
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
  from tmp_azadliq_subjects ts
  on conflict (org_id, department_id, name) do update
  set code = coalesce(excluded.code, public.subjects.code),
      deleted_at = null,
      archived_at = null;

  select count(*) into v_missing_teachers
    from tmp_azadliq_assignments a
   where not exists (
     select 1
       from public.teachers t
      where t.id = a.teacher_id
        and t.org_id = 'default'
        and t.deleted_at is null
        and (
          t.branch_id = v_branch_id
          or v_branch_id = any(coalesce(t.branch_ids, '{}'::text[]))
        )
   );

  select count(*) into v_missing_groups
    from tmp_azadliq_assignments a
   where not exists (
     select 1
       from public.groups g
      where g.org_id = 'default'
        and g.branch_id = v_branch_id
        and g.deleted_at is null
        and lower(g.name) = lower(a.group_name)
   );

  select count(*) into v_missing_subjects
    from tmp_azadliq_assignments a
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
      'Import dayand?r?ld?. Tap?lmayanlar -> teacher: %, group: %, subject: %',
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
  from tmp_azadliq_assignments a
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

