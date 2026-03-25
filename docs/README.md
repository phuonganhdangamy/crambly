# Crambly documentation

Technical docs for developers working on the repo. Product positioning and judge narrative stay in the root [README.md](../README.md).

| Document | Contents |
|----------|----------|
| [architecture.md](./architecture.md) | System boundaries, major components, how services talk |
| [implementation-flows.md](./implementation-flows.md) | End-to-end flows: upload → concepts → study deck → UI; transforms; email; TTS |
| [database-and-storage.md](./database-and-storage.md) | Supabase tables, RLS notes, Realtime, storage bucket |
| [backend-api.md](./backend-api.md) | FastAPI entrypoint, router layout, notable routes |
| [frontend-web.md](./frontend-web.md) | Next.js app routes, data fetching, study deck UI, **light mode** (theme tokens) |
| [agents-and-tasks.md](./agents-and-tasks.md) | Python agents vs `tasks/` workers, Gemini usage |
