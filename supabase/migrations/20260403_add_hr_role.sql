begin;

alter type public.user_role add value if not exists 'hr';

commit;

begin;

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
      and role::text in ('branch_admin', 'moderator', 'hr')
  )
$$;

grant execute on function public.is_branch_staff() to authenticated;

commit;
