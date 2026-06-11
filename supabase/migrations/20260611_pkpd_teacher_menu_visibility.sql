-- Lightweight teacher menu gate. The sidebar should not depend on the heavier
-- result payload RPC, because partial or uncached evaluations must still be
-- reachable when visibility is enabled.

create or replace function public.can_view_my_pkpd_results()
returns table (
  visibility_enabled boolean,
  disabled_reason text
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_user public.users%rowtype;
  v_teacher public.teachers%rowtype;
  v_visible boolean := false;
begin
  select user_row.*
    into v_user
    from public.users user_row
   where user_row.id = auth.uid()::text
     and user_row.org_id = public.current_org_id()
   limit 1;

  select teacher_row.*
    into v_teacher
    from public.teachers teacher_row
   where teacher_row.org_id = public.current_org_id()
     and teacher_row.deleted_at is null
     and (
       teacher_row.user_id = auth.uid()::text
       or (
         v_user.login is not null
         and teacher_row.login = v_user.login
       )
     )
   order by
     case when teacher_row.user_id = auth.uid()::text then 0 else 1 end,
     teacher_row.created_at desc
   limit 1;

  if not found then
    return query select
      false,
      'Sizin üçün PKPD nəticəsi tapılmadı'::text;
    return;
  end if;

  select exists (
    select 1
      from public.survey_cycles cycle_row
      join public.pkpd_result_visibility_settings setting_row
        on setting_row.org_id = cycle_row.org_id
       and setting_row.cycle_id = cycle_row.id
       and setting_row.is_visible_to_teachers = true
     where cycle_row.org_id = v_teacher.org_id
       and (
         cycle_row.branch_ids is null
         or cardinality(cycle_row.branch_ids) = 0
         or v_teacher.branch_id = any(cycle_row.branch_ids)
       )
  )
    into v_visible;

  return query select
    v_visible,
    case
      when v_visible then null::text
      else 'PKPD nəticələrinin müəllimlər üçün görünməsi hazırda bağlıdır.'::text
    end;
end;
$$;

grant execute on function public.can_view_my_pkpd_results() to authenticated;

notify pgrst, 'reload schema';
