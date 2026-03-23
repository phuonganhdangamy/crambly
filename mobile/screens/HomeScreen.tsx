import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getPulse } from "../lib/api";

export function HomeScreen({ onStartQuiz }: { onStartQuiz: () => void }) {
  const q = useQuery({
    queryKey: ["pulse"],
    queryFn: getPulse,
    retry: 1,
  });

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" }}>
        <ActivityIndicator color="#a5b4fc" />
        <Text style={{ color: "#94a3b8", marginTop: 12 }}>Loading TLDR Pulse…</Text>
      </View>
    );
  }

  const err = q.isError ? (q.error instanceof Error ? q.error.message : "Failed to load") : null;

  const pulse = q.data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: "#e2e8f0", fontSize: 24, fontWeight: "700" }}>TLDR Pulse</Text>
      {err && <Text style={{ color: "#fb7185" }}>{err}</Text>}

      {pulse?.top_assessment && (
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#f97316" }}>
          <Text style={{ color: "#fdba74", fontSize: 12, fontWeight: "600" }}>Highest priority</Text>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 4 }}>{pulse.top_assessment.name}</Text>
          <Text style={{ color: "#cbd5e1", marginTop: 6 }}>{pulse.top_assessment.urgency_message}</Text>
        </View>
      )}

      <View style={{ borderRadius: 16, padding: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155" }}>
        <Text style={{ color: "#a5b4fc", fontWeight: "600" }}>Today&apos;s concept chunks</Text>
        {(pulse?.concept_chunks ?? []).map((c) => (
          <View key={c.id} style={{ marginTop: 10 }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>{c.title}</Text>
            <Text style={{ color: "#94a3b8", marginTop: 4 }}>{c.summary}</Text>
          </View>
        ))}
        {(pulse?.concept_chunks?.length ?? 0) === 0 && (
          <Text style={{ color: "#64748b", marginTop: 8 }}>Upload notes on desktop to populate your pulse.</Text>
        )}
      </View>

      <Pressable
        onPress={onStartQuiz}
        style={{ borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: "#6366f1" }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Start Today&apos;s Study Session</Text>
      </Pressable>
    </ScrollView>
  );
}
