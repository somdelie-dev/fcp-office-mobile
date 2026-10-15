import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { SearchablePickerModal } from "@/components/SearchablePickerModal";
import {
  apiCalendarCreate,
  apiCalendarEvent,
  apiCalendarPeople,
  apiCalendarUpdate,
  type CalendarCategory,
  type CalendarPersonDto,
} from "@/lib/apiClient";
import {
  CATEGORIES,
  CATEGORY_META,
  REMINDER_OPTIONS,
  TIME_SLOTS,
  addDays,
  dayLabel,
  hhmm,
  startOfDay,
  withTime,
} from "@/lib/calendar";
import { catalogueThemes } from "@/lib/paintsCatalogue";
import { useTheme } from "@/lib/themeContext";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  OFFICE: "Office",
  SUPERVISOR: "Supervisor",
  FOREMAN: "Foreman",
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "#2563eb",
  OFFICE: "#0891b2",
  SUPERVISOR: "#7c3aed",
  FOREMAN: "#ea580c",
};

function roundedNow() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

export default function CalendarEventForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const editingId = params.id;
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];
  const isDark = theme === "dark";

  const initialDay = startOfDay(
    params.date ? new Date(params.date) : new Date(),
  );
  const start = roundedNow();

  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CalendarCategory>("MEETING");
  const [day, setDay] = useState(initialDay);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(hhmm(start));
  const [endTime, setEndTime] = useState(
    hhmm(new Date(start.getTime() + 60 * 60_000)),
  );
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [reminder, setReminder] = useState<number | null>(10);
  const [people, setPeople] = useState<CalendarPersonDto[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<"date" | "start" | "end" | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiCalendarPeople()
      .then((res) => setPeople(res.people))
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    if (!editingId) return;
    apiCalendarEvent(editingId)
      .then(({ event }) => {
        const s = new Date(event.startsAt);
        setTitle(event.title);
        setCategory(event.category);
        setDay(startOfDay(s));
        setAllDay(event.allDay);
        setStartTime(hhmm(s));
        if (event.endsAt) setEndTime(hhmm(new Date(event.endsAt)));
        setLocation(event.location ?? "");
        setNotes(event.description ?? "");
        setReminder(event.reminderMinutes);
        setInvited(
          new Set(
            event.attendees
              .filter((a) => a.userId !== event.createdBy.id)
              .map((a) => a.userId),
          ),
        );
      })
      .catch((e: any) =>
        Alert.alert("Couldn't load event", e?.message ?? "Please try again."),
      )
      .finally(() => setLoading(false));
  }, [editingId]);

  const dateOptions = useMemo(() => {
    const base = startOfDay(new Date());
    const out = Array.from({ length: 400 }, (_, i) => addDays(base, i - 30));
    if (!out.some((d) => d.getTime() === day.getTime())) out.push(day);
    return out.map((d) => ({ id: d.toISOString(), name: dayLabel(d) }));
  }, [day]);

  const timeOptions = TIME_SLOTS.map((t) => ({ id: t, name: t }));

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
  }, [people, search]);

  const invitedPeople = people.filter((p) => invited.has(p.id));

  const toggle = (id: string) =>
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!title.trim()) {
      Alert.alert("Title needed", "Give the event a title.");
      return;
    }
    const startsAt = allDay ? withTime(day, "00:00") : withTime(day, startTime);
    let endsAt: Date | null = allDay ? null : withTime(day, endTime);
    if (endsAt && endsAt <= startsAt) {
      Alert.alert(
        "Check the times",
        "The end time must be after the start time.",
      );
      return;
    }
    const input = {
      title: title.trim(),
      description: notes.trim() || null,
      location: location.trim() || null,
      category,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      allDay,
      reminderMinutes: reminder,
      attendeeUserIds: [...invited],
    };
    setSaving(true);
    try {
      const res = editingId
        ? await apiCalendarUpdate(editingId, input)
        : await apiCalendarCreate(input);
      router.replace({
        pathname: "/(foreman-stack)/calendar/[id]",
        params: { id: res.event.id },
      } as any);
    } catch (e: any) {
      Alert.alert(
        editingId ? "Couldn't save" : "Couldn't create",
        e?.message ?? "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const field = [
    styles.field,
    { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
  ];
  const placeholder = isDark ? "#64748b" : "#94a3b8";

  if (loading) {
    return (
      <AuthStyleBackground>
        <ActivityIndicator color="#22c55e" style={{ marginTop: 60 }} />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {editingId ? "Edit event" : "New event"}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="What's happening?"
            placeholderTextColor={placeholder}
            style={[...field, styles.titleInput, { color: colors.textPrimary }]}
          />

          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c];
              const on = category === c;
              return (
                <Pressable key={c} onPress={() => setCategory(c)}>
                  {on ? (
                    <LinearGradient
                      colors={meta.face}
                      style={[styles.chip, styles.chipOn]}
                    >
                      <Ionicons name={meta.icon} size={14} color="#fff" />
                      <Text style={[styles.chipText, { color: "#fff" }]}>
                        {meta.label}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.chip,
                        {
                          borderColor: colors.rowBorder,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                    >
                      <Ionicons
                        name={meta.icon}
                        size={14}
                        color={meta.face[1]}
                      />
                      <Text
                        style={[styles.chipText, { color: colors.textPrimary }]}
                      >
                        {meta.label}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
            ]}
          >
            <Pressable style={styles.row} onPress={() => setPicker("date")}>
              <Ionicons name="calendar-outline" size={18} color="#16a34a" />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>
                {dayLabel(day)}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
            <View
              style={[styles.divider, { backgroundColor: colors.rowBorder }]}
            />
            <View style={styles.row}>
              <Ionicons name="sunny-outline" size={18} color="#d97706" />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>
                All day
              </Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ true: "#22c55e" }}
              />
            </View>
            {!allDay && (
              <>
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: colors.rowBorder },
                  ]}
                />
                <View style={styles.timeRow}>
                  {(["start", "end"] as const).map((k) => (
                    <Pressable
                      key={k}
                      onPress={() => setPicker(k)}
                      style={[...field, styles.timeBox]}
                    >
                      <Text
                        style={[
                          styles.timeLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {k === "start" ? "Starts" : "Ends"}
                      </Text>
                      <Text
                        style={[
                          styles.timeValue,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {k === "start" ? startTime : endTime}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>

          <TextInput
            value={location}
            onChangeText={setLocation}
            maxLength={200}
            placeholder="Location (optional)"
            placeholderTextColor={placeholder}
            style={[...field, { color: colors.textPrimary }]}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            maxLength={2000}
            placeholder="Notes (optional)"
            placeholderTextColor={placeholder}
            multiline
            style={[...field, styles.notes, { color: colors.textPrimary }]}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Remind me
          </Text>
          <View style={styles.chips}>
            {REMINDER_OPTIONS.map((o) => {
              const on = reminder === o.value;
              return (
                <Pressable
                  key={String(o.value)}
                  onPress={() => setReminder(o.value)}
                  style={[
                    styles.chip,
                    on
                      ? { backgroundColor: "#16a34a", borderColor: "#16a34a" }
                      : {
                          borderColor: colors.rowBorder,
                          backgroundColor: colors.cardBg,
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: on ? "#fff" : colors.textPrimary },
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.shareHead}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Share with ({invited.size})
            </Text>
            <Pressable
              onPress={() => setPeopleOpen(true)}
              style={styles.addPeople}
            >
              <Ionicons name="person-add" size={14} color="#fff" />
              <Text style={styles.addPeopleText}>Add people</Text>
            </Pressable>
          </View>
          {invitedPeople.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Only you will see this event. Add people to share it and remind
              them too.
            </Text>
          ) : (
            <View style={styles.chips}>
              {invitedPeople.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p.id)}
                  style={[
                    styles.personChip,
                    { borderColor: ROLE_COLOR[p.role] ?? "#64748b" },
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: colors.textPrimary }]}
                  >
                    {p.name}
                  </Text>
                  <Ionicons
                    name="close"
                    size={14}
                    color={colors.textSecondary}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.barBg,
              borderTopColor: colors.rowBorder,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Pressable onPress={save} disabled={saving}>
            {({ pressed }) => (
              <View
                style={[
                  styles.saveEdge,
                  {
                    marginTop: pressed ? 3 : 0,
                    paddingBottom: pressed ? 1 : 4,
                  },
                ]}
              >
                <LinearGradient
                  colors={["#4ade80", "#16a34a"]}
                  style={styles.saveFace}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveText}>
                      {editingId
                        ? "Save changes"
                        : invited.size > 0
                          ? `Create & share with ${invited.size}`
                          : "Create event"}
                    </Text>
                  )}
                </LinearGradient>
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SearchablePickerModal
        visible={picker === "date"}
        title="Date"
        searchPlaceholder="Search dates…"
        showAllOption={false}
        options={dateOptions}
        selectedId={day.toISOString()}
        onSelect={(o) => o && setDay(startOfDay(new Date(o.id)))}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />
      <SearchablePickerModal
        visible={picker === "start" || picker === "end"}
        title={picker === "start" ? "Start time" : "End time"}
        searchPlaceholder="Search times…"
        showAllOption={false}
        options={timeOptions}
        selectedId={picker === "start" ? startTime : endTime}
        onSelect={(o) => {
          if (!o) return;
          if (picker === "start") {
            setStartTime(o.id);
            // Keep the event an hour long when the start moves past the end.
            if (o.id >= endTime) {
              const s = withTime(day, o.id);
              setEndTime(hhmm(new Date(s.getTime() + 60 * 60_000)));
            }
          } else setEndTime(o.id);
        }}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />

      <Modal
        visible={peopleOpen}
        animationType="slide"
        onRequestClose={() => setPeopleOpen(false)}
      >
        <View
          style={[
            styles.peopleModal,
            { backgroundColor: colors.sheetBg, paddingTop: insets.top + 8 },
          ]}
        >
          <View style={styles.peopleHead}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Share with
            </Text>
            <Pressable
              onPress={() => setPeopleOpen(false)}
              style={styles.doneBtn}
            >
              <Text style={styles.addPeopleText}>Done ({invited.size})</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or email"
            placeholderTextColor={placeholder}
            autoCapitalize="none"
            style={[
              ...field,
              { color: colors.textPrimary, marginHorizontal: 16 },
            ]}
          />
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 24,
            }}
          >
            {filteredPeople.map((p) => {
              const on = invited.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p.id)}
                  style={[
                    styles.personRow,
                    { borderBottomColor: colors.rowBorder },
                  ]}
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={22}
                    color={on ? "#22c55e" : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.personName, { color: colors.textPrimary }]}
                    >
                      {p.name}
                    </Text>
                    <Text
                      style={[
                        styles.personEmail,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {p.email}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.roleTag,
                      {
                        backgroundColor: `${ROLE_COLOR[p.role] ?? "#64748b"}22`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        { color: ROLE_COLOR[p.role] ?? "#64748b" },
                      ]}
                    >
                      {ROLE_LABEL[p.role] ?? p.role}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {filteredPeople.length === 0 && (
              <Text
                style={[
                  styles.hint,
                  { color: colors.textSecondary, textAlign: "center" },
                ]}
              >
                No one matches your search
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: "900" },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    fontWeight: "600",
  },
  titleInput: { fontSize: 18, fontWeight: "800" },
  notes: { height: 90, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipOn: { borderWidth: 0, elevation: 3 },
  chipText: { fontSize: 13, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 50,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: "700" },
  divider: { height: 1 },
  timeRow: { flexDirection: "row", gap: 10, padding: 12 },
  timeBox: { flex: 1, justifyContent: "center", paddingVertical: 6 },
  timeLabel: { fontSize: 11, fontWeight: "800" },
  timeValue: { fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  label: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  hint: { fontSize: 12, fontWeight: "600" },
  shareHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addPeople: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
  },
  addPeopleText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  saveEdge: { height: 54, borderRadius: 14, backgroundColor: "#14532d" },
  saveFace: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  peopleModal: { flex: 1, gap: 12 },
  peopleHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  doneBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    justifyContent: "center",
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  personName: { fontSize: 15, fontWeight: "800" },
  personEmail: { fontSize: 12, fontWeight: "500" },
  roleTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 11, fontWeight: "900" },
});
