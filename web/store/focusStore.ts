import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FocusStore {
  sessionUploadId: string | null;
  sessionGoal: number | null;
  sessionStartedAt: number | null;
  smartNudgesEnabled: boolean;
  simplificationsUsed: number;
  sectionsReviewed: string[];
  setSession: (uploadId: string, goal: number | null) => void;
  incrementSimplifications: () => void;
  addReviewedSection: (blockId: string) => void;
  toggleSmartNudges: () => void;
  endSession: () => void;
  resetSession: () => void;
}

export const useFocusStore = create<FocusStore>()(
  persist(
    (set) => ({
      sessionUploadId: null,
      sessionGoal: null,
      sessionStartedAt: null,
      smartNudgesEnabled: false,
      simplificationsUsed: 0,
      sectionsReviewed: [],
      setSession: (uploadId, goal) =>
        set({
          sessionUploadId: uploadId,
          sessionGoal: goal,
          sessionStartedAt: Date.now(),
          simplificationsUsed: 0,
          sectionsReviewed: [],
        }),
      incrementSimplifications: () => set((s) => ({ simplificationsUsed: s.simplificationsUsed + 1 })),
      addReviewedSection: (blockId) =>
        set((s) =>
          s.sectionsReviewed.includes(blockId) ? s : { sectionsReviewed: [...s.sectionsReviewed, blockId] },
        ),
      toggleSmartNudges: () => set((s) => ({ smartNudgesEnabled: !s.smartNudgesEnabled })),
      endSession: () =>
        set({
          sessionUploadId: null,
          sessionGoal: null,
          sessionStartedAt: null,
          simplificationsUsed: 0,
          sectionsReviewed: [],
        }),
      resetSession: () =>
        set({
          sessionUploadId: null,
          sessionGoal: null,
          sessionStartedAt: null,
          smartNudgesEnabled: false,
          simplificationsUsed: 0,
          sectionsReviewed: [],
        }),
    }),
    {
      name: "crambly-focus",
      partialize: (s) => ({
        sessionUploadId: s.sessionUploadId,
        sessionGoal: s.sessionGoal,
        smartNudgesEnabled: s.smartNudgesEnabled,
      }),
    },
  ),
);
