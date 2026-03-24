import type { YouTubeSuggestionGroup } from "@/lib/api";

export function YouTubeSuggestions({ suggestions }: { suggestions: YouTubeSuggestionGroup[] }) {
  const groups = suggestions.slice(0, 3);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-white">YouTube picks</h3>
      <div className="mt-4 space-y-6">
        {groups.map((g) => (
          <div key={g.concept}>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">{g.concept}</p>
            <ul className="mt-2 space-y-3">
              {(g.videos ?? []).slice(0, 2).map((v) => (
                <li key={v.video_url}>
                  <a
                    href={v.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 transition hover:border-indigo-500/40"
                  >
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="h-16 w-28 shrink-0 rounded-md bg-slate-700 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-28 shrink-0 rounded-md bg-slate-700" />
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-white">{v.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{v.channel}</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500">Suggestions based on your content · Opens YouTube</p>
    </div>
  );
}
