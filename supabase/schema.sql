-- Supabase schema for Teacher Evaluation Survey System.
-- Includes RLS policies and server-side validations for the current auth model.

begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum (
    'student',
    'teacher',
    'manager',
    'moderator',
    'branch_admin',
    'superadmin'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.target_flow as enum (
    'student_teacher',
    'teacher_management',
    'management_teacher',
    'teacher_self'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.teacher_category as enum (
    'standard',
    'drama_gym',
    'chess'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.target_flow add value if not exists 'teacher_self';

do $$
begin
  create type public.question_type as enum ('scale', 'choice', 'text');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_status as enum ('OPEN', 'DONE');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pkpd_decision_status as enum ('PENDING', 'APPROVED', 'REJECTED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.survey_cycle_status as enum ('DRAFT', 'OPEN', 'CLOSED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.target_type as enum ('teacher', 'manager');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.orgs (
  id text primary key,
  name text,
  created_at timestamptz not null default now()
);

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;

create table if not exists public.branches (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  name text not null,
  address text,
  student_count integer,
  teacher_count integer,
  admin_count integer,
  code text,
  created_at timestamptz not null default now()
);

alter table public.branches
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists branches_org_id_idx on public.branches (org_id);

create table if not exists public.users (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  role public.user_role not null,
  branch_id text references public.branches (id) on delete set null,
  display_name text,
  login text,
  email text,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.users
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists users_org_role_idx on public.users (org_id, role);
create index if not exists users_branch_idx on public.users (branch_id);

create table if not exists public.usernames (
  org_id text not null references public.orgs (id) on delete cascade,
  login text not null,
  user_id text not null references public.users (id) on delete cascade,
  role public.user_role not null,
  branch_id text references public.branches (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, login)
);

alter table public.usernames
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists usernames_user_id_idx on public.usernames (user_id);

create table if not exists public.groups (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  class_level text not null,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.groups
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists groups_branch_idx on public.groups (branch_id);

create table if not exists public.subjects (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now()
);

alter table public.subjects
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists subjects_org_idx on public.subjects (org_id);

create table if not exists public.departments (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists departments_org_idx on public.departments (org_id);
create index if not exists departments_branch_idx on public.departments (branch_id);
create unique index if not exists departments_org_branch_name_uidx on public.departments (org_id, branch_id, name);

create table if not exists public.teachers (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  name text not null,
  first_name text,
  last_name text,
  department_id text references public.departments (id) on delete set null,
  photo_url text,
  branch_id text references public.branches (id) on delete set null,
  branch_ids text[],
  teacher_category public.teacher_category not null default 'standard',
  user_id text references public.users (id) on delete set null,
  login text,
  created_at timestamptz not null default now()
);

alter table public.teachers
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists department_id text references public.departments (id) on delete set null,
  add column if not exists photo_url text,
  add column if not exists teacher_category public.teacher_category not null default 'standard';

create index if not exists teachers_branch_idx on public.teachers (branch_id);
create index if not exists teachers_department_idx on public.teachers (department_id);

-- Default departments + backfill
insert into public.departments (id, org_id, branch_id, name)
select gen_random_uuid()::text, b.org_id, b.id, 'Ümumi'
  from public.branches b
 where not exists (
   select 1
     from public.departments d
    where d.org_id = b.org_id
      and d.branch_id = b.id
      and d.name = 'Ümumi'
 );

update public.teachers t
   set department_id = d.id
  from public.departments d
 where t.department_id is null
   and t.branch_id = d.branch_id
   and t.org_id = d.org_id
   and d.name = 'Ümumi';

alter table public.teachers drop constraint if exists teachers_department_required;
alter table public.teachers
  add constraint teachers_department_required
  check (branch_id is null or department_id is not null);

create table if not exists public.students (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  name text not null,
  branch_id text not null references public.branches (id) on delete cascade,
  group_id text not null references public.groups (id) on delete cascade,
  class_level text not null,
  user_id text references public.users (id) on delete set null,
  login text,
  created_at timestamptz not null default now()
);

alter table public.students
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists students_branch_idx on public.students (branch_id);
create index if not exists students_group_idx on public.students (group_id);

create table if not exists public.teaching_assignments (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  group_id text not null references public.groups (id) on delete cascade,
  subject_id text not null references public.subjects (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  year integer not null,
  created_at timestamptz not null default now(),
  unique (org_id, teacher_id, group_id, subject_id, branch_id, year)
);

alter table public.teaching_assignments
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists teaching_assignments_teacher_idx on public.teaching_assignments (teacher_id);
create index if not exists teaching_assignments_group_idx on public.teaching_assignments (group_id);

create table if not exists public.management_assignments (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  manager_id text not null references public.users (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  year integer not null,
  created_at timestamptz not null default now(),
  unique (org_id, manager_id, branch_id, year)
);

alter table public.management_assignments
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists management_assignments_branch_idx on public.management_assignments (branch_id);

create table if not exists public.questions (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  text text not null,
  type public.question_type not null,
  required boolean not null default false,
  options text[],
  scale_min integer,
  scale_max integer,
  category text,
  created_at timestamptz not null default now()
);

alter table public.questions
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists questions_org_idx on public.questions (org_id);

create table if not exists public.survey_cycles (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_ids text[],
  year integer not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_days integer not null,
  status public.survey_cycle_status not null default 'DRAFT',
  threshold_y numeric not null,
  threshold_p numeric not null,
  created_at timestamptz not null default now(),
  check (duration_days > 0),
  check (end_at >= start_at)
);

alter table public.survey_cycles
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

alter table public.survey_cycles
  add column if not exists branch_ids text[];

create index if not exists survey_cycles_org_year_idx on public.survey_cycles (org_id, year);
create index if not exists survey_cycles_branch_ids_gin on public.survey_cycles using gin (branch_ids);

create table if not exists public.question_sets (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  target_flow public.target_flow not null,
  question_ids text[] not null default '{}'::text[],
  updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, cycle_id, target_flow)
);

alter table public.question_sets
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists question_sets_cycle_idx on public.question_sets (cycle_id);

create table if not exists public.tasks (
  id text primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  rater_id text not null references public.users (id) on delete cascade,
  rater_role public.user_role not null,
  target_type public.target_type not null,
  target_id text not null,
  target_name text,
  branch_id text not null references public.branches (id) on delete cascade,
  group_id text references public.groups (id) on delete set null,
  subject_id text references public.subjects (id) on delete set null,
  group_name text,
  subject_name text,
  status public.task_status not null default 'OPEN',
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists tasks_rater_idx on public.tasks (rater_id);
create index if not exists tasks_cycle_idx on public.tasks (cycle_id);
create index if not exists tasks_status_idx on public.tasks (status);

create table if not exists public.submissions (
  task_id text primary key references public.tasks (id) on delete cascade,
  org_id text not null references public.orgs (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  rater_id text not null references public.users (id) on delete cascade,
  target_id text not null,
  branch_id text not null references public.branches (id) on delete cascade,
  group_id text references public.groups (id) on delete set null,
  subject_id text references public.subjects (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.submissions
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists submissions_rater_idx on public.submissions (rater_id);
create index if not exists submissions_cycle_idx on public.submissions (cycle_id);

create table if not exists public.answers (
  org_id text not null references public.orgs (id) on delete cascade,
  submission_id text not null references public.submissions (task_id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  primary key (submission_id, question_id)
);

alter table public.answers
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists answers_org_idx on public.answers (org_id);
create index if not exists answers_question_idx on public.answers (question_id);

create table if not exists public.ai_insights (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  target_id text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  unique (org_id, cycle_id, target_id)
);

alter table public.ai_insights
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create table if not exists public.biq_class_results (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  group_id text not null references public.groups (id) on delete cascade,
  subject_id text not null references public.subjects (id) on delete cascade,
  score numeric not null,
  created_at timestamptz not null default now(),
  check (score >= 0 and score <= 100),
  unique (org_id, branch_id, cycle_id, group_id, subject_id)
);

alter table public.biq_class_results
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists biq_class_results_org_idx on public.biq_class_results (org_id);
create index if not exists biq_class_results_branch_idx on public.biq_class_results (branch_id);
create index if not exists biq_class_results_cycle_idx on public.biq_class_results (cycle_id);

create table if not exists public.pkpd_exam_results (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  score numeric not null,
  note text,
  created_at timestamptz not null default now(),
  check (score >= 0 and score <= 30),
  unique (org_id, cycle_id, teacher_id)
);

alter table public.pkpd_exam_results
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists pkpd_exam_org_idx on public.pkpd_exam_results (org_id);
create index if not exists pkpd_exam_branch_idx on public.pkpd_exam_results (branch_id);
create index if not exists pkpd_exam_cycle_idx on public.pkpd_exam_results (cycle_id);
create index if not exists pkpd_exam_teacher_idx on public.pkpd_exam_results (teacher_id);

create table if not exists public.pkpd_portfolios (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  education_score numeric,
  attendance_score numeric,
  training_score numeric,
  olympiad_score numeric,
  events_score numeric,
  note text,
  created_at timestamptz not null default now(),
  check (education_score is null or (education_score >= 0 and education_score <= 3)),
  check (attendance_score is null or (attendance_score >= 0 and attendance_score <= 3)),
  check (training_score is null or (training_score >= 0 and training_score <= 9)),
  check (olympiad_score is null or (olympiad_score >= 0 and olympiad_score <= 30)),
  check (events_score is null or (events_score >= 0 and events_score <= 25)),
  unique (org_id, cycle_id, teacher_id)
);

alter table public.pkpd_portfolios
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists pkpd_portfolios_org_idx on public.pkpd_portfolios (org_id);
create index if not exists pkpd_portfolios_branch_idx on public.pkpd_portfolios (branch_id);
create index if not exists pkpd_portfolios_cycle_idx on public.pkpd_portfolios (cycle_id);
create index if not exists pkpd_portfolios_teacher_idx on public.pkpd_portfolios (teacher_id);

create table if not exists public.pkpd_achievements (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  type text not null,
  points numeric not null,
  note text,
  created_at timestamptz not null default now(),
  check (points >= 0 and points <= 10)
);

alter table public.pkpd_achievements
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists pkpd_achievements_org_idx on public.pkpd_achievements (org_id);
create index if not exists pkpd_achievements_branch_idx on public.pkpd_achievements (branch_id);
create index if not exists pkpd_achievements_cycle_idx on public.pkpd_achievements (cycle_id);
create index if not exists pkpd_achievements_teacher_idx on public.pkpd_achievements (teacher_id);

create table if not exists public.pkpd_decisions (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.orgs (id) on delete cascade,
  branch_id text not null references public.branches (id) on delete cascade,
  cycle_id text not null references public.survey_cycles (id) on delete cascade,
  teacher_id text not null references public.teachers (id) on delete cascade,
  status public.pkpd_decision_status not null default 'PENDING',
  category text,
  total_score numeric,
  note text,
  decided_by text references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, cycle_id, teacher_id)
);

alter table public.pkpd_decisions
  add column if not exists org_id text not null default 'default' references public.orgs (id) on delete cascade;

create index if not exists pkpd_decisions_org_idx on public.pkpd_decisions (org_id);
create index if not exists pkpd_decisions_branch_idx on public.pkpd_decisions (branch_id);
create index if not exists pkpd_decisions_cycle_idx on public.pkpd_decisions (cycle_id);
create index if not exists pkpd_decisions_teacher_idx on public.pkpd_decisions (teacher_id);

-- Scale defaults (1-10)
alter table public.questions
  alter column scale_min set default 1;
alter table public.questions
  alter column scale_max set default 10;

update public.questions
   set scale_min = coalesce(scale_min, 1),
       scale_max = coalesce(scale_max, 10)
 where type = 'scale'
   and (scale_min is null or scale_max is null);

-- Soft delete / archiving columns
alter table public.branches
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.users
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.teachers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.students
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.groups
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.subjects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.departments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.teaching_assignments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

alter table public.management_assignments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.users (id) on delete set null;

-- Audit log
create table if not exists public.audit_logs (
  id bigserial primary key,
  org_id text not null references public.orgs (id) on delete cascade,
  actor_id text references public.users (id) on delete set null,
  action text not null,
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on public.audit_logs (org_id);
create index if not exists audit_logs_table_idx on public.audit_logs (table_name);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor text := auth.uid()::text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_org text := coalesce(v_new->>'org_id', v_old->>'org_id', public.current_org_id());
  v_row text;
  v_action text := tg_op;
begin
  v_row := coalesce(
    v_new->>'id',
    v_old->>'id',
    v_new->>'task_id',
    v_old->>'task_id',
    v_new->>'submission_id',
    v_old->>'submission_id'
  );
  insert into public.audit_logs (org_id, actor_id, action, table_name, row_id, before, after)
  values (
    v_org,
    v_actor,
    v_action,
    tg_table_name,
    v_row,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_branches on public.branches;
create trigger audit_branches
  after insert or update or delete on public.branches
  for each row execute function public.log_audit();

drop trigger if exists audit_users on public.users;
create trigger audit_users
  after insert or update or delete on public.users
  for each row execute function public.log_audit();

drop trigger if exists audit_teachers on public.teachers;
create trigger audit_teachers
  after insert or update or delete on public.teachers
  for each row execute function public.log_audit();

drop trigger if exists audit_students on public.students;
create trigger audit_students
  after insert or update or delete on public.students
  for each row execute function public.log_audit();

drop trigger if exists audit_groups on public.groups;
create trigger audit_groups
  after insert or update or delete on public.groups
  for each row execute function public.log_audit();

drop trigger if exists audit_subjects on public.subjects;
create trigger audit_subjects
  after insert or update or delete on public.subjects
  for each row execute function public.log_audit();

drop trigger if exists audit_departments on public.departments;
create trigger audit_departments
  after insert or update or delete on public.departments
  for each row execute function public.log_audit();

drop trigger if exists audit_teaching_assignments on public.teaching_assignments;
create trigger audit_teaching_assignments
  after insert or update or delete on public.teaching_assignments
  for each row execute function public.log_audit();

drop trigger if exists audit_management_assignments on public.management_assignments;
create trigger audit_management_assignments
  after insert or update or delete on public.management_assignments
  for each row execute function public.log_audit();

drop trigger if exists audit_biq_class_results on public.biq_class_results;
create trigger audit_biq_class_results
  after insert or update or delete on public.biq_class_results
  for each row execute function public.log_audit();

drop trigger if exists audit_pkpd_exam_results on public.pkpd_exam_results;
create trigger audit_pkpd_exam_results
  after insert or update or delete on public.pkpd_exam_results
  for each row execute function public.log_audit();

drop trigger if exists audit_pkpd_portfolios on public.pkpd_portfolios;
create trigger audit_pkpd_portfolios
  after insert or update or delete on public.pkpd_portfolios
  for each row execute function public.log_audit();

drop trigger if exists audit_pkpd_achievements on public.pkpd_achievements;
create trigger audit_pkpd_achievements
  after insert or update or delete on public.pkpd_achievements
  for each row execute function public.log_audit();

drop trigger if exists audit_pkpd_decisions on public.pkpd_decisions;
create trigger audit_pkpd_decisions
  after insert or update or delete on public.pkpd_decisions
  for each row execute function public.log_audit();

-- Uniqueness + integrity helpers
create unique index if not exists users_org_login_uidx on public.users (org_id, login) where login is not null;
create unique index if not exists users_org_email_uidx on public.users (org_id, email) where email is not null;
create unique index if not exists branches_org_name_uidx on public.branches (org_id, name);
create unique index if not exists subjects_org_name_uidx on public.subjects (org_id, name);
create unique index if not exists subjects_org_code_uidx on public.subjects (org_id, code) where code is not null;
create unique index if not exists groups_org_branch_name_uidx on public.groups (org_id, branch_id, name);
create unique index if not exists survey_cycles_org_year_uidx on public.survey_cycles (org_id, year);

-- Security helpers
create or replace function public.current_user_profile()
returns table (id text, org_id text, role public.user_role, branch_id text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select id, org_id, role, branch_id
  from public.users
  where id = auth.uid()::text
$$;

grant execute on function public.current_user_profile() to authenticated;

create or replace function public.current_org_id()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select org_id
  from public.users
  where id = auth.uid()::text
$$;

grant execute on function public.current_org_id() to authenticated;

create or replace function public.current_branch_id()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select branch_id
  from public.users
  where id = auth.uid()::text
$$;

grant execute on function public.current_branch_id() to authenticated;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()::text
      and role = 'superadmin'
  )
$$;

grant execute on function public.is_superadmin() to authenticated;

create or replace function public.is_branch_staff()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()::text
      and role in ('branch_admin', 'moderator')
  )
$$;

grant execute on function public.is_branch_staff() to authenticated;

create or replace function public.validate_task_target()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if new.target_type = 'teacher' then
    if not exists (
      select 1 from public.teachers
      where id = new.target_id
        and org_id = new.org_id
    ) then
      raise exception 'invalid teacher target';
    end if;
  elsif new.target_type = 'manager' then
    if not exists (
      select 1 from public.users
      where id = new.target_id
        and org_id = new.org_id
        and role = 'manager'
    ) then
      raise exception 'invalid manager target';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_validate_target on public.tasks;
create trigger tasks_validate_target
  before insert or update on public.tasks
  for each row execute function public.validate_task_target();

create or replace function public.validate_answer()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_type public.question_type;
  v_options text[];
  v_min integer;
  v_max integer;
begin
  select type, options, scale_min, scale_max
    into v_type, v_options, v_min, v_max
    from public.questions
   where id = new.question_id
     and org_id = new.org_id;

  if not found then
    raise exception 'invalid question';
  end if;

  if v_type = 'scale' then
    if jsonb_typeof(new.value) <> 'number' then
      raise exception 'invalid scale answer';
    end if;
    if (new.value::text)::numeric < coalesce(v_min, 1)
       or (new.value::text)::numeric > coalesce(v_max, 10) then
      raise exception 'scale out of range';
    end if;
  elsif v_type = 'choice' then
    if jsonb_typeof(new.value) <> 'string' then
      raise exception 'invalid choice answer';
    end if;
    if not (trim(both '"' from new.value::text) = any(coalesce(v_options, '{}'::text[]))) then
      raise exception 'invalid choice option';
    end if;
  elsif v_type = 'text' then
    if jsonb_typeof(new.value) <> 'string' then
      raise exception 'invalid text answer';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists answers_validate_value on public.answers;
create trigger answers_validate_value
  before insert or update on public.answers
  for each row execute function public.validate_answer();

-- Voting RPC with validation + transaction
create or replace function public.submit_vote(
  p_task_id text,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_task public.tasks%rowtype;
  v_cycle public.survey_cycles%rowtype;
  v_flow public.target_flow;
  v_question_ids text[];
  v_now timestamptz := now();
  v_missing text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
    into v_task
    from public.tasks
   where id = p_task_id
     and org_id = public.current_org_id()
   for update;

  if not found then
    raise exception 'task not found';
  end if;

  if v_task.rater_id <> auth.uid()::text then
    raise exception 'not allowed';
  end if;

  if v_task.status <> 'OPEN' then
    raise exception 'task already completed';
  end if;

  if exists (select 1 from public.submissions where task_id = v_task.id) then
    raise exception 'submission already exists';
  end if;

  select *
    into v_cycle
    from public.survey_cycles
   where id = v_task.cycle_id
     and org_id = v_task.org_id;

  if not found then
    raise exception 'cycle not found';
  end if;

  if v_cycle.status <> 'OPEN' then
    raise exception 'cycle not open';
  end if;

  if v_now < v_cycle.start_at or v_now > v_cycle.end_at then
    raise exception 'cycle closed';
  end if;

  if v_task.rater_role = 'student' and v_task.target_type = 'teacher' then
    v_flow := 'student_teacher';
  elsif v_task.rater_role = 'teacher' and v_task.target_type = 'manager' then
    v_flow := 'teacher_management';
  elsif v_task.rater_role = 'teacher' and v_task.target_type = 'teacher' then
    v_flow := 'teacher_self';
  else
    v_flow := 'management_teacher';
  end if;

  select question_ids
    into v_question_ids
    from public.question_sets
   where org_id = v_task.org_id
     and cycle_id = v_task.cycle_id
     and target_flow = v_flow;

  if v_question_ids is null or array_length(v_question_ids, 1) is null then
    raise exception 'question set not found';
  end if;

  create temp table tmp_answers (
    question_id text,
    value jsonb
  ) on commit drop;

  if p_answers is not null then
    insert into tmp_answers (question_id, value)
    select distinct on (elem->>'question_id') (elem->>'question_id'), (elem->'value')
      from jsonb_array_elements(p_answers) elem
     where (elem->>'question_id') is not null;
  end if;

  if exists (
    select 1
      from tmp_answers a
     where not (a.question_id = any(v_question_ids))
  ) then
    raise exception 'invalid question id';
  end if;

  select array_agg(q.id)
    into v_missing
    from public.questions q
   where q.org_id = v_task.org_id
     and q.id = any(v_question_ids)
     and q.required = true
     and not exists (
       select 1
         from tmp_answers a
        where a.question_id = q.id
          and (
            case jsonb_typeof(a.value)
              when 'string' then length(trim(both '"' from a.value::text)) > 0
              when 'number' then true
              when 'boolean' then true
              else false
            end
          )
     );

  if v_missing is not null then
    raise exception 'missing required answers';
  end if;

  if exists (
    select 1
      from tmp_answers a
      join public.questions q
        on q.id = a.question_id
       and q.org_id = v_task.org_id
     where q.type = 'scale'
       and (
         jsonb_typeof(a.value) <> 'number'
         or (a.value::text)::numeric < coalesce(q.scale_min, 1)
         or (a.value::text)::numeric > coalesce(q.scale_max, 10)
       )
  ) then
    raise exception 'invalid scale answer';
  end if;

  if exists (
    select 1
      from tmp_answers a
      join public.questions q
        on q.id = a.question_id
       and q.org_id = v_task.org_id
     where q.type = 'choice'
       and (
         jsonb_typeof(a.value) <> 'string'
         or not (trim(both '"' from a.value::text) = any(coalesce(q.options, '{}'::text[])))
       )
  ) then
    raise exception 'invalid choice answer';
  end if;

  if exists (
    select 1
      from tmp_answers a
      join public.questions q
        on q.id = a.question_id
       and q.org_id = v_task.org_id
     where q.type = 'text'
       and jsonb_typeof(a.value) <> 'string'
  ) then
    raise exception 'invalid text answer';
  end if;

  insert into public.submissions (
    task_id,
    org_id,
    cycle_id,
    rater_id,
    target_id,
    branch_id,
    group_id,
    subject_id
  ) values (
    v_task.id,
    v_task.org_id,
    v_task.cycle_id,
    v_task.rater_id,
    v_task.target_id,
    v_task.branch_id,
    v_task.group_id,
    v_task.subject_id
  );

  insert into public.answers (org_id, submission_id, question_id, value)
  select v_task.org_id, v_task.id, a.question_id, a.value
    from tmp_answers a;

  update public.tasks
     set status = 'DONE',
         submitted_at = v_now
   where id = v_task.id;
end;
$$;

grant execute on function public.submit_vote(text, jsonb) to authenticated;

-- Row Level Security
alter table public.orgs enable row level security;
alter table public.branches enable row level security;
alter table public.users enable row level security;
alter table public.usernames enable row level security;
alter table public.groups enable row level security;
alter table public.subjects enable row level security;
alter table public.departments enable row level security;
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.management_assignments enable row level security;
alter table public.questions enable row level security;
alter table public.survey_cycles enable row level security;
alter table public.question_sets enable row level security;
alter table public.tasks enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
alter table public.ai_insights enable row level security;
alter table public.biq_class_results enable row level security;
alter table public.pkpd_exam_results enable row level security;
alter table public.pkpd_portfolios enable row level security;
alter table public.pkpd_achievements enable row level security;
alter table public.pkpd_decisions enable row level security;
alter table public.audit_logs enable row level security;

-- Drop existing policies to keep this script idempotent
drop policy if exists orgs_select_member on public.orgs;

drop policy if exists branches_select on public.branches;
drop policy if exists branches_write on public.branches;
drop policy if exists branches_update on public.branches;
drop policy if exists branches_delete on public.branches;

drop policy if exists users_select on public.users;
drop policy if exists users_insert on public.users;
drop policy if exists users_update on public.users;
drop policy if exists users_delete on public.users;

drop policy if exists usernames_select on public.usernames;
drop policy if exists usernames_insert on public.usernames;
drop policy if exists usernames_delete on public.usernames;

drop policy if exists groups_select on public.groups;
drop policy if exists groups_insert on public.groups;
drop policy if exists groups_update on public.groups;
drop policy if exists groups_delete on public.groups;

drop policy if exists subjects_select on public.subjects;
drop policy if exists subjects_insert on public.subjects;
drop policy if exists subjects_update on public.subjects;
drop policy if exists subjects_delete on public.subjects;

drop policy if exists departments_select on public.departments;
drop policy if exists departments_insert on public.departments;
drop policy if exists departments_update on public.departments;
drop policy if exists departments_delete on public.departments;

drop policy if exists teachers_select on public.teachers;
drop policy if exists teachers_insert on public.teachers;
drop policy if exists teachers_update on public.teachers;
drop policy if exists teachers_delete on public.teachers;

drop policy if exists students_select on public.students;
drop policy if exists students_insert on public.students;
drop policy if exists students_update on public.students;
drop policy if exists students_delete on public.students;

drop policy if exists teaching_assignments_select on public.teaching_assignments;
drop policy if exists teaching_assignments_insert on public.teaching_assignments;
drop policy if exists teaching_assignments_update on public.teaching_assignments;
drop policy if exists teaching_assignments_delete on public.teaching_assignments;

drop policy if exists management_assignments_select on public.management_assignments;
drop policy if exists management_assignments_insert on public.management_assignments;
drop policy if exists management_assignments_update on public.management_assignments;
drop policy if exists management_assignments_delete on public.management_assignments;

drop policy if exists questions_select on public.questions;
drop policy if exists questions_insert on public.questions;
drop policy if exists questions_update on public.questions;
drop policy if exists questions_delete on public.questions;
drop policy if exists questions_select_branch on public.questions;

drop policy if exists survey_cycles_select on public.survey_cycles;
drop policy if exists survey_cycles_insert on public.survey_cycles;
drop policy if exists survey_cycles_update on public.survey_cycles;
drop policy if exists survey_cycles_delete on public.survey_cycles;

drop policy if exists question_sets_select on public.question_sets;
drop policy if exists question_sets_insert on public.question_sets;
drop policy if exists question_sets_update on public.question_sets;
drop policy if exists question_sets_delete on public.question_sets;

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_select_branch on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

drop policy if exists submissions_select on public.submissions;
drop policy if exists submissions_select_branch on public.submissions;
drop policy if exists submissions_insert on public.submissions;
drop policy if exists submissions_delete on public.submissions;

drop policy if exists answers_select on public.answers;
drop policy if exists answers_select_branch on public.answers;
drop policy if exists answers_insert on public.answers;
drop policy if exists answers_delete on public.answers;

drop policy if exists ai_insights_select on public.ai_insights;
drop policy if exists ai_insights_insert on public.ai_insights;
drop policy if exists ai_insights_update on public.ai_insights;
drop policy if exists ai_insights_delete on public.ai_insights;

drop policy if exists biq_class_results_select on public.biq_class_results;
drop policy if exists biq_class_results_insert on public.biq_class_results;
drop policy if exists biq_class_results_update on public.biq_class_results;
drop policy if exists biq_class_results_delete on public.biq_class_results;

drop policy if exists pkpd_exam_results_select on public.pkpd_exam_results;
drop policy if exists pkpd_exam_results_insert on public.pkpd_exam_results;
drop policy if exists pkpd_exam_results_update on public.pkpd_exam_results;
drop policy if exists pkpd_exam_results_delete on public.pkpd_exam_results;

drop policy if exists pkpd_portfolios_select on public.pkpd_portfolios;
drop policy if exists pkpd_portfolios_insert on public.pkpd_portfolios;
drop policy if exists pkpd_portfolios_update on public.pkpd_portfolios;
drop policy if exists pkpd_portfolios_delete on public.pkpd_portfolios;

drop policy if exists pkpd_achievements_select on public.pkpd_achievements;
drop policy if exists pkpd_achievements_insert on public.pkpd_achievements;
drop policy if exists pkpd_achievements_update on public.pkpd_achievements;
drop policy if exists pkpd_achievements_delete on public.pkpd_achievements;

drop policy if exists pkpd_decisions_select on public.pkpd_decisions;
drop policy if exists pkpd_decisions_insert on public.pkpd_decisions;
drop policy if exists pkpd_decisions_update on public.pkpd_decisions;
drop policy if exists pkpd_decisions_delete on public.pkpd_decisions;

drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;

create policy orgs_select_member on public.orgs
  for select
  using (
    exists (
      select 1 from public.current_user_profile() cu
      where cu.org_id = orgs.id
    )
  );

create policy branches_select on public.branches
  for select
  using (
    public.is_superadmin()
    or (public.current_org_id() = org_id and public.current_branch_id() = id)
  );

create policy branches_write on public.branches
  for insert with check (public.is_superadmin());
create policy branches_update on public.branches
  for update using (public.is_superadmin()) with check (public.is_superadmin());
create policy branches_delete on public.branches
  for delete using (public.is_superadmin());

create policy users_select on public.users
  for select
  using (
    id = auth.uid()::text
    or public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy users_insert on public.users
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
      and role in ('student', 'teacher', 'manager', 'moderator')
    )
  );

create policy users_update on public.users
  for update
  using (id = auth.uid()::text or public.is_superadmin())
  with check (id = auth.uid()::text or public.is_superadmin());

create policy users_delete on public.users
  for delete
  using (public.is_superadmin());

create policy usernames_select on public.usernames
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
    )
  );

create policy usernames_insert on public.usernames
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy usernames_delete on public.usernames
  for delete
  using (public.is_superadmin());

create policy groups_select on public.groups
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
    or exists (
      select 1 from public.tasks t
      where t.rater_id = auth.uid()::text
        and t.group_id = groups.id
        and t.org_id = groups.org_id
    )
  );

create policy groups_insert on public.groups
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy groups_update on public.groups
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy groups_delete on public.groups
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy subjects_select on public.subjects
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
    )
    or exists (
      select 1 from public.tasks t
      where t.rater_id = auth.uid()::text
        and t.subject_id = subjects.id
        and t.org_id = subjects.org_id
    )
  );

create policy subjects_insert on public.subjects
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
    )
  );

create policy subjects_update on public.subjects
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
    )
  );

create policy subjects_delete on public.subjects
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
    )
  );

create policy departments_select on public.departments
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy departments_insert on public.departments
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy departments_update on public.departments
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy departments_delete on public.departments
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy teachers_select on public.teachers
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        public.current_branch_id() = branch_id
        or public.current_branch_id() = any(branch_ids)
      )
    )
    or exists (
      select 1 from public.tasks t
      where t.rater_id = auth.uid()::text
        and t.target_id = teachers.id
        and t.org_id = teachers.org_id
    )
  );

create policy teachers_insert on public.teachers
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
      and exists (
        select 1
          from public.departments d
         where d.id = department_id
           and d.org_id = org_id
           and d.branch_id = branch_id
      )
    )
  );

create policy teachers_update on public.teachers
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        public.current_branch_id() = branch_id
        or public.current_branch_id() = any(branch_ids)
      )
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        public.current_branch_id() = branch_id
        or public.current_branch_id() = any(branch_ids)
      )
      and (
        department_id is null
        or exists (
          select 1
            from public.departments d
           where d.id = department_id
             and d.org_id = org_id
             and d.branch_id = branch_id
        )
      )
    )
  );

create policy teachers_delete on public.teachers
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        public.current_branch_id() = branch_id
        or public.current_branch_id() = any(branch_ids)
      )
    )
  );

create policy students_select on public.students
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy students_insert on public.students
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy students_update on public.students
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy students_delete on public.students
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy teaching_assignments_select on public.teaching_assignments
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy teaching_assignments_insert on public.teaching_assignments
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy teaching_assignments_update on public.teaching_assignments
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy teaching_assignments_delete on public.teaching_assignments
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy management_assignments_select on public.management_assignments
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy management_assignments_insert on public.management_assignments
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy management_assignments_update on public.management_assignments
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy management_assignments_delete on public.management_assignments
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy questions_select on public.questions
  for select
  using (
    public.is_superadmin()
    or exists (
      select 1
        from public.question_sets qs
        join public.tasks t
          on t.cycle_id = qs.cycle_id
       where t.rater_id = auth.uid()::text
         and t.org_id = qs.org_id
         and questions.org_id = qs.org_id
         and questions.id = any(qs.question_ids)
         and (
          (t.rater_role = 'student' and t.target_type = 'teacher' and qs.target_flow = 'student_teacher')
          or (t.rater_role = 'teacher' and t.target_type = 'manager' and qs.target_flow = 'teacher_management')
          or (t.rater_role = 'teacher' and t.target_type = 'teacher' and qs.target_flow = 'teacher_self')
          or (t.rater_role = 'manager' and t.target_type = 'teacher' and qs.target_flow = 'management_teacher')
         )
    )
  );

create policy questions_insert on public.questions
  for insert
  with check (public.is_superadmin());
create policy questions_update on public.questions
  for update using (public.is_superadmin()) with check (public.is_superadmin());
create policy questions_delete on public.questions
  for delete using (public.is_superadmin());

create policy survey_cycles_select on public.survey_cycles
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and (
        branch_ids is null
        or array_length(branch_ids, 1) is null
        or public.current_branch_id() = any(branch_ids)
      )
    )
    or exists (
      select 1
        from public.tasks t
       where t.rater_id = auth.uid()::text
         and t.cycle_id = survey_cycles.id
         and t.org_id = survey_cycles.org_id
    )
  );

create policy survey_cycles_insert on public.survey_cycles
  for insert
  with check (public.is_superadmin());
create policy survey_cycles_update on public.survey_cycles
  for update using (public.is_superadmin()) with check (public.is_superadmin());
create policy survey_cycles_delete on public.survey_cycles
  for delete using (public.is_superadmin());

create policy question_sets_select on public.question_sets
  for select
  using (
    public.is_superadmin()
    or exists (
      select 1
        from public.tasks t
       where t.rater_id = auth.uid()::text
         and t.cycle_id = question_sets.cycle_id
         and t.org_id = question_sets.org_id
         and (
          (t.rater_role = 'student' and t.target_type = 'teacher' and question_sets.target_flow = 'student_teacher')
          or (t.rater_role = 'teacher' and t.target_type = 'manager' and question_sets.target_flow = 'teacher_management')
          or (t.rater_role = 'teacher' and t.target_type = 'teacher' and question_sets.target_flow = 'teacher_self')
          or (t.rater_role = 'manager' and t.target_type = 'teacher' and question_sets.target_flow = 'management_teacher')
         )
    )
  );

create policy question_sets_insert on public.question_sets
  for insert
  with check (public.is_superadmin());
create policy question_sets_update on public.question_sets
  for update using (public.is_superadmin()) with check (public.is_superadmin());
create policy question_sets_delete on public.question_sets
  for delete using (public.is_superadmin());

create policy tasks_select on public.tasks
  for select
  using (
    public.is_superadmin()
    or rater_id = auth.uid()::text
  );

create policy tasks_select_branch on public.tasks
  for select
  using (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  );

create policy tasks_insert on public.tasks
  for insert
  with check (public.is_superadmin());

create policy tasks_update on public.tasks
  for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy tasks_delete on public.tasks
  for delete
  using (public.is_superadmin());

create policy submissions_select on public.submissions
  for select
  using (public.is_superadmin());

create policy submissions_select_branch on public.submissions
  for select
  using (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  );

create policy submissions_insert on public.submissions
  for insert
  with check (
    rater_id = auth.uid()::text
    and exists (
      select 1 from public.tasks t
      where t.id = submissions.task_id
        and t.rater_id = auth.uid()::text
        and t.org_id = submissions.org_id
    )
  );

create policy submissions_delete on public.submissions
  for delete
  using (public.is_superadmin());

create policy answers_select on public.answers
  for select
  using (public.is_superadmin());

create policy answers_select_branch on public.answers
  for select
  using (
    public.is_branch_staff()
    and public.current_org_id() = answers.org_id
    and exists (
      select 1
        from public.submissions s
       where s.task_id = answers.submission_id
         and s.org_id = answers.org_id
         and s.branch_id = public.current_branch_id()
    )
  );

create policy answers_insert on public.answers
  for insert
  with check (
    exists (
      select 1 from public.submissions s
      where s.task_id = answers.submission_id
        and s.rater_id = auth.uid()::text
        and s.org_id = answers.org_id
    )
  );

create policy answers_delete on public.answers
  for delete
  using (public.is_superadmin());

create policy ai_insights_select on public.ai_insights
  for select
  using (public.is_superadmin());

create policy ai_insights_insert on public.ai_insights
  for insert
  with check (public.is_superadmin());

create policy ai_insights_update on public.ai_insights
  for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy ai_insights_delete on public.ai_insights
  for delete
  using (public.is_superadmin());

create policy biq_class_results_select on public.biq_class_results
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy biq_class_results_insert on public.biq_class_results
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy biq_class_results_update on public.biq_class_results
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy biq_class_results_delete on public.biq_class_results
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_exam_results_select on public.pkpd_exam_results
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_exam_results_insert on public.pkpd_exam_results
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_exam_results_update on public.pkpd_exam_results
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_exam_results_delete on public.pkpd_exam_results
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_portfolios_select on public.pkpd_portfolios
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_portfolios_insert on public.pkpd_portfolios
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_portfolios_update on public.pkpd_portfolios
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_portfolios_delete on public.pkpd_portfolios
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_achievements_select on public.pkpd_achievements
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_achievements_insert on public.pkpd_achievements
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_achievements_update on public.pkpd_achievements
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_achievements_delete on public.pkpd_achievements
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_decisions_select on public.pkpd_decisions
  for select
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_decisions_insert on public.pkpd_decisions
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_decisions_update on public.pkpd_decisions
  for update
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy pkpd_decisions_delete on public.pkpd_decisions
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_branch_staff()
      and public.current_org_id() = org_id
      and public.current_branch_id() = branch_id
    )
  );

create policy questions_select_branch on public.questions
  for select
  using (
    public.is_branch_staff()
    and public.current_org_id() = org_id
  );

create policy audit_logs_select on public.audit_logs
  for select
  using (public.is_superadmin());

create policy audit_logs_insert on public.audit_logs
  for insert
  with check (true);

-- Grants for PostgREST (RLS still applies)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;

commit;
