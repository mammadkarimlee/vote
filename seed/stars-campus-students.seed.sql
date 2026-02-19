-- Stars Campusu student seed generated from Excel:
-- c:\Users\mamma\Downloads\pkpd üçün\pkpd üçün\şagird siyahıları\Stars Campus Siniflər üzrə balabilgə siyahısı.xlsx
-- Generated at: 2026-02-18 10:36:04
-- Safe to re-run (idempotent for this dataset).

begin;

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;

-- Ensure Stars Campusu branch exists and is active
insert into public.branches (id, org_id, name, code, student_count, deleted_at, archived_at)
values (
  coalesce((select id from public.branches where org_id = 'default' and name = 'Stars Campusu' limit 1), gen_random_uuid()::text),
  'default',
  'Stars Campusu',
  'STR',
  0,
  null,
  null
)
on conflict (org_id, name) do update
set code = excluded.code,
    deleted_at = null,
    archived_at = null;

create temporary table tmp_stars_students (
  student_id text primary key,
  class_code text not null,
  class_level text not null,
  seq_no integer not null,
  student_name text not null
) on commit drop;

insert into tmp_stars_students (student_id, class_code, class_level, seq_no, student_name)
values
  ('stars-student-0e4-001', '0E4', '0', 1, 'Novruzlu Məryəm Camal'),
  ('stars-student-0e4-002', '0E4', '0', 2, 'Muradzadə Tofiq Sadiq'),
  ('stars-student-0e4-003', '0E4', '0', 3, 'Salmanov Murad Orxan'),
  ('stars-student-0e4-004', '0E4', '0', 4, 'Əliyeva Alena Ülfət'),
  ('stars-student-0e4-005', '0E4', '0', 5, 'Zeynallı Oğuzxan Məhəmməd'),
  ('stars-student-0e4-006', '0E4', '0', 6, 'Qubatova Jasmin Famil'),
  ('stars-student-0e4-007', '0E4', '0', 7, 'İbrahimli Müjgan Fuad'),
  ('stars-student-0e4-008', '0E4', '0', 8, 'Süleymanlı Aras Baba'),
  ('stars-student-0e4-009', '0E4', '0', 9, 'Səfərova Jasmin Emin'),
  ('stars-student-0e4-010', '0E4', '0', 10, 'Vəliyeva Alsu Rauf'),
  ('stars-student-0e4-011', '0E4', '0', 11, 'Bingöl Yığıt Galip'),
  ('stars-student-0e4-012', '0E4', '0', 12, 'Şahbaz Miray Tamerlan'),
  ('stars-student-0e4-013', '0E4', '0', 13, 'Allahverdi Ayla Maarif'),
  ('stars-student-0e4-014', '0E4', '0', 14, 'Arifzadə Furqan'),
  ('stars-student-0e4-015', '0E4', '0', 15, 'Ufuk Yekta Kaya'),
  ('stars-student-0e4-016', '0E4', '0', 16, 'Umut Sina Kaya'),
  ('stars-student-0e4-017', '0E4', '0', 17, 'Qurbanov İbrahim Rəhim'),
  ('stars-student-1e6-001', '1E6', '1', 1, 'Məmmədli Aydın Ramin'),
  ('stars-student-1e6-002', '1E6', '1', 2, 'Məmmədli Lalə Ramin'),
  ('stars-student-1e6-003', '1E6', '1', 3, 'Qasımzadə Mustafa Fərid'),
  ('stars-student-1e6-004', '1E6', '1', 4, 'Nurəli Səid Səbuhi'),
  ('stars-student-1r3-001', '1R3', '1', 1, 'Qurbanova Səmra Rəhim'),
  ('stars-student-1r3-002', '1R3', '1', 2, 'Tağızadə Yasmin Tural'),
  ('stars-student-1r3-003', '1R3', '1', 3, 'Hüseynli Xatirə Səid'),
  ('stars-student-1r3-004', '1R3', '1', 4, 'Əliyev Səid Hüseyn'),
  ('stars-student-2a4-001', '2A4', '2', 1, 'Bayramov Fəxrəddin Bayram'),
  ('stars-student-2a4-002', '2A4', '2', 2, 'Hüseynov Kamil Kamran'),
  ('stars-student-2a4-003', '2A4', '2', 3, 'Paşazadə Fərəh Rasim'),
  ('stars-student-2a4-004', '2A4', '2', 4, 'Cəfərzadə Aminə Ələsgər'),
  ('stars-student-2a4-005', '2A4', '2', 5, 'Hüseynli Cəmil Əhməd'),
  ('stars-student-2e4-001', '2E4', '2', 1, 'Ağazadə Nəzrin Nurlan'),
  ('stars-student-2e4-002', '2E4', '2', 2, 'Bingöl Ayşe Zeynep'),
  ('stars-student-2e4-003', '2E4', '2', 3, 'Hüseyn Kemal Ceyhun'),
  ('stars-student-2e4-004', '2E4', '2', 4, 'İbrahimli Abdullah Məmməd'),
  ('stars-student-2e4-005', '2E4', '2', 5, 'Orucov Nihad Orxan'),
  ('stars-student-2e4-006', '2E4', '2', 6, 'Şükürov Nihat Şəmşir'),
  ('stars-student-2r4-001', '2R4', '2', 1, 'Qafarova Zeynəb Cabbar'),
  ('stars-student-2r4-002', '2R4', '2', 2, 'Qubatova Mehin Famil'),
  ('stars-student-3a4-001', '3A4', '3', 1, 'İmanov Uğur Ramil'),
  ('stars-student-3a4-002', '3A4', '3', 2, 'Hüseynli Mələk İqbal'),
  ('stars-student-3a4-003', '3A4', '3', 3, 'Nurulu Nilay Fuad'),
  ('stars-student-3a4-004', '3A4', '3', 4, 'Məmmədova Şəms Rəcəb'),
  ('stars-student-3a4-005', '3A4', '3', 5, 'Məmmədova Melisa Ayaz'),
  ('stars-student-3e3-001', '3E3', '3', 1, 'Quliyev Amin Həşim'),
  ('stars-student-3e3-002', '3E3', '3', 2, 'Bəxtiyarzadə Polad Pərviz'),
  ('stars-student-3e3-003', '3E3', '3', 3, 'Hacılı Türkel Vüqar'),
  ('stars-student-3e3-004', '3E3', '3', 4, 'Ömer Hatem Kaya'),
  ('stars-student-3r3-001', '3R3', '3', 1, 'Ağayeva Adelina Əli'),
  ('stars-student-3r3-002', '3R3', '3', 2, 'Nağıyev Rəhman Raman'),
  ('stars-student-3r3-003', '3R3', '3', 3, 'Allahverdiyeva Selin Turan'),
  ('stars-student-3r3-004', '3R3', '3', 4, 'Xələfli Ayaz Araz'),
  ('stars-student-3r3-005', '3R3', '3', 5, 'Tağıyeva Ayan Aydın'),
  ('stars-student-3r3-006', '3R3', '3', 6, 'Qurbanov Azər Sənan'),
  ('stars-student-3r3-007', '3R3', '3', 7, 'Qurbanova Sürəyya Süleyman'),
  ('stars-student-4a4-001', '4A4', '4', 1, 'Hüseynov Qafar Fərid'),
  ('stars-student-4a4-002', '4A4', '4', 2, 'Hüseynli Mehri Əli'),
  ('stars-student-4a4-003', '4A4', '4', 3, 'Muxtarlı Ziya Fərid'),
  ('stars-student-4a4-004', '4A4', '4', 4, 'Nəbiyev Uğur Ülvi'),
  ('stars-student-4a4-005', '4A4', '4', 5, 'Paşazadə Ümid Rasim'),
  ('stars-student-4a4-006', '4A4', '4', 6, 'Həsənova Banu Emil'),
  ('stars-student-4a4-007', '4A4', '4', 7, 'Qasımov Aydın Anar'),
  ('stars-student-4a4-008', '4A4', '4', 8, 'Həsənli Murad Səməd'),
  ('stars-student-4e4-001', '4E4', '4', 1, 'Hüseyn Amir Ceyhun'),
  ('stars-student-4e4-002', '4E4', '4', 2, 'Talıbzadə Həsən'),
  ('stars-student-4e4-003', '4E4', '4', 3, 'Vəliyeva Humay Rauf'),
  ('stars-student-4e4-004', '4E4', '4', 4, 'Ayşə Məmmədova Tofiq'),
  ('stars-student-4e4-005', '4E4', '4', 5, 'Qasımova Fərəh İbiş'),
  ('stars-student-4e4-006', '4E4', '4', 6, 'Məmmədov Firuz Məhərrəm'),
  ('stars-student-5a4-001', '5A4', '5', 1, 'Nəbizadə Zəhra Hüseyn'),
  ('stars-student-5a4-002', '5A4', '5', 2, 'Mollayeva Mədinə Rəşad'),
  ('stars-student-5a4-003', '5A4', '5', 3, 'Cəfərova Humay Nicat'),
  ('stars-student-5a4-004', '5A4', '5', 4, 'Qasımzadə Aylin Fərid'),
  ('stars-student-5a4-005', '5A4', '5', 5, 'Dəmirçili Ayaz Nofel'),
  ('stars-student-5a4-006', '5A4', '5', 6, 'Hüseynli Kamran İqbal'),
  ('stars-student-5a4-007', '5A4', '5', 7, 'Əliyev Həsən Qalib'),
  ('stars-student-5a4-008', '5A4', '5', 8, 'Şükürlü Məhəmməd Əbülfət'),
  ('stars-student-5a4-009', '5A4', '5', 9, 'Hacılı Çinarfəxri Vüqar'),
  ('stars-student-5a4-010', '5A4', '5', 10, 'Qüdrətli Eldar Rəşad'),
  ('stars-student-5a4-011', '5A4', '5', 11, 'Babaxanov Əli Farid'),
  ('stars-student-5r4-001', '5R4', '5', 1, 'Ahməd Ramazan Samir'),
  ('stars-student-5r4-002', '5R4', '5', 2, 'Qaraxani Şahruz Mehman'),
  ('stars-student-5r4-003', '5R4', '5', 3, 'Qafarov Yusif Cabbar'),
  ('stars-student-5r4-004', '5R4', '5', 4, 'Kərimova Zərifə Ramil'),
  ('stars-student-5r4-005', '5R4', '5', 5, 'İsmayılov Nail Amil'),
  ('stars-student-5r4-006', '5R4', '5', 6, 'Alcanova Miray Cavidan'),
  ('stars-student-5r4-007', '5R4', '5', 7, 'İsmayılov Camal Emin'),
  ('stars-student-5r4-008', '5R4', '5', 8, 'İbrahimli Mədinə Fuad'),
  ('stars-student-5r4-009', '5R4', '5', 9, 'Abbaszadə Lətif'),
  ('stars-student-6a5-001', '6A5', '6', 1, 'Səfərəliyeva Miray Elmir'),
  ('stars-student-6a5-002', '6A5', '6', 2, 'Süleymanzadə Murad Rəşad'),
  ('stars-student-6a5-003', '6A5', '6', 3, 'Məsimova Aişə Səxavət'),
  ('stars-student-6r4-001', '6R4', '6', 1, 'Cavadov Cahid Azər'),
  ('stars-student-6r4-002', '6R4', '6', 2, 'Məhəmmədəlizadə Atilla Elgün'),
  ('stars-student-6r4-003', '6R4', '6', 3, 'Yusifzadə Ziya Samir'),
  ('stars-student-6r4-004', '6R4', '6', 4, 'Allahverdiyev Ayxan Turan'),
  ('stars-student-6r4-005', '6R4', '6', 5, 'Mustafazadə Fazil Faid'),
  ('stars-student-6r4-006', '6R4', '6', 6, 'Novruzova Nərgiz Novruz'),
  ('stars-student-6r4-007', '6R4', '6', 7, 'Rəhimli Fateh Camal'),
  ('stars-student-6r4-008', '6R4', '6', 8, 'Rzazadə Gövhərşah Aqşin'),
  ('stars-student-6r4-009', '6R4', '6', 9, 'Qasımova Duyğu İbiş'),
  ('stars-student-7a5-001', '7A5', '7', 1, 'Cəfərli Hüseyn Telman'),
  ('stars-student-7a5-002', '7A5', '7', 2, 'Cəfərova Gülay Nicat'),
  ('stars-student-7a5-003', '7A5', '7', 3, 'Cavadzadə Fidan Kənan'),
  ('stars-student-7a5-004', '7A5', '7', 4, 'Nəcəfov Məhəmməd Nəsimi'),
  ('stars-student-7a5-005', '7A5', '7', 5, 'Əsədli Məhəmməd Əsəd'),
  ('stars-student-7a5-006', '7A5', '7', 6, 'Quluzadə İnci Zöhrab'),
  ('stars-student-7a5-007', '7A5', '7', 7, 'Furuğ Dilruba Kaya'),
  ('stars-student-7r2-001', '7R2', '7', 1, 'Musasoy Camal Əmir'),
  ('stars-student-7r2-002', '7R2', '7', 2, 'Qaraxani Əminə Mehman'),
  ('stars-student-7r2-003', '7R2', '7', 3, 'Əkbərli Məhərrəm Elşən'),
  ('stars-student-7r2-004', '7R2', '7', 4, 'İbrahimli Yusif Fuad'),
  ('stars-student-7r2-005', '7R2', '7', 5, 'Safarov Yunis Mahiroviç'),
  ('stars-student-7r2-006', '7R2', '7', 6, 'Hacıyev Süleyman Elçin'),
  ('stars-student-7r2-007', '7R2', '7', 7, 'Qarazadə Tuncay Kənan');

-- Upsert groups from class codes
insert into public.groups (id, org_id, branch_id, class_level, name, deleted_at, archived_at)
select
  coalesce((
    select g.id
    from public.groups g
    where g.org_id = 'default'
      and g.branch_id = b.id
      and g.name = s.class_code
    limit 1
  ), gen_random_uuid()::text) as id,
  'default' as org_id,
  b.id as branch_id,
  s.class_level,
  s.class_code as name,
  null as deleted_at,
  null as archived_at
from (
  select distinct class_code, class_level
  from tmp_stars_students
) s
join public.branches b
  on b.org_id = 'default'
 and b.name = 'Stars Campusu'
on conflict (org_id, branch_id, name) do update
set class_level = excluded.class_level,
    deleted_at = null,
    archived_at = null;

-- Upsert students
insert into public.students (id, org_id, name, branch_id, group_id, class_level, user_id, login, deleted_at, archived_at)
select
  s.student_id,
  'default' as org_id,
  s.student_name as name,
  b.id as branch_id,
  g.id as group_id,
  s.class_level,
  null as user_id,
  null as login,
  null as deleted_at,
  null as archived_at
from tmp_stars_students s
join public.branches b
  on b.org_id = 'default'
 and b.name = 'Stars Campusu'
join public.groups g
  on g.org_id = 'default'
 and g.branch_id = b.id
 and g.name = s.class_code
on conflict (id) do update
set name = excluded.name,
    branch_id = excluded.branch_id,
    group_id = excluded.group_id,
    class_level = excluded.class_level,
    deleted_at = null,
    archived_at = null;

-- Keep branch counters in sync with seeded list
update public.branches b
set student_count = (select count(*) from tmp_stars_students),
    deleted_at = null,
    archived_at = null
where b.org_id = 'default'
  and b.name = 'Stars Campusu';

commit;

