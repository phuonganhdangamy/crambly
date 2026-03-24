-- Persist generated study deck transforms so returning to an existing deck/mode
-- does not require re-calling Gemini.

alter table public.uploads
  add column if not exists study_cache jsonb not null default '{}'::jsonb;

comment on column public.uploads.study_cache is
  'Cache of /api/transform payloads keyed by "{mode}|{complexity_dial}".';

