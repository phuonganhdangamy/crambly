import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-widest text-indigo-300">Ingestion Hub</p>
        <h1 className="text-4xl font-bold text-white sm:text-5xl">Turn your notes into an adaptive course brain.</h1>
        <p className="max-w-2xl text-lg text-slate-300">
          Upload PDFs, images, or audio. Crambly extracts concepts, scores exam importance, and syncs with your Digital
          Twin for mobile study pulses.
        </p>
      </div>
      <Link
        href="/upload"
        className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400"
      >
        Upload your notes
      </Link>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "1. Upload", d: "Drop a lecture PDF or snapshot of handwritten notes." },
          { t: "2. Choose mode", d: "ADHD bursts, Global Scholar clarity, audio scripts, and more." },
          { t: "3. Study anywhere", d: "TLDR Pulse + quizzes sync to the mobile hub." },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-semibold text-white">{x.t}</p>
            <p className="mt-2 text-sm text-slate-400">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
