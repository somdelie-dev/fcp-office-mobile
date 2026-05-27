import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  clearCacheDebugEvents,
  getCacheDebugEvents,
  type CacheDebugEvent,
} from "../lib/cacheDebug";

function formatTime(at: number) {
  const d = new Date(at);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function DebugCacheScreen() {
  const [events, setEvents] = useState<CacheDebugEvent[]>(() =>
    getCacheDebugEvents(),
  );

  const refresh = useCallback(() => {
    setEvents(getCacheDebugEvents());
  }, []);

  const clear = useCallback(() => {
    clearCacheDebugEvents();
    setEvents([]);
  }, []);

  return (
    <AuthStyleBackground>
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        <GlassCard style={styles.card}>
          <Text style={styles.title}>Cache Debug</Text>
          <Text style={styles.subtitle}>
            Internal panel showing recent cache + network events.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={refresh}>
              <Text style={styles.buttonText}>Refresh log</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.clear]} onPress={clear}>
              <Text style={styles.buttonText}>Clear</Text>
            </Pressable>
          </View>

          {events.length === 0 ? (
            <Text style={styles.empty}>No events recorded yet.</Text>
          ) : (
            <View style={styles.list}>
              {events.map((e) => (
                <View key={e.id} style={styles.row}>
                  <Text style={styles.time}>{formatTime(e.at)}</Text>
                  <Text style={styles.kind}>{e.kind}</Text>
                  {e.path ? <Text style={styles.path}>{e.path}</Text> : null}
                  {e.cacheKey ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      key: {e.cacheKey}
                    </Text>
                  ) : null}
                  {e.note ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {e.note}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      </ScrollView>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#0ea5e9",
  },
  clear: {
    backgroundColor: "#ef4444",
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
  },
  empty: {
    marginTop: 8,
    fontSize: 13,
    opacity: 0.8,
  },
  list: {
    marginTop: 8,
    gap: 6,
  },
  row: {
    borderRadius: 6,
    padding: 8,
    backgroundColor: "rgba(15,23,42,0.75)",
  },
  time: {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 2,
  },
  kind: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  path: {
    fontSize: 12,
    opacity: 0.85,
  },
  meta: {
    fontSize: 11,
    opacity: 0.7,
  },
});
