# Crambly 🧠

> Your notes, adapted to your brain.

A cross-platform AI study companion that ingests academic material on desktop, transforms it into personalized learning formats, and delivers adaptive active learning on mobile — based on each student's cognitive patterns.

Built for the **Google Developer Group UTSC AI Case Competition 2026**.

---

## The Problem

The standard way of studying — reading hundreds of pages, memorizing textbooks — is built for one type of learner. Students with ADHD, dyslexia, or non-English first languages face a system that was never designed for them. The result: cognitive overload, burnout, and disengagement right when it matters most.

---

## The Solution

Crambly is an adaptive learning operating system with two halves:

- **Desktop** — the Ingestion Hub. Upload anything, pick your mode, get your material transformed.
- **Mobile** — the Active Learning Hub. Receive daily study pulses, quiz bursts, audio walkthroughs, and meme recaps on the go.

The system learns how you learn over time via a **Digital Twin** — and every output gets sharper the more you use it.

---

## Demo Story

> Amy is a UofT STEM student with ADHD and a 45-minute TTC commute each way. She uploads 120 lecture slides, a syllabus, and some handwritten notes on desktop. Crambly detects she prefers examples over theory and shorter bursts over long reading. It transforms her material into 5-minute mobile challenges, a commute audio recap, and a daily TLDR Pulse based on her exam date. When she gets stuck on torque, the system re-explains it in simpler English with a CN Tower analogy. The next day, it prioritizes torque again because her quiz results showed confusion.

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

### 2. Active Learning Hub (Mobile)

Turns passive notes into active review:
- **TLDR Pulse** — a daily personalized study digest based on syllabus deadlines and remaining time. Prevents burnout by breaking hundreds of pages into manageable daily chunks.
- **Quiz bursts** — 5-minute interactive challenges sent via mobile notification
- **Podcast / commute mode** — adaptive audio walkthroughs with emphasis on high-importance exam terms
- **Meme recap feed** — memory encoding through humor and rhythm (emotional salience = higher recall)
- **Voice tutor** — explains, re-explains, and quizzes in a conversational format

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

## Complexity Dial

A real-time slider in the UI that adjusts explanation complexity from **Expert** to **ELI5** while keeping all technical keywords highlighted in their original English — so exam accuracy is never sacrificed.

---

## Tech Stack

### Frontend
| Layer | Technology | Why |
|---|---|---|
| Desktop web | Next.js + Tailwind CSS + TypeScript | Fast, polished, cross-platform MVP |
| Mobile | React Native with Expo | Efficient reuse of JS logic |

### Backend
| Layer | Technology | Why |
|---|---|---|
| API | FastAPI | Lightweight, async-friendly |
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
| **Delivery Agent** | Decides what to send today on mobile based on twin + deadline data |
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

Step 4 — Mobile delivers adaptive learning
  └── Daily TLDR Pulse, quiz bursts, audio walkthrough, meme recap, voice tutor

Step 5 — Digital Twin improves over time
  └── Notices patterns → adapts tomorrow's plan → Study DNA refines explanations
```

---

## Local setup (run the repo)

Commands below use **PowerShell** on **Windows**. Adjust paths if your project lives elsewhere.

### Prerequisites

- **Node.js 18+** and **npm** (for Next.js and Expo)
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
# Edit .env: GEMINI_API_KEY, SUPABASE_*, ELEVENLABS_* (if using TTS), NEXT_PUBLIC_API_URL, etc.
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

### 6. Mobile (Expo)

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

## MVP Scope (Submission)

**Must-have:**
- Desktop upload (PDF, slides, syllabus)
- Learner mode selection
- Gemini-powered concept extraction and transformation
- TLDR Pulse (daily digest)
- Mobile quiz bursts
- Digital Twin (preference storage + weak topic reprioritization)
- Global Scholar mode (complexity dial)

**Showcase / demo features:**
- Study DNA (few-shot from user notes)
- Explain Like Me
- Meme recap generator
- Podcast / commute mode
- CN Tower localized analogy example

**Stretch (post-competition):**
- Attention-aware training (scroll loop detection)
- Full gaze tracking via WebGazer.js
- Multi-language UI

---

## Target Audience (v1)

STEM students at Canadian universities — especially those with ADHD, non-English first languages, or heavy commutes. Expanding to all disciplines post-MVP.

---

## One-Line Pitches

**Product:** Crambly transforms any academic material into personalized learning experiences across desktop and mobile.

**Vision:** We're building the operating system for personalized learning — one that adapts not just to the content, but to the student's mind.

**Emotional:** Not every student struggles because they work less. Many struggle because the material was never shaped for how they learn.

---

## Submission

**Deadline:** March 25, 2026 — 12:00 PM EST
**Event:** Google Developer Group UTSC — Build With AI
**Winners announced:** March 28, 2026 — Build With AI Closing Ceremony