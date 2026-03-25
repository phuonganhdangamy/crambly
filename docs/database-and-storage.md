# Database and storage (Supabase)

Apply SQL files under **`supabase/migrations/`** in timestamp order on your Supabase project (SQL Editor or CLI). The root README lists the full sequence.

## Core entities (conceptual)

| Table / area | Purpose |
|--------------|---------|
| **`users`** | App user rows; demo user UUID aligned with env. |
| **`uploads`** | Uploaded file metadata, status, learner prefs, optional **meme_recap**, **course_id**, transform cache columns per migrations. |
| **`concepts`** | Per-upload concepts: title, summary, **exam_importance**, **embedding** (pgvector), **graph_data**, **has_math**, **raw_content** (per migrations). |
| **`study_deck`** | One row per (user, upload): URLs + JSON for meme, audio, word bank, puzzle pairs, YouTube suggestions; **`tasks_status`** jsonb for task state + extras like **`audio_provider`**. **Realtime** enabled for live UI updates. |
| **`courses`** | Course metadata; **uploads.course_id** optional FK. |
| **`assessments`** | Parsed syllabus assessments; optional **course_id**. |
| **`digital_twin`** | Per-user profile: weak topics, **confusion_score** / **confusion_by_course**, study DNA JSON, etc. |
| **`notification_preferences`** | Email, toggles, digest time, timezone, exam reminder window. |
| **`notification_log`** | Sent/failed log for digests and exam reminders. |
| **`audio_clips`** | Optional clip metadata for podcast-style features. |
| **`quiz_results`** | Concept-level quiz outcomes for twin updates. |

## Row Level Security (RLS)

Migrations enable RLS with **permissive demo policies** (e.g. `using (true)`). The **Python backend uses the service role key**, which bypasses RLS for server-side writes. **Tighten policies** before production.

## Storage

- Bucket name from **`SUPABASE_UPLOAD_BUCKET`** (default `uploads`).
- Raw uploads and generated deck assets (e.g. `summary.mp3`, `meme.png`) live under user/upload paths; backend creates **signed URLs** for playback (`tasks/common.storage_signed_url`).

## Realtime

`study_deck` is added to the **`supabase_realtime`** publication so the web app can subscribe to `postgres_changes` filtered by `upload_id`.
