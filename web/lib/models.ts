/** Display / Next routes: backend ingestion uses GEMINI_INGESTION_MODEL from .env (default pro). */
export const MODELS = {
  ingestion: "gemini-3.1-pro-preview",
  transform: "gemini-2.5-flash",
  snippet: "gemini-2.0-flash",
  background: "gemini-3.1-flash-lite",
} as const;
