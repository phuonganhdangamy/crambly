"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LearningCity, type LearningCityCourse } from "@/components/dashboard/LearningCity";
import { StudyHeatmap } from "@/components/dashboard/StudyHeatmap";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HomeLanding } from "@/components/home/HomeLanding";
import { fetchCourseAggregate, fetchCourses, fetchUploads, type PriorityCard } from "@/lib/api";
import { useAuthSession } from "@/hooks/useAuthSession";
import { getRecentActivity, type ActivityItem } from "@/lib/localActivity";
import { getSupabaseBrowser } from "@/lib/supabase";

/** Calendar days from today to due date (local). Negative if due date is in the past. */
function daysUntil(iso: string) {
  try {
    const due = new Date(iso + "T12:00:00");
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    return Math.round((startDue.getTime() - startToday.getTime()) / 86400000);
  } catch {
    return 999;
  }
}

function pickPriorityCourseId(courses: { id: string; next_assessment_date?: string | null }[]) {
  const withDates = courses.filter((c) => c.next_assessment_date);
  if (withDates.length === 0) return courses[0]?.id ?? null;
  withDates.sort(
    (a, b) =>
      new Date(a.next_assessment_date! + "T12:00:00").getTime() -
      new Date(b.next_assessment_date! + "T12:00:00").getTime(),
  );
  return withDates[0]!.id;
}

export default function Home() {
  const router = useRouter();
  const { status } = useAuthSession();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [greetingName, setGreetingName] = useState("there");
  const signedIn = status === "signedIn";
  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: fetchCourses, enabled: signedIn });
  const uploadsQ = useQuery({ queryKey: ["uploads"], queryFn: fetchUploads, enabled: signedIn });

  const priorityCourseId = useMemo(
    () => (coursesQ.data ? pickPriorityCourseId(coursesQ.data) : null),
    [coursesQ.data],
  );

  const aggQ = useQuery({
    queryKey: ["courseAggregate", priorityCourseId],
    queryFn: () => fetchCourseAggregate(priorityCourseId!),
    enabled: signedIn && Boolean(priorityCourseId),
  });

  const topAssessment: PriorityCard | null = useMemo(() => {
    const cards = aggQ.data?.assessment_cards ?? [];
    if (cards.length === 0) return null;
    return [...cards].sort((a, b) => b.priority_score - a.priority_score)[0] ?? null;
  }, [aggQ.data?.assessment_cards]);

  const cityCourses: LearningCityCourse[] = useMemo(() => {
    const list = coursesQ.data ?? [];
    const recentId =
      [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id ?? null;
    return list.map((c) => {
      const n = c.uploads_count ?? 0;
      const completionPercent = Math.min(100, 12 + n * 22);
      return {
        id: c.id,
        code: c.code || "—",
        color: c.color || "#00d9ff",
        completionPercent,
        isMostRecent: c.id === recentId,
      };
    });
  }, [coursesQ.data]);

  const recentCourseId = cityCourses.find((c) => c.isMostRecent)?.id ?? cityCourses[0]?.id ?? null;

  const conceptTotal = useMemo(
    () => (uploadsQ.data ?? []).reduce((s, u) => s + (u.concepts_count ?? 0), 0),
    [uploadsQ.data],
  );

  useEffect(() => {
    setActivity(getRecentActivity(5));
  }, []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void sb.auth.getSession().then((res: { data: { session: { user?: { email?: string | null } } | null } }) => {
      const em = res.data.session?.user?.email;
      if (em) setGreetingName(em.split("@")[0] ?? "there");
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e: AuthChangeEvent, session: Session | null) => {
      const em = session?.user?.email;
      setGreetingName(em ? em.split("@")[0] ?? "there" : "there");
    });
    return () => subscription.unsubscribe();
  }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const daysToTop = topAssessment?.due_date ? daysUntil(topAssessment.due_date) : null;
  const dueSoon = daysToTop != null && daysToTop >= 0 && daysToTop <= 3;

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      </div>
    );
  }

  if (status === "signedOut") {
    return <HomeLanding />;
  }

  return (
    <div className="space-y-10">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-2"
      >
        <p className="text-sm text-[var(--color-accent-cyan)]">Dashboard</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] md:text-4xl">
          Good {now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"},{" "}
          <span className="text-[var(--color-accent-cyan)]">{greetingName}</span> 👋
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          {dateStr}
          <span className="mx-2 text-[var(--color-text-muted)]">·</span>
          You have{" "}
          <strong className="text-[var(--color-text-primary)]">{conceptTotal}</strong> extracted concepts across your
          library
        </p>
      </motion.header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <LearningCity courses={cityCourses} onSelectCourse={(id) => router.push(`/courses/${id}`)} />
          <StudyHeatmap />
        </div>

        <div className="min-w-0 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
          >
            <Card
              glow
              className={`${dueSoon ? "border-[var(--color-accent-orange)]/40 shadow-[0_0_20px_rgba(255,123,53,0.12)]" : ""}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Today&apos;s priority
              </p>
              {aggQ.isLoading && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Loading deadlines…</p>}
              {!aggQ.isLoading && !topAssessment && (
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  Upload a syllabus for a course or add assessments to see priority scoring here.
                </p>
              )}
              {topAssessment && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">{aggQ.data?.course.code ?? "Course"}</Badge>
                    {dueSoon && <Badge variant="danger">Due soon</Badge>}
                  </div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{topAssessment.name}</h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {topAssessment.due_date
                      ? daysToTop == null
                        ? "No date"
                        : daysToTop < 0
                          ? "Past due"
                          : daysToTop === 0
                            ? "Due today"
                            : `${daysToTop} day${daysToTop === 1 ? "" : "s"} remaining`
                      : "No date"}{" "}
                    · weight{" "}
                    <span className="font-bold text-[var(--color-accent-orange)]">
                      {(topAssessment.grade_weight * 100).toFixed(0)}%
                    </span>
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">{topAssessment.message}</p>
                  <Link
                    href={priorityCourseId ? `/courses/${priorityCourseId}` : "/courses"}
                    className="inline-block text-sm font-medium text-[var(--color-accent-cyan)] hover:underline"
                  >
                    Open course hub →
                  </Link>
                </div>
              )}
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="space-y-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Quick actions</p>
            <div className="flex flex-col gap-2">
              <Link href="/upload" className="block">
                <Button variant="primary" className="w-full">
                  Upload material
                </Button>
              </Link>
              <Link href={recentCourseId ? `/courses/${recentCourseId}` : "/courses"} className="block">
                <Button variant="secondary" className="w-full">
                  Start study session
                </Button>
              </Link>
              <Link href="/library" className="block">
                <Button variant="ghost" className="w-full">
                  Take a quiz (pick a lecture)
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Recent activity
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Stored on this device until a server activity feed ships.
              </p>
              <ul className="mt-4 space-y-3">
                {activity.length === 0 &&
                  (uploadsQ.data ?? []).slice(0, 5).map((u) => (
                    <li key={u.id} className="flex min-w-0 gap-3 text-sm text-[var(--color-text-secondary)]">
                      <span className="shrink-0 text-[var(--color-accent-cyan)]" aria-hidden>
                        📄
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[var(--color-text-primary)]" title={u.file_name}>
                          In library: {u.file_name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">Upload</p>
                      </div>
                    </li>
                  ))}
                {activity.map((a) => (
                  <li key={a.id} className="flex min-w-0 gap-3 text-sm text-[var(--color-text-secondary)]">
                    <span className="shrink-0 text-[var(--color-accent-purple)]" aria-hidden>
                      ✦
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[var(--color-text-primary)]" title={a.label}>
                        {a.label}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {new Date(a.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
