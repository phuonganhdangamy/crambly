# Crambly 🧠

> Your notes, adapted to your brain.

An AI study companion that ingests academic material on **desktop** (Next.js), transforms it into personalized formats, and supports active review in the browser — with personalization driven by a **Digital Twin**. A **native mobile app** is roadmap-only: the **`mobile/`** Expo project is a scaffold and is **not** feature-complete or part of the tested demo path.

**Technical docs** for contributors: [docs/README.md](docs/README.md) (architecture, API, Supabase, agents, implementation flows, frontend notes).

---

## The Problem

The standard way of studying — reading hundreds of pages, memorizing textbooks — is built for one type of learner. Students with ADHD, dyslexia, or non-English first languages face a system that was never designed for them. The result: cognitive overload, burnout, and disengagement right when it matters most.

---

## The Solution

**Shipped and demo-ready:** the **desktop web** app — library, study hub (TLDR / Grind / Chill), courses, syllabus, Focus mode, transforms, study deck (meme, audio, games, YouTube), email digests and **email me this lesson**, and notification settings.

**Not shipped for this repo:** a production **native mobile** client. The vision is still “ingestion on desktop, nudges and quick review on the phone,” but **everything you can run and test today is in the desktop app** plus the FastAPI backend.

The system learns how you learn over time via a **Digital Twin** — and every output gets sharper the more you use it.

---

## Core Features

### 1. Ingest + Transform (Desktop)

Upload any academic content:
- Lecture PDFs and slides
- Handwritten notes (images)
- Syllabus documents
- Recorded lecture audio

Pick your learner mode:
- **ADHD mode** — short bursts, gamified milestones, no walls of text
- **Visual thinker** — concept maps, diagrams, spatial layouts
- **Global Scholar** — simplified vocabulary, technical keywords preserved, culturally localized analogies (e.g. CN Tower for physics)
- **Audio-first** — everything converted to voice-friendly scripts
- **Exam-cram mode** — urgency-ranked, deadline-aware chunking

Output formats generated:
- Plain-language summaries
- Visual concept maps
- Micro-lessons (5-minute chunks)
- Audio explainers
- Meme / brainrot / song recaps
- Daily study plans
- Approved materials stored in personal library

---

### 2. Active learning (desktop today)

These are implemented and exercised on **desktop** (study page, deck pipeline, email — not a separate mobile app):

- **TLDR** — summaries, sections, concept graph, deck audio (`AudioPlayer`), meme recap, **Email me this lesson**, transforms
- **Grind** — **QuizBurst**, **Wordle**, **PuzzleMatch** (short interactive review in the browser — not push notifications)
- **Chill** — meme + YouTube suggestions; same deck audio story as TLDR
- **Deck audio** — pipeline TTS / transcript; listen in-page (the “commute” story is “play your recap wherever you open the app,” not a native player app)
- **Meme recap** — unified TLDR/Chill card + Imgflip / Gemini pipeline
- **Email** — optional **daily digest** and **exam reminders** (`/settings/notifications`); complements in-app study

**Mobile roadmap (not in this milestone):** native push notifications, Expo app parity, and a **voice tutor** experience packaged for phone — see **`mobile/README.md`**; the folder is a placeholder, not a tested surface.

---

### 3. Digital Twin

The personalization engine that makes Crambly feel like it actually knows you.

What it tracks:
- Reading speed and preferred content chunk size
- Confusion points and re-reading loops
- Whether you learn better from examples, diagrams, or direct definitions
- Which formats lead to better quiz recall
- What time of day you focus best

What it changes:
- Future explanation style and structure
- Study plan pacing and topic prioritization
- Question format in quiz bursts
- Voice emphasis in audio mode
- Content chunk size

**The feedback loop:** quiz results → wrong answers → system reprioritizes that concept in tomorrow's Pulse → Digital Twin updates. Closed loop, self-improving.

---

### 4. Study DNA

The few-shot personalization layer built from your own writing.

How it works:
1. You upload past notes, completed assignments, or flag quiz answers you liked
2. Gemini extracts your personal explanation fingerprint — sentence structure, example-to-theory ratio, vocabulary level, preferred framing patterns
3. That fingerprint is stored in your Digital Twin as a few-shot prompt template
4. Every future generation call injects 2–3 examples of your writing as context before producing new content

Result: Crambly explains new concepts *the way you already think*. Cognitively familiar, faster to absorb.

---

### 5. Expressive AI Formats

Academic content doesn't have to look like academic content.

| Format | What it does |
|---|---|
| Meme recap | Encodes key concepts through humor and visual association |
| Podcast mode | Full audio walkthrough, adaptive pacing, exam term emphasis |
| Song / mnemonic | Rhythm-based recall for dense lists or formulas |
| Brainrot clip | Short-form summary in the cadence of viral content |
| Explain Like Me | Mirrors your own reasoning style using Study DNA |
| Global Scholar mode | Complexity dial from Expert → ELI5, technical terms always preserved |

---

### 6. Attention-Aware Training (Desktop)

An optional, fully on-device focus assistant.

- Detects prolonged dwell time and repeated scroll loops on specific paragraphs
- When cognitive friction is identified, the system offers a simpler explanation, worked example, or alternate format
- **Privacy-first**: no raw camera upload, no server-side processing, all local
- Opt-in only

---

### 7. Desktop Study Hub, Games & Courses

Beyond upload and transform, the **Next.js** desktop app includes a full **per-lecture study** experience and optional **course** organization.

**Library → Study (`/study/[uploadId]`)**  
Open any upload from the library to see a STEM-oriented layout. Learner mode and the complexity dial from local settings apply to transforms on this page.

**Study deck UI — TLDR · Grind · Chill**  
The main study surface is split into three tabs so dense content is grouped by intent:

| Tab | Contents |
|---|---|
| **TLDR** | Plain-language **summary** (math-aware via `MathRichText`), **Generate Audio** for on-demand TTS, **deck audio** from the pipeline (`AudioPlayer` when ready), **concept relationships** (interactive graph `ConceptGraphView` + selected-concept panel), **meme recap** (unified card — see below), **concept map (text)**, **key terms**, and **Sections & practice** (per-section `WorkedExampleCard` + `FormulaAnnotationBlock` where applicable). |
| **Grind** | **Wordle** (lecture word bank), **PuzzleMatch** (concept–definition pairs), **QuizBurst** (MCQ burst). |
| **Chill** | Same **meme recap** as TLDR (always the latest client or pipeline image) plus **YouTube** suggestions — no duplicate audio block here. |

**Meme recap (TLDR + Chill in sync)**  
One shared state drives the meme in both tabs: the UI prefers the newest **client-generated** recap when present, otherwise the **pipeline** meme from `study_deck` (`MemeCard`). Use **Generate Meme Recap**, **New theme**, or **Replace with AI meme** to refresh; there is no second regenerate control on the image itself. Regenerating updates storage and refreshes the deck so TLDR and Chill stay aligned.

**Light mode**  
The sidebar **Light** toggle (and Focus reader ☀/☾) switches the app to a **bright** palette via `html.light-mode` and CSS variables in `web/styles/tokens.css`. Preference is stored as **`crambly_light_mode`** in `localStorage` (with a small inline script in `layout.tsx` to apply it before first paint).

**Sections & practice**  
Section cards can be browsed in **Scroll** (full list) or **Carousel** (prev / next, slide counter, dot jumpers) via an in-page toggle.

**Wordle (Grind)**  
Beyond guessing: **Hint** (concept-style definition + first letter, prefilled when helpful), **Reveal answer** (ends the round and shows the term + explanation), and **Skip to next word** (picks another five-letter term from the bank when more than one exists).

**Study deck (background pipeline)**  
A **study deck** row per upload drives async tasks (meme recap, TTS audio, word bank, puzzles, quiz burst, YouTube ideas). While tasks run, the UI uses **Supabase Realtime** on `study_deck` so new assets can appear without a manual refresh. Users can trigger deck generation, regenerate pieces (e.g. meme), and delete a deck row to clear cached games/media while keeping the underlying upload and concepts.

**Game & media components (`web/components/games/`)**

| Component | Role |
|---|---|
| `MemeCard` | Pipeline meme: image, title, tone, **Copy image URL**; optional **`showHeader={false}`** when wrapped by the unified meme card |
| `AudioPlayer` | Plays the TTS / audio walkthrough clip |
| `YouTubeSuggestions` | Surfaces curated related-video ideas from the deck |
| `Wordle` | Word-bank game: hints, reveal answer, skip to next word |
| `PuzzleMatch` | Match concepts to definitions (pairs puzzle) |
| `QuizBurst` | Short multiple-choice burst for the upload |
| `GameShimmer` | Skeleton / loading state while deck slices are still generating |

**Courses**  
Create courses (name, course code, color), attach uploads, and use the **course hub** (`/courses`, `/courses/[courseId]`) to browse lectures in context. The hub reuses the same study-deck widgets per selected lecture and keeps **Digital Twin** signals (e.g. confusion / weak topics) organized **per course** where the schema supports it.

---

### 8. Email — daily digest & “email me this lesson”

Crambly can reach you by **email** (via **Resend**) when the backend is configured with the right API keys and migrations.

| Feature | What it does |
|---|---|
| **Daily digest** | On a schedule (per your **local time** and **digest time** in settings), the app can send a short study email: a concept biased toward weak topics or random review, with Gemini-written copy. **Exam reminders** can also nudge you about upcoming assessments from your syllabus. Toggle digests/reminders, set timezone, and send a **test digest** from **`/settings/notifications`**. The FastAPI **scheduler** (`APScheduler`) runs these jobs in-process when the API is up. |
| **Email me this lesson** | From the **TLDR** tab on **`/study/[uploadId]`**, use **Email me this lesson** to receive an HTML lesson pack for the current upload: personalized sections from your **study transform cache** (learner mode + complexity dial), plus the **study deck** audio transcript when available, and an **audio attachment** when the deck’s signed audio URL can be fetched. The recipient defaults to the address saved in **notification preferences**, then falls back to a demo email. |

**Setup:** apply the **`notification_preferences`** migration (see Local setup), set **`RESEND_API_KEY`** and related sender/domain vars in `.env` (see `.env.example`), and keep the backend running for scheduled sends.

---

## Complexity Dial

A real-time slider in the UI that adjusts explanation complexity from **Expert** to **ELI5** while keeping all technical keywords highlighted in their original English — so exam accuracy is never sacrificed.

---

## Tech Stack

### Frontend
| Layer | Technology | Why |
|---|---|---|
| Desktop web | Next.js + Tailwind CSS + TypeScript | Library, study hub (STEM graph + `games/` deck widgets), course hub, Focus mode, TanStack Query, Supabase client + Realtime |
| Mobile (scaffold) | React Native + Expo in `mobile/` | **Roadmap only** — not feature-parity with web; optional for contributors |

### Backend
| Layer | Technology | Why |
|---|---|---|
| API | FastAPI | Lightweight, async-friendly |
| Email | Resend | Transactional mail (daily digest, exam reminders, lesson export) |
| Database | Supabase (PostgreSQL) | Auth + DB + file storage in one |
| Caching | Redis | Queue management for agent tasks |
| Vector search | pgvector (via Supabase) | Semantic search over user content |

### AI / ML
| Layer | Technology | Why |
|---|---|---|
| Core LLM | Gemini (via Google ADK) | Multimodal: text + image + audio |
| Agent framework | Google ADK | Native Gemini integration, modular workflow agents |
| Text-to-speech | ElevenLabs | Best-in-class prosody, exam term emphasis via pitch |
| Attention module | WebGazer.js (scroll heuristics fallback) | 100% in-browser, no hardware required |
| Embeddings | Gemini Embeddings | Semantic concept retrieval |

---

## Agent Architecture

| Agent | Responsibility |
|---|---|
| **Ingestion Agent** | Parses PDFs, slides, audio, images — extracts concepts, structure, exam importance |
| **Deadline Agent** | Reads syllabus, computes urgency, generates daily chunk plan |
| **Transformation Agent** | Rewrites content into ADHD / visual / plain-language / audio / meme modes |
| **Study DNA Agent** | Extracts style fingerprint from user writing, builds few-shot template |
| **Digital Twin Agent** | Updates learner profile from quiz results, interaction traces, explicit feedback |
| **Delivery Agent** | Builds pulse-style payloads from twin + deadline data (e.g. for API / future clients — **desktop** consumes study + email flows today) |
| **Voice Tutor Agent** | Explains, quizzes, adapts tone and emphasis in real time |
| **Expressive Media Agent** | Generates meme / song / podcast / brainrot recap formats |

## Deadline Agent — Syllabus Dead-Reckoning

The Deadline Agent does more than track dates. It reads your syllabus the way a
seasoned student would: understanding not just *when* something is due, but *how
much it matters* and *how prepared you currently are*.

### What it extracts from your syllabus

| Field | Example |
|---|---|
| Assessment name | Midterm Exam |
| Due date | March 28, 2026 |
| Grade weight | 40% |
| Topics covered | Chapters 3–6, lecture slides 12–24 |
| Estimated study hours | Calculated from content volume |

### How it prioritizes

The agent computes a **Priority Score** for each assessment:
```
Priority = (Grade Weight × 0.5) + (Urgency × 0.3) + (Confusion Score × 0.2)
```

- **Grade Weight** — a 40% final ranks higher than a 5% quiz, always
- **Urgency** — days remaining, normalized against your total available study time
- **Confusion Score** — pulled live from the Digital Twin (topics you've struggled
  with in past quizzes get a higher score)

This means two assessments due on the same day are *not* treated equally. A 40%
midterm you've been struggling with beats a 10% assignment you've already
reviewed.

### What it tells you

The agent surfaces a plain-language priority card in your daily TLDR Pulse:

> **⚠ Midterm in 4 days — 40% of your grade**
> You've missed 3 torque questions this week. Today's plan focuses on rotational
> dynamics before moving to thermodynamics.

### What it feeds downstream

- **Delivery Agent** — receives today's ranked topic list and time budget
- **Transformation Agent** — told to generate exam-cram formats (not casual summaries)
  for high-priority assessments
- **Digital Twin** — logs whether the student followed the recommended plan,
  adjusting future pacing suggestions accordingly
---

## User Flow
```
Step 1 — Upload on desktop
  └── PDF, slides, handwritten notes, syllabus, lecture audio

Step 2 — AI agents process content
  └── Extract concepts, deadlines, topic hierarchy, exam importance, confusing sections

Step 3 — Student picks mode
  └── ADHD / visual / global scholar / audio-first / exam-cram

Step 4 — Desktop library & study (optional)
  └── Open an upload: concept graph, summaries, study deck (meme, audio, Wordle, puzzle, quiz burst, YouTube ideas)
  └── Organize uploads into courses and review from the course hub
  └── Optional: **Email me this lesson** from TLDR; configure **daily digest** / exam reminders under **Email alerts** (`/settings/notifications`)

Step 5 — Keep reviewing on **desktop**
  └── TLDR / Grind / Chill, deck audio, games, optional **email digest**, **Focus** reading

Step 6 — Digital Twin improves over time
  └── Quiz and study signals → reprioritized topics → Study DNA refines explanations (per-course where supported)

_Future step — Native mobile: push notifications, on-device tutor — not implemented in this repo._
```

---

## Local setup (run the repo)

Commands below use **PowerShell** on **Windows**. Adjust paths if your project lives elsewhere.

### Prerequisites

- **Node.js 18+** and **npm** (for Next.js; **Expo** only if you open the optional `mobile/` scaffold)
- **Python 3.11+** (3.12 is fine)
- A **Supabase** project: run the SQL migrations, create Storage bucket **`uploads`** (see `.env.example`)
- API keys in **`.env`** at the **repo root** (copy from `.env.example`)

### 1. Clone and enter the repo

```powershell
cd c:\Users\phuon\Desktop\crambly
```

If you cloned elsewhere:

```powershell
cd path\to\crambly
```

### 2. Environment variables

```powershell
Copy-Item .env.example .env
# Edit .env: GEMINI_API_KEY, SUPABASE_*, ELEVENLABS_* (if using TTS), RESEND_* (for email digests / lesson export), NEXT_PUBLIC_API_URL, etc.
```

Important for the desktop app:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

For **no Redis** (recommended if you are not running Redis):

```env
REDIS_URL=
```

### 3. Supabase (one-time)

1. In the Supabase **SQL Editor**, run:
   - `supabase/migrations/20250322000000_init.sql`
   - `supabase/migrations/20250323000000_storage_uploads_bucket.sql` (creates the **`uploads`** bucket)
   - `supabase/migrations/20250324000000_concepts_embedding_3072_optional.sql` (only if you use 3072-dim embeddings)
   - `supabase/migrations/20250325000000_concepts_stem_visual.sql` (**`graph_data`**, **`has_math`** on concepts — required for the STEM study graph)
   - `supabase/migrations/20250326000000_uploads_meme_recap.sql` (meme recap storage on uploads)
   - `supabase/migrations/20250327000000_uploads_study_transform_cache.sql` (cached study transform JSON)
   - `supabase/migrations/20250328000000_study_deck.sql` (**`study_deck`** table + Realtime — required for desktop games / deck pipeline)
   - `supabase/migrations/20250329000000_courses.sql` (**`courses`** and upload ↔ course association)
   - `supabase/migrations/20250331000000_upload_pages.sql` (optional page thumbnails / per-page metadata)
   - `supabase/migrations/20250332000000_notification_preferences.sql` (**`notification_preferences`** + **`notification_log`** — email digests / exam reminders)
2. **Storage →** confirm bucket **`uploads`** exists (or match `SUPABASE_UPLOAD_BUCKET` in `.env`).

### 4. Backend (FastAPI)

Use a **virtual environment** so `pip` does not fight other global packages.

```powershell
cd c:\Users\phuon\Desktop\crambly\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If activation is blocked:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Install dependencies and start the API:

```powershell
pip install -r requirements.txt
py -m uvicorn main:app --reload
```

Leave this terminal open. API: **http://127.0.0.1:8000** — interactive docs: **http://127.0.0.1:8000/docs**

> **`uvicorn` not recognized?** Use `py -m uvicorn main:app --reload` (same as above).

Deactivate the venv later:

```powershell
deactivate
```

### 5. Desktop web (Next.js)

New terminal:

```powershell
cd c:\Users\phuon\Desktop\crambly
npm install
npm run dev:web
```

Or from the `web` folder:

```powershell
cd c:\Users\phuon\Desktop\crambly\web
npm install
npm run dev
```

Open **http://localhost:3000**.

### 6. Mobile (Expo) — optional scaffold, not the demo

The **`mobile/`** app is **not** aligned with the desktop feature set and **has not** been used for competition testing. Skip this section unless you are experimenting with React Native.

Expo lives in **`mobile/`** with its **own** `node_modules` (not the root workspace).

```powershell
cd c:\Users\phuon\Desktop\crambly\mobile
npm install
npx expo start
```

From the repo root you can also run:

```powershell
cd c:\Users\phuon\Desktop\crambly
npm run dev:mobile
```

Then press **`w`** for **web**, or scan the QR code with **Expo Go** on your phone.

- **Expo Web on the same PC as the API:** set `EXPO_PUBLIC_API_URL=http://localhost:8000` (or `http://127.0.0.1:8000`) in `.env` / Expo env.
- **Physical iPhone:** PC and phone on the same Wi‑Fi; set `EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:8000` (not `localhost`).

### Optional: Redis (Docker)

Redis is **optional** for this MVP; leave `REDIS_URL=` empty unless you run a queue.

If Docker works on your machine:

```powershell
cd c:\Users\phuon\Desktop\crambly
docker compose up -d
```

Then in `.env`: `REDIS_URL=redis://localhost:6379/0` and restart the backend.

---

Built for the **Google Developer Group UTSC - Build With AI Case Competition 2026**.