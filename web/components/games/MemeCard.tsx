"use client";

import { useEffect, useState } from "react";
import { postMemeRegenerate } from "@/lib/api";

export function MemeCard(props: {
  uploadId: string;
  imageUrl: string;
  title: string;
  tone: string;
  onUpdated?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState(props.imageUrl);
  const [copyOk, setCopyOk] = useState(false);

  useEffect(() => setSrc(props.imageUrl), [props.imageUrl]);

  async function onRegenerate() {
    setBusy(true);
    try {
      const res = await postMemeRegenerate(props.uploadId);
      setSrc(res.image_url);
      props.onUpdated?.(res.image_url);
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(src);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      setCopyOk(false);
    }
  }

  return (
    <div className="rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-6">
      <p className="text-xs uppercase tracking-widest text-fuchsia-200">Meme recap</p>
      <div className="relative mt-4 inline-block max-w-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={props.title}
          className={`max-h-[480px] w-full rounded-lg border border-slate-700 object-contain ${busy ? "opacity-40" : ""}`}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-fuchsia-300 border-t-transparent" />
          </div>
        )}
      </div>
      <p className="mt-4 text-lg font-bold text-white">{props.title}</p>
      <p className="text-xs text-slate-500">Tone · {props.tone}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRegenerate()}
          className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-50"
        >
          {busy ? "Regenerating…" : "Regenerate"}
        </button>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          {copyOk ? "Copied" : "Copy image URL"}
        </button>
      </div>
    </div>
  );
}
