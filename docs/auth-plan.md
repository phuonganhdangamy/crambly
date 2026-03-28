# Plan: real sign-in and multiple users

This document turns the current **demo identity** (single `CRAMBLY_DEMO_USER_ID`, service-role backend, permissive RLS) into **Supabase Auth–backed multi-tenant** behavior. Implementation can be phased; order matters for security.

## Current state (baseline)

| Layer | Today |
|-------|--------|
| **Web** | `demoUserId()` from `NEXT_PUBLIC_DEMO_USER_ID`; fetches use that id in URLs and Supabase filters. |
| **FastAPI** | Many routes take `{uid}` or derive `user_id` from `settings.crambly_demo_user_id`; `403` if path uid ≠ demo id. |
| **Supabase DB** | `public.users.id` is a plain UUID; RLS policies are **demo-open** (`using (true)` on core tables). See `supabase/migrations/20250322000000_init.sql` and follow-on migrations. |
| **Storage** | Bucket rules are separate from RLS; must be tightened with auth. |

**Goal:** Each signed-in user has `user_id = auth.uid()` (same UUID in `public.users` and all child rows). The **anon** Supabase client only sees that user’s rows via RLS; the **API** trusts the caller only after verifying a JWT.

---

## Phase 1 — Supabase Auth and user rows

1. **Enable Auth providers** in Supabase (Email + password minimum; add Google/OAuth later if desired).
2. **Link identities to `public.users`:**  
   - Preferred: `public.users.id` **equals** `auth.users.id` for every account.  
   - Add a **trigger** on `auth.users` insert (or use Supabase “custom access token hook” / database webhook) to `insert` into `public.users` with `id = new.id`, `email = new.email`.  
   - Optionally backfill the old demo UUID as a one-off migration if you still need that account.
3. **Session on the web app:** use **`@supabase/ssr`** (App Router) or **Supabase Auth Helpers for Next.js** — cookie-based sessions, server and client components.
4. **Replace `demoUserId()` usage** with the authenticated user’s id from `supabase.auth.getUser()` / session (centralize in a small `lib/auth.ts` or React context).

**Exit criteria:** Users can sign up, sign in, sign out; you can read `user.id` in the browser and in Next.js server components/route handlers.

---

## Phase 2 — Row Level Security (RLS) by `auth.uid()`

Replace `demo all …` policies with policies scoped to the current user. Typical pattern:

- `using (user_id = auth.uid())` and `with check (user_id = auth.uid())` on tables that have `user_id`.
- **`concepts` / `upload_pages` / `study_deck`:** join through `uploads` — e.g. allow access where `exists (select 1 from uploads u where u.id = concepts.upload_id and u.user_id = auth.uid())`.

Apply the same idea to: `courses`, `notification_preferences`, `notification_log`, `upload_pages`, `study_deck`, etc. (audit every table in [database-and-storage.md](./database-and-storage.md)).

**Storage (bucket `uploads`):** add policies so objects are readable/writable only for paths tied to that user (e.g. prefix `user_id/...` if you adopt that layout; migration may be required for existing keys).

**Exit criteria:** With the **anon key** and a logged-in user, PostgREST and Realtime only see that user’s data. With no session, reads return empty.

---

## Phase 3 — FastAPI: verify JWT and drop demo-user checks

Today the backend uses the **service role** and manually checks `uid == crambly_demo_user_id`. For production multi-user:

1. **Verify Supabase JWT** on each request (or on a router dependency):  
   - `Authorization: Bearer <access_token>` from the web client.  
   - Validate signature with Supabase **JWT secret** (`SUPABASE_JWT_SECRET` in settings) or fetch JWKS from Supabase.  
   - Read `sub` claim → that is **`user_id`** for all DB operations.
2. **Remove or gate** `if uid != str(settings.crambly_demo_user_id): raise 403` patterns in `main.py` and `api/routes.py`; substitute **“token sub must equal path/body user id”** where the API still takes `uid` in the path, or **drop `uid` from the path** and use only the token’s `sub`.
3. **Supabase client in the backend:**  
   - Either continue with **service role** but **always filter** by `user_id` from JWT (simplest migration).  
   - Or use **user-scoped** client with the user’s JWT (stricter; RLS applies to PostgREST). Mixing patterns is OK if documented.
4. **`ensure_demo_user()`:** remove from startup or restrict to dev-only when `CRAMBLY_ALLOW_DEMO=true`.
5. **CORS:** keep explicit origins; if you use cookies for auth, align `credentials` and cookie settings (usually Supabase SSR uses cookies on the same site).

**Exit criteria:** Two different users hitting the same API routes only see and mutate their own data.

---

## Phase 4 — Wire the web app to send the token to the API

1. **Client-side `fetch` to FastAPI:** attach `Authorization: Bearer <session.access_token>` (get fresh session from Supabase before each call or use a small wrapper).
2. **Next.js Route Handlers** (`app/api/...`) that proxy to FastAPI: forward the same header from the incoming request or read the session server-side and pass the token.
3. **Remove `NEXT_PUBLIC_DEMO_USER_ID`** from production env once unused (or keep only for local dev fallback).

**Exit criteria:** All API calls from the browser carry a valid JWT; backend rejects missing/invalid tokens with `401`.

---

## Phase 5 — Scheduler, email, and background jobs

- **Notification scheduler** (`scheduler.py`) reads `notification_preferences` by user — already user-scoped; ensure jobs only send when `user_id` rows are correct and emails match verified `auth.users` emails.
- **Lesson export / Resend:** ensure “from” and recipient addresses respect user preference and verification.

---

## Phase 6 — Hardening and UX

- **Rate limiting** on auth-sensitive and upload routes (API or edge).
- **Email confirmation** (Supabase setting) before full access if desired.
- **Password reset / magic link** flows via Supabase templates.
- **Audit** for any remaining `service_role` usage in the frontend (must be **never**).

---

## Migration notes

- **Existing demo data** under the old UUID: either migrate to a real test user after signup or leave as a legacy row and stop using the demo id in production.
- **Downtime:** RLS policy swaps should be applied in a migration transaction; test on a Supabase **branch** or staging project first.

---

## Suggested order of work

1. Supabase Auth + trigger → `public.users` rows.  
2. Web: login UI + session + replace `demoUserId()` reads.  
3. RLS + storage policies (staging).  
4. Backend JWT dependency + strip demo checks.  
5. Client: pass Bearer token on all FastAPI calls.  
6. Scheduler/email sanity check + remove demo env from prod.

---

## Implementation status (repo)

| Phase | Status |
|-------|--------|
| 1 — Auth UI + session + `public.users` trigger | **Done:** `/login`, `/auth/callback`, `@supabase/ssr`, sidebar `AuthMenu`. |
| 2 — RLS | **Done:** migration `20250334000000_auth_rls.sql` (apply in Supabase after Phase 1 trigger). |
| 3 — FastAPI JWT | **Done:** `backend/auth.py`, `Depends(get_current_user_id)`; set `CRAMBLY_AUTH_DISABLED=false` + `SUPABASE_JWT_SECRET` for real JWT. |
| 4 — Bearer on API calls | **Done:** `web/lib/api.ts` `apiFetch`. |

**Local dev without logging in:** leave `CRAMBLY_AUTH_DISABLED=true` (default) so the API still accepts requests without a Bearer token (uses demo user id).

## References

- [architecture.md](./architecture.md) — identity and JWT notes.  
- [database-and-storage.md](./database-and-storage.md) — tables and RLS.  
- [Supabase: Row Level Security](https://supabase.com/docs/guides/auth/row-level-security), [Next.js Server-Side Auth](https://supabase.com/docs/guides/auth/server-side/nextjs).
