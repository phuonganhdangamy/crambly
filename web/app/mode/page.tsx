"use client";

import type { LearnerMode } from "@crambly/types";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postPreferences, postStudyDna } from "@/lib/api";

const MODES: { id: LearnerMode; label: string; hint: string }[] = [
  { id: "adhd", label: "ADHD", hint: "Short bursts, bold headers, examples first." },
  { id: "visual", label: "Visual Thinker", hint: "Hierarchy, spatial framing, fewer walls of text." },
  { id: "global_scholar", label: "Global Scholar", hint: "Simpler English, bold technical keywords." },
  { id: "audio", label: "Audio-first", hint: "Scripts tuned for listening." },
  { id: "exam_cram", label: "Exam Cram", hint: "High-yield, traps, mnemonics." },
];

export default function ModePage() {
  const [mode, setMode] = useState<LearnerMode>("adhd");
  const [dial, setDial] = useState(40);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dnaNotes, setDnaNotes] = useState("");
  const [dnaBusy, setDnaBusy] = useState(false);

  useEffect(() => {
    const m = localStorage.getItem("crambly_mode") as LearnerMode | null;
    const d = localStorage.getItem("crambly_complexity");
    if (m && MODES.some((x) => x.id === m)) setMode(m);
    if (d) setDial(Number(d));
  }, []);

  async function saveDna() {
    if (!dnaNotes.trim()) return;
    setDnaBusy(true);
    setMsg(null);
    try {
      await postStudyDna(dnaNotes);
      setMsg("Study DNA captured — future transforms will mirror your voice.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Study DNA failed");
    } finally {
      setDnaBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    localStorage.setItem("crambly_mode", mode);
    localStorage.setItem("crambly_complexity", String(dial));
    try {
      await postPreferences(mode, dial / 100);
      setMsg("Saved to Digital Twin (demo user).");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div>
        <p className="text-sm text-[var(--color-accent-cyan)]">Study DNA & pacing</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Learner mode</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          Pick how Crambly rewrites your material. This feeds the transformation agent.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m, i) => (
          <motion.button
            key={m.id}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.22 }}
            onClick={() => setMode(m.id)}
            className={`rounded-[var(--radius-lg)] border px-4 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)] ${
              mode === m.id
                ? "border-[var(--color-accent-cyan)] bg-[var(--color-accent-cyan)]/10 shadow-[var(--shadow-neon-cyan)]"
                : "border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-tertiary)]"
            }`}
          >
            <p className="font-semibold text-[var(--color-text-primary)]">{m.label}</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{m.hint}</p>
          </motion.button>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-[var(--color-text-primary)]">Complexity dial</p>
            <p className="text-sm text-[var(--color-text-secondary)]">Expert ←→ ELI5</p>
          </div>
          <span className="font-mono text-[var(--color-accent-cyan)]">{dial}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={dial}
          onChange={(e) => setDial(Number(e.target.value))}
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-bg-tertiary)] accent-[var(--color-accent-cyan)]"
          style={{ accentColor: "var(--color-accent-cyan)" }}
        />
      </Card>

      <Card>
        <p className="font-semibold text-[var(--color-text-primary)]">Optional: Study DNA samples</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Paste a paragraph of your own notes so the transformation agent can mimic tone (few-shot).
        </p>
        <textarea
          value={dnaNotes}
          onChange={(e) => setDnaNotes(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-cyan)] focus:outline-none focus:shadow-[var(--shadow-neon-cyan)]"
          placeholder="Your voice, your shorthand, your examples…"
        />
        <Button type="button" variant="secondary" className="mt-3" disabled={dnaBusy} loading={dnaBusy} onClick={() => void saveDna()}>
          Update Study DNA
        </Button>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" disabled={saving} loading={saving} onClick={() => void save()}>
          Save selection
        </Button>
        <Link
          href="/library"
          className="inline-flex min-h-[40px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-6 py-3 font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)]"
        >
          Go to library
        </Link>
      </div>
      {msg && <p className="text-sm text-[var(--color-text-secondary)]">{msg}</p>}
    </motion.div>
  );
}
