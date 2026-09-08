import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { SearchablePickerModal } from "@/components/SearchablePickerModal";
import {
  apiAdminAllUsers,
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
type AssignmentType = "SUPERVISOR" | "ADMIN";

function nextJobNumberFrom(sites: AdminSiteListItemDto[]): string {
  let max = 0;
  for (const s of sites) {
    const code = (s.code ?? "").trim();
    if (!/^\d+$/.test(code)) continue;
    max = Math.max(max, Number(code));
  }
  return max > 0 ? String(max + 1) : "";
}

function formatClientName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

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
  const [newClient, setNewClient] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newLatitude, setNewLatitude] = useState("");
  const [newLongitude, setNewLongitude] = useState("");
  const [newAssignmentType, setNewAssignmentType] =
    useState<AssignmentType | null>(null);
  const [newAssignmentUserId, setNewAssignmentUserId] = useState<
    string | null
  >(null);
  const [createBusy, setCreateBusy] = useState(false);

  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [addClientVisible, setAddClientVisible] = useState(false);
  const [newClientDraft, setNewClientDraft] = useState("");
  const [extraClientOptions, setExtraClientOptions] = useState<string[]>([]);

  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);

  // Every client already used on a site, plus any just typed in the "Add
  // client" prompt this session — deduped and sorted for the picker.
  const clientOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const s of sites) {
      const c = formatClientName(s.client ?? "");
      if (c) byKey.set(c.toLowerCase(), c);
    }
    for (const c of extraClientOptions) {
      const cleaned = formatClientName(c);
      if (cleaned) byKey.set(cleaned.toLowerCase(), cleaned);
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [sites, extraClientOptions]);

  const assigneeLabel =
    newAssignmentType === "ADMIN" ? "Admin / Office" : "Supervisor";

  // Load the assignee list whenever "Managed By" changes while the create
  // modal is open (Admin/Office merges two roles, matching the web form).
  useEffect(() => {
    if (!createModalVisible || !newAssignmentType) {
      setAssigneeOptions([]);
      return;
    }
    let alive = true;
    (async () => {
      setLoadingAssignees(true);
      try {
        const roles =
          newAssignmentType === "ADMIN" ? ["ADMIN", "OFFICE"] : ["SUPERVISOR"];
        const results = await Promise.all(
          roles.map((role) => apiAdminAllUsers({ role })),
        );
        if (!alive) return;
        const users = results.flatMap((r) => r.users ?? []);
        setAssigneeOptions(
          users.map((u) => ({
            id: u.id,
            name: u.email ? `${u.name} (${u.email})` : u.name,
          })),
        );
      } catch {
        if (alive) setAssigneeOptions([]);
      } finally {
        if (alive) setLoadingAssignees(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [newAssignmentType, createModalVisible]);

  function resetCreateForm() {
    setNewName("");
    setNewCode("");
    setNewClient("");
    setNewLocation("");
    setNewAddress("");
    setNewLatitude("");
    setNewLongitude("");
    setNewAssignmentType(null);
    setNewAssignmentUserId(null);
  }

  function openCreateModal() {
    setNewCode((current) => current || nextJobNumberFrom(sites));
    setCreateModalVisible(true);
  }

  function handleAddClient() {
    const cleaned = formatClientName(newClientDraft);
    if (!cleaned) {
      Alert.alert("Error", "Client name is required.");
      return;
    }
    if (cleaned.length > 120) {
      Alert.alert("Error", "Client name must be 120 characters or less.");
      return;
    }
    setExtraClientOptions((prev) =>
      prev.some((c) => c.toLowerCase() === cleaned.toLowerCase())
        ? prev
        : [...prev, cleaned],
    );
    setNewClient(cleaned);
    setNewClientDraft("");
    setAddClientVisible(false);
  }

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

    let latitude: number | null = null;
    if (newLatitude.trim()) {
      const n = Number(newLatitude.trim());
      if (!Number.isFinite(n) || n < -90 || n > 90) {
        Alert.alert("Error", "Latitude must be between -90 and 90.");
        return;
      }
      latitude = n;
    }
    let longitude: number | null = null;
    if (newLongitude.trim()) {
      const n = Number(newLongitude.trim());
      if (!Number.isFinite(n) || n < -180 || n > 180) {
        Alert.alert("Error", "Longitude must be between -180 and 180.");
        return;
      }
      longitude = n;
    }
    if (newAssignmentType && !newAssignmentUserId) {
      Alert.alert("Error", "Please select who manages this site.");
      return;
    }

    setCreateBusy(true);
    try {
      const res = await apiAdminCreateSite({
        name: trimName,
        code: newCode.trim() || null,
        client: newClient.trim() || null,
        location: newLocation.trim() || null,
        address: newAddress.trim() || null,
        latitude,
        longitude,
        assignmentType: newAssignmentUserId ? newAssignmentType : null,
        assignmentUserId: newAssignmentUserId || null,
      });
      if (res.ok) {
        setCreateModalVisible(false);
        resetCreateForm();
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
            <Pressable onPress={openCreateModal} style={styles.addBtn}>
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

      {/* Create site modal — a plain overlay, not React Native's <Modal>.
      It needs to host SearchablePickerModal (Client/Assignee), which is
      also a plain overlay: a real native Modal always renders in its own
      top native layer above ordinary content, so a plain overlay nested
      inside one can never out-rank it via zIndex — it would render behind
      the native Modal no matter what. Keeping this as a plain overlay too
      makes it and the picker peers in the same layer, where zIndex works. */}
      {createModalVisible && (
      <View style={[StyleSheet.absoluteFill, { zIndex: 20000, elevation: 20000 }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
                <Text style={[styles.modalTitle, { color: textMain }]}>Create New Site</Text>
                <Text style={[styles.modalSub, { color: textSub }]}>Fill in the details for the new site.</Text>
                {[
                  { label: "Job Number", value: newCode, setter: setNewCode, placeholder: "Next job number" },
                  { label: "Name *", value: newName, setter: setNewName, placeholder: "e.g. Ellipse Phase 3" },
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

                <Text style={[styles.fieldLabel, { color: textSub }]}>Client (Optional)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setClientPickerOpen(true)}
                    style={[styles.pickerTrigger, { flex: 1, borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
                  >
                    <Text style={{ color: newClient ? textMain : (isDark ? "#64748b" : "#9ca3af"), fontWeight: "600", fontSize: 13, flex: 1 }} numberOfLines={1}>
                      {newClient || "Select client"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={textSub} />
                  </Pressable>
                  <Pressable
                    onPress={() => setAddClientVisible(true)}
                    style={[styles.iconBtn, { borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
                  >
                    <Ionicons name="add" size={18} color={textMain} />
                  </Pressable>
                </View>

                {[
                  { label: "Location", value: newLocation, setter: setNewLocation, placeholder: "e.g. Midrand, Gauteng" },
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

                <Text style={[styles.fieldLabel, { color: textSub }]}>Managed By (Optional)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["SUPERVISOR", "ADMIN"] as AssignmentType[]).map((type) => {
                    const active = newAssignmentType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          setNewAssignmentType(active ? null : type);
                          setNewAssignmentUserId(null);
                        }}
                        style={[
                          styles.pill,
                          active ? (isDark ? styles.pillActiveDark : styles.pillActive) : (isDark ? styles.pillInactiveDark : styles.pillInactive),
                          { flex: 1, alignItems: "center" },
                        ]}
                      >
                        <Text style={[styles.pillText, { color: active ? (isDark ? "#0f172a" : "#111827") : (isDark ? "#cbd5e1" : "#6b7280") }]}>
                          {type === "ADMIN" ? "Admin / Office" : "Supervisor"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {newAssignmentType && (
                  <>
                    <Text style={[styles.fieldLabel, { color: textSub }]}>{assigneeLabel}</Text>
                    <Pressable
                      onPress={() => setAssigneePickerOpen(true)}
                      style={[styles.pickerTrigger, { borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
                    >
                      <Text style={{ color: newAssignmentUserId ? textMain : (isDark ? "#64748b" : "#9ca3af"), fontWeight: "600", fontSize: 13, flex: 1 }} numberOfLines={1}>
                        {loadingAssignees
                          ? "Loading…"
                          : (assigneeOptions.find((a) => a.id === newAssignmentUserId)?.name ?? `Select ${assigneeLabel}`)}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={textSub} />
                    </Pressable>
                  </>
                )}

                <Text style={[styles.fieldLabel, { color: textSub }]}>Pin Location (Optional)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    value={newLatitude}
                    onChangeText={setNewLatitude}
                    placeholder="Latitude"
                    keyboardType="numbers-and-punctuation"
                    placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                    style={[styles.fieldInput, { flex: 1, color: textMain, borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
                  />
                  <TextInput
                    value={newLongitude}
                    onChangeText={setNewLongitude}
                    placeholder="Longitude"
                    keyboardType="numbers-and-punctuation"
                    placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                    style={[styles.fieldInput, { flex: 1, color: textMain, borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
                  />
                </View>

                <View style={styles.modalBtns}>
                  <Pressable
                    disabled={createBusy}
                    onPress={() => { if (!createBusy) { setCreateModalVisible(false); resetCreateForm(); } }}
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

        {/* Add Client */}
        <Modal
          visible={addClientVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAddClientVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxWidth: 360, backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
              <Text style={[styles.modalTitle, { color: textMain }]}>Add Client</Text>
              <Text style={[styles.modalSub, { color: textSub }]}>Add a client to the list and select it for this site.</Text>
              <TextInput
                value={newClientDraft}
                onChangeText={setNewClientDraft}
                placeholder="Client name"
                placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                autoCapitalize="characters"
                maxLength={120}
                style={[styles.fieldInput, { color: textMain, borderColor: isDark ? "#1f2937" : "#d1d5db", backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,1)" }]}
              />
              <View style={styles.modalBtns}>
                <Pressable onPress={() => { setAddClientVisible(false); setNewClientDraft(""); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: textSub }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleAddClient} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>Add Client</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
      )}

      <SearchablePickerModal
        visible={clientPickerOpen}
        title="Select Client"
        searchPlaceholder="Search clients…"
        allLabel="No client"
        options={clientOptions.map((c) => ({ id: c, name: c }))}
        selectedId={newClient || null}
        onSelect={(option) => setNewClient(option?.id ?? "")}
        onClose={() => setClientPickerOpen(false)}
        colors={{ textPrimary: textMain, textSecondary: textSub, border: borderCol }}
        isDark={isDark}
      />
      <SearchablePickerModal
        visible={assigneePickerOpen}
        title={`Select ${assigneeLabel}`}
        searchPlaceholder={`Search ${assigneeLabel.toLowerCase()}…`}
        showAllOption={false}
        options={assigneeOptions}
        selectedId={newAssignmentUserId}
        onSelect={(option) => setNewAssignmentUserId(option?.id ?? null)}
        onClose={() => setAssigneePickerOpen(false)}
        colors={{ textPrimary: textMain, textSecondary: textSub, border: borderCol }}
        isDark={isDark}
      />
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
            backgroundColor: isOpen ? (isDark ? "rgba(34,197,94,0.15)" : "rgba(22,163,74,0.1)") : "transparent",
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
              style={({ pressed }) => [styles.dropdownItem, { backgroundColor: pressed ? (isDark ? "rgba(34,197,94,0.1)" : "rgba(22,163,74,0.06)") : "transparent" }]}
              onPress={() => { setActionsId(null); onManage(); }}
            >
              <Ionicons name="arrow-forward" size={15} color={isDark ? "#22c55e" : "#16A34A"} />
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
  pillActive: { backgroundColor: "#bbf7d0", borderColor: "#4ade80" },
  pillInactive: { backgroundColor: "rgba(255,255,255,0.7)", borderColor: "rgba(148,163,184,0.6)" },
  pillActiveDark: { backgroundColor: "rgba(34,197,94,0.22)", borderColor: "rgba(34,197,94,0.7)" },
  pillInactiveDark: { backgroundColor: "rgba(15,23,42,0.9)", borderColor: "rgba(51,65,85,0.9)" },
  pillText: { fontSize: 11, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#16A34A" },
  addBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  // justifyContent must stay "flex-start" here, not "center": the create-site
  // form is taller than the screen on most phones, and centering content
  // inside a ScrollView makes the overflow portion untouchable — taps below
  // the fold silently do nothing even though the fields are visible.
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-start", alignItems: "center", padding: 16, paddingTop: 60 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
  modalSub: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  fieldInput: { height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13, fontWeight: "700" },
  pickerTrigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, gap: 8,
  },
  iconBtn: {
    width: 42, height: 42, borderWidth: 1, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  modalBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  cancelBtnText: { fontSize: 13, fontWeight: "800" },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#16A34A" },
  saveBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },
});