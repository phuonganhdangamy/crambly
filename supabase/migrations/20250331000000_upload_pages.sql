-- Per-page PNGs for PDF Focus Reading view (signed URLs via API).

create table if not exists public.upload_pages (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads (id) on delete cascade,
  page_number int not null,
  storage_path text not null,
  width int not null,
  height int not null,
  concept_id uuid references public.concepts (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (upload_id, page_number)
);

create index if not exists upload_pages_upload_id_idx on public.upload_pages (upload_id);
create index if not exists upload_pages_concept_id_idx on public.upload_pages (concept_id);

alter table public.upload_pages enable row level security;

create policy "demo all upload_pages"
  on public.upload_pages for all
  using (true) with check (true);
