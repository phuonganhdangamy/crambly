# Frontend web (Next.js)

**App root**: `web/` — App Router under `web/app/`.

## Global shell

- **`app/layout.tsx`**: wraps children with **`SiteChrome`** (sidebar, mobile tab bar, light mode toggle).
- **Providers**: `web/app/providers.tsx` — TanStack **QueryClientProvider**.

## Notable routes

| Path | Role |
|------|------|
| `/` | Dashboard |
| `/library` | Upload list; links into study |
| `/study/[uploadId]` | Main study hub: **TLDR / Grind / Chill** tabs, concept graph, deck audio, unified meme, sections (scroll vs carousel), games |
| `/courses`, `/courses/[courseId]` | Course-scoped lecture list + deck widgets |
| `/syllabus` | Syllabus upload / deadline extraction |
| `/upload` | Expressive media flows |
| `/mode` | Study DNA / learner mode UI |
| `/focus`, `/focus/[uploadId]` | Focus / attention-aware reading |
| `/settings/notifications` | Email notification preferences + test send |

## Data access

- **REST**: `web/lib/api.ts` — `fetch` to **`NEXT_PUBLIC_API_URL`** (FastAPI). Typed helpers for deck, transforms, meme, notifications, etc.
- **Supabase**: `web/lib/supabase.ts` — browser client with **anon key** for Realtime subscriptions on **`study_deck`** (and other tables as needed).

## Study deck UI modes

On **`/study/[uploadId]`**:

- **TLDR**: Summary, on-demand TTS, pipeline **AudioPlayer** (shows **`audio_provider`** when present), concept graph, meme card, text map, key terms, sections with **scroll/carousel** toggle.
- **Grind**: Wordle, puzzle match, quiz burst.
- **Chill**: Same meme state as TLDR + YouTube suggestions.

Meme state is shared (client recap vs pipeline **`MemeCard`**); regenerating refreshes deck data.

## Styling

Tailwind + CSS variables for theme tokens (`globals.css`). Game UI under `web/components/games/`.
