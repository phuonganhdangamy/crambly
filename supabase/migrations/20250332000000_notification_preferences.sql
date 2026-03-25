-- Email notification preferences + send log (Resend + scheduled digests / exam nudges).

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  email text not null,
  daily_digest_enabled boolean not null default true,
  daily_digest_time text not null default '08:00',
  exam_reminder_enabled boolean not null default true,
  exam_reminder_days_before integer not null default 3,
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_user_id_idx
  on public.notification_preferences (user_id);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('daily_digest', 'exam_reminder')),
  sent_at timestamptz not null default now(),
  subject text not null default '',
  concept_id uuid references public.concepts (id) on delete set null,
  assessment_id uuid references public.assessments (id) on delete set null,
  status text not null check (status in ('sent', 'failed'))
);

create index if not exists notification_log_user_id_idx on public.notification_log (user_id);
create index if not exists notification_log_sent_at_idx on public.notification_log (sent_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notification_log enable row level security;

create policy "demo all notification_preferences"
  on public.notification_preferences for all using (true) with check (true);

create policy "demo all notification_log"
  on public.notification_log for all using (true) with check (true);
