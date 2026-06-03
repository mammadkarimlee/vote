do $$
declare
  v_function_def text;
  v_updated_def text;
begin
  select pg_get_functiondef('public.refresh_pkpd_teacher_summaries(text,text)'::regprocedure)
    into v_function_def;

  v_updated_def := replace(
    v_function_def,
    'assignment_row.year = public.pkpd_teaching_assignment_year(cycle_scope.year)',
    'assignment_row.year = cycle_scope.year'
  );

  if v_updated_def <> v_function_def then
    execute v_updated_def;
  end if;
end;
$$;

drop function if exists public.pkpd_teaching_assignment_year(integer);

notify pgrst, 'reload schema';
