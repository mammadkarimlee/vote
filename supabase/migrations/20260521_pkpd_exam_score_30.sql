alter table public.pkpd_exam_results
  drop constraint if exists pkpd_exam_results_score_miq_check;

alter table public.pkpd_exam_results
  drop constraint if exists pkpd_exam_results_score_check;

alter table public.pkpd_exam_results
  add constraint pkpd_exam_results_score_check
  check (score >= 0 and score <= 30);
