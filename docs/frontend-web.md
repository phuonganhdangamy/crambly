# Frontend web (Next.js)

**App root**: `web/` — App Router under `web/app/`.

## Global shell

- **`app/layout.tsx`**: wraps children with **`SiteChrome`** (sidebar, mobile tab bar). Inline script applies saved **`light-mode`** class from `localStorage` (`crambly_light_mode`) before paint to avoid a dark flash.
- **`ChromeProvider`** (`components/layout/ChromeContext.tsx`): **`lightMode`** / **`setLightMode`**; persists toggle and syncs **`document.documentElement.classList`** (`light-mode`).
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

Meme state is shared (client recap vs pipeline **`MemeCard`**). Regeneration uses the study actions (**Generate Meme Recap**, **New theme** / **Replace with AI meme**), not a separate overlay on the image. **`MemeCard`** (pipeline path) supports **`showHeader={false}`** when embedded under **`StudyUnifiedMemeCard`** so the section title is not duplicated.

## Styling and themes

- **Tokens**: `web/styles/tokens.css` — `:root` defines the default **dark** palette (`--color-bg-*`, `--color-text-*`, accents, shadows). **`html.light-mode`** overrides the same variables for a **bright** UI (`color-scheme: light`).
- **Globals**: `web/app/globals.css` imports tokens, sets `body` background/text from variables, KaTeX color, shimmer utilities.
- **Tailwind**: utility classes often reference **`var(--color-…)`** for surfaces and borders.
- **Light toggle**: sidebar footer (**Light** switch) and Focus reader header (☀/☾) call **`useChrome().setLightMode`**.
- **Games**: `web/components/games/` — Wordle, PuzzleMatch, QuizBurst, YouTube suggestions, etc., use semantic variables so cards stay readable in light mode.
