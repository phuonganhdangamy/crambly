# Crambly web (Next.js)

App Router desktop client for Crambly. Product overview and judge narrative: [../README.md](../README.md). Technical detail: [../docs/frontend-web.md](../docs/frontend-web.md).

## Scripts

From the **repo root** (npm workspaces):

```bash
npm run dev:web
```

From **`web/`**:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The FastAPI backend should be running separately (see root README); set **`NEXT_PUBLIC_API_URL`** (e.g. `http://127.0.0.1:8000`) in **`web/.env.local`**.

## Layout

- **`app/`** — routes (`/`, `/library`, `/study/[uploadId]`, `/courses`, `/focus`, `/settings/notifications`, …).
- **`components/`** — UI shell (`SiteChrome`, `Sidebar`), games, focus reader, shared widgets.
- **`lib/api.ts`** — typed `fetch` helpers to the Python API.
- **`lib/supabase.ts`** — browser Supabase client + Realtime for **`study_deck`** updates.
- **`styles/tokens.css`** — CSS variables for **dark** (default) and **`html.light-mode`** (bright theme).

## Build

```bash
npm run build
npm run start
```

Lint / typecheck (from `web/`):

```bash
npm run lint
npx tsc --noEmit
```
