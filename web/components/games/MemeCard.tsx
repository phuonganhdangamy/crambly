"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Shimmer } from "@/components/ui/Shimmer";

export function MemeCard(props: {
  imageUrl: string;
  title: string;
  tone: string;
  /** When true, show skeleton over the image area */
  generating?: boolean;
  /** Set false when a parent section already shows the "Meme recap" label */
  showHeader?: boolean;
}) {
  const showHeader = props.showHeader !== false;
  const [src, setSrc] = useState(props.imageUrl);
  const [copyOk, setCopyOk] = useState(false);

  useEffect(() => setSrc(props.imageUrl), [props.imageUrl]);

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
      {showHeader ? (
        <p className="text-xs uppercase tracking-widest text-[var(--color-accent-pink)]">Meme recap</p>
      ) : null}
      <div className={`relative max-w-lg ${showHeader ? "mt-4" : ""}`}>
        {props.generating && !src ? (
          <Shimmer height={280} width="100%" borderRadius="var(--radius-md)" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={props.title}
              className="max-h-[480px] w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] object-contain"
            />
          </>
        )}
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
