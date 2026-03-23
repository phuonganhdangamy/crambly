-- Crambly MVP schema: auth is bypassed for demo; backend uses service role.
-- Run in Supabase SQL editor or via CLI after enabling pgvector.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- users (application profile; mirror demo user from env)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- uploads
-- ---------------------------------------------------------------------------
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text not null check (file_type in ('pdf', 'image', 'audio', 'text')),
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  learner_mode text,
  complexity_dial double precision,
  created_at timestamptz not null default now()
);

create index if not exists uploads_user_id_idx on public.uploads (user_id);

-- ---------------------------------------------------------------------------
-- concepts (+ pgvector embedding; Gemini embedding-001 dimension = 768)
-- ---------------------------------------------------------------------------
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads (id) on delete cascade,
  title text not null,
  summary text not null,
  exam_importance int not null check (exam_importance between 1 and 5),
  embedding vector(768)
);

create index if not exists concepts_upload_id_idx on public.concepts (upload_id);

-- ---------------------------------------------------------------------------
-- assessments
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  due_date date not null,
  grade_weight double precision not null,
  topics_covered text[] not null default '{}',
  priority_score double precision
);

create index if not exists assessments_user_id_idx on public.assessments (user_id);

-- ---------------------------------------------------------------------------
-- digital_twin
-- ---------------------------------------------------------------------------
create table if not exists public.digital_twin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  preferred_format text,
  weak_topics text[] not null default '{}',
  confusion_score jsonb not null default '{}'::jsonb,
  study_dna jsonb not null default '{}'::jsonb,
  peak_focus_time text,
  complexity_dial double precision default 0.5,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- quiz_results
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  concept_id uuid not null references public.concepts (id) on delete cascade,
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_results_user_id_idx on public.quiz_results (user_id);

-- Optional: audio artifacts for podcast screen (MVP)
create table if not exists public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  concept_id uuid references public.concepts (id) on delete set null,
  title text not null,
  audio_url text,
  transcript text,
  created_at timestamptz not null default now()
);

-- Demo-friendly RLS: tighten before production. Service role bypasses RLS.
alter table public.users enable row level security;
alter table public.uploads enable row level security;
alter table public.concepts enable row level security;
alter table public.assessments enable row level security;
alter table public.digital_twin enable row level security;
alter table public.quiz_results enable row level security;
alter table public.audio_clips enable row level security;

create policy "demo read users" on public.users for select using (true);
create policy "demo write users" on public.users for insert with check (true);
create policy "demo update users" on public.users for update using (true);

create policy "demo all uploads" on public.uploads for all using (true) with check (true);
create policy "demo all concepts" on public.concepts for all using (true) with check (true);
create policy "demo all assessments" on public.assessments for all using (true) with check (true);
create policy "demo all digital_twin" on public.digital_twin for all using (true) with check (true);
create policy "demo all quiz_results" on public.quiz_results for all using (true) with check (true);
create policy "demo all audio_clips" on public.audio_clips for all using (true) with check (true);
