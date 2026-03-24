"use client";

import { useEffect, useState } from "react";
import { postMemeRegenerate } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Shimmer } from "@/components/ui/Shimmer";

export function MemeCard(props: {
  uploadId: string;
  imageUrl: string;
  title: string;
  tone: string;
  onUpdated?: (url: string) => void;
  /** When true, show skeleton over the image area */
  generating?: boolean;
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
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-card)]">
      <p className="text-xs uppercase tracking-widest text-[var(--color-accent-pink)]">Meme recap</p>
      <div className="relative mt-4 max-w-lg">
        {props.generating && !src ? (
          <Shimmer height={280} width="100%" borderRadius="var(--radius-md)" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={props.title}
              className={`max-h-[480px] w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] object-contain ${busy ? "opacity-40" : ""}`}
            />
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-accent-pink)] border-t-transparent" />
              </div>
            )}
          </>
        )}
        <div className="absolute bottom-3 right-3 flex gap-2">
          <Button variant="ghost" type="button" disabled={busy} onClick={() => void onRegenerate()} className="!bg-[var(--color-bg-elevated)]/90 text-xs backdrop-blur-sm">
            {busy ? "…" : "Regenerate"}
          </Button>
        </div>
      </div>
      <p className="mt-4 text-lg font-bold text-[var(--color-text-primary)]">{props.title}</p>
      <p className="text-xs text-[var(--color-text-muted)]">Tone · {props.tone}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" type="button" onClick={() => void onCopy()} className="text-sm">
          {copyOk ? "Copied" : "Copy image URL"}
        </Button>
      </div>
    </div>
  );
}
