import { Ionicons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import {
  apiSupervisorRequestPhoto,
  apiSupervisorSitePhotoRequests,
  apiSupervisorSites,
  apiSupervisorSiteToday,
  apiSupervisorSiteWageTotals,
  type SupervisorSiteListItemDto,
  type SupervisorSitePhotoRequestDto,
  type SupervisorTodayAttendanceDto,
} from "@/lib/apiClient";
import { useDataCache } from "@/lib/dataCache";
import { useTheme } from "@/lib/themeContext";

// --- theme colors ---
const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#38bdf8",
    accentOverlay: "rgba(56,189,248,0.9)",
    accentLight: "rgba(56,189,248,0.18)",
    accentBorder: "rgba(56,189,248,0.45)",
    accentSelected: "rgba(56,189,248,0.12)",
    success: "#16a34a",
    error: "#dc2626",
    modalOverlay: "rgba(0,0,0,0.6)",
    buttonBg: "rgba(148,163,184,0.2)",
    accentDisabled: "rgba(56,189,248,0.35)",
    sheetBg: "#0f172a",
    sheetHandle: "rgba(148,163,184,0.35)",
    sheetDivider: "rgba(148,163,184,0.18)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#0ea5e9",
    accentOverlay: "rgba(14,165,233,0.9)",
    accentLight: "rgba(14,165,233,0.08)",
    accentBorder: "rgba(14,165,233,0.3)",
    accentSelected: "rgba(14,165,233,0.06)",
    success: "#22c55e",
    error: "#ef4444",
    modalOverlay: "rgba(0,0,0,0.35)",
    buttonBg: "rgba(100,116,139,0.1)",
    accentDisabled: "rgba(14,165,233,0.35)",
    sheetBg: "#ffffff",
    sheetHandle: "rgba(100,116,139,0.35)",
    sheetDivider: "rgba(100,116,139,0.16)",
  },
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function niceStatus(s: string) {
  return (s || "").replaceAll("_", " ");
}

function SiteTitle(site: SupervisorSiteListItemDto) {
  return `${site.code ? site.code + " · " : ""}${site.name}`;
}

function Card({
  colors,
  children,
  style,
}: {
  colors: (typeof themes)["dark"];
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgSecondary,
          borderRadius: 12,
          padding: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type SiteDetailData = {
  today: SupervisorTodayAttendanceDto | null;
  requests: SupervisorSitePhotoRequestDto[];
  totals: null | {
    totalWages: number;
    totalWorkerDays: number;
    averageDayRate?: number | null;
  };
};

function SiteDetailSheet({
  open,
  onClose,
  colors,
  site,
  fromISO,
  toISO,
  loading,
  error,
  data,
  onRefresh,
  onRequestPhoto,
}: {
  open: boolean;
  onClose: () => void;
  colors: (typeof themes)["dark"];
  site: SupervisorSiteListItemDto | null;
  fromISO: string;
  toISO: string;
  loading: boolean;
  error: string | null;
  data: SiteDetailData;
  onRefresh: () => Promise<void>;
  onRequestPhoto: (note?: string) => Promise<void>;
}) {
  const [noteModal, setNoteModal] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setNoteModal(false);
      setNote("");
      setSending(false);
    }
  }, [open]);

  const request = useCallback(async () => {
    setSending(true);
    try {
      await onRequestPhoto(note.trim() || undefined);
      setNote("");
      setNoteModal(false);
    } finally {
      setSending(false);
    }
  }, [note, onRequestPhoto]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.modalOverlay,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.sheetBg,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingTop: 8,
            paddingHorizontal: 14,
            paddingBottom: 14,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 48,
              height: 5,
              borderRadius: 999,
              backgroundColor: colors.sheetHandle,
              marginBottom: 10,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontWeight: "900",
                  fontSize: 16,
                }}
                numberOfLines={1}
              >
                {site ? SiteTitle(site) : "Site"}
              </Text>
              <Text
                style={{ color: colors.textSecondary, marginTop: 4 }}
                numberOfLines={1}
              >
                Wage totals {fromISO} → {toISO}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={onRefresh}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgSecondary,
                }}
              >
                {loading ? (
                  <ActivityIndicator />
                ) : (
                  <Ionicons
                    name="refresh"
                    size={18}
                    color={colors.textSecondary}
                  />
                )}
              </Pressable>

              <Pressable
                onPress={onClose}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgSecondary,
                }}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={{ height: 12 }} />

          {error ? (
            <Card colors={colors}>
              <Text style={{ color: colors.error, fontWeight: "900" }}>
                {error}
              </Text>
              <View style={{ height: 10 }} />
              <Pressable
                onPress={onRefresh}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: colors.error,
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Try Again
                </Text>
              </Pressable>
            </Card>
          ) : (
            <>
              <Card colors={colors}>
                <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
                  Today
                </Text>
                <View style={{ height: 8 }} />

                {loading ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator />
                    <Text
                      style={{ color: colors.textSecondary, fontWeight: "800" }}
                    >
                      Loading…
                    </Text>
                  </View>
                ) : data.today ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.textTertiary }}>
                      Scans:{" "}
                      <Text
                        style={{ color: colors.textPrimary, fontWeight: "900" }}
                      >
                        {data.today.scannedCount}
                      </Text>
                    </Text>

                    <Text style={{ color: colors.textTertiary }}>
                      Ready to submit:{" "}
                      <Text
                        style={{
                          color: data.today.readyToSubmit
                            ? colors.success
                            : colors.error,
                          fontWeight: "900",
                        }}
                      >
                        {data.today.readyToSubmit ? "YES" : "NO"}
                      </Text>
                    </Text>

                    <Text style={{ color: colors.textTertiary }}>
                      Locked:{" "}
                      <Text
                        style={{
                          color: data.today.isLocked
                            ? colors.success
                            : colors.textSecondary,
                          fontWeight: "900",
                        }}
                      >
                        {data.today.isLocked ? "YES" : "NO"}
                      </Text>
                    </Text>

                    <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
                      Foremen on site:{" "}
                      {data.today.foremenOnSite?.length
                        ? data.today.foremenOnSite.map((f) => f.name).join(", ")
                        : "-"}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary }}>
                    No data yet.
                  </Text>
                )}
              </Card>

              <View style={{ height: 12 }} />

              <Card colors={colors}>
                <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
                  Wage totals
                </Text>
                <View style={{ height: 10 }} />

                {loading ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator />
                    <Text
                      style={{ color: colors.textSecondary, fontWeight: "800" }}
                    >
                      Loading…
                    </Text>
                  </View>
                ) : data.totals ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.textTertiary }}>
                      Team days:{" "}
                      <Text
                        style={{ color: colors.textPrimary, fontWeight: "900" }}
                      >
                        {data.totals.totalWorkerDays}
                      </Text>
                    </Text>
                    <Text style={{ color: colors.textTertiary }}>
                      Total wages:{" "}
                      <Text
                        style={{ color: colors.textPrimary, fontWeight: "900" }}
                      >
                        R {Number(data.totals.totalWages ?? 0).toFixed(2)}
                      </Text>
                    </Text>
                    <Text style={{ color: colors.textTertiary }}>
                      Avg rate:{" "}
                      <Text
                        style={{ color: colors.textPrimary, fontWeight: "900" }}
                      >
                        {data.totals.averageDayRate == null
                          ? "-"
                          : `R ${Number(data.totals.averageDayRate).toFixed(2)}`}
                      </Text>
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary }}>
                    No totals yet.
                  </Text>
                )}
              </Card>

              <View style={{ height: 12 }} />

              <Card colors={colors}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ color: colors.textPrimary, fontWeight: "900" }}
                  >
                    Photo requests
                  </Text>

                  <Pressable
                    onPress={() => setNoteModal(true)}
                    disabled={!site}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: colors.accentLight,
                      borderWidth: 1,
                      borderColor: colors.accentBorder,
                      opacity: !site ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: colors.accent, fontWeight: "900" }}>
                      Request
                    </Text>
                  </Pressable>
                </View>

                <View style={{ height: 10 }} />

                {loading ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator />
                    <Text
                      style={{ color: colors.textSecondary, fontWeight: "800" }}
                    >
                      Loading…
                    </Text>
                  </View>
                ) : data.requests?.length ? (
                  <View style={{ gap: 10 }}>
                    {data.requests.slice(0, 6).map((r) => (
                      <View
                        key={r.id}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          padding: 10,
                          backgroundColor: colors.bgSecondary,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textPrimary,
                            fontWeight: "900",
                          }}
                        >
                          {niceStatus(r.status)}
                        </Text>
                        <Text
                          style={{ color: colors.textSecondary, marginTop: 4 }}
                        >
                          Requested:{" "}
                          {r.requestedAt?.slice(0, 19).replace("T", " ")}
                        </Text>
                        {!!r.note && (
                          <Text
                            style={{ color: colors.textTertiary, marginTop: 6 }}
                          >
                            Note: {r.note}
                          </Text>
                        )}
                        <Text
                          style={{ color: colors.textSecondary, marginTop: 6 }}
                        >
                          Photos: {r.photoCount}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary }}>
                    No photo requests.
                  </Text>
                )}
              </Card>
            </>
          )}

          <Modal
            visible={noteModal}
            transparent
            animationType="fade"
            onRequestClose={() => setNoteModal(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: colors.modalOverlay,
                justifyContent: "center",
                padding: 16,
              }}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{
                  backgroundColor: colors.bgSecondary,
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontWeight: "900",
                    fontSize: 16,
                  }}
                >
                  Request group photo
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
                  Optional note to the foreman.
                </Text>

                <View style={{ height: 10 }} />

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Optional note…"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    color: colors.textPrimary,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 44,
                  }}
                  multiline
                />

                <View style={{ height: 12 }} />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => setNoteModal(false)}
                    disabled={sending}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: colors.buttonBg,
                      opacity: sending ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{ color: colors.textTertiary, fontWeight: "900" }}
                    >
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={request}
                    disabled={sending || !site}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: sending
                        ? colors.accentDisabled
                        : colors.accentOverlay,
                      opacity: !site && !sending ? 0.5 : 1,
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {sending ? (
                      <ActivityIndicator />
                    ) : (
                      <Ionicons
                        name="send"
                        size={16}
                        color={colors.textPrimary}
                      />
                    )}
                    <Text
                      style={{ color: colors.textPrimary, fontWeight: "900" }}
                    >
                      {sending ? "Sending…" : "Send"}
                    </Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ReportsScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];

  const {
    supervisorSites,
    setSupervisorSites,
    supervisorSiteDetail,
    setSupervisorSiteDetail,
    isFresh,
  } = useDataCache();

  // ✅ Refs to avoid dependency loops
  const supervisorSitesRef = useRef(supervisorSites);
  useEffect(() => {
    supervisorSitesRef.current = supervisorSites;
  }, [supervisorSites]);

  const isFreshRef = useRef(isFresh);
  useEffect(() => {
    isFreshRef.current = isFresh;
  }, [isFresh]);

  const siteDetailRef = useRef(supervisorSiteDetail);
  useEffect(() => {
    siteDetailRef.current = supervisorSiteDetail;
  }, [supervisorSiteDetail]);

  // Past 14 days (including today)
  const { startISO: fromISO, endISO: toISO } = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 13);
    return { startISO: isoDate(start), endISO: isoDate(end) };
  }, []);

  // list state
  const [sites, setSites] = useState<SupervisorSiteListItemDto[]>([]);
  const [siteQuery, setSiteQuery] = useState("");
  const [loadingSites, setLoadingSites] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSite, setActiveSite] =
    useState<SupervisorSiteListItemDto | null>(null);

  const [loadingSiteData, setLoadingSiteData] = useState(false);
  const [siteDataError, setSiteDataError] = useState<string | null>(null);

  const [today, setToday] = useState<SupervisorTodayAttendanceDto | null>(null);
  const [requests, setRequests] = useState<SupervisorSitePhotoRequestDto[]>([]);
  const [totals, setTotals] = useState<SiteDetailData["totals"]>(null);

  // ✅ Stable + NO dependencies on supervisorSites / isFresh / siteQuery
  const loadSites = useCallback(
    async (opts?: { force?: boolean; q?: string }) => {
      const q = (opts?.q ?? "").trim();
      const force = !!opts?.force;

      const cached = supervisorSitesRef.current;

      if (!q && !force && cached && isFreshRef.current(cached.timestamp)) {
        setSites(cached.data ?? []);
        return;
      }

      const res = await apiSupervisorSites({
        q: q || undefined,
        show: "active",
      });

      const list = res.sites ?? [];
      setSites(list);

      if (!q) setSupervisorSites(list);
    },
    [setSupervisorSites],
  );

  const loadSiteData = useCallback(
    async (siteId: string, force = false) => {
      const cachedEntry = siteDetailRef.current?.[siteId];
      if (!force && cachedEntry && isFreshRef.current(cachedEntry.timestamp)) {
        const cached = cachedEntry.data;
        setToday(cached.today ?? null);
        setRequests(cached.requests ?? []);
        setTotals(cached.totals ?? null);
        return;
      }

      setLoadingSiteData(true);
      setSiteDataError(null);

      try {
        const [todayRes, reqRes, totalsRes] = await Promise.all([
          apiSupervisorSiteToday(siteId),
          apiSupervisorSitePhotoRequests(siteId),
          apiSupervisorSiteWageTotals({ siteId, from: fromISO, to: toISO }),
        ]);

        const today = (todayRes as any).data ?? null;
        const requests = (reqRes as any).requests ?? [];
        const totals = (totalsRes as any).totals ?? null;

        setToday(today);
        setRequests(requests);
        setTotals(totals);

        setSupervisorSiteDetail(siteId, { today, requests, totals });
      } catch (e: any) {
        setSiteDataError(e?.message ?? "Failed to load site data");
      } finally {
        setLoadingSiteData(false);
      }
    },
    [fromISO, toISO, setSupervisorSiteDetail],
  );

  // ✅ Initial load runs once (no [loadSites] dependency)
  useEffect(() => {
    (async () => {
      try {
        setLoadingSites(true);
        setError(null);
        await loadSites({ force: true, q: "" });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load sites");
      } finally {
        setLoadingSites(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Debounced search only reacts to siteQuery
  useEffect(() => {
    const t = setTimeout(() => {
      (async () => {
        try {
          setLoadingSites(true);
          setError(null);
          await loadSites({ force: true, q: siteQuery });
        } catch (e: any) {
          setError(e?.message ?? "Failed to load sites");
        } finally {
          setLoadingSites(false);
        }
      })();
    }, 400);

    return () => clearTimeout(t);
  }, [siteQuery, loadSites]);

  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);

      await loadSites({ force: true, q: siteQuery });

      if (activeSite?.id && sheetOpen) {
        await loadSiteData(activeSite.id, true);
      }
    } catch (e: any) {
      Alert.alert("Refresh failed", e?.message ?? "Unknown error");
    } finally {
      setRefreshing(false);
    }
  }, [loadSites, loadSiteData, activeSite?.id, sheetOpen, siteQuery]);

  const openSite = useCallback(
    async (site: SupervisorSiteListItemDto) => {
      setActiveSite(site);
      setSheetOpen(true);
      await loadSiteData(site.id, false);
    },
    [loadSiteData],
  );

  const refreshSite = useCallback(async () => {
    if (!activeSite?.id) return;
    await loadSiteData(activeSite.id, true);
  }, [activeSite?.id, loadSiteData]);

  const requestPhoto = useCallback(
    async (note?: string) => {
      if (!activeSite?.id) return;
      try {
        await apiSupervisorRequestPhoto({
          siteId: activeSite.id,
          note: note?.trim() || undefined,
        });
        Alert.alert("Requested", "Photo request sent to the foreman.");
        await loadSiteData(activeSite.id, true);
      } catch (e: any) {
        Alert.alert("Request failed", e?.message ?? "Unknown error");
      }
    },
    [activeSite?.id, loadSiteData],
  );

  return (
    <AuthStyleBackground>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 20,
        }}
      >
        <Text
          style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900" }}
        >
          Reports
        </Text>

        <View style={{ height: 12 }} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={siteQuery}
              onChangeText={setSiteQuery}
              placeholder="Search sites..."
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgSecondary,
                color: colors.textPrimary,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
              returnKeyType="search"
            />
          </View>

          <Pressable
            onPress={refreshAll}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgSecondary,
            }}
          >
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={{ height: 12 }} />

        {loadingSites ? (
          <Card colors={colors}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <ActivityIndicator />
              <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>
                Loading sites…
              </Text>
            </View>
          </Card>
        ) : error ? (
          <Card colors={colors}>
            <Text style={{ color: colors.error, fontWeight: "900" }}>
              {error}
            </Text>
            <View style={{ height: 10 }} />
            <Pressable
              onPress={refreshAll}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: colors.error,
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                alignSelf: "flex-start",
              }}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900" }}>
                Try Again
              </Text>
            </Pressable>
          </Card>
        ) : (
          <FlatList
            data={sites}
            keyExtractor={(s) => s.id}
            scrollEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshAll}
                tintColor={colors.accent}
              />
            }
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openSite(item)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bgSecondary,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
                  {SiteTitle(item)}
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                  Foremen: {item.foremenCount} ·{" "}
                  {item.isActive ? "Active" : "Inactive"}
                </Text>

                <View style={{ position: "absolute", right: 12, top: 14 }}>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textSecondary}
                  />
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ paddingTop: 12 }}>
                <Text style={{ color: colors.textSecondary }}>
                  No sites found.
                </Text>
              </View>
            }
          />
        )}

        <SiteDetailSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          colors={colors}
          site={activeSite}
          fromISO={fromISO}
          toISO={toISO}
          loading={loadingSiteData}
          error={siteDataError}
          data={{ today, requests, totals }}
          onRefresh={refreshSite}
          onRequestPhoto={requestPhoto}
        />
      </ScrollView>
    </AuthStyleBackground>
  );
}
