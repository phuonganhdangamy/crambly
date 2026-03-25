# Backend API (FastAPI)

**Entry**: `backend/main.py` — `app = FastAPI()`, CORS open for dev.

**Mounted router**: `api_router` from `backend/api/routes.py` at prefix **`/api`**.

## Route map (non-exhaustive)

| Area | Examples | Module |
|------|----------|--------|
| Health | `GET /health` | `main.py` |
| Upload | `POST /api/upload` | `main.py` → `run_ingestion` |
| Syllabus | `POST /api/syllabus`, text variants | `main.py` → `deadline_agent` |
| Transform | `POST /api/transform`, streaming NDJSON | `main.py` → `transformation_agent` |
| Preferences / twin | `POST /api/preferences`, quiz result | `main.py` |
| TTS | `POST /api/tts` | `main.py` → `synthesize_study_audio` |
| Meme | `POST /api/meme`, stored GET/PUT | `main.py` |
| Pulse | `GET /api/pulse/{user_id}` | `main.py` → `delivery_agent` |
| Deck | `GET/DELETE /api/deck/{upload_id}`, `POST /api/deck/generate` | `api/routes.py` |
| Courses | `POST /api/courses`, uploads listing, aggregates | `api/routes.py` |
| Quiz burst | `GET /api/quiz-burst/{upload_id}` | `api/routes.py` |
| Meme regen | `POST /api/meme/regenerate` | `api/routes.py` |
| Upload delete | `DELETE /api/upload/{id}` | `api/routes.py` |
| Notifications | `GET/POST /api/notifications/preferences`, `POST .../test-digest` | `api/routes.py` |
| Lesson email | `POST /api/uploads/{upload_id}/email-lesson` | `api/routes.py` → `lesson_export` + Resend |

## Dependencies

- **`get_settings`**: Pydantic `Settings` from `config.py` (env-driven).
- **`supabase_client`**: service-role Supabase client from `db.py`.
- **`ensure_demo_user`**: upserts demo user row for local demos.

## Background execution

- **Upload response** schedules **`run_study_deck_workers`** via FastAPI `BackgroundTasks`.
- **Deck generate** route uses the same pattern after `prepare_study_deck_row`.
- **APScheduler** runs notification jobs in-process (see `scheduler.py`).

## Error handling

Routes generally map failures to **HTTPException** with 4xx/5xx; study deck workers log exceptions and set **`tasks_status.<task> = "error"`** via `patch_study_deck`.
