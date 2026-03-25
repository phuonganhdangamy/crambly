# Implementation flows

## 1. File upload → ingestion → concepts

1. Client **POST `/api/upload`** (`main.py`) with multipart file + `file_type` (+ optional `course_id`).
2. **`run_ingestion`** (`agents/ingestion_agent.py`) parses content (PDF/images/audio/text per type), calls Gemini where needed, writes **`uploads`** row and **`concepts`** rows (title, summary, exam importance, optional embedding, graph/math flags per migrations).
3. On success, upload **`status`** becomes `ready`.
4. **Study deck kickoff** (same request): `prepare_study_deck_row` + **background task** `run_study_deck_workers` so deck assets generate without blocking the HTTP response.

## 2. Study deck pipeline (parallel workers)

Orchestration: `tasks/orchestrator.py`.

1. **`prepare_study_deck_row`**: Ensures upload is `ready`; inserts or resets **`study_deck`** with `tasks_status` keys `meme`, `audio`, `wordle`, `puzzle`, `youtube` → `pending`, clears URLs/JSON fields.
2. **`run_study_deck_workers`**: `ThreadPoolExecutor(max_workers=5)` runs:
   - `run_meme_task`
   - `run_audio_task`
   - `run_wordle_task`
   - `run_puzzle_task`
   - `run_youtube_task`
3. Each worker **`patch_study_deck`** (`tasks/common.py`): merges `tasks_status` and sets fields (e.g. `audio_url`, `meme_image_url`). Extra string keys (e.g. `audio_provider`) are preserved when merging.
4. **Frontend**: study/course pages subscribe to **Supabase Realtime** on `study_deck` for that `upload_id` to refresh when tasks complete.

**Re-run**: API routes under `/api/deck/` can regenerate or delete the row; **`POST /api/meme/regenerate`** and client **`POST /api/meme`** can call `run_meme_pipeline` and upload to storage. Study UI prefers **unified meme** actions (standard vs **reimagine**) over duplicating controls on **`MemeCard`**.

**Meme templates**: Brief selects an allowed template key; Imgflip path requires credentials (`IMGFLIP_USERNAME` / `IMGFLIP_PASSWORD` in env). Only templates with two caption fields are used for Imgflip so rendered images are complete.

## 3. Deck audio script (deduplicated TOC)

`audio_summary_script` (`tasks/common.py`) builds TTS text from concepts sorted by **`exam_importance`**. It **deduplicates** near-identical summaries (repeated outline/TOC slides) via fingerprints, similarity, and subset checks before capping length. **TTS input** is further capped (~4800 chars) in `run_audio_task` via `synthesize_study_audio`.

## 4. TTS (ElevenLabs + Gemini fallback)

`tts_synthesis.py`: try **`elevenlabs_client.synthesize_speech`**; on failure, **`gemini_tts.synthesize_speech_gemini`** (WAV). **`POST /api/tts`** uses the same stack and returns `mime` + `provider`.

## 5. Study transform (personalized sections)

Client calls transform endpoints with `upload_id`, **learner mode**, optional **complexity dial**. Backend **`transformation_agent`** produces mode-specific sections; results can be cached in **`uploads`** transform cache (migration-dependent). Study page may stream NDJSON for progressive UI updates (see `main.py` + `transformation_agent.iter_transform_ndjson`).

## 6. Syllabus → assessments → deadline priorities

**POST `/api/syllabus`** (file or text variants) runs **`deadline_agent`**: extracts assessments, persists **`assessments`**, may attach **`course_id`**, updates priority scores using digital twin signals where implemented.

## 7. Email notifications (Resend)

1. Tables **`notification_preferences`** and **`notification_log`** (migration `20250332000000_notification_preferences.sql`).
2. **`agents/notification_agent.py`**: builds **daily digest** (random/weak-topic-biased concept + Gemini copy) and **exam reminders** (upcoming assessments + weak concepts); sends via **Resend**; logs outcomes.
3. **`scheduler.py`**: **BackgroundScheduler** — frequent tick for per-user local digest time; periodic exam reminder pass. Started from FastAPI **startup** in `main.py` (best-effort if tables/deps missing).
4. **API**: `GET/POST /api/notifications/preferences`, `POST /api/notifications/test-digest` (`api/routes.py`).
5. **Web**: `web/app/settings/notifications/page.tsx`.

## 8. Lesson email export

**POST `/api/uploads/{upload_id}/email-lesson`** (`api/routes.py`) builds an HTML lesson pack from **`uploads.study_cache`** for the request’s `learner_mode` + `complexity_dial`, plus **`study_deck`** transcript and (when possible) an **audio attachment** downloaded from the deck’s signed `audio_url` (`lesson_export.py`, Resend). Recipient defaults to **`notification_preferences.email`**, then demo email. Study page TLDR: **Email me this lesson**.

## 9. Pulse / quiz / digital twin (sketch)

- **Pulse**: `delivery_agent.build_pulse` aggregated for mobile-style digest.
- **Quiz**: quiz results POST updates **`digital_twin`** / related tables via `digital_twin_agent.apply_quiz_result`.
- Exact field shapes evolve with migrations; see `supabase/migrations/` and agent modules.

## 10. Light mode (web only)

1. User toggles **Light** in the sidebar (or ☀/☾ in Focus reader); state lives in **`ChromeContext`** and **`localStorage`** key **`crambly_light_mode`** (`1` = on).
2. **`document.documentElement`** gets class **`light-mode`**; **`web/styles/tokens.css`** redefines `--color-bg-*`, `--color-text-*`, accents, and shadows for a bright theme.
3. Root **`layout.tsx`** runs a small inline script before React hydrates so the correct class is applied on first paint (avoids flashing dark then light).
