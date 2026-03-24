import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxies to FastAPI GET /api/upload/{uploadId}/pages so the browser only talks to Next.js
 * (avoids CORS / wrong NEXT_PUBLIC_API_URL when the backend runs on another host).
 */
export async function GET(
  _req: Request,
  { params }: { params: { uploadId: string } },
) {
  const uploadId = params.uploadId?.trim();
  if (!uploadId) {
    return NextResponse.json({ error: "upload_id required", pages: [] }, { status: 400 });
  }

  const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const url = `${api}/api/upload/${encodeURIComponent(uploadId)}/pages`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: text || res.statusText, pages: [] },
        { status: res.status >= 400 ? res.status : 502 },
      );
    }
    try {
      const data = JSON.parse(text) as { pages?: unknown };
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from backend", pages: [] }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Backend unreachable",
        pages: [],
      },
      { status: 503 },
    );
  }
}
