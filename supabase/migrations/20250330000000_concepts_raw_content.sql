-- Focus Mode: verbatim paragraph text per concept + code flag for reader/simplifier

alter table public.concepts
  add column if not exists raw_content text;

alter table public.concepts
  add column if not exists has_code boolean not null default false;
