-- Seed data for Teacher Evaluation Survey System
-- Safe to run multiple times (uses ON CONFLICT / NOT EXISTS where possible)

begin;

-- Orgs
insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;

-- Branches
insert into public.branches (id, org_id, name, address, code, student_count, teacher_count, admin_count)
values
  ('branch-1', 'default', 'Bakı - Mərkəz', 'Nizami küç. 12', 'BKM', 220, 18, 3),
  ('branch-2', 'default', 'Sumqayıt', 'Sülh pr. 45', 'SMQ', 140, 12, 2),
  ('branch-3', 'default', 'Gəncə', 'Atatürk pr. 8', 'GNC', 160, 15, 2)
on conflict do nothing;

-- Departments (ensure "Ümumi" exists for each branch)
insert into public.departments (id, org_id, branch_id, name)
values
  ('dep-b1-general', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Ümumi'),
  ('dep-b1-math', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Riyaziyyat'),
  ('dep-b1-phys', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Fizika'),
  ('dep-b2-general', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Ümumi'),
  ('dep-b3-general', 'default', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Ümumi')
on conflict do nothing;

-- Subjects
insert into public.subjects (id, org_id, name, code)
values
  ('sub-math', 'default', 'Riyaziyyat', 'MATH'),
  ('sub-az', 'default', 'Azərbaycan dili', 'AZ'),
  ('sub-phys', 'default', 'Fizika', 'PHYS'),
  ('sub-eng', 'default', 'İngilis dili', 'ENG')
on conflict do nothing;

-- Groups
insert into public.groups (id, org_id, branch_id, class_level, name)
values
  ('grp-9a', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), '9', '9A'),
  ('grp-9b', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), '9', '9B'),
  ('grp-8a', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), '8', '8A')
on conflict do nothing;

-- Users
insert into public.users (id, org_id, role, branch_id, display_name, login, email)
values
  ('u-superadmin', 'default', 'superadmin', null, 'Baş direktor', 'admin', 'admin@example.com'),
  ('u-branch-admin-1', 'default', 'branch_admin', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Filial admin', 'branchadmin1', 'branch1@example.com'),
  ('u-moderator-1', 'default', 'moderator', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Moderator', 'moderator1', 'moderator1@example.com'),
  ('u-manager-1', 'default', 'manager', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Rəhbər', 'manager1', 'manager1@example.com'),
  ('u-teacher-1', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Aygün Məmmədova', 'aygunma', 'aygun@example.com'),
  ('u-student-1', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Elvin Əliyev', 'elvin1', 'elvin@example.com')
on conflict do nothing;

-- Usernames (link to existing users by login)
insert into public.usernames (org_id, login, user_id, role, branch_id)
select org_id, login, id, role, branch_id
  from public.users
 where org_id = 'default'
   and login in ('admin', 'branchadmin1', 'moderator1', 'manager1', 'aygunma', 'elvin1')
on conflict (org_id, login) do nothing;

-- Teachers
insert into public.teachers (id, org_id, name, first_name, last_name, department_id, branch_id, branch_ids, teacher_category, user_id, login)
values
  ('t-001', 'default', 'Aygün Məmmədova', 'Aygün', 'Məmmədova',
   (select id from public.departments where org_id = 'default' and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1) and name = 'Riyaziyyat' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   array[
     (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
     (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
   ],
   'standard',
   (select id from public.users where org_id = 'default' and login = 'aygunma'), 'aygunma'),
  ('t-002', 'default', 'Rauf Əliyev', 'Rauf', 'Əliyev',
   (select id from public.departments where org_id = 'default' and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1) and name = 'Fizika' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)],
   'standard', null, 'rauf1')
on conflict (id) do nothing;

-- Students
insert into public.students (id, org_id, name, branch_id, group_id, class_level, user_id, login)
values
  ('s-001', 'default', 'Elvin Əliyev',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '9A' limit 1),
   '9',
   (select id from public.users where org_id = 'default' and login = 'elvin1'), 'elvin1'),
  ('s-002', 'default', 'Aysel Qasımova',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '9B' limit 1),
   '9', null, 'aysel1')
on conflict (id) do nothing;

-- Teaching assignments
insert into public.teaching_assignments (id, org_id, teacher_id, group_id, subject_id, branch_id, year)
values
  ('ta-001', 'default', 't-001',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '9A' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Riyaziyyat' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   2026),
  ('ta-002', 'default', 't-002',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '9B' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Fizika' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   2026)
on conflict (org_id, teacher_id, group_id, subject_id, branch_id, year) do nothing;

-- Management assignments
insert into public.management_assignments (id, org_id, manager_id, branch_id, year)
select 'ma-001', 'default', u.id,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       2026
  from public.users u
 where u.org_id = 'default' and u.login = 'manager1'
on conflict (org_id, manager_id, branch_id, year) do nothing;

-- Questions
insert into public.questions (id, org_id, text, type, required, options, scale_min, scale_max, category)
values
  ('q-scale-1', 'default', 'Bu müəllimi sevirsən?', 'scale', true, null, 1, 10, 'Ümumi'),
  ('q-choice-1', 'default', 'Dərslərdən razısan?', 'choice', true, array['Bəli','Xeyr'], null, null, 'Ümumi'),
  ('q-text-1', 'default', 'Qısa rəyini yaz', 'text', false, null, null, null, 'Rəy'),
  ('q-scale-2', 'default', 'Ümumi qiymət', 'scale', true, null, 1, 10, 'Ümumi')
on conflict (id) do nothing;

-- Survey cycle
insert into public.survey_cycles (id, org_id, branch_ids, year, start_at, end_at, duration_days, status, threshold_y, threshold_p)
values
  ('cycle-2026', 'default', array[
     (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
     (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
     (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
   ], 2026,
   '2026-02-01 00:00:00+00', '2026-03-01 00:00:00+00', 29, 'OPEN', 75, 60)
on conflict do nothing;

-- Question sets
insert into public.question_sets (id, org_id, cycle_id, target_flow, question_ids)
values
  ('qs-student-teacher', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   'student_teacher', array['q-scale-1','q-text-1']),
  ('qs-teacher-management', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   'teacher_management', array['q-scale-1','q-choice-1']),
  ('qs-teacher-self', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   'teacher_self', array['q-scale-2','q-text-1']),
  ('qs-management-teacher', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   'management_teacher', array['q-scale-1','q-choice-1','q-text-1'])
on conflict (org_id, cycle_id, target_flow) do nothing;

-- Tasks
insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-001', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
          and name = '9A' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Riyaziyyat' limit 1),
       '9A', 'Riyaziyyat', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-001'
 where u.org_id = 'default' and u.login = 'elvin1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-002', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'teacher', 'manager', m.id, m.display_name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       null, null, null, null, 'OPEN', null
  from public.users u
  join public.users m on m.org_id = 'default' and m.login = 'manager1'
 where u.org_id = 'default' and u.login = 'aygunma'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-003', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'teacher', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       null, null, null, null, 'OPEN', null
  from public.users u
  join public.teachers t on t.id = 't-001'
 where u.org_id = 'default' and u.login = 'aygunma'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-004', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'manager', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       null, null, null, null, 'OPEN', null
  from public.users u
  join public.teachers t on t.id = 't-001'
 where u.org_id = 'default' and u.login = 'manager1'
on conflict (id) do nothing;

-- Submissions + Answers
insert into public.submissions (task_id, org_id, cycle_id, rater_id, target_id, branch_id, group_id, subject_id)
select t.id, t.org_id, t.cycle_id, t.rater_id, t.target_id, t.branch_id, t.group_id, t.subject_id
  from public.tasks t
 where t.id = 'task-001'
on conflict (task_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-scale-1', '8'::jsonb
  from public.submissions s
 where s.task_id = 'task-001'
on conflict (submission_id, question_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-text-1', '"Çox yaxşı müəllimdir"'::jsonb
  from public.submissions s
 where s.task_id = 'task-001'
on conflict (submission_id, question_id) do nothing;

-- AI Insights
insert into public.ai_insights (org_id, cycle_id, target_id, summary)
values
  ('default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-001', 'Şagird rəyləri ümumilikdə müsbətdir. Davamlılıq və ünsiyyət yüksək qiymətləndirilir.')
on conflict (org_id, cycle_id, target_id) do nothing;

-- BIQ class results
insert into public.biq_class_results (org_id, branch_id, cycle_id, group_id, subject_id, score)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '9A' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Riyaziyyat' limit 1),
   78)
on conflict (org_id, branch_id, cycle_id, group_id, subject_id) do nothing;

-- PKPD exam results
insert into public.pkpd_exam_results (org_id, branch_id, cycle_id, teacher_id, score, note)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-001', 24, 'İmtahan nəticəsi yaxşıdır.')
on conflict (org_id, cycle_id, teacher_id) do nothing;

-- PKPD portfolios
insert into public.pkpd_portfolios (
  org_id, branch_id, cycle_id, teacher_id,
  education_score, attendance_score, training_score, olympiad_score, events_score, note
)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-001', 3, 2.5, 8, 20, 15, 'Portfolioda aktivlik yüksəkdir.')
on conflict (org_id, cycle_id, teacher_id) do nothing;

-- PKPD achievements
insert into public.pkpd_achievements (id, org_id, branch_id, cycle_id, teacher_id, type, points, note)
values
  ('pka-001', 'default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-001', 'Olimpiada', 8, 'Şagird nailiyyəti: şəhər mərhələsi')
on conflict (id) do nothing;

-- PKPD decisions
insert into public.pkpd_decisions (org_id, branch_id, cycle_id, teacher_id, status, category, total_score, note, decided_by, decided_at)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-001', 'APPROVED', 'Yüksək', 86, 'Təklif olunan qərar.',
   (select id from public.users where org_id = 'default' and login = 'manager1'), now())
on conflict (org_id, cycle_id, teacher_id) do nothing;

-- EXTRA DATA (more students, teachers, tasks, results) for richer testing

-- Extra departments
insert into public.departments (id, org_id, branch_id, name)
values
  ('dep-b1-chem', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Kimya'),
  ('dep-b1-az', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Azərbaycan dili'),
  ('dep-b1-bio', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Biologiya'),
  ('dep-b1-hist', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Tarix'),
  ('dep-b1-cs', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'İnformatika'),
  ('dep-b1-eng', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'İngilis dili'),
  ('dep-b2-math', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Riyaziyyat'),
  ('dep-b2-az', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Azərbaycan dili'),
  ('dep-b2-phys', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Fizika'),
  ('dep-b3-eng', 'default', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'İngilis dili'),
  ('dep-b3-math', 'default', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Riyaziyyat'),
  ('dep-b3-bio', 'default', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Biologiya')
on conflict do nothing;

-- Extra subjects
insert into public.subjects (id, org_id, name, code)
values
  ('sub-chem', 'default', 'Kimya', 'CHEM'),
  ('sub-bio', 'default', 'Biologiya', 'BIO'),
  ('sub-hist', 'default', 'Tarix', 'HIST'),
  ('sub-geo', 'default', 'Coğrafiya', 'GEO'),
  ('sub-cs', 'default', 'İnformatika', 'CS')
on conflict do nothing;

-- Extra groups
insert into public.groups (id, org_id, branch_id, class_level, name)
values
  ('grp-7a', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), '7', '7A'),
  ('grp-7b', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), '7', '7B'),
  ('grp-10a', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), '10', '10A'),
  ('grp-11a', 'default', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), '11', '11A'),
  ('grp-8b', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), '8', '8B'),
  ('grp-9c', 'default', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), '9', '9A'),
  ('grp-10b', 'default', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), '10', '10B'),
  ('grp-11b', 'default', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), '11', '11B')
on conflict do nothing;

-- Extra users (teachers, students, managers)
insert into public.users (id, org_id, role, branch_id, display_name, login, email)
values
  ('u-teacher-2', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Nigar Hüseynova', 'nigar1', 'nigar1@example.com'),
  ('u-teacher-3', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Emin Quliyev', 'emin1', 'emin1@example.com'),
  ('u-teacher-4', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Arzu Əliyeva', 'arzu1', 'arzu1@example.com'),
  ('u-teacher-5', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Samir Məmmədov', 'samir1', 'samir1@example.com'),
  ('u-teacher-6', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Kamal Rzayev', 'kamal1', 'kamal1@example.com'),
  ('u-teacher-7', 'default', 'teacher', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Leyla Həsənova', 'leyla1', 'leyla1@example.com'),
  ('u-manager-2', 'default', 'manager', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Rövşən Rəhimov', 'manager2', 'manager2@example.com'),
  ('u-manager-3', 'default', 'manager', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Sevinc Kərimova', 'manager3', 'manager3@example.com'),
  ('u-student-2', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Sara Əliyeva', 'sara1', 'sara1@example.com'),
  ('u-student-3', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Murad Qasımov', 'murad1', 'murad1@example.com'),
  ('u-student-4', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Zəhra Məmmədli', 'zahra1', 'zahra1@example.com'),
  ('u-student-5', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'İlkin Rzayev', 'ilkin1', 'ilkin1@example.com'),
  ('u-student-6', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Nərmin Həsənli', 'nermin1', 'nermin1@example.com'),
  ('u-student-7', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Tural Əliyev', 'tural1', 'tural1@example.com'),
  ('u-student-8', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Lalə Quliyeva', 'lale1', 'lale1@example.com'),
  ('u-student-9', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 'Fərid Məmmədov', 'farid1', 'farid1@example.com'),
  ('u-student-10', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Zeynəb Xəlilova', 'zeynab1', 'zeynab1@example.com'),
  ('u-student-11', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Orxan Əliyev', 'orxan1', 'orxan1@example.com'),
  ('u-student-12', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 'Vüsal Məmmədli', 'vusal1', 'vusal1@example.com'),
  ('u-student-13', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Günel Rzayeva', 'gunel1', 'gunel1@example.com'),
  ('u-student-14', 'default', 'student', (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 'Samirə Əliyeva', 'samira1', 'samira1@example.com')
on conflict do nothing;

-- Extra usernames
insert into public.usernames (org_id, login, user_id, role, branch_id)
select org_id, login, id, role, branch_id
  from public.users
 where org_id = 'default'
   and login in (
     'nigar1','emin1','arzu1','samir1','kamal1','leyla1',
     'manager2','manager3',
     'sara1','murad1','zahra1','ilkin1','nermin1','tural1','lale1','farid1',
     'zeynab1','orxan1','vusal1','gunel1','samira1'
   )
on conflict (org_id, login) do nothing;

-- Extra teachers
insert into public.teachers (id, org_id, name, first_name, last_name, department_id, branch_id, branch_ids, teacher_category, user_id, login)
values
  ('t-003', 'default', 'Nigar Hüseynova', 'Nigar', 'Hüseynova',
   (select id from public.departments where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = 'Azərbaycan dili' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)],
   'standard', (select id from public.users where org_id = 'default' and login = 'nigar1'), 'nigar1'),
  ('t-004', 'default', 'Emin Quliyev', 'Emin', 'Quliyev',
   (select id from public.departments where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = 'Kimya' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)],
   'standard', (select id from public.users where org_id = 'default' and login = 'emin1'), 'emin1'),
  ('t-005', 'default', 'Arzu Əliyeva', 'Arzu', 'Əliyeva',
   (select id from public.departments where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = 'Riyaziyyat' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)],
   'standard', (select id from public.users where org_id = 'default' and login = 'arzu1'), 'arzu1'),
  ('t-006', 'default', 'Samir Məmmədov', 'Samir', 'Məmmədov',
   (select id from public.departments where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = 'Fizika' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)],
   'standard', (select id from public.users where org_id = 'default' and login = 'samir1'), 'samir1'),
  ('t-007', 'default', 'Kamal Rzayev', 'Kamal', 'Rzayev',
   (select id from public.departments where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
      and name = 'Biologiya' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)],
   'standard', (select id from public.users where org_id = 'default' and login = 'kamal1'), 'kamal1'),
  ('t-008', 'default', 'Leyla Həsənova', 'Leyla', 'Həsənova',
   (select id from public.departments where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
      and name = 'İngilis dili' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
   array[(select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)],
   'standard', (select id from public.users where org_id = 'default' and login = 'leyla1'), 'leyla1')
on conflict (id) do nothing;

-- Extra students
insert into public.students (id, org_id, name, branch_id, group_id, class_level, user_id, login)
values
  ('s-003', 'default', 'Sara Əliyeva',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7A' limit 1),
   '7', (select id from public.users where org_id = 'default' and login = 'sara1'), 'sara1'),
  ('s-004', 'default', 'Murad Qasımov',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7A' limit 1),
   '7', (select id from public.users where org_id = 'default' and login = 'murad1'), 'murad1'),
  ('s-005', 'default', 'Zəhra Məmmədli',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7B' limit 1),
   '7', (select id from public.users where org_id = 'default' and login = 'zahra1'), 'zahra1'),
  ('s-006', 'default', 'İlkin Rzayev',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7B' limit 1),
   '7', (select id from public.users where org_id = 'default' and login = 'ilkin1'), 'ilkin1'),
  ('s-007', 'default', 'Nərmin Həsənli',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '10A' limit 1),
   '10', (select id from public.users where org_id = 'default' and login = 'nermin1'), 'nermin1'),
  ('s-008', 'default', 'Tural Əliyev',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '10A' limit 1),
   '10', (select id from public.users where org_id = 'default' and login = 'tural1'), 'tural1'),
  ('s-009', 'default', 'Lalə Quliyeva',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '11A' limit 1),
   '11', (select id from public.users where org_id = 'default' and login = 'lale1'), 'lale1'),
  ('s-010', 'default', 'Fərid Məmmədov',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '11A' limit 1),
   '11', (select id from public.users where org_id = 'default' and login = 'farid1'), 'farid1'),
  ('s-011', 'default', 'Zeynəb Xəlilova',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = '8A' limit 1),
   '8', (select id from public.users where org_id = 'default' and login = 'zeynab1'), 'zeynab1'),
  ('s-012', 'default', 'Orxan Əliyev',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = '8B' limit 1),
   '8', (select id from public.users where org_id = 'default' and login = 'orxan1'), 'orxan1'),
  ('s-013', 'default', 'Vüsal Məmmədli',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = '9A' limit 1),
   '9', (select id from public.users where org_id = 'default' and login = 'vusal1'), 'vusal1'),
  ('s-014', 'default', 'Günel Rzayeva',
   (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
      and name = '10B' limit 1),
   '10', (select id from public.users where org_id = 'default' and login = 'gunel1'), 'gunel1'),
  ('s-015', 'default', 'Samirə Əliyeva',
   (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
      and name = '11B' limit 1),
   '11', (select id from public.users where org_id = 'default' and login = 'samira1'), 'samira1')
on conflict (id) do nothing;

-- Extra teaching assignments
insert into public.teaching_assignments (id, org_id, teacher_id, group_id, subject_id, branch_id, year)
values
  ('ta-003', 'default', 't-003',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7A' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Azərbaycan dili' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 2026),
  ('ta-004', 'default', 't-004',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7B' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Kimya' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1), 2026),
  ('ta-005', 'default', 't-005',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = '8A' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Riyaziyyat' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 2026),
  ('ta-006', 'default', 't-006',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = '8B' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Fizika' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 2026),
  ('ta-007', 'default', 't-007',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
      and name = '10B' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Biologiya' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 2026),
  ('ta-008', 'default', 't-008',
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
      and name = '11B' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'İngilis dili' limit 1),
   (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 2026)
on conflict (org_id, teacher_id, group_id, subject_id, branch_id, year) do nothing;

-- Extra management assignments
insert into public.management_assignments (id, org_id, manager_id, branch_id, year)
select 'ma-002', 'default', u.id,
       (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1), 2026
  from public.users u
 where u.org_id = 'default' and u.login = 'manager2'
on conflict (org_id, manager_id, branch_id, year) do nothing;

insert into public.management_assignments (id, org_id, manager_id, branch_id, year)
select 'ma-003', 'default', u.id,
       (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1), 2026
  from public.users u
 where u.org_id = 'default' and u.login = 'manager3'
on conflict (org_id, manager_id, branch_id, year) do nothing;

-- Extra survey cycle (2025, CLOSED)
insert into public.survey_cycles (id, org_id, branch_ids, year, start_at, end_at, duration_days, status, threshold_y, threshold_p)
values
  ('cycle-2025', 'default', array[
     (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
     (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
     (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
   ], 2025,
   '2025-02-01 00:00:00+00', '2025-03-01 00:00:00+00', 29, 'CLOSED', 75, 60)
on conflict do nothing;

-- Extra question sets for 2025
insert into public.question_sets (id, org_id, cycle_id, target_flow, question_ids)
values
  ('qs-student-teacher-2025', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2025 order by created_at desc limit 1),
   'student_teacher', array['q-scale-1','q-text-1']),
  ('qs-teacher-management-2025', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2025 order by created_at desc limit 1),
   'teacher_management', array['q-scale-1','q-choice-1']),
  ('qs-teacher-self-2025', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2025 order by created_at desc limit 1),
   'teacher_self', array['q-scale-2','q-text-1']),
  ('qs-management-teacher-2025', 'default',
   (select id from public.survey_cycles where org_id = 'default' and year = 2025 order by created_at desc limit 1),
   'management_teacher', array['q-scale-1','q-choice-1','q-text-1'])
on conflict (org_id, cycle_id, target_flow) do nothing;

-- Extra tasks (DONE) for richer results
insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-005', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
          and name = '7A' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Azərbaycan dili' limit 1),
       '7A', 'Azərbaycan dili', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-003'
 where u.org_id = 'default' and u.login = 'sara1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-006', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
          and name = '7A' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Kimya' limit 1),
       '7A', 'Kimya', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-004'
 where u.org_id = 'default' and u.login = 'murad1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-007', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
          and name = '7B' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Kimya' limit 1),
       '7B', 'Kimya', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-004'
 where u.org_id = 'default' and u.login = 'zahra1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-008', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
          and name = '7B' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Azərbaycan dili' limit 1),
       '7B', 'Azərbaycan dili', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-003'
 where u.org_id = 'default' and u.login = 'ilkin1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-009', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
          and name = '8A' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Riyaziyyat' limit 1),
       '8A', 'Riyaziyyat', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-005'
 where u.org_id = 'default' and u.login = 'zeynab1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-010', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
          and name = '8B' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Fizika' limit 1),
       '8B', 'Fizika', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-006'
 where u.org_id = 'default' and u.login = 'orxan1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-011', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
          and name = '10B' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'Biologiya' limit 1),
       '10B', 'Biologiya', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-007'
 where u.org_id = 'default' and u.login = 'gunel1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, group_id, subject_id, group_name, subject_name, status, submitted_at)
select 'task-012', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'student', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
       (select id from public.groups where org_id = 'default'
          and branch_id = (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1)
          and name = '11B' limit 1),
       (select id from public.subjects where org_id = 'default' and name = 'İngilis dili' limit 1),
       '11B', 'İngilis dili', 'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-008'
 where u.org_id = 'default' and u.login = 'samira1'
on conflict (id) do nothing;

-- Manager -> teacher evaluations
insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, status, submitted_at)
select 'task-013', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       m.id, 'manager', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
       'DONE', now()
  from public.users m
  join public.teachers t on t.id = 't-005'
 where m.org_id = 'default' and m.login = 'manager2'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, status, submitted_at)
select 'task-014', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       m.id, 'manager', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Gəncə' limit 1),
       'DONE', now()
  from public.users m
  join public.teachers t on t.id = 't-007'
 where m.org_id = 'default' and m.login = 'manager3'
on conflict (id) do nothing;

-- Teacher self + teacher -> manager
insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, status, submitted_at)
select 'task-015', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'teacher', 'teacher', t.id, t.name,
       (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
       'DONE', now()
  from public.users u
  join public.teachers t on t.id = 't-003'
 where u.org_id = 'default' and u.login = 'nigar1'
on conflict (id) do nothing;

insert into public.tasks (id, org_id, cycle_id, rater_id, rater_role, target_type, target_id, target_name, branch_id, status, submitted_at)
select 'task-016', 'default',
       (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
       u.id, 'teacher', 'manager', m.id, m.display_name,
       (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
       'DONE', now()
  from public.users u
  join public.users m on m.org_id = 'default' and m.login = 'manager2'
 where u.org_id = 'default' and u.login = 'arzu1'
on conflict (id) do nothing;

-- Extra submissions for the new DONE tasks
insert into public.submissions (task_id, org_id, cycle_id, rater_id, target_id, branch_id, group_id, subject_id)
select t.id, t.org_id, t.cycle_id, t.rater_id, t.target_id, t.branch_id, t.group_id, t.subject_id
  from public.tasks t
 where t.id in ('task-005','task-006','task-007','task-008','task-009','task-010','task-011','task-012','task-013','task-014','task-015','task-016')
on conflict (task_id) do nothing;

-- Answers for student -> teacher (scale + text)
insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-scale-1', to_jsonb(8)
  from public.submissions s
 where s.task_id in ('task-005','task-006','task-007','task-008','task-009','task-010','task-011','task-012')
on conflict (submission_id, question_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-text-1', to_jsonb('Çox yaxşı dərs keçir.'::text)
  from public.submissions s
 where s.task_id in ('task-005','task-006','task-007','task-008')
on conflict (submission_id, question_id) do nothing;

-- Answers for manager -> teacher (scale + choice + text)
insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-scale-1', to_jsonb(9)
  from public.submissions s
 where s.task_id in ('task-013','task-014')
on conflict (submission_id, question_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-choice-1', to_jsonb('Bəli'::text)
  from public.submissions s
 where s.task_id in ('task-013','task-014')
on conflict (submission_id, question_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-text-1', to_jsonb('Rəhbərlik tərəfindən müsbət qiymətləndirildi.'::text)
  from public.submissions s
 where s.task_id in ('task-013','task-014')
on conflict (submission_id, question_id) do nothing;

-- Answers for teacher self (scale-2 + text)
insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-scale-2', to_jsonb(8)
  from public.submissions s
 where s.task_id = 'task-015'
on conflict (submission_id, question_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-text-1', to_jsonb('Özünü inkişaf üçün plan var.'::text)
  from public.submissions s
 where s.task_id = 'task-015'
on conflict (submission_id, question_id) do nothing;

-- Answers for teacher -> manager (scale + choice)
insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-scale-1', to_jsonb(7)
  from public.submissions s
 where s.task_id = 'task-016'
on conflict (submission_id, question_id) do nothing;

insert into public.answers (org_id, submission_id, question_id, value)
select 'default', s.task_id, 'q-choice-1', to_jsonb('Bəli'::text)
  from public.submissions s
 where s.task_id = 'task-016'
on conflict (submission_id, question_id) do nothing;

-- Extra AI Insights
insert into public.ai_insights (org_id, cycle_id, target_id, summary)
values
  ('default', (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-003', 'Ünsiyyət bacarıqları yüksəkdir, şagirdlərlə münasibət müsbətdir.'),
  ('default', (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-004', 'Fənn üzrə bilik səviyyəsi yaxşıdır, izahlar aydındır.'),
  ('default', (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-005', 'Dərslərdə aktivlik yüksəkdir, iştirak təmin olunur.')
on conflict (org_id, cycle_id, target_id) do nothing;

-- Extra BIQ class results
insert into public.biq_class_results (org_id, branch_id, cycle_id, group_id, subject_id, score)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1)
      and name = '7A' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Azərbaycan dili' limit 1),
   74),
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   (select id from public.groups where org_id = 'default'
      and branch_id = (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1)
      and name = '8B' limit 1),
   (select id from public.subjects where org_id = 'default' and name = 'Fizika' limit 1),
   69)
on conflict (org_id, branch_id, cycle_id, group_id, subject_id) do nothing;

-- Extra PKPD exam results
insert into public.pkpd_exam_results (org_id, branch_id, cycle_id, teacher_id, score, note)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-003', 22, 'İmtahan nəticəsi qənaətbəxşdir.'),
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-005', 26, 'İmtahan nəticəsi yaxşıdır.')
on conflict (org_id, cycle_id, teacher_id) do nothing;

-- Extra PKPD portfolios
insert into public.pkpd_portfolios (
  org_id, branch_id, cycle_id, teacher_id,
  education_score, attendance_score, training_score, olympiad_score, events_score, note
)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-003', 2.5, 2.0, 6, 10, 12, 'Portfolioda fəaliyyət stabil davam edir.'),
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-005', 3, 2.8, 7, 15, 18, 'Portfolio aktivdir.')
on conflict (org_id, cycle_id, teacher_id) do nothing;

-- Extra PKPD achievements
insert into public.pkpd_achievements (id, org_id, branch_id, cycle_id, teacher_id, type, points, note)
values
  ('pka-002', 'default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-003', 'Təlim', 6, 'Seminar iştirakçısı'),
  ('pka-003', 'default',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-005', 'Olimpiada', 7, 'Rayon mərhələsi')
on conflict (id) do nothing;

-- Extra PKPD decisions
insert into public.pkpd_decisions (org_id, branch_id, cycle_id, teacher_id, status, category, total_score, note, decided_by, decided_at)
values
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Bakı - Mərkəz' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-003', 'APPROVED', 'Yaxşı', 78, 'Qərar müsbətdir.',
   (select id from public.users where org_id = 'default' and login = 'manager1'), now()),
  ('default',
   (select id from public.branches where org_id = 'default' and name = 'Sumqayıt' limit 1),
   (select id from public.survey_cycles where org_id = 'default' and year = 2026 order by created_at desc limit 1),
   't-005', 'APPROVED', 'Yüksək', 84, 'Yüksək nəticə.',
   (select id from public.users where org_id = 'default' and login = 'manager2'), now())
on conflict (org_id, cycle_id, teacher_id) do nothing;
commit;


