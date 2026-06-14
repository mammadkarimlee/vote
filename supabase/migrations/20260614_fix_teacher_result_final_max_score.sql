-- Keep teacher-facing final score denominators aligned with PKPD components.
-- BIQ teachers with exam are evaluated over 100, not 110.

do $$
declare
  v_sql text;
  v_start_marker text := 'v_final_max_score := case';
  v_end_marker text := 'v_final_percentage := case';
  v_start_pos integer;
  v_end_pos integer;
begin
  select pg_get_functiondef('public.get_my_latest_pkpd_result()'::regprocedure)
    into v_sql;

  v_start_pos := strpos(v_sql, v_start_marker);
  v_end_pos := strpos(v_sql, v_end_marker);

  if v_start_pos = 0 or v_end_pos = 0 or v_end_pos <= v_start_pos then
    raise exception 'Could not patch get_my_latest_pkpd_result final max score block';
  end if;

  v_sql :=
    substr(v_sql, 1, v_start_pos - 1) ||
    'v_final_max_score := case
    when v_is_exam_exempt then 70
    else 100
  end;
  ' ||
    substr(v_sql, v_end_pos);

  execute v_sql;
end;
$$;

notify pgrst, 'reload schema';
