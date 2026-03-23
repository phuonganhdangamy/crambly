import { Audio } from "expo-av";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getAudioClips, postTts, ttsDataUrl } from "../lib/api";

export function PodcastScreen() {
  const q = useQuery({ queryKey: ["clips"], queryFn: getAudioClips });
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    return () => {
      void sound?.unloadAsync();
    };
  }, [sound]);

  async function playTts(title: string, transcript: string) {
    setLoadingId(title);
    try {
      const { audio_base64, mime } = await postTts(transcript.slice(0, 2000));
      const uri = ttsDataUrl(audio_base64, mime);
      await sound?.unloadAsync();
      const { sound: s } = await Audio.Sound.createAsync({ uri });
      setSound(s);
      await s.playAsync();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: "#e2e8f0", fontSize: 22, fontWeight: "700" }}>Audio explainers</Text>
      <Text style={{ color: "#94a3b8" }}>
        Clips saved from the hub appear here. Tap any row to synthesize audio from its transcript (ElevenLabs).
      </Text>
      {q.isLoading && <ActivityIndicator color="#a5b4fc" />}
      {(q.data ?? []).map((c) => (
        <View key={c.id} style={{ borderRadius: 14, padding: 12, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>{c.title}</Text>
          <Pressable
            onPress={() => void playTts(c.id, c.transcript || c.title)}
            style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: "#6366f1" }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
              {loadingId === c.id ? "Loading…" : "Play (TTS)"}
            </Text>
          </Pressable>
          {!!c.transcript && <Text style={{ color: "#94a3b8", marginTop: 10 }}>{c.transcript}</Text>}
        </View>
      ))}
      {(q.data?.length ?? 0) === 0 && !q.isLoading && (
        <Text style={{ color: "#64748b" }}>No clips yet — generate audio on desktop study view (future: auto-save here).</Text>
      )}
    </ScrollView>
  );
}
