import type { PulsePayload } from "@crambly/types";

const uid =
  process.env.EXPO_PUBLIC_DEMO_USER_ID || "00000000-0000-0000-0000-000000000001";
const base = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export async function getPulse(): Promise<PulsePayload> {
  const res = await fetch(`${base}/api/pulse/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postQuizResult(conceptId: string, correct: boolean) {
  const res = await fetch(`${base}/api/quiz/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept_id: conceptId, correct }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ digital_twin: Record<string, unknown> }>;
}

export async function getAudioClips() {
  const res = await fetch(`${base}/api/audio-clips/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<
    { id: string; title: string; audio_url: string | null; transcript: string | null }[]
  >;
}

export async function getUploads() {
  const res = await fetch(`${base}/api/uploads/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<
    { id: string; file_name: string; status: string; concepts_count: number }[]
  >;
}

export async function getConcepts(uploadId: string) {
  const res = await fetch(`${base}/api/concepts/by-upload/${uploadId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ id: string; title: string; summary: string }[]>;
}

export function ttsDataUrl(audioBase64: string, mime = "audio/mpeg") {
  return `data:${mime};base64,${audioBase64}`;
}

export async function postTts(text: string) {
  const res = await fetch(`${base}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ audio_base64: string; mime: string }>;
}
