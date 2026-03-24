import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { FocusUploadRow } from "@/lib/focusUploadApi";

export const runtime = "nodejs";

const DEMO_UID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "00000000-0000-0000-0000-000000000001";

/** When Next.js has no Supabase browser keys, reuse the FastAPI list (backend already talks to Supabase). */
async function fetchUploadsViaBackend(): Promise<FocusUploadRow[] | null> {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${api.replace(/\/$/, "")}/api/uploads/${DEMO_UID}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((u) => ({
      id: String(u.id ?? ""),
      file_name: String(u.file_name ?? ""),
      status: String(u.status ?? ""),
      created_at: String(u.created_at ?? ""),
      course_id: u.course_id != null ? String(u.course_id) : null,
      course_code: u.course_code != null ? String(u.course_code) : null,
      course_name: u.course_name != null ? String(u.course_name) : null,
      course_color: u.course_color != null ? String(u.course_color) : null,
      concepts_count: Number(u.concepts_count ?? 0),
      has_raw_content: Boolean(u.has_raw_content),
    }));
  } catch {
    return null;
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const uid = DEMO_UID;

  if (!url || !key) {
    const fallback = await fetchUploadsViaBackend();
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json(
      {
        error:
          "Supabase env missing for Next.js. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in web/.env.local (or repo .env), or ensure the FastAPI backend is running so this route can fall back to it.",
      },
      { status: 503 },
    );
  }

  const sb = createClient(url, key);

  const { data: ups, error: upErr } = await sb
    .from("uploads")
    .select("id,file_name,status,created_at,course_id")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const rows = ups ?? [];
  if (rows.length === 0) {
    return NextResponse.json([] satisfies FocusUploadRow[]);
  }

  const uploadIds = rows.map((r) => r.id as string);

  const { data: concepts, error: cErr } = await sb
    .from("concepts")
    .select("upload_id,raw_content")
    .in("upload_id", uploadIds);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const byUpload = new Map<string, { total: number; withRaw: number }>();
  for (const id of uploadIds) {
    byUpload.set(id, { total: 0, withRaw: 0 });
  }
  for (const c of concepts ?? []) {
    const uidRow = c.upload_id as string;
    const cur = byUpload.get(uidRow);
    if (!cur) continue;
    cur.total += 1;
    const raw = c.raw_content;
    if (typeof raw === "string" && raw.trim().length > 0) {
      cur.withRaw += 1;
    }
  }

  const courseIds = Array.from(
    new Set(rows.map((r) => r.course_id).filter((x): x is string => Boolean(x))),
  );
  const courseMap = new Map<string, { code: string; name: string; color: string }>();
  if (courseIds.length > 0) {
    const { data: courses } = await sb.from("courses").select("id,code,name,color").in("id", courseIds);
    for (const co of courses ?? []) {
      courseMap.set(co.id as string, {
        code: String(co.code ?? ""),
        name: String(co.name ?? ""),
        color: String(co.color ?? ""),
      });
    }
  }

  const out: FocusUploadRow[] = rows.map((u) => {
    const id = u.id as string;
    const agg = byUpload.get(id) ?? { total: 0, withRaw: 0 };
    const concepts_count = agg.total;
    const has_raw_content = concepts_count > 0 && agg.withRaw === concepts_count;
    const cid = u.course_id as string | null;
    const cmeta = cid ? courseMap.get(cid) : undefined;
    return {
      id,
      file_name: String(u.file_name ?? ""),
      status: String(u.status ?? ""),
      created_at: String(u.created_at ?? ""),
      course_id: cid,
      course_code: cmeta?.code ?? null,
      course_name: cmeta?.name ?? null,
      course_color: cmeta?.color ?? null,
      concepts_count,
      has_raw_content,
    };
  });

  return NextResponse.json(out);
}
