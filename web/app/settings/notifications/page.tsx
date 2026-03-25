"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  fetchNotificationPreferences,
  postNotificationTestDigest,
  saveNotificationPreferences,
} from "@/lib/api";

const DIGEST_TIMES = [
  { value: "07:00", label: "7:00 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "12:00", label: "Noon" },
] as const;

const REMINDER_DAYS = [1, 2, 3, 5, 7] as const;

export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const prefsQ = useQuery({ queryKey: ["notification-preferences"], queryFn: fetchNotificationPreferences });
  const [email, setEmail] = useState("");
  const [dailyOn, setDailyOn] = useState(true);
  const [digestTime, setDigestTime] = useState("08:00");
  const [examOn, setExamOn] = useState(true);
  const [examDays, setExamDays] = useState(3);
  const [tz, setTz] = useState("America/Toronto");
  const [savedFlash, setSavedFlash] = useState(false);
  const [testFlash, setTestFlash] = useState(false);

  useEffect(() => {
    const p = prefsQ.data;
    if (!p) return;
    setEmail(p.email || "");
    setDailyOn(p.daily_digest_enabled);
    setDigestTime(p.daily_digest_time || "08:00");
    setExamOn(p.exam_reminder_enabled);
    setExamDays(p.exam_reminder_days_before ?? 3);
    setTz(p.timezone || "America/Toronto");
  }, [prefsQ.data]);

  const saveM = useMutation({
    mutationFn: () =>
      saveNotificationPreferences({
        email: email.trim() || undefined,
        daily_digest_enabled: dailyOn,
        daily_digest_time: digestTime,
        exam_reminder_enabled: examOn,
        exam_reminder_days_before: examDays,
        timezone: tz.trim() || "America/Toronto",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notification-preferences"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 3000);
    },
  });

  const testM = useMutation({
    mutationFn: postNotificationTestDigest,
    onSuccess: () => {
      setTestFlash(true);
      window.setTimeout(() => setTestFlash(false), 3000);
    },
  });

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Email notifications</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Daily concept digest and pre-exam reminders via Resend. Requires <code className="text-xs">RESEND_API_KEY</code>{" "}
          on the API and the latest Supabase migration for notification tables.
        </p>
      </div>

      {prefsQ.isError && (
        <p className="text-sm text-[var(--color-warning)]">
          Could not load preferences — run <code className="text-xs">notification_preferences</code> migration and restart
          the API.
        </p>
      )}

      <Card className="space-y-6 p-6">
        <div>
          <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="notif-email">
            Email
          </label>
          <input
            id="notif-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            placeholder="you@university.edu"
            autoComplete="email"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-[var(--color-text-primary)]">Daily digest</span>
          <button
            type="button"
            role="switch"
            aria-checked={dailyOn}
            onClick={() => setDailyOn(!dailyOn)}
            className={`relative h-7 w-12 shrink-0 rounded-full border border-[var(--color-border-default)] ${dailyOn ? "border-[var(--color-accent-cyan)]/45" : ""}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-[var(--color-accent-cyan)] transition-all ${dailyOn ? "left-6" : "left-1"}`}
            />
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Digest time (local)</label>
          <select
            value={digestTime}
            onChange={(e) => setDigestTime(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            {DIGEST_TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="notif-tz">
            Timezone (IANA)
          </label>
          <input
            id="notif-tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-[var(--color-text-primary)]">Exam reminders</span>
          <button
            type="button"
            role="switch"
            aria-checked={examOn}
            onClick={() => setExamOn(!examOn)}
            className={`relative h-7 w-12 shrink-0 rounded-full border border-[var(--color-border-default)] ${examOn ? "border-[var(--color-accent-cyan)]/45" : ""}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-[var(--color-accent-cyan)] transition-all ${examOn ? "left-6" : "left-1"}`}
            />
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Remind when exam is within</label>
          <select
            value={examDays}
            onChange={(e) => setExamDays(Number(e.target.value))}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            {REMINDER_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="primary" loading={saveM.isPending} onClick={() => saveM.mutate()}>
            Save preferences
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={testM.isPending}
            disabled={testM.isPending}
            onClick={() => testM.mutate()}
          >
            Send test email
          </Button>
        </div>

        {saveM.isError && (
          <p className="text-sm text-[var(--color-danger)]">{String((saveM.error as Error)?.message ?? saveM.error)}</p>
        )}
        {testM.isError && (
          <p className="text-sm text-[var(--color-danger)]">{String((testM.error as Error)?.message ?? testM.error)}</p>
        )}
        {savedFlash && <p className="text-sm text-[var(--color-success)]">Saved.</p>}
        {testFlash && <p className="text-sm text-[var(--color-success)]">Email sent (check inbox &amp; Resend dashboard).</p>}
      </Card>
    </div>
  );
}
