import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getPulse, postQuizResult } from "../lib/api";

export function QuizScreen({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const pulseQ = useQuery({ queryKey: ["pulse"], queryFn: getPulse });
  const [idx, setIdx] = useState(0);
  const [twinMsg, setTwinMsg] = useState<string | null>(null);

  const questions = pulseQ.data?.quiz_burst ?? [];
  const current = questions[idx];

  const fallbackConceptId = pulseQ.data?.concept_chunks?.[0]?.id;

  const mut = useMutation({
    mutationFn: async (payload: { conceptId: string; correct: boolean }) => {
      return postQuizResult(payload.conceptId, payload.correct);
    },
    onSuccess: (data) => {
      const weak = (data.digital_twin?.weak_topics as string[] | undefined) ?? [];
      setTwinMsg(`Updated weak topics: ${weak.length ? weak.join(", ") : "—"}`);
      void qc.invalidateQueries({ queryKey: ["pulse"] });
    },
  });

  const progress = useMemo(() => `${idx + 1} / ${Math.max(questions.length, 1)}`, [idx, questions.length]);

  if (pulseQ.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" }}>
        <ActivityIndicator color="#a5b4fc" />
        <Text style={{ color: "#94a3b8", marginTop: 12 }}>Loading quiz burst…</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "#020617" }}>
        <Text style={{ color: "#e2e8f0", fontSize: 18, fontWeight: "700" }}>No quiz yet</Text>
        <Text style={{ color: "#94a3b8", marginTop: 8 }}>Open the Home tab to refresh the pulse after uploading content.</Text>
        <Pressable onPress={onDone} style={{ marginTop: 16, padding: 12, backgroundColor: "#334155", borderRadius: 12 }}>
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  async function answer(choiceIndex: number) {
    const correct = choiceIndex === current.correct_index;
    const cid = current.concept_id || fallbackConceptId;
    if (cid) {
      await mut.mutateAsync({ conceptId: cid, correct });
    }
    if (idx + 1 >= questions.length) {
      onDone();
      return;
    }
    setIdx((v) => v + 1);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: "#94a3b8" }}>Quiz burst · {progress}</Text>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{current.question}</Text>
      {current.choices.map((c, i) => (
        <Pressable
          key={`${idx}-${c}`}
          disabled={mut.isPending}
          onPress={() => void answer(i)}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: "#0f172a",
            borderWidth: 1,
            borderColor: "#334155",
          }}
        >
          <Text style={{ color: "#e2e8f0", fontWeight: "600" }}>{c}</Text>
        </Pressable>
      ))}
      {mut.isPending && <ActivityIndicator color="#a5b4fc" />}
      {twinMsg && <Text style={{ color: "#86efac" }}>{twinMsg}</Text>}
    </ScrollView>
  );
}
