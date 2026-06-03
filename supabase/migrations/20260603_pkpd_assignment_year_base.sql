create or replace function public.pkpd_teaching_assignment_year(p_cycle_year integer)
returns integer
language sql
immutable
as $$
  select case
    when p_cycle_year is null then null
    when length(abs(p_cycle_year)::text) > 4 then left(abs(p_cycle_year)::text, 4)::integer
    else p_cycle_year
  end;
$$;

do $$
declare
  v_function_def text;
  v_updated_def text;
begin
  select pg_get_functiondef('public.refresh_pkpd_teacher_summaries(text,text)'::regprocedure)
    into v_function_def;

  v_updated_def := replace(
    v_function_def,
    'assignment_row.year = cycle_scope.year',
    'assignment_row.year = public.pkpd_teaching_assignment_year(cycle_scope.year)'
  );

  if v_updated_def = v_function_def then
    raise exception 'refresh_pkpd_teacher_summaries assignment year predicate was not found';
  end if;

  execute v_updated_def;
end;
$$;

grant execute on function public.pkpd_teaching_assignment_year(integer) to authenticated;

notify pgrst, 'reload schema';
