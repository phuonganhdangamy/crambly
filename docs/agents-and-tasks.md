# Agents vs tasks (Python)

## Agents (`backend/agents/`)

LLM-centric orchestration used from **HTTP routes** or other agents. Examples:

| Module | Role |
|--------|------|
| `ingestion_agent` | Multimodal ingest → structured concepts + upload row |
| `transformation_agent` | Learner-mode rewrites; study cache keys |
| `deadline_agent` | Syllabus → assessments + priority logic |
| `delivery_agent` | Pulse payload, quiz burst assembly |
| `digital_twin_agent` | Profile updates from quiz/interactions |
| `study_dna_agent` | Style fingerprint from user writing |
| `expressive_media_agent` | Meme pipeline: Gemini JSON **brief** (template + top/bottom text + image fallback prompt) → **Imgflip** `caption_image` for classic **two-text** templates only, or **Gemini image** for `custom` / when Imgflip is skipped or fails. Templates include e.g. drake, distracted boyfriend, this is fine, change my mind, is this a pigeon (multi-panel Imgflip memes are avoided so captions are not left blank). |
| `notification_agent` | Email copy + Resend send (not an “agent” in ADK sense, but colocated) |

Shared utilities: **`gemini_client.py`** (text, JSON, embeddings, image REST), **`config.py`**, **`db.py`**.

## Tasks (`backend/tasks/`)

**Side-effect workers** for the **study deck** row. They are **not** invoked as HTTP handlers directly; the orchestrator runs them in a **thread pool** after `prepare_study_deck_row`.

| Task | Output (typical) |
|------|------------------|
| `meme_task` | Meme image URL + `tasks_status.meme` |
| `audio_task` | Signed audio URL, transcript, `audio_provider` |
| `wordle_task` | `word_bank` JSON |
| `puzzle_task` | `puzzle_pairs` JSON |
| `youtube_task` | `youtube_suggestions` JSON |

**`tasks/common.py`**: `fetch_concepts_for_upload`, `patch_study_deck`, `merge_tasks_status`, `upload_bytes_to_storage`, **`audio_summary_script`** (deduplicated script for TTS).

## Gemini usage patterns

- **Legacy SDK**: `google.generativeai` in `gemini_client.py` for many text/multimodal flows.
- **Newer SDK**: `google.genai` in **`gemini_tts.py`** for native TTS fallback.
- **Images**: `generate_image_bytes_rest` for meme / reimagine flows.

## Testing / extension

- To add a new deck slice: extend **`TASK_KEYS`** + `default_tasks_status`, add `run_*_task`, register in **`orchestrator.run_study_deck_workers`**, migrate DB if new columns needed, extend **`StudyDeckRow`** TypeScript type and UI.
