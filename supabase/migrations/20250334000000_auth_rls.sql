-- Replace demo-open RLS with auth.uid()-scoped policies (anon key + logged-in user).

-- users
drop policy if exists "demo read users" on public.users;
drop policy if exists "demo write users" on public.users;
drop policy if exists "demo update users" on public.users;

create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- uploads
drop policy if exists "demo all uploads" on public.uploads;

create policy "uploads_select_own" on public.uploads for select using (user_id = auth.uid());
create policy "uploads_insert_own" on public.uploads for insert with check (user_id = auth.uid());
create policy "uploads_update_own" on public.uploads for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "uploads_delete_own" on public.uploads for delete using (user_id = auth.uid());

-- concepts (via owning upload)
drop policy if exists "demo all concepts" on public.concepts;

create policy "concepts_select_own" on public.concepts for select using (
  exists (select 1 from public.uploads u where u.id = concepts.upload_id and u.user_id = auth.uid())
);
create policy "concepts_insert_own" on public.concepts for insert with check (
  exists (select 1 from public.uploads u where u.id = concepts.upload_id and u.user_id = auth.uid())
);
create policy "concepts_update_own" on public.concepts for update using (
  exists (select 1 from public.uploads u where u.id = concepts.upload_id and u.user_id = auth.uid())
);
create policy "concepts_delete_own" on public.concepts for delete using (
  exists (select 1 from public.uploads u where u.id = concepts.upload_id and u.user_id = auth.uid())
);

-- assessments
drop policy if exists "demo all assessments" on public.assessments;

create policy "assessments_all_own" on public.assessments for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- digital_twin
drop policy if exists "demo all digital_twin" on public.digital_twin;

create policy "digital_twin_all_own" on public.digital_twin for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- quiz_results
drop policy if exists "demo all quiz_results" on public.quiz_results;

create policy "quiz_results_all_own" on public.quiz_results for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audio_clips
drop policy if exists "demo all audio_clips" on public.audio_clips;

create policy "audio_clips_all_own" on public.audio_clips for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- courses
drop policy if exists "demo all courses" on public.courses;

create policy "courses_all_own" on public.courses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- study_deck
drop policy if exists "demo all study_deck" on public.study_deck;

create policy "study_deck_all_own" on public.study_deck for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- upload_pages
drop policy if exists "demo all upload_pages" on public.upload_pages;

create policy "upload_pages_select_own" on public.upload_pages for select using (
  exists (select 1 from public.uploads u where u.id = upload_pages.upload_id and u.user_id = auth.uid())
);
create policy "upload_pages_insert_own" on public.upload_pages for insert with check (
  exists (select 1 from public.uploads u where u.id = upload_pages.upload_id and u.user_id = auth.uid())
);
create policy "upload_pages_update_own" on public.upload_pages for update using (
  exists (select 1 from public.uploads u where u.id = upload_pages.upload_id and u.user_id = auth.uid())
);
create policy "upload_pages_delete_own" on public.upload_pages for delete using (
  exists (select 1 from public.uploads u where u.id = upload_pages.upload_id and u.user_id = auth.uid())
);

-- notification_preferences
drop policy if exists "demo all notification_preferences" on public.notification_preferences;

create policy "notification_preferences_all_own" on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_log
drop policy if exists "demo all notification_log" on public.notification_log;

create policy "notification_log_all_own" on public.notification_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
