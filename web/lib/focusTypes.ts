export type FocusSection = {
  id: string;
  title: string;
  raw_content: string | null;
  summary: string;
  has_math: boolean;
  has_code: boolean;
  exam_importance: number;
  key_terms: string[];
};
