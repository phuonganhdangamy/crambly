import type { LearnerMode, PulsePayload, QuizQuestion } from "@crambly/types";
import { apiBase, demoUserId } from "./user";

const jsonHeaders = { "Content-Type": "application/json" };

export async function uploadFile(file: File, fileType: string, courseId?: string | null) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("file_type", fileType);
  if (courseId) fd.append("course_id", courseId);
  const res = await fetch(`${apiBase()}/api/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ upload_id: string; concepts_count: number }>;
}

export async function fetchUploads() {
  const uid = demoUserId();
  const res = await fetch(`${apiBase()}/api/uploads/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<
    {
      id: string;
      file_name: string;
      status: string;
      learner_mode?: string | null;
      complexity_dial?: number | null;
      concepts_count: number;
      course_id?: string | null;
      course_code?: string | null;
      course_name?: string | null;
    }[]
  >;
}

export async function fetchUploadMeta(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/upload-meta/${uploadId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ learner_mode: LearnerMode | null; complexity_dial: number | null }>;
}

export interface UploadPage {
  page_number: number;
  signed_url: string;
  width: number;
  height: number;
  concept_id: string | null;
}

export async function fetchUploadPages(uploadId: string): Promise<UploadPage[]> {
  // Same-origin Next.js route proxies to FastAPI (see app/api/upload/[uploadId]/pages/route.ts).
  const res = await fetch(`/api/upload/${encodeURIComponent(uploadId)}/pages`, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { pages?: UploadPage[] };
  return data.pages ?? [];
}

export async function fetchTwin() {
  const uid = demoUserId();
  const res = await fetch(`${apiBase()}/api/twin/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ digital_twin: Record<string, unknown> }>;
}

export type ConceptGraphPayload = {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string; relationship: string }[];
};

export type ConceptCatalogItem = {
  id: string;
  title: string;
  summary: string;
  has_math: boolean;
};

export type StudyTransformSection = {
  header: string;
  body: string;
  worked_example: {
    scenario: string;
    steps: string[];
    plain_english: string;
  };
  has_math: boolean;
  formula_annotation: {
    formula: string;
    terms: { symbol: string; meaning: string }[];
  } | null;
  /** Present for DB fallback rows while streaming transform */
  is_fallback?: boolean;
  concept_id?: string;
};

export type StudyTransformPayload = {
  mode?: string;
  summary: string;
  concept_map: string;
  key_terms: string[];
  sections: StudyTransformSection[] | Record<string, unknown>[];
  concept_graph?: ConceptGraphPayload | null;
  concepts_catalog?: ConceptCatalogItem[];
  complexity_dial?: number;
  partial?: boolean;
};

export async function postTransform(uploadId: string, mode: LearnerMode, complexityDial?: number | null) {
  const res = await fetch(`${apiBase()}/api/transform`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      upload_id: uploadId,
      mode,
      complexity_dial: complexityDial ?? null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<StudyTransformPayload>;
}

export async function probeTransformCache(
  uploadId: string,
  mode: LearnerMode,
  complexityDial: number | null | undefined,
  opts?: { signal?: AbortSignal },
): Promise<{ cached: boolean; payload: StudyTransformPayload | null }> {
  const params = new URLSearchParams({ upload_id: uploadId, mode });
  if (complexityDial !== undefined && complexityDial !== null) {
    params.set("complexity_dial", String(complexityDial));
  }
  const res = await fetch(`${apiBase()}/api/transform/cache?${params}`, { signal: opts?.signal });
  if (!res.ok) return { cached: false, payload: null };
  return res.json() as Promise<{ cached: boolean; payload: StudyTransformPayload | null }>;
}

export async function streamTransform(
  uploadId: string,
  mode: LearnerMode,
  complexityDial: number | null | undefined,
  onBatch: (
    sections: Record<string, unknown>[],
    meta: { batchIndex: number; totalBatches: number },
  ) => void,
  onSynthesis: (summary: string, conceptMap: string, keyTerms: string[]) => void,
  onError: (err: Error) => void,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/transform/stream`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        upload_id: uploadId,
        mode,
        complexity_dial: complexityDial ?? null,
      }),
      signal: opts?.signal,
    });
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!res.ok || !res.body) {
    onError(new Error(`Stream failed: ${res.status}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (opts?.signal?.aborted) {
        await reader.cancel();
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as {
            type?: string;
            batch_index?: number;
            total_batches?: number;
            sections?: Record<string, unknown>[];
            summary?: string;
            concept_map?: string;
            key_terms?: string[];
          };
          if (chunk.type === "sections_batch") {
            onBatch(chunk.sections ?? [], {
              batchIndex: chunk.batch_index ?? 0,
              totalBatches: chunk.total_batches ?? 1,
            });
          } else if (chunk.type === "synthesis") {
            onSynthesis(
              String(chunk.summary ?? ""),
              String(chunk.concept_map ?? ""),
              Array.isArray(chunk.key_terms) ? chunk.key_terms.map(String) : [],
            );
          }
        } catch {
          continue;
        }
      }
    }
  } catch (err) {
    if (opts?.signal?.aborted) return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function postPreferences(preferred_format: string, complexity_dial: number) {
  const res = await fetch(`${apiBase()}/api/preferences`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ preferred_format, complexity_dial }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postSyllabus(file: File, courseId?: string | null) {
  const fd = new FormData();
  fd.append("file", file);
  if (courseId) fd.append("course_id", courseId);
  const res = await fetch(`${apiBase()}/api/syllabus`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<
    {
      name: string;
      due_date: string;
      grade_weight: number;
      priority_score: number;
      message: string;
      tier: string;
    }[]
  >;
}

export async function postTts(text: string) {
  const res = await fetch(`${apiBase()}/api/tts`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ audio_base64: string; mime: string; provider?: string }>;
}

export type NotificationPreferences = {
  user_id: string;
  email: string;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  exam_reminder_enabled: boolean;
  exam_reminder_days_before: number;
  timezone: string;
  persisted?: boolean;
};

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch(`${apiBase()}/api/notifications/preferences`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<NotificationPreferences>;
}

export async function saveNotificationPreferences(patch: Partial<NotificationPreferences>) {
  const res = await fetch(`${apiBase()}/api/notifications/preferences`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function postNotificationTestDigest() {
  const res = await fetch(`${apiBase()}/api/notifications/test-digest`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; message?: string }>;
}

export async function postEmailLessonExport(
  uploadId: string,
  body: { email?: string; learner_mode: string; complexity_dial?: number | null },
) {
  const res = await fetch(`${apiBase()}/api/uploads/${encodeURIComponent(uploadId)}/email-lesson`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      learner_mode: body.learner_mode,
      complexity_dial: body.complexity_dial ?? null,
      ...(body.email?.trim() ? { email: body.email.trim() } : {}),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    ok: boolean;
    to: string;
    audio_attached: boolean;
    used_transform_cache: boolean;
  }>;
}

export async function postAudioClipMeta(payload: {
  title: string;
  transcript: string;
  concept_id?: string | null;
}) {
  const res = await fetch(`${apiBase()}/api/audio-clips`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postStudyDna(notes: string) {
  const res = await fetch(`${apiBase()}/api/study-dna`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ study_dna: Record<string, unknown> }>;
}

export type MemeBrief = {
  template: string;
  top_text: string;
  bottom_text: string;
  fallback_prompt: string;
};

export type MemePipelineResponse = {
  brief: MemeBrief;
  source: "imgflip" | "gemini";
  image_url?: string;
  image_base64?: string;
  mime?: string;
};

/** Validate JSON from `uploads.meme_recap` for UI display. */
export function parseStoredMemeRecap(raw: unknown): MemePipelineResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const b = o.brief;
  if (!b || typeof b !== "object") return null;
  const br = b as Record<string, unknown>;
  const brief: MemeBrief = {
    template: String(br.template ?? ""),
    top_text: String(br.top_text ?? ""),
    bottom_text: String(br.bottom_text ?? ""),
    fallback_prompt: String(br.fallback_prompt ?? ""),
  };
  const source = o.source === "imgflip" || o.source === "gemini" ? o.source : null;
  if (!source) return null;
  const image_url = typeof o.image_url === "string" ? o.image_url : undefined;
  const image_base64 = typeof o.image_base64 === "string" ? o.image_base64 : undefined;
  const mime = typeof o.mime === "string" ? o.mime : undefined;
  if (!image_url && !(image_base64 && mime)) return null;
  return { brief, source, image_url, image_base64, mime };
}

export async function fetchMemeRecap(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/meme/stored/${uploadId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ meme_recap: unknown }>;
}

export async function putMemeRecap(uploadId: string, payload: MemePipelineResponse) {
  const res = await fetch(`${apiBase()}/api/meme/stored/${uploadId}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function postMeme(
  concept_title: string,
  summary: string,
  opts?: { reimagine?: boolean; priorBrief?: MemeBrief | null },
) {
  const reimagine = Boolean(opts?.reimagine);
  const res = await fetch(`${apiBase()}/api/meme`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      concept_title,
      summary,
      reimagine,
      brief: reimagine && opts?.priorBrief ? opts.priorBrief : undefined,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<MemePipelineResponse>;
}

export async function fetchPulse(): Promise<PulsePayload> {
  const uid = demoUserId();
  const res = await fetch(`${apiBase()}/api/pulse/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type StudyDeckTasksStatus = Partial<
  Record<"meme" | "audio" | "wordle" | "puzzle" | "youtube", "pending" | "done" | "error">
> & {
  /** Set when deck audio was synthesized (study pipeline). */
  audio_provider?: "elevenlabs" | "gemini";
};

export type StudyDeckRow = {
  id: string;
  upload_id: string;
  user_id: string;
  meme_image_url: string | null;
  audio_url: string | null;
  audio_transcript: string | null;
  word_bank: string[] | null;
  puzzle_pairs: { term: string; definition: string }[] | null;
  youtube_suggestions: YouTubeSuggestionGroup[] | null;
  tasks_status: StudyDeckTasksStatus | null;
  created_at: string;
};

export type YouTubeSuggestionGroup = {
  concept: string;
  videos: {
    title: string;
    channel: string;
    thumbnail_url: string;
    video_url: string;
  }[];
};

export async function fetchStudyDeck(uploadId: string): Promise<StudyDeckRow | null> {
  const res = await fetch(`${apiBase()}/api/deck/${uploadId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<StudyDeckRow>;
}

export async function postDeckGenerate(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/deck/generate`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ upload_id: uploadId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; upload_id: string }>;
}

export async function deleteStudyDeck(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/deck/${uploadId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function deleteCourse(courseId: string) {
  const res = await fetch(`${apiBase()}/api/course/${courseId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function deleteUpload(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/upload/${uploadId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function postMemeRegenerate(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/meme/regenerate`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ upload_id: uploadId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    ok: boolean;
    image_url: string;
    brief: MemeBrief;
    source: string;
  }>;
}

export async function fetchQuizBurstForUpload(uploadId: string): Promise<{ questions: QuizQuestion[] }> {
  const res = await fetch(`${apiBase()}/api/quiz-burst/upload/${uploadId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchConceptsByUpload(uploadId: string) {
  const res = await fetch(`${apiBase()}/api/concepts/by-upload/${uploadId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<
    {
      id: string;
      title: string;
      summary: string;
      exam_importance: number;
      has_math?: boolean;
      graph_data?: ConceptGraphPayload | null;
    }[]
  >;
}

export async function postQuizResult(conceptId: string, correct: boolean) {
  const res = await fetch(`${apiBase()}/api/quiz/result`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ concept_id: conceptId, correct }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type CourseRow = {
  id: string;
  user_id: string;
  name: string;
  code: string;
  color: string;
  created_at: string;
  uploads_count?: number;
  next_assessment_date?: string | null;
};

export type PriorityCard = {
  assessment_id: string;
  name: string;
  due_date: string;
  grade_weight: number;
  priority_score: number;
  message: string;
  tier: string;
};

export async function fetchCourses(): Promise<CourseRow[]> {
  const uid = demoUserId();
  const res = await fetch(`${apiBase()}/api/courses/${uid}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postCourse(payload: { name: string; code: string; color: string }) {
  const res = await fetch(`${apiBase()}/api/courses`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CourseRow>;
}

export async function fetchCourseUploads(courseId: string) {
  const res = await fetch(`${apiBase()}/api/courses/${courseId}/uploads`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<
    {
      id: string;
      file_name: string;
      status: string;
      created_at: string;
      concepts_count: number;
    }[]
  >;
}

export async function fetchCourseAggregate(courseId: string) {
  const res = await fetch(`${apiBase()}/api/courses/${courseId}/aggregate`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    course: CourseRow;
    key_terms: string[];
    assessment_cards: PriorityCard[];
    next_assessment_date: string | null;
    weak_topics: string[];
  }>;
}
