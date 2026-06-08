-- Keep PKPD score fields populated even when required source components are missing.
-- The row can still be marked incomplete, but score-based decisions/reviews should not be blocked.

create or replace function public.normalize_pkpd_non_biq_exam_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_score numeric;
  v_raw_score numeric;
begin
  if new.is_biq_teacher is false then
    select least(greatest(exam_result.score, 0), 30)
      into v_exam_score
      from public.pkpd_exam_results exam_result
     where exam_result.org_id = new.org_id
       and exam_result.cycle_id = new.cycle_id
       and exam_result.teacher_id = new.teacher_id;

    new.exam_score := v_exam_score;
    v_raw_score :=
      coalesce(new.student_weighted_score, 0)
      + coalesce(new.management_weighted_score, 0)
      + coalesce(new.self_weighted_score, 0)
      + coalesce(new.portfolio_score, 0)
      + coalesce(v_exam_score, 0);

    new.current_entered_score :=
      case
        when v_exam_score is not null then v_raw_score * 100 / 130
        else v_raw_score
      end;

    new.is_complete :=
      new.student_weighted_score is not null
      and new.management_weighted_score is not null
      and new.self_weighted_score is not null
      and new.portfolio_score is not null
      and new.leadership_complete;
  end if;

  new.base_total_score := coalesce(new.current_entered_score, 0);
  new.final_score := new.base_total_score;
  new.final_score_with_extra := new.base_total_score + coalesce(new.bonus_score, 0);

  return new;
end;
$$;

update public.pkpd_teacher_summaries
   set current_entered_score = current_entered_score
 where base_total_score is distinct from current_entered_score
    or final_score is distinct from current_entered_score
    or final_score_with_extra is distinct from current_entered_score + coalesce(bonus_score, 0);

notify pgrst, 'reload schema';
