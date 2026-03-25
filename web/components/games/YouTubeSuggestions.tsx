import type { YouTubeSuggestionGroup } from "@/lib/api";

export function YouTubeSuggestions({ suggestions }: { suggestions: YouTubeSuggestionGroup[] }) {
  const groups = suggestions.slice(0, 3);
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">YouTube picks</h3>
      <div className="mt-4 space-y-6">
        {groups.map((g) => (
          <div key={g.concept}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-purple)]">{g.concept}</p>
            <ul className="mt-2 space-y-3">
              {(g.videos ?? []).slice(0, 2).map((v) => (
                <li key={v.video_url}>
                  <a
                    href={v.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-3 transition hover:border-[var(--color-accent-cyan)]/35"
                  >
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="h-16 w-28 shrink-0 rounded-md bg-[var(--color-bg-elevated)] object-cover"
                      />
                    ) : (
                      <div className="h-16 w-28 shrink-0 rounded-md bg-[var(--color-bg-elevated)]" />
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)]">{v.title}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{v.channel}</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-[var(--color-text-muted)]">Suggestions based on your content · Opens YouTube</p>
    </div>
  );
}
