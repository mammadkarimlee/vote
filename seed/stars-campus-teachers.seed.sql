-- Stars Campusu teachers + teaching assignments seed
-- Source: Stars 16.02.2026 teacher schedule PDF + provided teacher roster
-- Generated at: 2026-02-18T08:14:53.891Z
-- Notes:
-- 1) 0E4-1 and 0E4-2 are mapped to group 0E4.
-- 2) "Sinif rehberi" page is ignored (non-person).
-- 3) Two extra names from PDF are included as provisional teachers: 'Aysel Karimova (PDF source)', 'Nermin Selimova (PDF source)'.

begin;

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;

-- Ensure Stars Campusu branch exists and is active
insert into public.branches (id, org_id, name, code, deleted_at, archived_at)
values (
  coalesce((select id from public.branches where org_id = 'default' and name = 'Stars Campusu' limit 1), gen_random_uuid()::text),
  'default',
  'Stars Campusu',
  'STR',
  null,
  null
)
on conflict (org_id, name) do update
set code = excluded.code,
    deleted_at = null,
    archived_at = null;

-- Ensure a branch-level default department exists
insert into public.departments (id, org_id, branch_id, name, deleted_at, archived_at)
select
  coalesce((
    select d.id
    from public.departments d
    where d.org_id = 'default' and d.branch_id = b.id and d.name = 'Umumi'
    limit 1
  ), gen_random_uuid()::text),
  'default', b.id, 'Umumi', null, null
from public.branches b
where b.org_id = 'default' and b.name = 'Stars Campusu'
on conflict (org_id, branch_id, name) do update
set deleted_at = null, archived_at = null;

create temporary table tmp_stars_teachers (
  teacher_id text primary key,
  teacher_name text not null,
  first_name text,
  last_name text
) on commit drop;

insert into tmp_stars_teachers (teacher_id, teacher_name, first_name, last_name)
values
  ('stars-teacher-afaq-kazimova-arif-qizi', 'Afaq Kazımova Arif qızı', 'Afaq', 'Kazımova'),
  ('stars-teacher-alisiya-akcurina-shamilovna', 'Alisiya Akçurina Shamilovna', 'Alisiya', 'Akçurina'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', 'Ayan Həsənova Şəmsi qızı', 'Ayan', 'Həsənova'),
  ('stars-teacher-aydan-ibrahimova-elmar-qizi', 'Aydan İbrahimova Elmar qızı', 'Aydan', 'İbrahimova'),
  ('stars-teacher-aynur-soltanova-namiq-qizi', 'Aynur Soltanova Namiq qızı', 'Aynur', 'Soltanova'),
  ('stars-teacher-aysel-xeberova-dunyamali-qizi', 'Aysel Xəbərova Dünyamalı qızı', 'Aysel', 'Xəbərova'),
  ('stars-teacher-aysel-seyid-eliqulu-qizi', 'Aysel Seyid Əliqulu qızı', 'Aysel', 'Seyid'),
  ('stars-teacher-aysel-zamanli-kamil-qizi', 'Aysel Zamanlı Kamil qızı', 'Aysel', 'Zamanlı'),
  ('stars-teacher-ayten-memmedli-bextiyar-qizi', 'Aytən Məmmədli Bəxtiyar qızı', 'Aytən', 'Məmmədli'),
  ('stars-teacher-camal-hemidov-behruz-oglu', 'Camal Həmidov Behruz oğlu', 'Camal', 'Həmidov'),
  ('stars-teacher-elcan-seyidov', 'Elcan Seyidov', 'Elcan', 'Seyidov'),
  ('stars-teacher-eren-kancilar-xxx', 'Eren Kancilar XXX', 'Eren', 'Kancilar'),
  ('stars-teacher-emine-serifova-elxan-qizi', 'Əminə Şərifova Elxan qızı', 'Əminə', 'Şərifova'),
  ('stars-teacher-esref-memmedov-zaur-oglu', 'Əşrəf Məmmədov Zaur oğlu', 'Əşrəf', 'Məmmədov'),
  ('stars-teacher-fatime-ceferova-etibar-qizi', 'Fatimə Cəfərova Etibar qızı', 'Fatimə', 'Cəfərova'),
  ('stars-teacher-fatime-kerimli-idnoy-qizi', 'Fatimə Kərimli İdnoy qızı', 'Fatimə', 'Kərimli'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', 'Fatimə Quliyeva Mürşüd qızı', 'Fatimə', 'Quliyeva'),
  ('stars-teacher-fatime-memmedli-aftandil-qizi', 'Fatimə Məmmədli Aftandil qızı', 'Fatimə', 'Məmmədli'),
  ('stars-teacher-fexri-qacar-mahir-oglu', 'Fəxri Qacar Mahir oğlu', 'Fəxri', 'Qacar'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', 'Fidan Ağayeva Zöhrab qızı', 'Fidan', 'Ağayeva'),
  ('stars-teacher-govher-meherremova-selahaddin-qizi', 'Gövhər Məhərrəmova Səlahəddin qızı', 'Gövhər', 'Məhərrəmova'),
  ('stars-teacher-gulrux-elsafa-sefter-qizi', 'Gülrux Elsafa Səftər qızı', 'Gülrux', 'Elsafa'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', 'Gülsən Əsədova Gülağa qızı', 'Gülsən', 'Əsədova'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', 'Gülsən Novruzlu Rasim qızı', 'Gülsən', 'Novruzlu'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', 'Günel Niftəliyeva Davud qızı', 'Günel', 'Niftəliyeva'),
  ('stars-teacher-heyran-memmedova-ceyhun-qizi', 'Heyran Məmmədova Ceyhun qızı', 'Heyran', 'Məmmədova'),
  ('stars-teacher-hemide-seyidova-asiman-qizi', 'Həmidə Seyidova Asiman qızı', 'Həmidə', 'Seyidova'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', 'Hüseyn Savalanlı Natiq oğlu', 'Hüseyn', 'Savalanlı'),
  ('stars-teacher-xaver-ceferzade-bayram-qizi', 'Xavər Cəfərzadə Bayram qızı', 'Xavər', 'Cəfərzadə'),
  ('stars-teacher-inci-elesgerli-cavid-qizi', 'İnci Ələsgərli Cavid qızı', 'İnci', 'Ələsgərli'),
  ('stars-teacher-lale-ceferova-mehman-qizi', 'Lalə Cəfərova Mehman qızı', 'Lalə', 'Cəfərova'),
  ('stars-teacher-lale-nebiyeva-arif-qizi', 'Lalə Nəbiyeva Arif qızı', 'Lalə', 'Nəbiyeva'),
  ('stars-teacher-lale-vahabova-tagi-qizi', 'Lalə Vahabova Tağı qızı', 'Lalə', 'Vahabova'),
  ('stars-teacher-larisa-huseynova-andreyevna', 'Larisa Hüseynova Andreyevna', 'Larisa', 'Hüseynova'),
  ('stars-teacher-leyla-memmedova-namiq-qizi', 'Leyla Məmmədova Namiq qızı', 'Leyla', 'Məmmədova'),
  ('stars-teacher-nigar-hasimova-bextiyar-qizi', 'Nigar Həşimova Bəxtiyar qızı', 'Nigar', 'Həşimova'),
  ('stars-teacher-radim-memmedov-memmed-oglu', 'Radim Məmmədov Memmed oğlu', 'Radim', 'Məmmədov'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', 'Rizvan Qubatov Natiq oğlu', 'Rizvan', 'Qubatov'),
  ('stars-teacher-semaye-quluzade-akif-qizi', 'Səmayə Quluzadə Akif qızı', 'Səmayə', 'Quluzadə'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', 'Sürəyya Allahverdiyeva Əli qızı', 'Sürəyya', 'Allahverdiyeva'),
  ('stars-teacher-taciman-mahmudova-sahib-qizi', 'Taciman Mahmudova Sahib qızı', 'Taciman', 'Mahmudova'),
  ('stars-teacher-ulduz-babayeva-fexreddin-qizi', 'Ulduz Babayeva Fəxrəddin qızı', 'Ulduz', 'Babayeva'),
  ('stars-teacher-vasif-saftarov-qara-oglu', 'Vasif Səftərov Qara oğlu', 'Vasif', 'Səftərov'),
  ('stars-teacher-zamile-mustafayeva-meherrem-qizi', 'Zamilə Mustafayeva Məhərrəm qızı', 'Zamilə', 'Mustafayeva'),
  ('stars-teacher-zerife-xelilova-bextiyar-qizi', 'Zərifə Xəlilova Bəxtiyar qızı', 'Zərifə', 'Xəlilova'),
  ('stars-teacher-aysel-karimova-pdf-source', 'Aysel Kərimova (PDF source)', 'Aysel', 'Kərimova'),
  ('stars-teacher-nermin-selimova-pdf-source', 'Nermin Səlimova (PDF source)', 'Nermin', 'Səlimova');

insert into public.teachers (
  id, org_id, name, first_name, last_name, department_id, branch_id, branch_ids, teacher_category, deleted_at, archived_at
)
select
  t.teacher_id,
  'default',
  t.teacher_name,
  t.first_name,
  t.last_name,
  coalesce((
    select d.id from public.departments d
    where d.org_id = 'default' and d.branch_id = b.id and d.deleted_at is null
    order by d.created_at
    limit 1
  ), (
    select d2.id from public.departments d2
    where d2.org_id = 'default' and d2.branch_id = b.id
    limit 1
  )) as department_id,
  b.id as branch_id,
  array[b.id] as branch_ids,
  'standard'::public.teacher_category,
  null as deleted_at,
  null as archived_at
from tmp_stars_teachers t
join public.branches b
  on b.org_id = 'default' and b.name = 'Stars Campusu'
on conflict (id) do update
set name = excluded.name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    department_id = excluded.department_id,
    branch_id = excluded.branch_id,
    branch_ids = excluded.branch_ids,
    teacher_category = excluded.teacher_category,
    deleted_at = null,
    archived_at = null;

create temporary table tmp_stars_subjects (
  subject_id text primary key,
  subject_name text not null
) on commit drop;

insert into tmp_stars_subjects (subject_id, subject_name)
values
  ('stars-subject-art', 'Art'),
  ('stars-subject-azerb-t', 'Azerb/T'),
  ('stars-subject-azerbaycan-dili', 'Azerbaycan Dili'),
  ('stars-subject-biologiya', 'Biologiya'),
  ('stars-subject-chess', 'Chess'),
  ('stars-subject-cografiya', 'Cografiya'),
  ('stars-subject-dance', 'Dance'),
  ('stars-subject-deyerler', 'Deyerler'),
  ('stars-subject-dram', 'Dram'),
  ('stars-subject-edebiyyat', 'Edebiyyat'),
  ('stars-subject-f-t', 'F/T'),
  ('stars-subject-fi', 'FI'),
  ('stars-subject-fizika', 'Fizika'),
  ('stars-subject-german', 'German'),
  ('stars-subject-gym', 'Gym'),
  ('stars-subject-h-b', 'H/B'),
  ('stars-subject-informatika', 'Informatika'),
  ('stars-subject-iqtisadiyyat', 'Iqtisadiyyat'),
  ('stars-subject-kimya', 'Kimya'),
  ('stars-subject-la', 'LA'),
  ('stars-subject-math', 'Math'),
  ('stars-subject-mentiq', 'Mentiq'),
  ('stars-subject-music', 'Music'),
  ('stars-subject-musiqi', 'Musiqi'),
  ('stars-subject-pe', 'PE'),
  ('stars-subject-play-time', 'Play time'),
  ('stars-subject-resm', 'Resm'),
  ('stars-subject-ritorika', 'Ritorika'),
  ('stars-subject-riyaziyyat', 'Riyaziyyat'),
  ('stars-subject-rus-dili', 'Rus Dili'),
  ('stars-subject-steam', 'STEAM'),
  ('stars-subject-sahmat', 'Sahmat'),
  ('stars-subject-science', 'Science'),
  ('stars-subject-sinif-saati', 'Sinif Saati'),
  ('stars-subject-story', 'Story'),
  ('stars-subject-tebiet', 'Tebiet'),
  ('stars-subject-uoi', 'UOI'),
  ('stars-subject-umumi-t', 'Umumi/T'),
  ('stars-subject-values', 'Values');

insert into public.subjects (id, org_id, name, code, department_id, deleted_at, archived_at)
select
  s.subject_id,
  'default',
  s.subject_name,
  null as code,
  coalesce((
    select d.id from public.departments d
    where d.org_id = 'default' and d.branch_id = b.id and d.deleted_at is null
    order by d.created_at
    limit 1
  ), (
    select d2.id from public.departments d2
    where d2.org_id = 'default' and d2.branch_id = b.id
    limit 1
  )) as department_id,
  null as deleted_at,
  null as archived_at
from tmp_stars_subjects s
join public.branches b
  on b.org_id = 'default' and b.name = 'Stars Campusu'
on conflict (id) do update
set name = excluded.name,
    department_id = excluded.department_id,
    deleted_at = null,
    archived_at = null;

create temporary table tmp_stars_assignments (
  teacher_id text not null,
  class_code text not null,
  class_level text not null,
  subject_name text not null
) on commit drop;

insert into tmp_stars_assignments (teacher_id, class_code, class_level, subject_name)
values
  ('stars-teacher-afaq-kazimova-arif-qizi', '3A4', '3', 'Azerbaycan Dili'),
  ('stars-teacher-afaq-kazimova-arif-qizi', '3A4', '3', 'Deyerler'),
  ('stars-teacher-afaq-kazimova-arif-qizi', '3A4', '3', 'FI'),
  ('stars-teacher-afaq-kazimova-arif-qizi', '3A4', '3', 'Riyaziyyat'),
  ('stars-teacher-afaq-kazimova-arif-qizi', '4A4', '4', 'Azerbaycan Dili'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '2R4', '2', 'Riyaziyyat'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '3R3', '3', 'FI'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '3R3', '3', 'H/B'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '3R3', '3', 'Rus Dili'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '5A4', '5', 'Rus Dili'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '5R4', '5', 'Ritorika'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '6A5', '6', 'Rus Dili'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '6R4', '6', 'Ritorika'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '7A5', '7', 'Rus Dili'),
  ('stars-teacher-alisiya-akcurina-shamilovna', '7R2', '7', 'Ritorika'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '0E4', '0', 'Music'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '1E6', '1', 'Music'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '1R3', '1', 'Dram'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '1R3', '1', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '2A4', '2', 'Dram'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '2A4', '2', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '2E4', '2', 'Music'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '2R4', '2', 'Dram'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '2R4', '2', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '3A4', '3', 'Dram'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '3A4', '3', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '3E3', '3', 'Music'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '3R3', '3', 'Dram'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '3R3', '3', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '4A4', '4', 'Dram'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '4A4', '4', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '4E4', '4', 'Music'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '5A4', '5', 'Musiqi'),
  ('stars-teacher-ayan-hasanova-shemsi-qizi', '5R4', '5', 'Musiqi'),
  ('stars-teacher-aynur-soltanova-namiq-qizi', '5A4', '5', 'FI'),
  ('stars-teacher-aynur-soltanova-namiq-qizi', '5A4', '5', 'Sinif Saati'),
  ('stars-teacher-aynur-soltanova-namiq-qizi', '6A5', '6', 'Riyaziyyat'),
  ('stars-teacher-aysel-xeberova-dunyamali-qizi', '1E6', '1', 'FI'),
  ('stars-teacher-aysel-xeberova-dunyamali-qizi', '1E6', '1', 'LA'),
  ('stars-teacher-aysel-xeberova-dunyamali-qizi', '1E6', '1', 'Math'),
  ('stars-teacher-aysel-xeberova-dunyamali-qizi', '2E4', '2', 'LA'),
  ('stars-teacher-aysel-karimova-pdf-source', '0E4', '0', 'Values'),
  ('stars-teacher-aysel-karimova-pdf-source', '1E6', '1', 'Values'),
  ('stars-teacher-aysel-karimova-pdf-source', '2A4', '2', 'Azerbaycan Dili'),
  ('stars-teacher-aysel-karimova-pdf-source', '2A4', '2', 'Deyerler'),
  ('stars-teacher-aysel-karimova-pdf-source', '2A4', '2', 'H/B'),
  ('stars-teacher-aysel-karimova-pdf-source', '2A4', '2', 'Riyaziyyat'),
  ('stars-teacher-aysel-karimova-pdf-source', '2E4', '2', 'Values'),
  ('stars-teacher-aysel-karimova-pdf-source', '3E3', '3', 'Values'),
  ('stars-teacher-aysel-karimova-pdf-source', '4A4', '4', 'Riyaziyyat'),
  ('stars-teacher-aysel-karimova-pdf-source', '4E4', '4', 'Values'),
  ('stars-teacher-aysel-zamanli-kamil-qizi', '2E4', '2', 'German'),
  ('stars-teacher-aysel-zamanli-kamil-qizi', '3E3', '3', 'German'),
  ('stars-teacher-aysel-zamanli-kamil-qizi', '4E4', '4', 'German'),
  ('stars-teacher-ayten-memmedli-bextiyar-qizi', '2A4', '2', 'FI'),
  ('stars-teacher-ayten-memmedli-bextiyar-qizi', '2A4', '2', 'Sinif Saati'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '1E6', '1', 'Informatika'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '1E6', '1', 'STEAM'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '1R3', '1', 'Informatika'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '1R3', '1', 'STEAM'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '2A4', '2', 'Informatika'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '2A4', '2', 'STEAM'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '2E4', '2', 'Informatika'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '2E4', '2', 'STEAM'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '2R4', '2', 'Informatika'),
  ('stars-teacher-camal-hemidov-behruz-oglu', '2R4', '2', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '3A4', '3', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '3E3', '3', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '3R3', '3', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '4A4', '4', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '4E4', '4', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '5A4', '5', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '5R4', '5', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '6A5', '6', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '6R4', '6', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '7A5', '7', 'STEAM'),
  ('stars-teacher-elcan-seyidov', '7R2', '7', 'STEAM'),
  ('stars-teacher-emine-serifova-elxan-qizi', '2E4', '2', 'UOI'),
  ('stars-teacher-emine-serifova-elxan-qizi', '3E3', '3', 'LA'),
  ('stars-teacher-emine-serifova-elxan-qizi', '3E3', '3', 'Sinif Saati'),
  ('stars-teacher-emine-serifova-elxan-qizi', '3E3', '3', 'UOI'),
  ('stars-teacher-emine-serifova-elxan-qizi', '4E4', '4', 'LA'),
  ('stars-teacher-eren-kancilar-xxx', '5A4', '5', 'LA'),
  ('stars-teacher-eren-kancilar-xxx', '6R4', '6', 'LA'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '1R3', '1', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '2A4', '2', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '2R4', '2', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '3A4', '3', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '3A4', '3', 'Science'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '3R3', '3', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '3R3', '3', 'Science'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '4A4', '4', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '4A4', '4', 'Science'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '5A4', '5', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '5R4', '5', 'Mentiq'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '7R2', '7', 'Biologiya'),
  ('stars-teacher-esref-memmedov-zaur-oglu', '7R2', '7', 'Kimya'),
  ('stars-teacher-fatime-ceferova-etibar-qizi', '0E4', '0', 'Dance'),
  ('stars-teacher-fatime-ceferova-etibar-qizi', '0E4', '0', 'Gym'),
  ('stars-teacher-fatime-kerimli-idnoy-qizi', '5A4', '5', 'Riyaziyyat'),
  ('stars-teacher-fatime-kerimli-idnoy-qizi', '7A5', '7', 'Riyaziyyat'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '5R4', '5', 'Edebiyyat'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '5R4', '5', 'Rus Dili'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '6R4', '6', 'Edebiyyat'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '6R4', '6', 'FI'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '6R4', '6', 'Rus Dili'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '6R4', '6', 'Sinif Saati'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '7R2', '7', 'Edebiyyat'),
  ('stars-teacher-fatime-quliyeva-murshud-qizi', '7R2', '7', 'Rus Dili'),
  ('stars-teacher-fatime-memmedli-aftandil-qizi', '6R4', '6', 'Umumi/T'),
  ('stars-teacher-fatime-memmedli-aftandil-qizi', '7R2', '7', 'Azerb/T'),
  ('stars-teacher-fatime-memmedli-aftandil-qizi', '7R2', '7', 'Umumi/T'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '3A4', '3', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '3E3', '3', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '3R3', '3', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '4A4', '4', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '4E4', '4', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '5A4', '5', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '5R4', '5', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '6A5', '6', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '6R4', '6', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '7A5', '7', 'Informatika'),
  ('stars-teacher-fexri-qacar-mahir-oglu', '7R2', '7', 'Informatika'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '1R3', '1', 'Deyerler'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '1R3', '1', 'H/B'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '2A4', '2', 'Rus Dili'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '2R4', '2', 'Deyerler'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '2R4', '2', 'H/B'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '3A4', '3', 'Rus Dili'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '3R3', '3', 'Deyerler'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '3R3', '3', 'Riyaziyyat'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '3R3', '3', 'Sinif Saati'),
  ('stars-teacher-fidan-agayeva-zohrab-qizi', '4A4', '4', 'Rus Dili'),
  ('stars-teacher-govher-meherremova-selahaddin-qizi', '5A4', '5', 'Tebiet'),
  ('stars-teacher-govher-meherremova-selahaddin-qizi', '7A5', '7', 'Kimya'),
  ('stars-teacher-gulrux-elsafa-sefter-qizi', '1E6', '1', 'Play time'),
  ('stars-teacher-gulrux-elsafa-sefter-qizi', '1E6', '1', 'Sinif Saati'),
  ('stars-teacher-gulrux-elsafa-sefter-qizi', '7A5', '7', 'Biologiya'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', '5R4', '5', 'Riyaziyyat'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', '5R4', '5', 'Tebiet'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', '6R4', '6', 'Riyaziyyat'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', '6R4', '6', 'Tebiet'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', '7R2', '7', 'Fizika'),
  ('stars-teacher-gulsen-esedova-gulaga-qizi', '7R2', '7', 'Riyaziyyat'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '1R3', '1', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '2A4', '2', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '2R4', '2', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '3A4', '3', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '3R3', '3', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '4A4', '4', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '5A4', '5', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '5R4', '5', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '6A5', '6', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '6R4', '6', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '7A5', '7', 'Math'),
  ('stars-teacher-gulsen-novruzlu-rasim-qizi', '7R2', '7', 'Math'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '5A4', '5', 'Azerbaycan Dili'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '5A4', '5', 'Edebiyyat'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '5A4', '5', 'Ritorika'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '6A5', '6', 'Azerbaycan Dili'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '6A5', '6', 'Edebiyyat'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '6A5', '6', 'Ritorika'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '6R4', '6', 'Azerbaycan Dili'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '7A5', '7', 'Azerbaycan Dili'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '7A5', '7', 'Edebiyyat'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '7A5', '7', 'Ritorika'),
  ('stars-teacher-gunel-nifteliyeva-davud-qizi', '7R2', '7', 'Azerbaycan Dili'),
  ('stars-teacher-hemide-seyidova-asiman-qizi', '3A4', '3', 'H/B'),
  ('stars-teacher-hemide-seyidova-asiman-qizi', '4A4', '4', 'H/B'),
  ('stars-teacher-hemide-seyidova-asiman-qizi', '6A5', '6', 'Cografiya'),
  ('stars-teacher-hemide-seyidova-asiman-qizi', '7A5', '7', 'Cografiya'),
  ('stars-teacher-hemide-seyidova-asiman-qizi', '7A5', '7', 'Iqtisadiyyat'),
  ('stars-teacher-heyran-memmedova-ceyhun-qizi', '3E3', '3', 'FI'),
  ('stars-teacher-heyran-memmedova-ceyhun-qizi', '3E3', '3', 'Play time'),
  ('stars-teacher-heyran-memmedova-ceyhun-qizi', '4A4', '4', 'LA'),
  ('stars-teacher-heyran-memmedova-ceyhun-qizi', '4E4', '4', 'FI'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '0E4', '0', 'Chess'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '1E6', '1', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '1R3', '1', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '2A4', '2', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '2E4', '2', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '2R4', '2', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '3E3', '3', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '3R3', '3', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '4A4', '4', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '4E4', '4', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '5A4', '5', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '5R4', '5', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '6A5', '6', 'Sahmat'),
  ('stars-teacher-huseyn-savalanli-natiq-oglu', '6R4', '6', 'Sahmat'),
  ('stars-teacher-xaver-ceferzade-bayram-qizi', '2E4', '2', 'FI'),
  ('stars-teacher-xaver-ceferzade-bayram-qizi', '2E4', '2', 'Math'),
  ('stars-teacher-xaver-ceferzade-bayram-qizi', '2E4', '2', 'Play time'),
  ('stars-teacher-xaver-ceferzade-bayram-qizi', '2E4', '2', 'Sinif Saati'),
  ('stars-teacher-inci-elesgerli-cavid-qizi', '1E6', '1', 'Azerbaycan Dili'),
  ('stars-teacher-inci-elesgerli-cavid-qizi', '1R3', '1', 'Azerbaycan Dili'),
  ('stars-teacher-inci-elesgerli-cavid-qizi', '2E4', '2', 'Azerbaycan Dili'),
  ('stars-teacher-inci-elesgerli-cavid-qizi', '2R4', '2', 'Azerbaycan Dili'),
  ('stars-teacher-inci-elesgerli-cavid-qizi', '3A4', '3', 'Sinif Saati'),
  ('stars-teacher-lale-ceferova-mehman-qizi', '0E4', '0', 'Story'),
  ('stars-teacher-lale-vahabova-tagi-qizi', '1R3', '1', 'FI'),
  ('stars-teacher-lale-vahabova-tagi-qizi', '1R3', '1', 'Riyaziyyat'),
  ('stars-teacher-lale-vahabova-tagi-qizi', '1R3', '1', 'Rus Dili'),
  ('stars-teacher-lale-vahabova-tagi-qizi', '2R4', '2', 'Rus Dili'),
  ('stars-teacher-lale-vahabova-tagi-qizi', '2R4', '2', 'Sinif Saati'),
  ('stars-teacher-larisa-huseynova-andreyevna', '6R4', '6', 'Cografiya'),
  ('stars-teacher-larisa-huseynova-andreyevna', '7R2', '7', 'Cografiya'),
  ('stars-teacher-larisa-huseynova-andreyevna', '7R2', '7', 'Iqtisadiyyat'),
  ('stars-teacher-leyla-memmedova-namiq-qizi', '6A5', '6', 'FI'),
  ('stars-teacher-leyla-memmedova-namiq-qizi', '6A5', '6', 'Sinif Saati'),
  ('stars-teacher-leyla-memmedova-namiq-qizi', '6A5', '6', 'Tebiet'),
  ('stars-teacher-nermin-selimova-pdf-source', '3E3', '3', 'Azerbaycan Dili'),
  ('stars-teacher-nermin-selimova-pdf-source', '3R3', '3', 'Azerbaycan Dili'),
  ('stars-teacher-nermin-selimova-pdf-source', '4E4', '4', 'Azerbaycan Dili'),
  ('stars-teacher-nermin-selimova-pdf-source', '5R4', '5', 'Azerbaycan Dili'),
  ('stars-teacher-nigar-hasimova-bextiyar-qizi', '4A4', '4', 'LA'),
  ('stars-teacher-nigar-hasimova-bextiyar-qizi', '6R4', '6', 'LA'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '0E4', '0', 'PE'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '1E6', '1', 'F/T'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '2E4', '2', 'F/T'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '3E3', '3', 'F/T'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '4E4', '4', 'F/T'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '5R4', '5', 'F/T'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '6R4', '6', 'F/T'),
  ('stars-teacher-radim-memmedov-memmed-oglu', '7R2', '7', 'F/T'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '3A4', '3', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '3E3', '3', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '3R3', '3', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '4A4', '4', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '4E4', '4', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '5A4', '5', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '5R4', '5', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '6A5', '6', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '6R4', '6', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '7A5', '7', 'STEAM'),
  ('stars-teacher-rizvan-qubatov-natiq-oglu', '7R2', '7', 'STEAM'),
  ('stars-teacher-semaye-quluzade-akif-qizi', '1E6', '1', 'UOI'),
  ('stars-teacher-semaye-quluzade-akif-qizi', '3E3', '3', 'Math'),
  ('stars-teacher-semaye-quluzade-akif-qizi', '4E4', '4', 'Math'),
  ('stars-teacher-semaye-quluzade-akif-qizi', '4E4', '4', 'Sinif Saati'),
  ('stars-teacher-semaye-quluzade-akif-qizi', '4E4', '4', 'UOI'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '5A4', '5', 'Azerb/T'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '5R4', '5', 'Azerb/T'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '6A5', '6', 'Azerb/T'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '6A5', '6', 'Umumi/T'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '6R4', '6', 'Azerb/T'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '7A5', '7', 'Azerb/T'),
  ('stars-teacher-sureyya-allahverdiyeva-eli-qizi', '7A5', '7', 'Umumi/T'),
  ('stars-teacher-taciman-mahmudova-sahib-qizi', '3A4', '3', 'LA'),
  ('stars-teacher-taciman-mahmudova-sahib-qizi', '5A4', '5', 'LA'),
  ('stars-teacher-taciman-mahmudova-sahib-qizi', '5R4', '5', 'FI'),
  ('stars-teacher-taciman-mahmudova-sahib-qizi', '5R4', '5', 'Sinif Saati'),
  ('stars-teacher-ulduz-babayeva-fexreddin-qizi', '1R3', '1', 'LA'),
  ('stars-teacher-ulduz-babayeva-fexreddin-qizi', '1R3', '1', 'Science'),
  ('stars-teacher-ulduz-babayeva-fexreddin-qizi', '2A4', '2', 'Science'),
  ('stars-teacher-ulduz-babayeva-fexreddin-qizi', '2R4', '2', 'Science'),
  ('stars-teacher-ulduz-babayeva-fexreddin-qizi', '3A4', '3', 'LA'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '0E4', '0', 'Art'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '1E6', '1', 'Art'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '1R3', '1', 'Resm'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '2A4', '2', 'Resm'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '2E4', '2', 'Art'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '2R4', '2', 'Resm'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '3E3', '3', 'Art'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '3R3', '3', 'Resm'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '4A4', '4', 'Resm'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '4E4', '4', 'Art'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '5A4', '5', 'Resm'),
  ('stars-teacher-vasif-saftarov-qara-oglu', '5R4', '5', 'Resm'),
  ('stars-teacher-zamile-mustafayeva-meherrem-qizi', '7A5', '7', 'Fizika'),
  ('stars-teacher-zerife-xelilova-bextiyar-qizi', '4A4', '4', 'Deyerler'),
  ('stars-teacher-zerife-xelilova-bextiyar-qizi', '4A4', '4', 'FI'),
  ('stars-teacher-zerife-xelilova-bextiyar-qizi', '4A4', '4', 'Sinif Saati');

-- Ensure all schedule groups exist
insert into public.groups (id, org_id, branch_id, class_level, name, deleted_at, archived_at)
select
  coalesce((
    select g.id from public.groups g
    where g.org_id = 'default' and g.branch_id = b.id and g.name = a.class_code
    limit 1
  ), gen_random_uuid()::text),
  'default',
  b.id,
  a.class_level,
  a.class_code,
  null, null
from (select distinct class_code, class_level from tmp_stars_assignments) a
join public.branches b
  on b.org_id = 'default' and b.name = 'Stars Campusu'
on conflict (org_id, branch_id, name) do update
set class_level = excluded.class_level,
    deleted_at = null,
    archived_at = null;

insert into public.teaching_assignments (org_id, teacher_id, group_id, subject_id, branch_id, year, deleted_at, archived_at)
select distinct
  'default' as org_id,
  a.teacher_id,
  g.id as group_id,
  s.id as subject_id,
  b.id as branch_id,
  2026 as year,
  null::timestamptz as deleted_at,
  null::timestamptz as archived_at
from tmp_stars_assignments a
join public.branches b
  on b.org_id = 'default' and b.name = 'Stars Campusu'
join public.groups g
  on g.org_id = 'default' and g.branch_id = b.id and g.name = a.class_code
join tmp_stars_subjects ts
  on ts.subject_name = a.subject_name
join public.subjects s
  on s.org_id = 'default' and s.id = ts.subject_id
on conflict (org_id, teacher_id, group_id, subject_id, branch_id, year) do update
set deleted_at = null, archived_at = null;

-- Keep branch teacher counter synchronized for Stars
update public.branches b
set teacher_count = (
  select count(*) from public.teachers t
  where t.org_id = 'default' and t.branch_id = b.id and t.deleted_at is null
),
    deleted_at = null,
    archived_at = null
where b.org_id = 'default' and b.name = 'Stars Campusu';

commit;

