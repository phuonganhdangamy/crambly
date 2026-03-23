-- Bucket for raw uploads (name must match SUPABASE_UPLOAD_BUCKET in .env, default: uploads).
-- Without this row, POST /api/upload returns Storage 404 "Bucket not found".

insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 52428800)
on conflict (id) do nothing;
