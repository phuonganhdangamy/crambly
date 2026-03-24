export function GameShimmer({ label }: { label?: string }) {
  return (
    <div
      className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
      aria-busy="true"
      aria-label={label || "Loading"}
    >
      <div className="h-4 w-1/3 rounded bg-slate-700" />
      <div className="mt-4 space-y-2">
        <div className="h-3 rounded bg-slate-800" />
        <div className="h-3 w-5/6 rounded bg-slate-800" />
        <div className="h-3 w-2/3 rounded bg-slate-800" />
      </div>
    </div>
  );
}
  