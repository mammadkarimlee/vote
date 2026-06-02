-- Keep BİQ-siz teachers on the official 100-point PKPD scale when they
-- participate in the 30-point attestasiya exam. Their raw component maximum
-- is 130: 20 student + 10 management + 10 self + 60 portfolio + 30 exam.

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
  if new.is_biq_teacher is not false then
    return new;
  end if;

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

  new.base_total_score :=
    case when new.is_complete then new.current_entered_score else null end;
  new.final_score :=
    case when new.is_complete then new.current_entered_score else null end;
  new.final_score_with_extra :=
    case
      when new.is_complete then new.current_entered_score + coalesce(new.bonus_score, 0)
      else null
    end;

  return new;
end;
$$;

drop trigger if exists normalize_pkpd_non_biq_exam_summary_cache
  on public.pkpd_teacher_summaries;

create trigger normalize_pkpd_non_biq_exam_summary_cache
before insert or update on public.pkpd_teacher_summaries
for each row
execute function public.normalize_pkpd_non_biq_exam_summary();
