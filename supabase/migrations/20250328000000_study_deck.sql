-- Study deck: background-generated assets (meme, audio, games data, YouTube).
-- Frontend can subscribe via Supabase Realtime on this table.

create table if not exists public.study_deck (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  meme_image_url text,
  audio_url text,
  audio_transcript text,
  word_bank text[],
  puzzle_pairs jsonb,
  youtube_suggestions jsonb,
  tasks_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (upload_id)
);

create index if not exists study_deck_user_id_idx on public.study_deck (user_id);
create index if not exists study_deck_upload_id_idx on public.study_deck (upload_id);

alter table public.study_deck enable row level security;

create policy "demo all study_deck" on public.study_deck for all using (true) with check (true);

-- Enable Realtime (run in SQL Editor if your project uses a custom publication name).
alter publication supabase_realtime add table public.study_deck;
