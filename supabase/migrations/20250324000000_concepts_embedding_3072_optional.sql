-- OPTIONAL: use full gemini-embedding-001 / gemini-embedding-2-preview vectors (3072 dims).
-- Default Crambly schema uses vector(768) with API output_dimensionality=768 (no migration needed).
--
-- If you set GEMINI_EMBEDDING_OUTPUT_DIMENSIONALITY=3072 in .env, run this first, then re-ingest
-- (existing rows lose vectors below — adjust if you need to preserve data).

alter table public.concepts drop column if exists embedding;
alter table public.concepts add column embedding vector(3072);
