-- Multi-branch teachers seed generated from workbook
-- Source: branches-teachers.xlsx
-- Generated at: 2026-02-19T10:25:34.613Z
-- Rules: sheet name => branch name (<Sheet> Campusu), Stars sheet skipped.

begin;

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;

create temporary table tmp_import_branches (
  branch_name text primary key,
  branch_code text
) on commit drop;

insert into tmp_import_branches (branch_name, branch_code)
values
  ('Nəsimi Campusu', 'NES'),
  ('Abşeron Campusu', 'ABS'),
  ('Azadlıq Campusu', 'AZA'),
  ('Xətai Campusu', 'XET');

insert into public.branches (id, org_id, name, code, deleted_at, archived_at)
select
  coalesce((
    select br.id
    from public.branches br
    where br.org_id = 'default' and br.name = b.branch_name
    limit 1
  ), gen_random_uuid()::text),
  'default',
  b.branch_name,
  b.branch_code,
  null,
  null
from tmp_import_branches b
on conflict (org_id, name) do update
set code = excluded.code,
    deleted_at = null,
    archived_at = null;

insert into public.departments (id, org_id, branch_id, name, deleted_at, archived_at)
select
  coalesce((
    select d.id
    from public.departments d
    where d.org_id = 'default' and d.branch_id = br.id and d.name = 'Umumi'
    limit 1
  ), gen_random_uuid()::text),
  'default',
  br.id,
  'Umumi',
  null,
  null
from public.branches br
join tmp_import_branches b on b.branch_name = br.name
where br.org_id = 'default'
on conflict (org_id, branch_id, name) do update
set deleted_at = null,
    archived_at = null;

create temporary table tmp_import_teachers (
  teacher_id text primary key,
  teacher_name text not null,
  first_name text,
  last_name text,
  branch_name text not null,
  position text
) on commit drop;

insert into tmp_import_teachers (teacher_id, teacher_name, first_name, last_name, branch_name, position)
values
  ('nesimi-teacher-afet-kazimova-zakir-qizi', 'Afət Kazımova Zakir Qızı', 'Afət', 'Kazımova', 'Nəsimi Campusu', 'Tarix müəllimi'),
  ('nesimi-teacher-aida-mamedova-xxx', 'Aıda Mamedova Xxx', 'Aıda', 'Mamedova', 'Nəsimi Campusu', 'İbtidai sinif müəllimi-Rus bölməsi üzrə'),
  ('nesimi-teacher-amalya-semedova-sevdar-qizi', 'Amalya Səmədova Sevdar Qızı', 'Amalya', 'Səmədova', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-aydan-kerimli-etibar-qizi', 'Aydan Kərimli Etibar Qızı', 'Aydan', 'Kərimli', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-aynur-isgenderova-mehemmed-qizi', 'Aynur İsgəndərova Məhəmməd Qızı', 'Aynur', 'İsgəndərova', 'Nəsimi Campusu', 'İbtidai sinif müəllimi (Azərbaycan bölməsi)'),
  ('nesimi-teacher-aysel-memmedova-natiq-qizi', 'Aysel Məmmədova Natiq Qızı', 'Aysel', 'Məmmədova', 'Nəsimi Campusu', 'Müəllim köməkçisi (İbtidai təhsil-Rus bölməsi üzrə)'),
  ('nesimi-teacher-aysun-huseynova-huseyn-qizi', 'Aysun Hüseynova Hüseyn Qızı', 'Aysun', 'Hüseynova', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-aysen-tariverdiyeva-elcin-qizi', 'Ayşən Tariverdiyeva Elçin Qızı', 'Ayşən', 'Tariverdiyeva', 'Nəsimi Campusu', 'İcraçı direktorun İbtidai təhsil üzrə müavini'),
  ('nesimi-teacher-aytac-bagirova-natiq-qizi', 'Aytac Bağırova Natiq Qızı', 'Aytac', 'Bağırova', 'Nəsimi Campusu', 'Köməkçi müəllim(İbtidai sinif üzrə-rus bölməsi)'),
  ('nesimi-teacher-aytac-nesibova-vuqar-qizi', 'Aytac Nəsibova Vüqar Qızı', 'Aytac', 'Nəsibova', 'Nəsimi Campusu', 'Fizika müəllimi rus bölməsi üzrə'),
  ('nesimi-teacher-ayten-qasimova-qasim-qizi', 'Aytən Qasımova Qasım Qızı', 'Aytən', 'Qasımova', 'Nəsimi Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('nesimi-teacher-balabek-eliyev-ruslan-oglu', 'Balabək Əliyev Ruslan Oğlu', 'Balabək', 'Əliyev', 'Nəsimi Campusu', 'İnformatika müəllimi'),
  ('nesimi-teacher-ceyran-veliyeva-arif-qizi', 'Ceyran Vəliyeva Arif Qızı', 'Ceyran', 'Vəliyeva', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-dunya-selimova-edalet-qizi', 'Dünya Səlimova Ədalət Qızı', 'Dünya', 'Səlimova', 'Nəsimi Campusu', 'Müəllim köməkçisi (İbtidai təhsil Azərbaycan bölməsi)'),
  ('nesimi-teacher-elnara-memmedova-elcin-qizi', 'Elnara Məmmədova Elçin Qızı', 'Elnara', 'Məmmədova', 'Nəsimi Campusu', 'Köməkçi müəllim(İbtidai sinif üzrə-rus bölməsi)'),
  ('nesimi-teacher-elsema-memmedova-afik-qizi', 'Elsəma Məmmədova Afik Qızı', 'Elsəma', 'Məmmədova', 'Nəsimi Campusu', 'Biologiya müəllimi'),
  ('nesimi-teacher-efsane-hesenova-mahir-qizi', 'Əfsanə Həsənova Mahir Qızı', 'Əfsanə', 'Həsənova', 'Nəsimi Campusu', 'İbtidai sinif müəllimi-Rus bölməsi üzrə'),
  ('nesimi-teacher-esmer-mehdiyeva-alim-qizi', 'Əsmər Mehdiyeva Alim Qızı', 'Əsmər', 'Mehdiyeva', 'Nəsimi Campusu', 'Biologiya müəllimi'),
  ('nesimi-teacher-fatime-eliyeva-elsen-qizi', 'Fatimə Əliyeva Elşən Qızı', 'Fatimə', 'Əliyeva', 'Nəsimi Campusu', 'Rus dili və Ədəbiyyatı müəllimi'),
  ('nesimi-teacher-fatime-hesenli-vekil-qizi', 'Fatimə Həsənli Vəkil Qızı', 'Fatimə', 'Həsənli', 'Nəsimi Campusu', 'Azərbaycan dili və ədəbiyyat'),
  ('nesimi-teacher-fatime-memmedli', 'Fatimə Məmmədli', 'Fatimə', 'Məmmədli', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-fidan-eliyeva-elxan-qizi', 'Fidan Əliyeva Elxan Qızı', 'Fidan', 'Əliyeva', 'Nəsimi Campusu', 'Müəllim köməkçisi (İbtidai təhsil İngilis bölməsi)'),
  ('nesimi-teacher-fidan-hesenova-memmed-qizi', 'Fidan Həsənova Məmməd Qızı', 'Fidan', 'Həsənova', 'Nəsimi Campusu', 'Sinif rəhbəri (İbtdai təhsil üzrə-Azərbaycan bölməsi)'),
  ('nesimi-teacher-fidan-serdarova-rabil-qizi', 'Fidan Sərdarova Rabil Qızı', 'Fidan', 'Sərdarova', 'Nəsimi Campusu', 'Müəllim köməkçisi (İbtidai təhsil-Rus bölməsi üzrə)'),
  ('nesimi-teacher-fidan-zerbeliyeva-aslan-qizi', 'Fidan Zərbəliyeva Aslan Qızı', 'Fidan', 'Zərbəliyeva', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-gunay-ehmed-zade-silduz-qizi', 'Günay Əhməd-Zadə Silduz Qızı', 'Günay', 'Əhməd-Zadə', 'Nəsimi Campusu', 'Rus dili və Ədəbiyyatı'),
  ('nesimi-teacher-gunay-ismayilova-mahir-qizi', 'Günay İsmayılova Mahir Qızı', 'Günay', 'İsmayılova', 'Nəsimi Campusu', 'Musiqi müəllimi'),
  ('nesimi-teacher-gunay-mahmudova-mukayil-qizi', 'Günay Mahmudova Mükayıl Qızı', 'Günay', 'Mahmudova', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-gunay-nagiyeva-namikovna', 'Günay Nağıyeva Namikovna', 'Günay', 'Nağıyeva', 'Nəsimi Campusu', 'Sinif rəhbəri (orta təhsil üzrə-rus bölməsi)'),
  ('nesimi-teacher-gunduz-bayramov-ibrahim-oglu', 'Gündüz Bayramov İbrahim Oğlu', 'Gündüz', 'Bayramov', 'Nəsimi Campusu', 'Kafedra rəhbəri (İdman kaferdası)'),
  ('nesimi-teacher-gunel-abbasova-ziyeddin-qizi', 'Günel Abbasova Ziyəddin Qızı', 'Günel', 'Abbasova', 'Nəsimi Campusu', 'Biologiya müəllimi'),
  ('nesimi-teacher-gunel-haciyeva-vahid-qizi', 'Günel Hacıyeva Vahid Qızı', 'Günel', 'Hacıyeva', 'Nəsimi Campusu', 'Riyaziyyat müəllimi (İngilis bölməsi)'),
  ('nesimi-teacher-gunel-memmedli-sadiq-qizi', 'Günel Məmmədli Sadiq Qızı', 'Günel', 'Məmmədli', 'Nəsimi Campusu', 'Müəllim köməkçisi (İbtidai təhsil Azərbaycan bölməsi)'),
  ('nesimi-teacher-xatire-ehmedzade-hicran-qizi', 'Xatirə Əhmədzadə Hicran Qızı', 'Xatirə', 'Əhmədzadə', 'Nəsimi Campusu', 'Alman dili müəllimi'),
  ('nesimi-teacher-xedice-sirinzade-sehriyar-qizi', 'Xədicə Şirinzadə Şəhriyar Qızı', 'Xədicə', 'Şirinzadə', 'Nəsimi Campusu', 'Sinif rəhbəri (İbtidai təhsil-Azərbaycan bölməsi)'),
  ('nesimi-teacher-xumar-mustafayeva-mahir-qizi', 'Xumar Mustafayeva Mahir Qızı', 'Xumar', 'Mustafayeva', 'Nəsimi Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('nesimi-teacher-ilahe-ehmedova-firuz-qizi', 'İlahə Əhmədova Firuz Qızı', 'İlahə', 'Əhmədova', 'Nəsimi Campusu', 'Təsviri incəsənət müəllimi'),
  ('nesimi-teacher-irade-azadova-elixan-qizi', 'İradə Azadova Əlixan Qızı', 'İradə', 'Azadova', 'Nəsimi Campusu', 'İnformatika müəllimi'),
  ('nesimi-teacher-irade-kerimova-azad-qizi', 'İradə Kərimova Azad Qızı', 'İradə', 'Kərimova', 'Nəsimi Campusu', 'Rəqs müəllimi'),
  ('nesimi-teacher-irade-memmedova-mayil-qizi', 'İradə Məmmədova Mayıl Qızı', 'İradə', 'Məmmədova', 'Nəsimi Campusu', 'Tarix müəllimi rus bölməsi üzrə'),
  ('nesimi-teacher-kemale-esgerova-agabey', 'Kəmalə Əsgərova Ağabəy', 'Kəmalə', 'Əsgərova', 'Nəsimi Campusu', 'Science'),
  ('nesimi-teacher-konul-ismayilova-muzeffer-qizi', 'Könül İsmayılova Müzəffər Qızı', 'Könül', 'İsmayılova', 'Nəsimi Campusu', 'Kafedra rəhbəri (İbtidai sinif -Azərbaycan bölməsi)'),
  ('nesimi-teacher-konul-sariyeva-arif-qizi', 'Könül Sarıyeva Arif Qızı', 'Könül', 'Sarıyeva', 'Nəsimi Campusu', 'Sinif rəhbəri (İbtidai təhsil üzrə -Rus bölməsi )'),
  ('nesimi-teacher-qendab-mahmudzade-adil-qizi', 'Qəndab Mahmudzadə Adil Qızı', 'Qəndab', 'Mahmudzadə', 'Nəsimi Campusu', 'Fizika müəllimi'),
  ('nesimi-teacher-lale-bayramova-elsad-qizi', 'Lalə Bayramova Elşad Qızı', 'Lalə', 'Bayramova', 'Nəsimi Campusu', 'Fikiza müəllimi'),
  ('nesimi-teacher-leyla-ehmedova-vaqifovna', 'Leyla Əhmədova Vaqifovna', 'Leyla', 'Əhmədova', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-leyla-eliyeva-elnur-qizi', 'Leyla Əliyeva Elnur Qızı', 'Leyla', 'Əliyeva', 'Nəsimi Campusu', 'Sinif rəhbəri (Orta təhsil üzrə-Azərbaycan bölməsi)'),
  ('nesimi-teacher-leyla-kerimli-polad-qizi', 'Leyla Kərimli Polad Qızı', 'Leyla', 'Kərimli', 'Nəsimi Campusu', 'İbtidai sinif müəllimi (Azərbaycan bölməsi)'),
  ('nesimi-teacher-leyla-rzayeva-arif-qizi', 'Leyla Rzayeva Arif Qızı', 'Leyla', 'Rzayeva', 'Nəsimi Campusu', 'Sinif rəhbəri (orta təhsil üzrə-rus bölməsi)'),
  ('nesimi-teacher-leyla-yusifli-huseyn-qizi', 'Leyla Yusifli Hüseyn Qızı', 'Leyla', 'Yusifli', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-mehriban-agazade-cingiz-qizi', 'Mehriban Ağazadə Çingiz Qızı', 'Mehriban', 'Ağazadə', 'Nəsimi Campusu', 'İnformatika müəllimi'),
  ('nesimi-teacher-nabat-eliyeva-rehim-qizi', 'Nabat Əliyeva Rəhim Qızı', 'Nabat', 'Əliyeva', 'Nəsimi Campusu', 'ingilis dili müəllimi'),
  ('nesimi-teacher-naciye-elizade-mahir-qizi', 'Naciyə Əlizadə Mahir Qızı', 'Naciyə', 'Əlizadə', 'Nəsimi Campusu', 'Sinif rəhbəri (Orta təhsil üzrə-Azərbaycan bölməsi)'),
  ('nesimi-teacher-naile-hesenova-nadir-qizi', 'Nailə Həsənova Nadir Qızı', 'Nailə', 'Həsənova', 'Nəsimi Campusu', 'Azərbaycan dili və ədəbiyyat'),
  ('nesimi-teacher-namiq-quliyev-teyyar-oglu', 'Namiq Quliyev Təyyar Oğlu', 'Namiq', 'Quliyev', 'Nəsimi Campusu', 'Bədən tərbiyəsi'),
  ('nesimi-teacher-nazli-kara-xanlar-qizi', 'Nazlı Kara Xanlar Qızı', 'Nazlı', 'Kara', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-nergiz-quliyeva-agaqulu-qizi', 'Nərgiz Quliyeva Ağaqulu Qızı', 'Nərgiz', 'Quliyeva', 'Nəsimi Campusu', 'İcraçı direktorun İngilis dili bölməsi üzrə müavini'),
  ('nesimi-teacher-nermin-cabbarli-huseyn-qizi', 'Nərmin Cabbarlı Hüseyn Qızı', 'Nərmin', 'Cabbarlı', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-nermin-memmedli-natiq-qizi', 'Nərmin Məmmədli Natiq Qızı', 'Nərmin', 'Məmmədli', 'Nəsimi Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('nesimi-teacher-nesrin-cavadova-resadet-qizi', 'Nəsrin Cavadova Rəşadət Qızı', 'Nəsrin', 'Cavadova', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-nezrin-huseynzade', 'Nəzrin Hüseynzadə', 'Nəzrin', 'Hüseynzadə', 'Nəsimi Campusu', 'Robotic'),
  ('nesimi-teacher-nusabe-qayayeva-elyar-qizi', 'Nüşabə Qayayeva Əlyar Qızı', 'Nüşabə', 'Qayayeva', 'Nəsimi Campusu', 'Rus dili və ədəbiyyat müəllimi'),
  ('nesimi-teacher-raisa-siraliyeva-maksudovna', 'Raisa Şiraliyeva Maksudovna', 'Raisa', 'Şiraliyeva', 'Nəsimi Campusu', 'Coğrafiya müəllimi'),
  ('nesimi-teacher-rehile-nezerli-rauf-qizi', 'Rəhilə Nəzərli Rauf Qızı', 'Rəhilə', 'Nəzərli', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-rena-abasova-ilqar-qizi', 'Rəna Abasova İlqar Qızı', 'Rəna', 'Abasova', 'Nəsimi Campusu', 'Müəllim köməkçisi (İbtidai təhsil-Rus bölməsi üzrə)'),
  ('nesimi-teacher-resad-emirguneyev-seydulla-oglu', 'Rəşad Əmirgünəyev Səydulla Oğlu', 'Rəşad', 'Əmirgünəyev', 'Nəsimi Campusu', 'Kafedra rəhbəri (steam mərkəzi)'),
  ('nesimi-teacher-rovsen-eliyev-isfendiyar-oglu', 'Rövşən Əliyev İsfəndiyar Oğlu', 'Rövşən', 'Əliyev', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-ruhiye-tehmezli-sohrab-qizi', 'Ruhiyə Təhməzli Söhrab Qızı', 'Ruhiyə', 'Təhməzli', 'Nəsimi Campusu', 'Sinif rəhbəri'),
  ('nesimi-teacher-ruziyye-rehimova-fezayil-qizi', 'Ruziyyə Rəhimova Fəzayil Qızı', 'Ruziyyə', 'Rəhimova', 'Nəsimi Campusu', 'Sinif rəhbəri (Orta təhsil-İngilis bölməsi)'),
  ('nesimi-teacher-rufet-medetov-memmed-huseyn-oglu', 'Rüfət Mədətov Məmməd Hüseyn Oğlu', 'Rüfət', 'Mədətov', 'Nəsimi Campusu', 'Riyaziyyat müəllimi rus bölməsi üzrə'),
  ('nesimi-teacher-sahibe-ferzeliyeva', 'Sahibə Fərzəliyeva', 'Sahibə', 'Fərzəliyeva', 'Nəsimi Campusu', 'Fizika müəllimi'),
  ('nesimi-teacher-samire-xelilova-ilqar-qizi', 'Samirə Xəlilova İlqar Qızı', 'Samirə', 'Xəlilova', 'Nəsimi Campusu', 'Köməkçi müəllim(İbtidai təhsil üzrə-İngilis bölməsi)'),
  ('nesimi-teacher-sara-hemidova', 'Sara Həmidova', 'Sara', 'Həmidova', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-sevil-esrefli-firuz-qizi', 'Sevil Əşrəfli Firuz Qızı', 'Sevil', 'Əşrəfli', 'Nəsimi Campusu', 'Riyaziyyat müəllimi (İngilis bölməsi)'),
  ('nesimi-teacher-sevinc-esedova-rufet-qizi', 'Sevinc Əsədova Rüfət Qızı', 'Sevinc', 'Əsədova', 'Nəsimi Campusu', 'Kimya müəllimi rus bölməsi üzrə'),
  ('nesimi-teacher-seadet-memmedova-balayar-qizi', 'Səadət Məmmədova Balayar Qızı', 'Səadət', 'Məmmədova', 'Nəsimi Campusu', 'Kafedra rəhbəri (Təbiət elimləri)'),
  ('nesimi-teacher-sema-avilova-fazil-qizi', 'Səma Avilova Fazil Qızı', 'Səma', 'Avilova', 'Nəsimi Campusu', 'İbtidai sinif müəllimi-Rus bölməsi üzrə'),
  ('nesimi-teacher-sahin-rehimov-elcin-oglu', 'Şahin Rəhimov Elçin Oğlu', 'Şahin', 'Rəhimov', 'Nəsimi Campusu', 'Şahmat müəllimi'),
  ('nesimi-teacher-sukufe-huseynli-arif-qizi', 'Şükufə Hüseynli Arif Qızı', 'Şükufə', 'Hüseynli', 'Nəsimi Campusu', 'Sinif rəhbəri (orta təhsil üzrə-rus bölməsi)'),
  ('nesimi-teacher-tunzale-cendirli-ali-qizi', 'Tünzalə Çəndirli Alı Qızı', 'Tünzalə', 'Çəndirli', 'Nəsimi Campusu', 'İngilis dili müəllimi'),
  ('nesimi-teacher-turkan-quliyeva-seyur-qizi', 'Türkan Quliyeva Seyur Qızı', 'Türkan', 'Quliyeva', 'Nəsimi Campusu', 'Kimya'),
  ('nesimi-teacher-ulfet-mustafayeva-efser-qizi', 'Ülfət Mustafayeva Əfsər Qızı', 'Ülfət', 'Mustafayeva', 'Nəsimi Campusu', 'Fikiza müəllimi'),
  ('nesimi-teacher-ulker-muradova-namiq-qizi', 'Ülkər Muradova Namiq Qızı', 'Ülkər', 'Muradova', 'Nəsimi Campusu', 'Coğrafiya müəllimi'),
  ('nesimi-teacher-ulviyye-nesirli-eli-qizi', 'Ülviyyə Nəsirli Əli Qızı', 'Ülviyyə', 'Nəsirli', 'Nəsimi Campusu', 'Köməkçi müəllim(İbtidai sinif üzrə-rus bölməsi)'),
  ('nesimi-teacher-vasif-huseynov-ramazan-oglu', 'Vasif Hüseynov Ramazan Oğlu', 'Vasif', 'Hüseynov', 'Nəsimi Campusu', 'Kimya müəllimi'),
  ('nesimi-teacher-vefa-aliszade-telman-qizi', 'Vəfa Alışzadə Telman Qızı', 'Vəfa', 'Alışzadə', 'Nəsimi Campusu', 'İnformatika'),
  ('nesimi-teacher-vuqar-agayev-gulbala-oglu', 'Vüqar Ağayev Gülbala Oğlu', 'Vüqar', 'Ağayev', 'Nəsimi Campusu', 'Riyaziyyat müəllimi'),
  ('nesimi-teacher-zenfira-pasayeva-bedreddin-qizi', 'Zenfira Paşayeva Bədrəddin Qızı', 'Zenfira', 'Paşayeva', 'Nəsimi Campusu', 'İbtidai sinif müəllimi-Rus bölməsi üzrə'),
  ('nesimi-teacher-zehra-elizade-zeka-qizi', 'Zəhra Əlizadə Zəka Qızı', 'Zəhra', 'Əlizadə', 'Nəsimi Campusu', 'Sinif rəhbəri (İbtidai təhsil-İngilis bölməsi)'),
  ('nesimi-teacher-zekiyye-memmedova-nazim-qizi', 'Zəkiyyə Məmmədova Nazim Qızı', 'Zəkiyyə', 'Məmmədova', 'Nəsimi Campusu', 'Sinif rəhbəri (Orta təhsil üzrə-Azərbaycan bölməsi)'),
  ('nesimi-teacher-zhala-shukurova-xxx', 'Zhala Shukurova Xxx', 'Zhala', 'Shukurova', 'Nəsimi Campusu', 'Sinif rəhbəri (orta təhsil üzrə-rus bölməsi)'),
  ('nesimi-teacher-zinaida-musayeva-yasin-qizi', 'Zinaida Musayeva Yasın Qızı', 'Zinaida', 'Musayeva', 'Nəsimi Campusu', 'Tarix müəllimi'),
  ('nesimi-teacher-ziver-resulova-nahid-qizi', 'Zivər Rəsulova Nahid Qızı', 'Zivər', 'Rəsulova', 'Nəsimi Campusu', 'Köməkçi müəllim(İbtidai təhsil üzrə-İngilis bölməsi)'),
  ('nesimi-teacher-zohre-ceferova-esger-qizi', 'Zöhrə Cəfərova Əsgər Qızı', 'Zöhrə', 'Cəfərova', 'Nəsimi Campusu', 'Kafedra rəhbəri (Rus dili və ədəbiyyatı )'),
  ('abseron-teacher-arize-memmedova-behruz-qizi', 'Arizə Məmmədova Bəhruz Qızı', 'Arizə', 'Məmmədova', 'Abşeron Campusu', 'Fikiza müəllimi'),
  ('abseron-teacher-arzu-ehmedova-vidadi-qizi', 'Arzu Əhmədova Vidadi Qızı', 'Arzu', 'Əhmədova', 'Abşeron Campusu', 'İbtidai sinif müəllimi-Rus bölməsi üzrə'),
  ('abseron-teacher-arzu-memmedova-vaqif-qizi', 'Arzu Məmmədova Vaqif Qızı', 'Arzu', 'Məmmədova', 'Abşeron Campusu', 'Biologiya müəllimi'),
  ('abseron-teacher-aysel-abbasova-asef-qizi', 'Aysel Abbasova Asəf Qızı', 'Aysel', 'Abbasova', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-aysel-abutalibova-elsad-qizi', 'Aysel Abutalıbova Elşad Qızı', 'Aysel', 'Abutalıbova', 'Abşeron Campusu', 'İnformatika müəllimi'),
  ('abseron-teacher-aysel-esgerova-xandadas-qizi', 'Aysel Əsgərova Xandadaş Qızı', 'Aysel', 'Əsgərova', 'Abşeron Campusu', 'Sinif rəhbəri (İbtdai təhsil üzrə-Azərbaycan bölməsi)'),
  ('abseron-teacher-aysel-rehimli-vuqar-qizi', 'Aysel Rəhimli Vüqar Qızı', 'Aysel', 'Rəhimli', 'Abşeron Campusu', 'Tarix müəllimi'),
  ('abseron-teacher-ayse-demirciyeva-elcin-qizi', 'Ayşə Dəmirçiyeva Elçin Qızı', 'Ayşə', 'Dəmirçiyeva', 'Abşeron Campusu', 'İngilis dili'),
  ('abseron-teacher-aysen-abdulezimova-yaqub-qizi', 'Ayşən Abduləzimova Yaqub Qızı', 'Ayşən', 'Abduləzimova', 'Abşeron Campusu', 'Sinif rəhbəri (İbtidai təhsil üzrə -Rus bölməsi )'),
  ('abseron-teacher-aytac-ceferova-ramiz-qizi', 'Aytac Cəfərova Ramiz Qızı', 'Aytac', 'Cəfərova', 'Abşeron Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('abseron-teacher-aytac-eylazli-hafiz-qizi', 'Aytac Eylazlı Hafiz Qızı', 'Aytac', 'Eylazlı', 'Abşeron Campusu', 'Fizika (ingilis bölməsi)'),
  ('abseron-teacher-ayten-edilova-qasim-qizi', 'Aytən Ədilova Qasım Qızı', 'Aytən', 'Ədilova', 'Abşeron Campusu', 'Sinif rəhbəri (İbtidai təhsil üzrə -Rus bölməsi )'),
  ('abseron-teacher-azer-ibrahimov-agapasa-oglu', 'Azər İbrahimov Ağapaşa Oğlu', 'Azər', 'İbrahimov', 'Abşeron Campusu', 'İbtidai sinif müəllimi-Azərbaycan bölməsi'),
  ('abseron-teacher-ceyhune-davudova-suleyman-qizi', 'Ceyhunə Davudova Süleyman Qızı', 'Ceyhunə', 'Davudova', 'Abşeron Campusu', 'Sinif rəhbəri (İbtdai təhsil üzrə-Azərbaycan bölməsi)'),
  ('abseron-teacher-cemile-pirmetova-cahangir-qizi', 'Cəmilə Pirmətova Cahangir Qızı', 'Cəmilə', 'Pirmətova', 'Abşeron Campusu', 'Riyaziyyat'),
  ('abseron-teacher-cemile-tagiyeva-ceyhun-qizi', 'Cəmilə Tağıyeva Ceyhun Qızı', 'Cəmilə', 'Tağıyeva', 'Abşeron Campusu', 'İnformatika müəllimi (ingilis bölməsi)'),
  ('abseron-teacher-diana-sixverdiyeva-osman-qizi', 'Diana Şixverdiyeva Osman Qızı', 'Diana', 'Şixverdiyeva', 'Abşeron Campusu', 'İdman müəllimi'),
  ('abseron-teacher-elizaveta-khalilova-xxx', 'Elızaveta Khalılova Xxx', 'Elızaveta', 'Khalılova', 'Abşeron Campusu', 'Müəllim köməkçisi (İbtidai təhsil-Rus bölməsi üzrə)'),
  ('abseron-teacher-elmar-eliyev-millet-oglu', 'Elmar Əliyev Millət Oğlu', 'Elmar', 'Əliyev', 'Abşeron Campusu', 'İcraçı direktorun Orta təhsil üzrə müavini'),
  ('abseron-teacher-elnare-ferzeli-abbas-qizi', 'Elnarə Fərzəli Abbas Qızı', 'Elnarə', 'Fərzəli', 'Abşeron Campusu', 'Tarix müəllimi rus bölməsi üzrə'),
  ('abseron-teacher-efruz-seferova-qalibiyyet-qizi', 'Əfruz Səfərova Qalibiyyət Qızı', 'Əfruz', 'Səfərova', 'Abşeron Campusu', 'İbtidai sinif müəllimi (Azərbaycan bölməsi)'),
  ('abseron-teacher-ehmed-bayraqdarov-eleddin-oglu', 'Əhməd Bayraqdarov Ələddin Oğlu', 'Əhməd', 'Bayraqdarov', 'Abşeron Campusu', 'Texnologiya müəllimi'),
  ('abseron-teacher-esmer-burceliyeva-ilqar-qizi', 'Əsmər Bürcəliyeva İlqar Qızı', 'Əsmər', 'Bürcəliyeva', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-ezim-haciyev-huseyn-oglu', 'Əzim Hacıyev Hüseyn Oğlu', 'Əzim', 'Hacıyev', 'Abşeron Campusu', 'Fizika müəllimi'),
  ('abseron-teacher-fatime-refizade-hicran-qizi', 'Fatimə Rəfizadə Hicran Qızı', 'Fatimə', 'Rəfizadə', 'Abşeron Campusu', 'Müəllim köməkçisi (İbtidai təhsil İngilis bölməsi)'),
  ('abseron-teacher-feteli-ferzeliyev-musviq-oglu', 'Fətəli Fərzəliyev Müşviq Oğlu', 'Fətəli', 'Fərzəliyev', 'Abşeron Campusu', 'Riyaziyyat müəllimi'),
  ('abseron-teacher-fezile-pasayeva-yasar-qizi', 'Fəzilə Paşayeva Yaşar Qızı', 'Fəzilə', 'Paşayeva', 'Abşeron Campusu', 'Təsviri incəsənət müəllimi'),
  ('abseron-teacher-gulgez-emreliyeva-mezahir-qizi', 'Gülgəz Əmrəliyeva Məzahir Qızı', 'Gülgəz', 'Əmrəliyeva', 'Abşeron Campusu', 'Müəllim köməkçisi (İbtidai təhsil Azərbaycan bölməsi)'),
  ('abseron-teacher-gulsum-tahirova-elxan-qizi', 'Gülsüm Tahirova Elxan Qızı', 'Gülsüm', 'Tahirova', 'Abşeron Campusu', 'Müəllim köməkçisi (İbtidai təhsil Azərbaycan bölməsi)'),
  ('abseron-teacher-gulsen-osmanova-elcin-qizi', 'Gülşən Osmanova Elçin Qızı', 'Gülşən', 'Osmanova', 'Abşeron Campusu', 'Rus dili və Ədəbiyyat müəllimi'),
  ('abseron-teacher-gulsen-sadixova-qedim-qizi', 'Gülşən Sadıxova Qədim Qızı', 'Gülşən', 'Sadıxova', 'Abşeron Campusu', 'Riyaziyyat müəllimi (İngilis bölməsi)'),
  ('abseron-teacher-gulyaz-behremova-pervaz-qizi', 'Gülyaz Bəhrəmova Pərvaz Qızı', 'Gülyaz', 'Bəhrəmova', 'Abşeron Campusu', 'Müəllim köməkçisi (İbtidai təhsil Azərbaycan bölməsi)'),
  ('abseron-teacher-gunay-tehmezova-tofiq-qizi', 'Günay Təhməzova Tofiq Qızı', 'Günay', 'Təhməzova', 'Abşeron Campusu', 'İnformatika müəllimi'),
  ('abseron-teacher-gunel-ceferova-nizami-qizi', 'Günel Cəfərova Nizami Qızı', 'Günel', 'Cəfərova', 'Abşeron Campusu', 'Tarix müəllimi'),
  ('abseron-teacher-xatire-ehmedzade-hicran-qizi', 'Xatirə Əhmədzadə Hicran Qızı', 'Xatirə', 'Əhmədzadə', 'Abşeron Campusu', 'Alman dili müəllimi'),
  ('abseron-teacher-xaver-hesenzade-kamran-qizi', 'Xavər Həsənzadə Kamran Qızı', 'Xavər', 'Həsənzadə', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-xaver-memmedli-nesimi-qizi', 'Xavər Məmmədli Nəsimi Qızı', 'Xavər', 'Məmmədli', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-ilahe-ezizli-zahir-qizi', 'İlahə Əzizli Zahir Qızı', 'İlahə', 'Əzizli', 'Abşeron Campusu', 'Riyaziyyat müəllimi'),
  ('abseron-teacher-ilkane-ceferova-arif-qizi', 'İlkanə Cəfərova Arif Qızı', 'İlkanə', 'Cəfərova', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-ismayil-feteliyev-mirzaga-oglu', 'İsmayıl Fətəliyev Mirzağa Oğlu', 'İsmayıl', 'Fətəliyev', 'Abşeron Campusu', 'Coğrafiyya müəllimi'),
  ('abseron-teacher-jale-ismayilova-hesen-qizi', 'Jalə İsmayılova Həsən Qızı', 'Jalə', 'İsmayılova', 'Abşeron Campusu', 'Riyaziyyat'),
  ('abseron-teacher-qafar-huseynov-mohsun-oglu', 'Qafar Hüseynov Möhsün Oğlu', 'Qafar', 'Hüseynov', 'Abşeron Campusu', 'Rus dili və Ədəbiyyatı müəllimi'),
  ('abseron-teacher-leyla-hesenova-vidadi-qizi', 'Leyla Həsənova Vidadi Qızı', 'Leyla', 'Həsənova', 'Abşeron Campusu', 'Rəqs müəllimi'),
  ('abseron-teacher-leman-agayeva-ferhad-qizi', 'Ləman Ağayeva Fərhad Qızı', 'Ləman', 'Ağayeva', 'Abşeron Campusu', 'Müəllim köməkçi( İbtidai təhsil üzrə- İngilis bölməsi)'),
  ('abseron-teacher-metanet-huseynova-hafiz-qizi', 'Mətanət Hüseynova Hafiz Qızı', 'Mətanət', 'Hüseynova', 'Abşeron Campusu', 'İcraçı direktorun İbtidai təhsil üzrə müavini'),
  ('abseron-teacher-natevan-yelmarova-kamil-qizi', 'Natəvan Yelmarova Kamil Qızı', 'Natəvan', 'Yelmarova', 'Abşeron Campusu', 'Şahmat müəllimi'),
  ('abseron-teacher-nergiz-namazova-elxan-qizi', 'Nərgiz Namazova Elxan Qızı', 'Nərgiz', 'Namazova', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-nezrin-qurbanova-rovsen-qizi', 'Nəzrin Qurbanova Rövşən Qızı', 'Nəzrin', 'Qurbanova', 'Abşeron Campusu', 'Müəllim köməkçisi(İbtidai təhsil üzrə-İngilis bölməsi)'),
  ('abseron-teacher-nigar-eliyeva-nizami-qizi', 'Nigar Əliyeva Nizami Qızı', 'Nigar', 'Əliyeva', 'Abşeron Campusu', 'Şahmat müəllimi'),
  ('abseron-teacher-nigar-rzayeva-arif-qizi', 'Nigar Rzayeva Arif Qızı', 'Nigar', 'Rzayeva', 'Abşeron Campusu', 'Kafedra rəhbəri (İncəsənət kanfedrası)'),
  ('abseron-teacher-nurane-haciyeva-qadir-qizi', 'Nuranə Hacıyeva Qadir Qızı', 'Nuranə', 'Hacıyeva', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-nuray-abdullazade-natiq-qizi', 'Nuray Abdullazadə Natiq Qızı', 'Nuray', 'Abdullazadə', 'Abşeron Campusu', 'Riyaziyyat müəllimi'),
  ('abseron-teacher-nuride-esedova-iman-qizi', 'Nuridə Əsədova İman Qızı', 'Nuridə', 'Əsədova', 'Abşeron Campusu', 'İcraçı direktorun İngilis dili bölməsi üzrə müavini'),
  ('abseron-teacher-nuru-abdullayev-nureddin-oglu', 'Nuru Abdullayev Nürəddin Oğlu', 'Nuru', 'Abdullayev', 'Abşeron Campusu', 'Tarix müəllimi'),
  ('abseron-teacher-pervane-memmedova-celal-qizi', 'Pərvanə Məmmədova Cəlal Qızı', 'Pərvanə', 'Məmmədova', 'Abşeron Campusu', 'Kafedra rəhbəri (İnformatika suni intellekt kafedrası)'),
  ('abseron-teacher-ramila-gulieva-xxx', 'Ramıla Gulıeva Xxx', 'Ramıla', 'Gulıeva', 'Abşeron Campusu', 'İbtidai sinif müəllimi-Rus bölməsi üzrə'),
  ('abseron-teacher-ramine-atayeva-teymur-qizi', 'Raminə Atayeva Teymur Qızı', 'Raminə', 'Atayeva', 'Abşeron Campusu', 'Musiqi müəllimi'),
  ('abseron-teacher-revane-osmanova-sabir-qizi', 'Rəvanə Osmanova Sabir Qızı', 'Rəvanə', 'Osmanova', 'Abşeron Campusu', 'Abituriyentlər ilə iş üzrə koordinator'),
  ('abseron-teacher-roya-huseynzade-behrem-qizi', 'Röya Hüseynzadə Bəhrəm Qızı', 'Röya', 'Hüseynzadə', 'Abşeron Campusu', 'Kimya müəllimi'),
  ('abseron-teacher-ruzigar-demirov-nureddin-oglu', 'Ruzigar Dəmirov Nürəddin Oğlu', 'Ruzigar', 'Dəmirov', 'Abşeron Campusu', 'Fiziki tərbiyə müəllimi'),
  ('abseron-teacher-ruzgar-agabbasoy-refail-qizi', 'Rüzgar Ağabbasoy Rəfail Qızı', 'Rüzgar', 'Ağabbasoy', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-sevda-axundova-vaqif-qizi', 'Sevda Axundova Vaqif Qızı', 'Sevda', 'Axundova', 'Abşeron Campusu', 'Sinif rəhbəri (İbtidai təhsil üzrə -Rus bölməsi )'),
  ('abseron-teacher-sevinc-bagirzade-oruc-qizi', 'Sevinc Bağırzadə Oruc Qızı', 'Sevinc', 'Bağırzadə', 'Abşeron Campusu', 'Riyaziyyat müəllimi'),
  ('abseron-teacher-sevinc-eliyeva-allahverdi-qizi', 'Sevinc Əliyeva Allahverdi Qızı', 'Sevinc', 'Əliyeva', 'Abşeron Campusu', 'Kimya müəllimi'),
  ('abseron-teacher-sevinc-ismayilova-mustafa-qizi', 'Sevinc İsmayılova Mustafa Qızı', 'Sevinc', 'İsmayılova', 'Abşeron Campusu', 'İbtidai sinif müəllimi-Azərbaycan bölməsi'),
  ('abseron-teacher-sevinc-qenberova-veli-qizi', 'Sevinc Qənbərova Vəli Qızı', 'Sevinc', 'Qənbərova', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-seyrane-eliyeva-intiqam-qizi', 'Seyranə Əliyeva İntiqam Qızı', 'Seyranə', 'Əliyeva', 'Abşeron Campusu', 'Sinif rəhbəri (Orta təhsil üzrə-Azərbaycan bölməsi)'),
  ('abseron-teacher-sekine-memmedova-ebulfet-qizi', 'Səkinə Məmmədova Əbülfət Qızı', 'Səkinə', 'Məmmədova', 'Abşeron Campusu', 'Sinif rəhbəri (İbtidai təhsil-Azərbaycan bölməsi)'),
  ('abseron-teacher-servinaz-ceferova-ilham-qizi', 'Sərvinaz Cəfərova İlham Qızı', 'Sərvinaz', 'Cəfərova', 'Abşeron Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('abseron-teacher-sakir-huseyn-vahid-oglu', 'Şakir Hüseyn Vahid Oğlu', 'Şakir', 'Hüseyn', 'Abşeron Campusu', 'Tarix müəllimi'),
  ('abseron-teacher-tuqay-abdullayeva-cebrayil-qizi', 'Tuqay Abdullayeva Cəbrayıl Qızı', 'Tuqay', 'Abdullayeva', 'Abşeron Campusu', 'Coğrafiya müəllimi'),
  ('abseron-teacher-tunare-rehimova-bayram-qizi', 'Tunarə Rəhimova Bayram Qızı', 'Tunarə', 'Rəhimova', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-ulker-serifli-asif-qizi', 'Ülkər Şərifli Asif Qızı', 'Ülkər', 'Şərifli', 'Abşeron Campusu', 'Sinif rəhbəri (Orta təhsil üzrə-Azərbaycan bölməsi)'),
  ('abseron-teacher-valeh-hesenli-umud-oglu', 'Valeh Həsənli Umud Oğlu', 'Valeh', 'Həsənli', 'Abşeron Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('abseron-teacher-vuqar-meherremov-ilqar-oglu', 'Vüqar Məhərrəmov İlqar Oğlu', 'Vüqar', 'Məhərrəmov', 'Abşeron Campusu', 'Riyaziyyat müəllimi'),
  ('abseron-teacher-vusale-eliyeva-eli-qizi', 'Vüsalə Əliyeva Əli Qızı', 'Vüsalə', 'Əliyeva', 'Abşeron Campusu', 'İngilis dili müəllimi'),
  ('abseron-teacher-yegane-ramazanova-mirhesen-qizi', 'Yeganə Ramazanova Mirhəsən Qızı', 'Yeganə', 'Ramazanova', 'Abşeron Campusu', 'İbtidai sinif müəllimi'),
  ('abseron-teacher-zehra-ceferzade-rizvan-qizi', 'Zəhra Cəfərzadə Rizvan Qızı', 'Zəhra', 'Cəfərzadə', 'Abşeron Campusu', 'ingilis dili müəllimi'),
  ('abseron-teacher-zerine-zubahirova-mayiz-qizi', 'Zərinə Zubahirova Mayiz Qızı', 'Zərinə', 'Zubahirova', 'Abşeron Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('azadliq-teacher-aybeniz-memmedova-rufet-qizi', 'Aybəniz Məmmədova Rüfət Qızı', 'Aybəniz', 'Məmmədova', 'Azadlıq Campusu', 'Riyaziyyat müəllimi (Rus bölməsi)'),
  ('azadliq-teacher-aynur-xelilzade-azer-qizi', 'Aynur Xəlilzadə Azər Qızı', 'Aynur', 'Xəlilzadə', 'Azadlıq Campusu', 'SAT'),
  ('azadliq-teacher-aysel-haciyeva-elvan-qizi', 'Aysel Hacıyeva Əlvan Qızı', 'Aysel', 'Hacıyeva', 'Azadlıq Campusu', 'Fizika müəllimi'),
  ('azadliq-teacher-aysel-huseynli-novruz-qizi', 'Aysel Hüseynli Novruz Qızı', 'Aysel', 'Hüseynli', 'Azadlıq Campusu', 'Azərbaycan dili və Ədəbiyyatı'),
  ('azadliq-teacher-ayten-memmedova-ilham-qizi', 'Aytən Məmmədova İlham Qızı', 'Aytən', 'Məmmədova', 'Azadlıq Campusu', 'ingilis dili müəllimi'),
  ('azadliq-teacher-balli-memmedli-elcin-qizi', 'Ballı Məmmədli Elçin Qızı', 'Ballı', 'Məmmədli', 'Azadlıq Campusu', 'İnformatika müəllimi'),
  ('azadliq-teacher-bextiyar-huseynov-davud-oglu', 'Bəxtiyar Hüseynov Davud Oğlu', 'Bəxtiyar', 'Hüseynov', 'Azadlıq Campusu', 'Riyaziyyat müəllimi rus bölməsi üzrə'),
  ('azadliq-teacher-cinare-bedelova-nazim-qizi', 'Çinarə Bədəlova Nazim Qızı', 'Çinarə', 'Bədəlova', 'Azadlıq Campusu', 'Coğrafiya müəllimi'),
  ('azadliq-teacher-elsen-quliyev-meqsud-oglu', 'Elşən Quliyev Məqsud Oğlu', 'Elşən', 'Quliyev', 'Azadlıq Campusu', 'Kimya müəllimi'),
  ('azadliq-teacher-esmira-qubadova-rovsen-qizi', 'Esmira Qubadova Rövşən Qızı', 'Esmira', 'Qubadova', 'Azadlıq Campusu', 'İnformatika müəllimi-rus bölməsi üzrə'),
  ('azadliq-teacher-husniyye-elesgerova-gulaga-qizi', 'Hüsniyyə Ələsgərova Gülağa Qızı', 'Hüsniyyə', 'Ələsgərova', 'Azadlıq Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('azadliq-teacher-xeyal-esedov-huseyinaga-oglu', 'Xəyal Əsədov Hüseyinağa Oğlu', 'Xəyal', 'Əsədov', 'Azadlıq Campusu', 'Riyaziyyat müəllimi'),
  ('azadliq-teacher-ibrahimova-fatime-vidadiyevna', 'İbrahimova Fatimə Vidadiyevna', 'İbrahimova', 'Fatimə', 'Azadlıq Campusu', 'Fizika müəllimi rus bölməsi'),
  ('azadliq-teacher-irade-memmedova-mayil-qizi', 'İradə Məmmədova Mayıl Qızı', 'İradə', 'Məmmədova', 'Azadlıq Campusu', 'Tarix müəllimi rus bölməsi üzrə'),
  ('azadliq-teacher-liaman-badalova-xxx', 'Lıaman Badalova Xxx', 'Lıaman', 'Badalova', 'Azadlıq Campusu', 'İngilis dili müəllimi'),
  ('azadliq-teacher-natiq-mazanov-ferrux-oglu', 'Natiq Mazanov Fərrux Oğlu', 'Natiq', 'Mazanov', 'Azadlıq Campusu', 'Biologiya müəllimi'),
  ('azadliq-teacher-nermin-emirova-eldar-qizi', 'Nərmin Əmirova Eldar Qızı', 'Nərmin', 'Əmirova', 'Azadlıq Campusu', 'Sinif rəhbəri (Orta təhsil üzrə-Azərbaycan bölməsi)'),
  ('azadliq-teacher-nusabe-qayayeva-elyar-qizi', 'Nüşabə Qayayeva Əlyar Qızı', 'Nüşabə', 'Qayayeva', 'Azadlıq Campusu', 'Rus dili və ədəbiyyat müəllimi'),
  ('azadliq-teacher-oktay-babayev-ezizaga-oglu', 'Oktay Babayev Əzizağa Oğlu', 'Oktay', 'Babayev', 'Azadlıq Campusu', 'Azərbaycan dili və ədəbiyyatı müəllimi'),
  ('azadliq-teacher-pervane-resulova-davud-qizi', 'Pərvanə Rəsulova Davud Qızı', 'Pərvanə', 'Rəsulova', 'Azadlıq Campusu', 'Tarix müəllimi'),
  ('azadliq-teacher-raisa-siraliyeva-maksudovna', 'Raisa Şiraliyeva Maksudovna', 'Raisa', 'Şiraliyeva', 'Azadlıq Campusu', 'Coğrafiya müəllimi'),
  ('azadliq-teacher-resul-ferzeliyev-huseyn-oglu', 'Rəsul Fərzəliyev Hüseyn Oğlu', 'Rəsul', 'Fərzəliyev', 'Azadlıq Campusu', 'Tarix müəllimi'),
  ('azadliq-teacher-sevinc-esedova-rufet-qizi', 'Sevinc Əsədova Rüfət Qızı', 'Sevinc', 'Əsədova', 'Azadlıq Campusu', 'Kimya müəllimi rus bölməsi üzrə'),
  ('azadliq-teacher-senan-seyidbeyli-imameddin-oglu', 'Sənan Seyidbəyli İmaməddin Oğlu', 'Sənan', 'Seyidbəyli', 'Azadlıq Campusu', 'Riyaziyyat müəllimi'),
  ('azadliq-teacher-zerengiz-memisova-sahin-qizi', 'Zərəngiz Məmişova Şahin Qızı', 'Zərəngiz', 'Məmişova', 'Azadlıq Campusu', 'ingilis dili müəllimi'),
  ('xetai-teacher-abbasova-siyale-ilqar', 'Abbasova Siyalə İlqar', 'Abbasova', 'Siyalə', 'Xətai Campusu', 'Fizika'),
  ('xetai-teacher-abdullayeva-vefa-gunduz', 'Abdullayeva Vəfa Gündüz', 'Abdullayeva', 'Vəfa', 'Xətai Campusu', 'Tarix'),
  ('xetai-teacher-agabalayeva-nurcahan-elxan', 'Ağabalayeva Nurcahan Elxan', 'Ağabalayeva', 'Nurcahan', 'Xətai Campusu', 'Azərbaycan dili və ədəbiyyat'),
  ('xetai-teacher-ceferova-esmira-aydin', 'Cəfərova Esmira Aydın', 'Cəfərova', 'Esmira', 'Xətai Campusu', 'Kimya'),
  ('xetai-teacher-ehmedli-musfiq-memmedali', 'Əhmədli Müşfiq Məmmədalı', 'Əhmədli', 'Müşfiq', 'Xətai Campusu', 'Kimya'),
  ('xetai-teacher-ehmedova-leman-rafiq', 'Əhmədova Ləman Rafiq', 'Əhmədova', 'Ləman', 'Xətai Campusu', 'Kimya'),
  ('xetai-teacher-ehmedova-turkane-taleh', 'Əhmədova Türkanə Taleh', 'Əhmədova', 'Türkanə', 'Xətai Campusu', 'İnformatika'),
  ('xetai-teacher-eliyeva-aygun-mubariz', 'Əliyeva Aygün Mübariz', 'Əliyeva', 'Aygün', 'Xətai Campusu', 'İngilis dili'),
  ('xetai-teacher-eliyeva-gulsen-mehman', 'Əliyeva Gülşən Mehman', 'Əliyeva', 'Gülşən', 'Xətai Campusu', 'Riyaziyyat'),
  ('xetai-teacher-elizade-jale-nazim', 'Əlizadə Jalə Nazim', 'Əlizadə', 'Jalə', 'Xətai Campusu', 'İngilis dili'),
  ('xetai-teacher-elizade-resid-elman', 'Əlizadə Rəşid Elman', 'Əlizadə', 'Rəşid', 'Xətai Campusu', 'Riyaziyyat'),
  ('xetai-teacher-elizade-samire-elxan', 'Əlizadə Samirə Elxan', 'Əlizadə', 'Samirə', 'Xətai Campusu', 'Azərbaycan dili'),
  ('xetai-teacher-ferecova-qonce-qudret', 'Fərəcova Qönçə Qüdrət', 'Fərəcova', 'Qönçə', 'Xətai Campusu', 'Fizika'),
  ('xetai-teacher-ferzeliyeva-hicran-arzu', 'Fərzəliyeva Hicran Arzu', 'Fərzəliyeva', 'Hicran', 'Xətai Campusu', 'Azərbaycan dili və ədəbiyyat'),
  ('xetai-teacher-hemidov-rufet-allahverdi', 'Həmidov Rüfət Allahverdi', 'Həmidov', 'Rüfət', 'Xətai Campusu', 'Tarix'),
  ('xetai-teacher-hesenova-sehane-sediyevna', 'Həsənova Şəhanə Sədiyevna', 'Həsənova', 'Şəhanə', 'Xətai Campusu', 'İnformatika'),
  ('xetai-teacher-ibrahimli-xezengul', 'İbrahimli Xəzəngül', 'İbrahimli', 'Xəzəngül', 'Xətai Campusu', 'Azərbaycan dili və ədəbiyyat'),
  ('xetai-teacher-ismayilova-yasemen-yusif', 'İsmayılova Yasəmən Yusif', 'İsmayılova', 'Yasəmən', 'Xətai Campusu', 'Azərbaycan dili və ədəbiyyat'),
  ('xetai-teacher-kazimova-gunel-faiq', 'Kazımova Günel Faiq', 'Kazımova', 'Günel', 'Xətai Campusu', 'Rus dili və ədəbiyyatı'),
  ('xetai-teacher-qurbanova-metanet-aqil', 'Qurbanova Mətanət Aqil', 'Qurbanova', 'Mətanət', 'Xətai Campusu', 'Fizika'),
  ('xetai-teacher-mahmudova-naile-rovsen', 'Mahmudova Nailə Rövşən', 'Mahmudova', 'Nailə', 'Xətai Campusu', 'Riyaziyyat'),
  ('xetai-teacher-mahmudova-ulker-xanoglan', 'Mahmudova Ülkər Xanoğlan', 'Mahmudova', 'Ülkər', 'Xətai Campusu', 'Müəllim'),
  ('xetai-teacher-mehraliyeva-safura-vuqar', 'Mehralıyeva Safura Vüqar', 'Mehralıyeva', 'Safura', 'Xətai Campusu', 'İngilis dili'),
  ('xetai-teacher-memmedova-irade-mobil', 'Məmmədova İradə Mobil', 'Məmmədova', 'İradə', 'Xətai Campusu', 'Rus dili və ədəbiyyatı'),
  ('xetai-teacher-musayeva-medine-receb', 'Musayeva Mədinə Rəcəb', 'Musayeva', 'Mədinə', 'Xətai Campusu', 'Coğrafiya'),
  ('xetai-teacher-musayeva-tatyana', 'Musayeva Tatyana', 'Musayeva', 'Tatyana', 'Xətai Campusu', 'Biologiya'),
  ('xetai-teacher-recebova-xumar-haqverdi', 'Rəcəbova Xumar Haqverdi', 'Rəcəbova', 'Xumar', 'Xətai Campusu', 'Tarix'),
  ('xetai-teacher-sadayli-nigar-deyanet', 'Sadaylı Nigar Dəyanət', 'Sadaylı', 'Nigar', 'Xətai Campusu', 'Coğrafiya'),
  ('xetai-teacher-seferova-aytac-yasef', 'Səfərova Aytac Yasəf', 'Səfərova', 'Aytac', 'Xətai Campusu', 'Rus dili və ədəbiyyatı'),
  ('xetai-teacher-seferova-qenimet-ramazan', 'Səfərova Qənimət Ramazan', 'Səfərova', 'Qənimət', 'Xətai Campusu', 'Riyaziyyat'),
  ('xetai-teacher-serderova-mehrane-fidayet', 'Sərdərova Mehranə Fidayət', 'Sərdərova', 'Mehranə', 'Xətai Campusu', 'İngilis dili'),
  ('xetai-teacher-serifova-ulker-nusret', 'Şərifova Ülkər Nüsrət', 'Şərifova', 'Ülkər', 'Xətai Campusu', 'İngilis dili müəllimi');

insert into public.teachers (
  id,
  org_id,
  name,
  first_name,
  last_name,
  department_id,
  branch_id,
  branch_ids,
  teacher_category,
  deleted_at,
  archived_at
)
select
  t.teacher_id,
  'default',
  t.teacher_name,
  nullif(t.first_name, ''),
  nullif(t.last_name, ''),
  coalesce((
    select d.id from public.departments d
    where d.org_id = 'default'
      and d.branch_id = br.id
      and d.name = 'Umumi'
      and d.deleted_at is null
    limit 1
  ), (
    select d2.id from public.departments d2
    where d2.org_id = 'default'
      and d2.branch_id = br.id
    limit 1
  )) as department_id,
  br.id,
  array[br.id],
  'standard'::public.teacher_category,
  null,
  null
from tmp_import_teachers t
join public.branches br
  on br.org_id = 'default' and br.name = t.branch_name
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

commit;
