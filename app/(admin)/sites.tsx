import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminCreateSite,
  apiAdminDeleteSite,
  apiAdminSites,
  type AdminSiteListItemDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type FilterMode = "all" | "active" | "inactive";

export default function AdminSitesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [sites, setSites] = useState<AdminSiteListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  const [actionsId, setActionsId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force) setLoading(true);
    setError(null);
    try {
      const res = await apiAdminSites();
      setSites(res?.sites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sites.");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    try { await load({ force: true }); }
    finally { setRefreshing(false); }
  }

  // Client-side filter + search (instant, no debounce needed)
  const filteredSites = useMemo(() => {
    let result = sites;
    if (filter === "active") result = result.filter((s) => s.isActive);
    if (filter === "inactive") result = result.filter((s) => !s.isActive);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.code ?? "").toLowerCase().includes(q) ||
          (s.location ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [sites, filter, search]);

  const handleDelete = useCallback((site: AdminSiteListItemDto) => {
    setActionsId(null);
    Alert.alert(
      "Delete Site?",
      `This will permanently delete "${site.name}" and all related data. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyAction(true);
            try {
              const res = await apiAdminDeleteSite(site.id);
              if (res.ok) { Alert.alert("Done", "Site deleted."); load({ force: true }); }
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete site.");
            } finally { setBusyAction(false); }
          },
        },
      ],
    );
  }, [load]);

  async function handleCreateSite() {
    const trimName = newName.trim();
    if (!trimName) { Alert.alert("Error", "Site name is required."); return; }
    setCreateBusy(true);
    try {
      const res = await apiAdminCreateSite({
        name: trimName,
        code: newCode.trim() || null,
        location: newLocation.trim() || null,
        address: newAddress.trim() || null,
      });
      if (res.ok) {
        setCreateModalVisible(false);
        setNewName(""); setNewCode(""); setNewLocation(""); setNewAddress("");
        Alert.alert("Done", "Site created successfully.");
        load({ force: true });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create site.");
    } finally { setCreateBusy(false); }
  }

  const textMain = isDark ? "#e5e7eb" : "#111827";
  const textSub = isDark ? "#94a3b8" : "#6b7280";
  const cardBg = isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.9)";
  const inputBg = isDark ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.9)";
  const borderCol = isDark ? "#1f2937" : "#e5e7eb";

  return (
    <AuthStyleBackground>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        {/* Header */}
        <GlassCard style={[styles.headerCard, { backgroundColor: cardBg }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: textMain }]}>Sites</Text>
              <Text style={[styles.sub, { color: textSub }]}>
                {loading ? "Loading…" : `${filteredSites.length} of ${sites.length} sites`}
              </Text>
            </View>
            <Pressable onPress={() => setCreateModalVisible(true)} style={styles.addBtn}>
              <Ionicons name="add-circle" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add Site</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </GlassCard>

        {/* Search + Filter */}
        <GlassCard style={[styles.searchCard, { backgroundColor: cardBg }]}>
          <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor: borderCol }]}>
            <Ionicons name="search" size={16} color={textSub} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, code, location…"
              placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
              style={[styles.searchInput, { color: textMain }]}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={textSub} />
              </Pressable>
            )}
          </View>
          <View style={styles.filterRow}>
            {(["all", "active", "inactive"] as FilterMode[]).map((f) => (
              <FilterPill
                key={f}
                label={f === "all" ? "All" : f === "active" ? "Active" : "Inactive"}
                active={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
            <Text style={[styles.filterLabel, { color: textSub }]}>
              {filteredSites.length} result{filteredSites.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </GlassCard>

        {/* Sites list */}
        <GlassCard style={[styles.listCard, { backgroundColor: cardBg }]}>
          {loading && !refreshing && sites.length === 0 ? (
            <LoadingOverlay icon="📍" title="Loading sites…" message="Please wait" />
          ) : (
            <FlatList
              data={filteredSites}
              keyExtractor={(s) => s.id}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ paddingVertical: 4 }}
              renderItem={({ item }) => (
                <SiteRow
                  item={item}
                  isDark={isDark}
                  actionsId={actionsId}
                  setActionsId={setActionsId}
                  onManage={() => router.push({ pathname: "/(admin-stack)/sites/[id]", params: { id: item.id } })}
                  onDelete={() => handleDelete(item)}
                />
              )}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="search-outline" size={48} color={textSub} style={{ opacity: 0.4 }} />
                    <Text style={[styles.emptyTitle, { color: textMain }]}>
                      {search ? "No sites match this search" : "No sites"}
                    </Text>
                    <Text style={[styles.emptySub, { color: textSub }]}>
                      {search ? "Try a different name, code or location." : "Sites will appear here once created."}
                    </Text>
                  </View>
                ) : null
              }
            />
          )}
        </GlassCard>
      </View>

      {/* Create site modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !createBusy && setCreateModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
                <Text style={[styles.modalTitle, { color: textMain }]}>Create New Site</Text>
                <Text style={[styles.modalSub, { color: textSub }]}>Fill in the details for the new site.</Text>
                {[
                  { label: "Name *", value: newName, setter: setNewName, placeholder: "Site name" },
                  { label: "Job Number", value: newCode, setter: setNewCode, placeholder: "Job number (optional)" },
                  { label: "Location", value: newLocation, setter: setNewLocation, placeholder: "Location (optional)" },
                  { label: "Address", value: newAddress, setter: setNewAddress, placeholder: "Address (optional)" },
                ].map(({ label, value, setter, placeholder }) => (
                  <View key={label}>
                    <Text style={[styles.fieldLabel, { color: textSub }]}>{label}</Text>
                    <TextInput
                      value={value}
                      onChangeText={setter}
                      placeholder={placeholder}
                      placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                      style={[styles.fieldInput, { color: textMain, borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
                    />
                  </View>
                ))}
                <View style={styles.modalBtns}>
                  <Pressable
                    disabled={createBusy}
                    onPress={() => { if (!createBusy) { setCreateModalVisible(false); setNewName(""); setNewCode(""); setNewLocation(""); setNewAddress(""); } }}
                    style={styles.cancelBtn}
                  >
                    <Text style={[styles.cancelBtnText, { color: textSub }]}>Cancel</Text>
                  </Pressable>
                  <Pressable disabled={createBusy} onPress={handleCreateSite} style={[styles.saveBtn, createBusy && { opacity: 0.7 }]}>
                    <Text style={styles.saveBtnText}>{createBusy ? "Creating…" : "Create Site"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </AuthStyleBackground>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? (isDark ? styles.pillActiveDark : styles.pillActive) : (isDark ? styles.pillInactiveDark : styles.pillInactive)]}
    >
      <Text style={[styles.pillText, { color: active ? (isDark ? "#0f172a" : "#111827") : (isDark ? "#cbd5e1" : "#6b7280") }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SiteRow({
  item, isDark, actionsId, setActionsId, onManage, onDelete,
}: {
  item: AdminSiteListItemDto;
  isDark: boolean;
  actionsId: string | null;
  setActionsId: (id: string | null) => void;
  onManage: () => void;
  onDelete: () => void;
}) {
  const created = useMemo(() => {
    try { return new Date(item.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }); }
    catch { return item.createdAt; }
  }, [item.createdAt]);

  const isActive = item.isActive;
  const badgeBg = isActive ? (isDark ? "rgba(22,163,74,0.18)" : "rgba(22,163,74,0.12)") : (isDark ? "rgba(220,38,38,0.18)" : "rgba(220,38,38,0.12)");
  const badgeColor = isActive ? (isDark ? "#4ade80" : "#16a34a") : (isDark ? "#f87171" : "#dc2626");
  const borderColor = isDark ? "#1f2937" : "#e2e8f0";
  const isOpen = actionsId === item.id;

  return (
    <Pressable
      onPress={onManage}
      style={({ pressed }) => [
        styles.rowPressable,
        { borderColor, opacity: pressed ? 0.7 : 1 },
        isOpen && { zIndex: 1000, elevation: 50 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.siteName, { color: isDark ? "#e5e7eb" : "#111827" }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.siteMeta, { color: isDark ? "#94a3b8" : "#6b7280" }]} numberOfLines={1}>
          {(item.code ? `${item.code} · ` : "") + (item.location ?? "—")}
        </Text>
        <Text style={[styles.siteCreated, { color: isDark ? "#64748b" : "#9ca3af" }]}>
          Created {created}
        </Text>
      </View>

      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.badgeText, { color: badgeColor }]}>{isActive ? "ACTIVE" : "INACTIVE"}</Text>
      </View>

      <View style={styles.actionsWrap}>
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); setActionsId(isOpen ? null : item.id); }}
          style={[styles.actionsBtn, {
            backgroundColor: isOpen ? (isDark ? "rgba(56,189,248,0.15)" : "rgba(14,165,233,0.1)") : "transparent",
            borderColor: isDark ? "#334155" : "#e2e8f0",
          }]}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={isDark ? "#94a3b8" : "#64748b"} />
        </Pressable>

        {isOpen && (
          <View style={[styles.dropdown, {
            backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff",
            borderColor: isDark ? "#334155" : "#e2e8f0",
          }]}>
            <Pressable
              style={({ pressed }) => [styles.dropdownItem, { backgroundColor: pressed ? (isDark ? "rgba(56,189,248,0.1)" : "rgba(14,165,233,0.06)") : "transparent" }]}
              onPress={() => { setActionsId(null); onManage(); }}
            >
              <Ionicons name="arrow-forward" size={15} color={isDark ? "#38bdf8" : "#0ea5e9"} />
              <Text style={[styles.dropdownText, { color: isDark ? "#e5e7eb" : "#111827" }]}>Manage</Text>
            </Pressable>
            <View style={[styles.divider, { backgroundColor: isDark ? "#1f2937" : "#e5e7eb" }]} />
            <Pressable
              style={({ pressed }) => [styles.dropdownItem, { backgroundColor: pressed ? "rgba(239,68,68,0.08)" : "transparent" }]}
              onPress={onDelete}
            >
              <Ionicons name="trash" size={15} color="#ef4444" />
              <Text style={[styles.dropdownText, { color: "#ef4444" }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerCard: { padding: 14, gap: 4 },
  searchCard: { padding: 12, gap: 10 },
  listCard: { flex: 1, paddingVertical: 2, overflow: "visible" as any },
  h1: { fontSize: 20, fontWeight: "900" },
  sub: { fontSize: 13, fontWeight: "700" },
  errorText: { color: "#f97373", fontWeight: "700", fontSize: 12, marginTop: 4 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  filterRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  filterLabel: { fontSize: 11, fontWeight: "700", marginLeft: "auto" as any },
  rowPressable: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    borderWidth: 1, borderRadius: 8, marginVertical: 3, marginHorizontal: 4,
    overflow: "visible" as any,
  },
  siteName: { fontSize: 15, fontWeight: "900" },
  siteMeta: { marginTop: 2, fontSize: 12, fontWeight: "700" },
  siteCreated: { marginTop: 2, fontSize: 11, fontWeight: "600" },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  actionsWrap: { position: "relative" },
  actionsBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  dropdown: {
    position: "absolute", top: 36, right: 0, minWidth: 160,
    borderWidth: 1, borderRadius: 10, paddingVertical: 4,
    zIndex: 9999, elevation: 9999,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 16,
  },
  dropdownItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  dropdownText: { fontSize: 13, fontWeight: "700" },
  divider: { height: 1, marginVertical: 2 },
  emptyWrap: { paddingVertical: 40, paddingHorizontal: 16, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "900" },
  emptySub: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  pillActive: { backgroundColor: "#bfdbfe", borderColor: "#60a5fa" },
  pillInactive: { backgroundColor: "rgba(255,255,255,0.7)", borderColor: "rgba(148,163,184,0.6)" },
  pillActiveDark: { backgroundColor: "rgba(56,189,248,0.22)", borderColor: "rgba(56,189,248,0.7)" },
  pillInactiveDark: { backgroundColor: "rgba(15,23,42,0.9)", borderColor: "rgba(51,65,85,0.9)" },
  pillText: { fontSize: 11, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#262D68" },
  addBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
  modalSub: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  fieldInput: { height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13, fontWeight: "700" },
  modalBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  cancelBtnText: { fontSize: 13, fontWeight: "800" },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#262D68" },
  saveBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },
});