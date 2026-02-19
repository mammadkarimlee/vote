# Seed Data və Şablonlar

Bu qovluq demo məlumatlar və import şablonları üçündür.

- `sample-data.json`: minimal demo data (usernames/users daxil).
- `import-templates/`: Branch admin/moderator üçün CSV şablonları.

CSV-ləri UI-də müvafiq paneldə yükləyə bilərsiniz. Login və şifrə avtomatik yaradılır.

## Stars students login provisioning

Stars Excel seed-i ilə əlavə olunan şagirdlər üçün login/parol yaratmaq:

1. `seed/stars-campus-students.seed.sql` faylını DB-yə run edin.
2. `.env.local` içində `SUPABASE_SERVICE_ROLE_KEY` dəyərini doldurun.
3. Komandanı işlədin: `npm run seed:stars:logins`

Nəticə:
- `auth.users`, `public.users`, `public.usernames` yaradılır.
- `public.students.user_id` və `public.students.login` doldurulur.
- Login/parol siyahısı `seed/stars-campus-student-logins.csv` faylına yazılır.

## Stars teachers + assignments

PDF cədvəlindən çıxarılan müəllim və dərs təyinatlarını yükləmək:

1. `seed/stars-campus-students.seed.sql` run edin (qrup/siniflər hazır olsun).
2. `seed/stars-campus-teachers.seed.sql` run edin.

Bu seed:
- `Stars Campusu` üçün müəllimləri əlavə edir (`47` müəllim, o cümlədən PDF-də olan 2 əlavə ad).
- PDF cədvəlindəki fənləri əlavə edir (`39` subject).
- `teaching_assignments` əlavə edir (`273` unikal müəllim-qrup-fənn təyinatı, `year=2026`).
- `0E4-1` və `0E4-2` kodlarını `0E4` qrupuna map edir.
- `Sinif rehberi` sətrini müəllim kimi import etmir.

## Stars teacher login provisioning

Stars müəllimlərinə login/parol yaratmaq:

1. `seed/stars-campus-teachers.seed.sql` faylını DB-yə run edin.
2. `.env.local` içində `SUPABASE_SERVICE_ROLE_KEY` dəyərini doldurun.
3. Komandanı işlədin: `npm run seed:stars:teacher-logins`

Nəticə:
- `auth.users`, `public.users`, `public.usernames` yaradılır (`role=teacher`).
- `public.teachers.user_id` və `public.teachers.login` doldurulur.
- Login/parol siyahısı `seed/stars-campus-teacher-logins.csv` faylına yazılır.

## Teacher name fixes (UTF-8)

Muellim adlari yanlis transliterasiya ile dusubse (mes. `Fatime` yerine `Fatimə`), toplu duzeltme ucun:

1. CSV template cixar:
   - `npm run seed:teacher-names:export`
2. `seed/teacher-name-fixes.csv` faylinda `new_name`, `new_first_name`, `new_last_name` sutunlarini duzelt.
3. Duzelisi DB-ye tetbiq et:
   - `npm run seed:teacher-names:apply`

Qeyd:
- Fayli UTF-8 saxlayin.
- Script `teachers` cedvelindeki adlari ve bagli `users.display_name` sahesini yenileyir.

## Teacher -> department bulk assignment

Muellimleri kafedralara toplu sekilde yerlestirmek ucun:

1. Template cixar:
   - `npm run seed:teacher-departments:export`
2. `seed/teacher-department-assignments.csv` faylinda `new_department` sutununu doldur.
3. DB-ye tetbiq et:
   - `npm run seed:teacher-departments:apply`

Qeyd:
- `new_department` adina uygun kafedra yoxdursa script onu avtomatik yaradir.
- Eyni filial daxilinde `teachers.department_id` sahesi toplu yenilenir.
