-- Phase 8: courses layer — optional grouping for uploads + scoped syllabus/assessments.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  code text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

create index if not exists courses_user_id_idx on public.courses (user_id);

alter table public.uploads
  add column if not exists course_id uuid references public.courses (id) on delete set null;

create index if not exists uploads_course_id_idx on public.uploads (course_id);

alter table public.assessments
  add column if not exists course_id uuid references public.courses (id) on delete cascade;

create index if not exists assessments_course_id_idx on public.assessments (course_id);

alter table public.digital_twin
  add column if not exists confusion_by_course jsonb not null default '{}'::jsonb;

alter table public.digital_twin
  add column if not exists weak_topics_by_course jsonb not null default '{}'::jsonb;

alter table public.courses enable row level security;

create policy "demo all courses" on public.courses for all using (true) with check (true);
