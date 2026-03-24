"use client";

import { useEffect, useState } from "react";

function TextFilePreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) {
          setErr(true);
          setText(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (err) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Could not load text preview. Try opening the file in a new tab.
      </p>
    );
  }
  if (text == null) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading text…</p>;
  }
  return (
    <pre className="max-h-[calc(100vh-120px)] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 font-mono text-xs text-[var(--color-text-primary)] md:text-sm">
      {text}
    </pre>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

export function OriginalFilePane({
  url,
  fileType,
  fileName,
  pdfOpenInNewTabUrl,
}: {
  url: string;
  fileType: string;
  fileName: string;
  /** When set for PDFs, shows a prominent top-right “open externally” control */
  pdfOpenInNewTabUrl?: string;
}) {
  const ft = fileType.toLowerCase();
  const iframeStyle = { height: "calc(100vh - 120px)" } as const;

  if (ft === "pdf") {
    const openHref = pdfOpenInNewTabUrl ?? url;
    return (
      <div className="relative space-y-2">
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]/95 px-2.5 py-1.5 text-[13px] font-medium text-[var(--color-text-primary)] shadow-sm backdrop-blur-sm transition-colors hover:border-[var(--color-accent-cyan)] hover:text-[var(--color-accent-cyan)]"
        >
          <ExternalLinkIcon className="shrink-0 opacity-90" />
          Open PDF
        </a>
        <p className="pr-[140px] text-xs text-[var(--color-text-muted)] md:pr-0">
          Original PDF — same layout as your lecture file. Use the reading view tab for friction tracking and
          simplifications.
        </p>
        <iframe
          title={fileName}
          src={`${url}#toolbar=1`}
          className="w-full rounded-[var(--radius-md)] border-0 bg-[var(--color-bg-secondary)]"
          style={iframeStyle}
        />
      </div>
    );
  }

  if (ft === "image") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)]">Original image upload.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          className="max-h-[calc(100vh-120px)] w-auto max-w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] object-contain"
        />
      </div>
    );
  }

  if (ft === "audio") {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6">
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">{fileName}</p>
        <audio controls className="w-full" src={url}>
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (ft === "text") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)]">Original text file.</p>
        <TextFilePreview url={url} />
      </div>
    );
  }

  return (
    <p className="text-sm text-[var(--color-text-muted)]">
      Preview is not available for this file type ({fileType}).
    </p>
  );
}
