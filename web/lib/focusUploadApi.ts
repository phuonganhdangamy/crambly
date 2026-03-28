export type FocusUploadRow = {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  course_color: string | null;
  concepts_count: number;
  has_raw_content: boolean;
};
