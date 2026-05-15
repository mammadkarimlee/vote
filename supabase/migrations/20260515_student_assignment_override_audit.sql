alter table public.student_assignment_overrides
  add column if not exists created_by text references public.users (id) on delete set null,
  add column if not exists deleted_by text references public.users (id) on delete set null;

notify pgrst, 'reload schema';
