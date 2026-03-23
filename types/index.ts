/** Shared contracts for Crambly web, mobile, and backend documentation. */

export type FileType = "pdf" | "image" | "audio" | "text";
export type UploadStatus = "processing" | "ready" | "error";

export type LearnerMode =
  | "adhd"
  | "visual"
  | "global_scholar"
  | "audio"
  | "exam_cram";

export interface UserRow {
  id: string;
  email: string | null;
  created_at: string;
}

export interface UploadRow {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_type: FileType;
  status: UploadStatus;
  created_at: string;
  learner_mode?: string | null;
  complexity_dial?: number | null;
}

export interface ConceptRow {
  id: string;
  upload_id: string;
  title: string;
  summary: string;
  exam_importance: number;
}

export interface AssessmentRow {
  id: string;
  user_id: string;
  name: string;
  due_date: string;
  grade_weight: number;
  topics_covered: string[];
  priority_score: number | null;
}

export interface DigitalTwinRow {
  id: string;
  user_id: string;
  preferred_format: string | null;
  weak_topics: string[];
  confusion_score: Record<string, number>;
  study_dna: Record<string, unknown>;
  peak_focus_time: string | null;
  updated_at: string;
  complexity_dial?: number | null;
}

export interface IngestedConcept {
  title: string;
  summary: string;
  exam_importance: number;
}

export interface TransformSection {
  header: string;
  body: string;
}

export interface TransformResult {
  mode: LearnerMode;
  summary: string;
  concept_map: string;
  key_terms: string[];
  sections?: TransformSection[];
  raw?: unknown;
}

export interface PriorityCard {
  assessment_id: string;
  name: string;
  due_date: string;
  grade_weight: number;
  priority_score: number;
  message: string;
  tier: "high" | "medium" | "low";
}

export interface QuizQuestion {
  id: string;
  concept_id: string | null;
  topic: string;
  question: string;
  choices: string[];
  correct_index: number;
}

export interface PulsePayload {
  date: string;
  top_assessment: {
    name: string;
    due_date: string;
    urgency_message: string;
  } | null;
  concept_chunks: { id: string; title: string; summary: string }[];
  quiz_burst: QuizQuestion[];
}

export interface StudyDnaFingerprint {
  sentence_length_preference?: string;
  example_vs_theory_ratio?: string;
  vocabulary_level_1_to_10?: number;
  structural_preference?: string;
  favorite_analogy_types?: string[];
  few_shot_snippets?: string[];
}
