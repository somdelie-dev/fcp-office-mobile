import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { apiCalendarEvents, type CalendarEventDto } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import {
  CATEGORY_META,
  WEEKDAYS,
  addDays,
  dayKey,
  dayLabel,
  eventDays,
  eventTimeRange,
  monthGrid,
  monthLabel,
  sameDay,
  startOfDay,
  syncLocalReminders,
} from "@/lib/calendar";
import { catalogueThemes, type CatalogueColors } from "@/lib/paintsCatalogue";
import { useTheme } from "@/lib/themeContext";

const DEPTH = 4;

function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Raised 3D button used for month navigation and New. */
function Key3D({
  onPress,
  face,
  edge,
  children,
  style,
  label,
}: {
  onPress: () => void;
  face: [string, string];
  edge: string;
  children: React.ReactNode;
  style?: object;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={style}
      hitSlop={4}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.keyEdge,
            {
              backgroundColor: edge,
              marginTop: pressed ? DEPTH - 1 : 0,
              paddingBottom: pressed ? 1 : DEPTH,
              elevation: pressed ? 1 : 5,
              shadowOpacity: pressed ? 0.1 : 0.28,
            },
          ]}
        >
          <LinearGradient colors={face} style={styles.keyFace}>
            <View style={styles.shine} />
            {children}
          </LinearGradient>
        </View>
      )}
    </Pressable>
  );
}

function DayTile({
  day,
  inMonth,
  isToday,
  selected,
  dots,
  isDark,
  onPress,
}: {
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
  dots: string[];
  isDark: boolean;
  onPress: () => void;
}) {
  const face: [string, string] = selected
    ? ["#4ade80", "#16a34a"]
    : isDark
      ? ["#3b4a60", "#273447"]
      : ["#ffffff", "#e8edf3"];
  const edge = selected ? "#14532d" : isDark ? "#0b1220" : "#b8c2d0";
  const text = selected ? "#fff" : isDark ? "#f1f5f9" : "#0f172a";

  return (
    <Pressable
      onPress={onPress}
      style={styles.dayOuter}
      accessibilityLabel={dayLabel(day)}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.dayEdge,
            {
              backgroundColor: edge,
              marginTop: pressed ? 2 : 0,
              paddingBottom: pressed ? 1 : 3,
              opacity: inMonth ? 1 : 0.38,
              elevation: pressed || !inMonth ? 0 : 3,
            },
          ]}
        >
          <LinearGradient
            colors={face}
            style={[styles.dayFace, isToday && !selected && styles.todayRing]}
          >
            <Text
              style={[
                styles.dayNum,
                { color: text },
                isToday && styles.dayNumToday,
              ]}
            >
              {day.getDate()}
            </Text>
            <View style={styles.dotRow}>
              {dots.slice(0, 3).map((c, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: selected ? "#fff" : c },
                  ]}
                />
              ))}
            </View>
          </LinearGradient>
        </View>
      )}
    </Pressable>
  );
}

function EventCard({
  event,
  colors,
  onPress,
}: {
  event: CalendarEventDto;
  colors: CatalogueColors;
  onPress: () => void;
}) {
  const meta = CATEGORY_META[event.category];
  const invited = event.myResponse === "PENDING";
  const others = event.attendees.length - 1;

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={[
            styles.eventCard,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.rowBorder,
              transform: [{ translateY: pressed ? 2 : 0 }],
              elevation: pressed ? 1 : 4,
            },
          ]}
        >
          <LinearGradient colors={meta.face} style={styles.eventStripe} />
          <View style={styles.eventBody}>
            <View style={styles.eventTop}>
              <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                {eventTimeRange(event)}
              </Text>
              <View
                style={[
                  styles.catBadge,
                  { backgroundColor: `${meta.face[1]}22` },
                ]}
              >
                <Ionicons name={meta.icon} size={11} color={meta.face[1]} />
                <Text style={[styles.catText, { color: meta.face[1] }]}>
                  {meta.label}
                </Text>
              </View>
            </View>
            <Text
              style={[styles.eventTitle, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {event.title}
            </Text>
            <View style={styles.eventMeta}>
              {event.location ? (
                <Text
                  style={[styles.metaText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  <Ionicons name="location-outline" size={12} />{" "}
                  {event.location}
                </Text>
              ) : null}
              {others > 0 && (
                <Text
                  style={[styles.metaText, { color: colors.textSecondary }]}
                >
                  <Ionicons name="people-outline" size={12} /> {others + 1}{" "}
                  people
                </Text>
              )}
            </View>
            {invited && (
              <View style={styles.inviteBadge}>
                <Ionicons
                  name="mail-unread-outline"
                  size={12}
                  color="#b45309"
                />
                <Text style={styles.inviteText}>
                  Invited by {event.createdBy.name}, tap to respond
                </Text>
              </View>
            )}
            {event.myResponse === "DECLINED" && (
              <Text style={styles.declinedText}>You declined</Text>
            )}
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </View>
      )}
    </Pressable>
  );
}

export default function CalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];
  const isDark = theme === "dark";
  const { user } = useAuth();

  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => {
    const d = params.date ? new Date(params.date) : today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() =>
    params.date ? startOfDay(new Date(params.date)) : today,
  );
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synced = useRef(false);

  const grid = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const res = await apiCalendarEvents(
          grid[0].toISOString(),
          addDays(grid[grid.length - 1], 1).toISOString(),
        );
        setEvents(res.events);
        setCanCreate(res.canCreate);
      } catch (e: any) {
        setError(e?.message ?? "Could not load the calendar.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [grid],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // Keep this phone's own reminders current once per visit.
      if (!synced.current) {
        synced.current = true;
        syncLocalReminders(user?.id);
      }
      return () => {
        synced.current = false;
      };
    }, [load, user?.id]),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventDto[]>();
    for (const e of events) {
      for (const d of eventDays(e)) {
        const k = dayKey(d);
        map.set(k, [...(map.get(k) ?? []), e]);
      }
    }
    return map;
  }, [events]);

  const dayEvents = byDay.get(dayKey(selected)) ?? [];

  const shiftMonth = (n: number) => {
    tap();
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  };

  const goToday = () => {
    tap();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(today);
  };

  const chassis: [string, string] = isDark
    ? ["#1e293b", "#0b1220"]
    : ["#f8fafc", "#d5dde7"];
  const navFace: [string, string] = isDark
    ? ["#475569", "#334155"]
    : ["#ffffff", "#e2e8f0"];
  const navEdge = isDark ? "#0f172a" : "#a8b3c4";

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Calendar
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {canCreate ? "Plan and share events" : "Events you're invited to"}
            </Text>
          </View>
          {canCreate && (
            <Key3D
              label="New event"
              face={["#4ade80", "#16a34a"]}
              edge="#14532d"
              style={styles.newKey}
              onPress={() => {
                tap();
                router.push({
                  pathname: "/(foreman-stack)/calendar/form",
                  params: { date: selected.toISOString() },
                } as any);
              }}
            >
              <View style={styles.newKeyInner}>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.newKeyText}>New</Text>
              </View>
            </Key3D>
          )}
        </View>

        <LinearGradient colors={chassis} style={styles.board}>
          <View style={styles.monthRow}>
            <Key3D
              label="Previous month"
              face={navFace}
              edge={navEdge}
              style={styles.navKey}
              onPress={() => shiftMonth(-1)}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={colors.textPrimary}
              />
            </Key3D>
            <Pressable onPress={goToday} style={styles.monthCenter} hitSlop={6}>
              <Text style={[styles.monthText, { color: colors.textPrimary }]}>
                {monthLabel(month)}
              </Text>
              <Text style={styles.todayLink}>Today</Text>
            </Pressable>
            <Key3D
              label="Next month"
              face={navFace}
              edge={navEdge}
              style={styles.navKey}
              onPress={() => shiftMonth(1)}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textPrimary}
              />
            </Key3D>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text
                key={w}
                style={[styles.weekday, { color: colors.textSecondary }]}
              >
                {w}
              </Text>
            ))}
          </View>

          {Array.from({ length: 6 }, (_, r) => (
            <View key={r} style={styles.gridRow}>
              {grid.slice(r * 7, r * 7 + 7).map((d) => (
                <DayTile
                  key={dayKey(d)}
                  day={d}
                  inMonth={d.getMonth() === month.getMonth()}
                  isToday={sameDay(d, today)}
                  selected={sameDay(d, selected)}
                  dots={(byDay.get(dayKey(d)) ?? []).map(
                    (e) => CATEGORY_META[e.category].face[1],
                  )}
                  isDark={isDark}
                  onPress={() => {
                    tap();
                    setSelected(d);
                    if (d.getMonth() !== month.getMonth()) {
                      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                    }
                  }}
                />
              ))}
            </View>
          ))}
        </LinearGradient>

        <View style={styles.agendaHead}>
          <Text style={[styles.agendaTitle, { color: colors.textPrimary }]}>
            {dayLabel(selected)}
          </Text>
          <Text style={[styles.agendaCount, { color: colors.textSecondary }]}>
            {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#22c55e" style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : dayEvents.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: colors.rowBorder }]}>
            <Ionicons
              name="calendar-clear-outline"
              size={36}
              color={colors.emptyText}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Nothing on this day
            </Text>
          </View>
        ) : (
          dayEvents.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              colors={colors}
              onPress={() =>
                router.push({
                  pathname: "/(foreman-stack)/calendar/[id]",
                  params: { id: e.id },
                } as any)
              }
            />
          ))
        )}
      </ScrollView>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontWeight: "900" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },

  keyEdge: {
    flex: 1,
    borderRadius: 12,
    shadowColor: "#000",
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  keyFace: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  shine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "48%",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  newKey: { width: 92, height: 46 },
  newKeyInner: { flexDirection: "row", alignItems: "center", gap: 4 },
  newKeyText: { color: "#fff", fontSize: 15, fontWeight: "900" },

  board: {
    borderRadius: 22,
    padding: 12,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  navKey: { width: 42, height: 42 },
  monthCenter: { flex: 1, alignItems: "center" },
  monthText: { fontSize: 18, fontWeight: "900" },
  todayLink: {
    fontSize: 11,
    fontWeight: "800",
    color: "#16a34a",
    marginTop: 1,
  },
  weekRow: { flexDirection: "row", marginBottom: 2 },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "800" },
  gridRow: { flexDirection: "row", gap: 5 },
  dayOuter: { flex: 1, aspectRatio: 0.92 },
  dayEdge: {
    flex: 1,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  dayFace: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  todayRing: { borderWidth: 2, borderColor: "#22c55e" },
  dayNum: { fontSize: 14, fontWeight: "800" },
  dayNumToday: { fontWeight: "900" },
  dotRow: { flexDirection: "row", gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  agendaHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 6,
  },
  agendaTitle: { fontSize: 16, fontWeight: "900" },
  agendaCount: { fontSize: 12, fontWeight: "700" },

  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    paddingRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  eventStripe: { width: 6, alignSelf: "stretch" },
  eventBody: { flex: 1, padding: 12, gap: 3 },
  eventTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eventTime: { fontSize: 12, fontWeight: "800" },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  catText: { fontSize: 10, fontWeight: "900" },
  eventTitle: { fontSize: 15, fontWeight: "900" },
  eventMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaText: { fontSize: 12, fontWeight: "600" },
  inviteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  inviteText: { fontSize: 11, fontWeight: "800", color: "#b45309" },
  declinedText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#dc2626",
    marginTop: 2,
  },

  emptyCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    alignItems: "center",
    padding: 24,
    gap: 6,
  },
  emptyText: { fontSize: 14, fontWeight: "700" },
  error: {
    color: "#ef4444",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 16,
  },
});
