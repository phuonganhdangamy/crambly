import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getConcepts, getUploads } from "../lib/api";

export function LibraryScreen() {
  const uploads = useQuery({ queryKey: ["uploads"], queryFn: getUploads });
  const [open, setOpen] = useState<string | null>(null);
  const concepts = useQuery({
    queryKey: ["concepts", open],
    queryFn: () => getConcepts(open!),
    enabled: Boolean(open),
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: "#e2e8f0", fontSize: 22, fontWeight: "700" }}>Library</Text>
      {uploads.isLoading && <ActivityIndicator color="#a5b4fc" />}
      {(uploads.data ?? []).map((u) => (
        <View key={u.id} style={{ borderRadius: 14, padding: 12, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155" }}>
          <Pressable onPress={() => setOpen((v) => (v === u.id ? null : u.id))}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>{u.file_name}</Text>
            <Text style={{ color: "#94a3b8", marginTop: 4 }}>
              {u.concepts_count} concepts · {u.status}
            </Text>
          </Pressable>
          {open === u.id && (
            <View style={{ marginTop: 10 }}>
              {concepts.isLoading && <ActivityIndicator color="#a5b4fc" />}
              {(concepts.data ?? []).map((c) => (
                <View key={c.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#1e293b" }}>
                  <Text style={{ color: "#a5b4fc", fontWeight: "700" }}>{c.title}</Text>
                  <Text style={{ color: "#cbd5e1", marginTop: 6 }}>{c.summary}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
