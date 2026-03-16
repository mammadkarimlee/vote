begin;

alter table public.question_sets
  add column if not exists is_open boolean;

update public.question_sets
   set is_open = case
     when array_position(question_ids, '__question_set_open__') is not null then true
     when array_position(question_ids, '__question_set_closed__') is not null then false
     else true
   end
 where is_open is null;

update public.question_sets
   set question_ids = array_remove(
     array_remove(question_ids, '__question_set_open__'),
     '__question_set_closed__'
   )
 where array_position(question_ids, '__question_set_open__') is not null
    or array_position(question_ids, '__question_set_closed__') is not null;

alter table public.question_sets
  alter column is_open set default false;

alter table public.question_sets
  alter column is_open set not null;

commit;
