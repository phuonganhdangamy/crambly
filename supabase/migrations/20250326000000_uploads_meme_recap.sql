-- Persist last generated meme per upload (study deck revisit).

alter table public.uploads
  add column if not exists meme_recap jsonb;

comment on column public.uploads.meme_recap is
  'Last meme pipeline payload: brief, source, image_url or image_base64+mime';
