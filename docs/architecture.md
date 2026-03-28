# Architecture

Crambly is a **demo-oriented monorepo**: a **FastAPI** backend, a **Next.js** desktop web app, optional **Expo** mobile (see root README), and **Supabase** (Postgres + Storage + Realtime).

## Logical view

```mermaid
flowchart LR
  subgraph clients
    Web[Next.js web]
    Mobile[Expo mobile]
  end
  subgraph backend
    API[FastAPI main.py]
    Agents[agents/]
    Tasks[tasks/]
    Sched[scheduler APScheduler]
  end
  subgraph supa[Supabase]
    PG[(PostgreSQL)]
    ST[Storage bucket]
    RT[Realtime]
  end
  subgraph external
    Gemini[Google Gemini]
    EL[ElevenLabs TTS]
    RS[Resend email]
    YT[YouTube Data API]
  end
  Web --> API
  Mobile --> API
  API --> Agents
  API --> Tasks
  Sched --> Agents
  API --> PG
  API --> ST
  Tasks --> PG
  Tasks --> ST
  Web --> RT
  RT --> PG
  Agents --> Gemini
  Tasks --> Gemini
  API --> EL
  API --> RS
  Tasks --> EL
  Tasks --> YT
```

## Responsibilities

| Layer | Role |
|-------|------|
| **Next.js (`web/`)** | Library, study hub, courses, syllabus, transforms (streaming), settings, email-notification prefs. Uses TanStack Query + Supabase JS client (anon key + Realtime). Calls FastAPI via `NEXT_PUBLIC_API_URL`. **Theming**: CSS variables in `web/styles/tokens.css`; optional **light mode** toggles `html.light-mode` (see [frontend-web.md](./frontend-web.md)). |
| **FastAPI (`backend/main.py`)** | HTTP API: upload, syllabus/deadline, transforms, preferences, TTS, meme pipeline, deck kick/delete, pulse, etc. Mounts `api/routes.py` at `/api`. |
| **`backend/api/routes.py`** | Additional REST: courses, deck generate/delete, quiz burst, meme regenerate, notification preferences. |
| **`backend/agents/`** | LLM-heavy workflows: ingestion, transformation, deadline, delivery pulse, digital twin, study DNA, expressive media (meme). |
| **`backend/tasks/`** | **Study deck asset builders** (parallel thread pool): meme, audio, wordle, puzzle, YouTube. Read concepts, call external APIs, patch `study_deck`. |
| **`backend/scheduler.py`** | In-process **APScheduler** jobs: email digests + exam reminders (see [implementation-flows.md](./implementation-flows.md)). |
| **Supabase** | Source of truth for users, uploads, concepts, study deck, courses, assessments, digital twin, notification prefs. **Service role** key on backend bypasses RLS. |

## Auth / identity

- **Production:** Supabase Auth (email/password in `/login`); `public.users.id` matches `auth.users.id` (see migrations `20250333000000_auth_user_sync.sql`, `20250334000000_auth_rls.sql`). The FastAPI backend verifies **JWT** access tokens (`Authorization: Bearer`) using `SUPABASE_JWT_SECRET` unless **`CRAMBLY_AUTH_DISABLED=true`** (demo-style, no Bearer required).
- **Web:** `@supabase/ssr` browser client + middleware; `web/lib/api.ts` attaches the session access token to API calls.

## Configuration

- **Backend**: `backend/config.py` + Pydantic `Settings` reads repo-root `.env` (and `backend/.env` if present). Optional **Imgflip** credentials enable fast classic-meme captions from `expressive_media_agent`; without them, the pipeline falls back to Gemini image or local SVG.
- **Web**: `.env.local` in `web/` for Next.js public env vars (`NEXT_PUBLIC_API_URL`, Supabase anon URL/key, demo user id, etc.).

## Deployment shape (typical)

- FastAPI on a host or container; set **`CORS_ORIGINS`** to your web origin(s) in production (see [deployment-plan.md](./deployment-plan.md)).
- Next.js on Vercel or similar; `NEXT_PUBLIC_API_URL` points at the API.
- Supabase project with migrations applied in order (see [database-and-storage.md](./database-and-storage.md)).
- Multiple API replicas: set **`ENABLE_NOTIFICATION_SCHEDULER=false`** on all but one instance so digest/reminder jobs do not run twice.
