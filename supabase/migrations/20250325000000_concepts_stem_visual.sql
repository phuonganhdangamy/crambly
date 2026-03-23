-- STEM visual layer: concept relationship graph (same JSON stored on every row for this upload after ingestion).

alter table public.concepts
  add column if not exists graph_data jsonb;

alter table public.concepts
  add column if not exists has_math boolean not null default false;
