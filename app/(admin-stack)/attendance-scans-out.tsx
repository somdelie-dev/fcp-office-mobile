import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { SearchablePickerModal } from "@/components/SearchablePickerModal";
import {
  apiAdminAttendanceScansOut,
  type AdminAttendanceScanOutDto,
} from "@/lib/apiClient";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryImage";
import { getCurrentFortnight } from "@/lib/fortnight";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
    border: "rgba(148,163,184,0.2)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
    border: "rgba(0,0,0,0.1)",
  },
};

type FilterOption = { id: string; name: string; code?: string | null } | null;
type MethodTab = "ALL" | "FACE" | "PHOTO_BULK" | "MANUAL" | "FAILED";
type StatusFilter =
  | "VERIFIED"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "NOT_VERIFIED"
  | null;

const METHOD_TABS: { id: MethodTab; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "FACE", label: "Face" },
  { id: "PHOTO_BULK", label: "Photo/Bulk" },
  { id: "MANUAL", label: "Manual" },
  { id: "FAILED", label: "Failed" },
];

const STATUS_OPTIONS: { id: string; name: string }[] = [
  { id: "VERIFIED", name: "Verified" },
  { id: "PENDING_REVIEW", name: "Pending Review" },
  { id: "REJECTED", name: "Rejected" },
  { id: "NOT_VERIFIED", name: "Not Verified" },
];

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateOptionLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getMethodLabel(bucket: AdminAttendanceScanOutDto["methodBucket"]) {
  switch (bucket) {
    case "FACE":
      return "Face";
    case "PHOTO_BULK":
      return "Photo/Bulk";
    default:
      return "Manual";
  }
}

function getMethodIcon(
  bucket: AdminAttendanceScanOutDto["methodBucket"],
): keyof typeof Ionicons.glyphMap {
  switch (bucket) {
    case "FACE":
      return "scan";
    case "PHOTO_BULK":
      return "camera";
    default:
      return "person-add";
  }
}

function getVerificationLabel(
  status: AdminAttendanceScanOutDto["verificationStatus"],
) {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "PENDING_REVIEW":
      return "Pending Review";
    case "REJECTED":
      return "Rejected";
    default:
      return "Not Verified";
  }
}

function getVerificationColor(
  status: AdminAttendanceScanOutDto["verificationStatus"],
) {
  switch (status) {
    case "VERIFIED":
      return "#22c55e";
    case "PENDING_REVIEW":
      return "#f59e0b";
    case "REJECTED":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "#bbf7d0", fg: "#166534" },
  { bg: "#bfdbfe", fg: "#1e3a8a" },
  { bg: "#fed7aa", fg: "#9a3412" },
  { bg: "#ddd6fe", fg: "#5b21b6" },
  { bg: "#fbcfe8", fg: "#9d174d" },
  { bg: "#fde68a", fg: "#854d0e" },
] as const;

function avatarPaletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function ScanOutDetailModal({
  scan,
  visible,
  onClose,
  colors,
  isDark,
}: {
  scan: AdminAttendanceScanOutDto;
  visible: boolean;
  onClose: () => void;
  colors: (typeof themes)["light"];
  isDark: boolean;
}) {
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const hasLocation = scan.latitude && scan.longitude;
  const openMap = () => {
    if (hasLocation) {
      Linking.openURL(
        `https://www.google.com/maps?q=${scan.latitude},${scan.longitude}`,
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            modalStyles.sheet,
            { backgroundColor: isDark ? "#1e293b" : "#fff" },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={modalStyles.handleBar} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={modalStyles.profileSection}>
              {scan.employeePhotoUrl ? (
                <Image
                  source={{
                    uri:
                      optimizeCloudinaryUrl(scan.employeePhotoUrl, "detail") ??
                      scan.employeePhotoUrl,
                  }}
                  style={modalStyles.avatar}
                />
              ) : (
                <View
                  style={[
                    modalStyles.avatar,
                    modalStyles.avatarPlaceholder,
                    { backgroundColor: isDark ? "#334155" : "#e2e8f0" },
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={40}
                    color={isDark ? "#64748b" : "#94a3b8"}
                  />
                </View>
              )}
              <Text
                style={[
                  modalStyles.employeeName,
                  { color: colors.textPrimary },
                ]}
              >
                {scan.employeeName}
              </Text>
              <Text
                style={[
                  modalStyles.employeeCode,
                  { color: colors.textSecondary },
                ]}
              >
                Code: {scan.employeeCode}
              </Text>
            </View>

            <View
              style={[
                modalStyles.infoCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.03)",
                },
              ]}
            >
              <InfoRow icon="business" label="Site" value={scan.siteName} colors={colors} />
              <InfoRow
                icon="person"
                label="Foreman"
                value={scan.foremanName}
                colors={colors}
              />
              <InfoRow
                icon="log-in"
                label="Scanned In"
                value={formatTime(scan.scannedAtISO)}
                colors={colors}
              />
              <InfoRow
                icon="log-out"
                label="Scanned Out"
                value={formatTime(scan.scannedOutAtISO)}
                colors={colors}
              />
              <InfoRow
                icon={getMethodIcon(scan.methodBucket)}
                label="Method"
                value={getMethodLabel(scan.methodBucket)}
                colors={colors}
              />
              <InfoRow
                icon="shield-checkmark"
                label="Verification"
                value={getVerificationLabel(scan.verificationStatus)}
                colors={colors}
                valueColor={getVerificationColor(scan.verificationStatus)}
              />
              {scan.confidence != null && (
                <InfoRow
                  icon="analytics"
                  label="Confidence"
                  value={`${Math.round(scan.confidence * 100)}%`}
                  colors={colors}
                />
              )}
              {scan.device && (
                <InfoRow
                  icon="phone-portrait"
                  label="Device"
                  value={scan.device}
                  colors={colors}
                />
              )}
              {scan.address && (
                <InfoRow
                  icon="location"
                  label="Location"
                  value={scan.address}
                  colors={colors}
                />
              )}
            </View>

            {scan.scanOutPhotoUrl && (
              <View style={modalStyles.photoSection}>
                <Text
                  style={[
                    modalStyles.photoSectionLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Scan-out Photo
                </Text>
                <Pressable onPress={() => setPhotoFullscreen(true)}>
                  <Image
                    source={{ uri: scan.scanOutPhotoUrl }}
                    style={modalStyles.scanOutPhoto}
                  />
                </Pressable>
              </View>
            )}

            {hasLocation && (
              <Pressable onPress={openMap} style={modalStyles.mapBtn}>
                <Ionicons name="map" size={18} color="#fff" />
                <Text style={modalStyles.mapBtnText}>View on Map</Text>
              </Pressable>
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Text style={modalStyles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      {scan.scanOutPhotoUrl && (
        <Modal
          visible={photoFullscreen}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoFullscreen(false)}
        >
          <Pressable
            style={modalStyles.fullscreenBackdrop}
            onPress={() => setPhotoFullscreen(false)}
          >
            <Image
              source={{ uri: scan.scanOutPhotoUrl }}
              style={modalStyles.fullscreenImage}
              resizeMode="contain"
            />
            <Pressable
              style={modalStyles.fullscreenCloseBtn}
              onPress={() => setPhotoFullscreen(false)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

function InfoRow({
  icon,
  label,
  value,
  colors,
  valueColor,
}: {
  icon: any;
  label: string;
  value: string;
  colors: (typeof themes)["light"];
  valueColor?: string;
}) {
  return (
    <View style={modalStyles.infoRow}>
      <View style={modalStyles.infoLabel}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
        <Text
          style={[modalStyles.infoLabelText, { color: colors.textSecondary }]}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          modalStyles.infoValue,
          { color: valueColor ?? colors.textPrimary },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ScanOutRow({
  item,
  colors,
  onPress,
}: {
  item: AdminAttendanceScanOutDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
}) {
  const avatar = avatarPaletteFor(item.employeeId);
  const verificationColor = getVerificationColor(item.verificationStatus);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.scanCard,
        { borderColor: colors.rowBorder, backgroundColor: colors.cardBg },
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.scanIdentityRow}>
          {item.employeePhotoUrl ? (
            <Image
              source={{
                uri:
                  optimizeCloudinaryUrl(item.employeePhotoUrl, "thumbnail") ??
                  item.employeePhotoUrl,
              }}
              style={styles.avatarImg}
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
              <Text style={[styles.avatarText, { color: avatar.fg }]}>
                {initialsFor(item.employeeName)}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.scanName, { color: colors.textPrimary }]}>
              {item.employeeName}
            </Text>
            <Text style={[styles.scanSite, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.siteName}
            </Text>
          </View>
        </View>

        <View style={styles.scanRight}>
          <Text style={[styles.scanTime, { color: colors.textPrimary }]}>
            {formatTime(item.scannedOutAtISO)}
          </Text>
          <View
            style={[
              styles.verifyBadge,
              { borderColor: verificationColor },
            ]}
          >
            <Text style={[styles.verifyBadgeText, { color: verificationColor }]}>
              {getVerificationLabel(item.verificationStatus)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.methodBadgeRow}>
          <Ionicons
            name={getMethodIcon(item.methodBucket)}
            size={12}
            color={colors.textSecondary}
          />
          <Text style={[styles.methodText, { color: colors.textSecondary }]}>
            {getMethodLabel(item.methodBucket)}
          </Text>
          {item.confidence != null && (
            <Text style={[styles.methodText, { color: colors.textSecondary }]}>
              · {Math.round(item.confidence * 100)}%
            </Text>
          )}
        </View>
        <View style={styles.footerRight}>
          {item.device && (
            <Text
              style={[styles.deviceText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.device}
            </Text>
          )}
          {item.scanOutPhotoUrl && (
            <Image
              source={{ uri: item.scanOutPhotoUrl }}
              style={styles.rowPhotoThumb}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function AttendanceScansOutScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";

  const [scans, setScans] = useState<AdminAttendanceScanOutDto[]>([]);
  const [sites, setSites] = useState<
    { id: string; name: string; code: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSite, setFilterSite] = useState<FilterOption>(null);
  const [siteFilterOpen, setSiteFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(null);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [methodTab, setMethodTab] = useState<MethodTab>("ALL");
  const [selectedDate, setSelectedDate] = useState(() => todayISODate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedScan, setSelectedScan] =
    useState<AdminAttendanceScanOutDto | null>(null);

  const fortnightDates = useMemo(() => {
    const current = getCurrentFortnight();
    const today = todayISODate();
    const endISO = current.endISO < today ? current.endISO : today;
    const out: { id: string; name: string }[] = [];
    for (
      let d = new Date(`${current.startISO}T00:00:00`);
      d <= new Date(`${endISO}T00:00:00`);
      d.setDate(d.getDate() + 1)
    ) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ id: iso, name: dateOptionLabel(iso) });
    }
    return out.reverse();
  }, []);

  const load = useCallback(async (dateISO: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdminAttendanceScansOut({ date: dateISO });
      setScans(res.scans ?? []);
      setSites(res.sites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scan-outs.");
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async (dateISO: string) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiAdminAttendanceScansOut({ date: dateISO });
      setScans(res.scans ?? []);
      setSites(res.sites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(selectedDate);
    }, [load, selectedDate]),
  );

  // Every filter here is applied client-side against the already-loaded
  // day's scan-outs, matching attendance-scans.tsx's convention — the
  // endpoint only returns one day at a time, so only the date needs a
  // round trip.
  const filteredScans = useMemo(() => {
    let list = scans;
    if (filterSite) list = list.filter((s) => s.siteId === filterSite.id);
    if (methodTab === "FAILED") {
      list = list.filter((s) => s.verificationStatus === "REJECTED");
    } else if (methodTab !== "ALL") {
      list = list.filter((s) => s.methodBucket === methodTab);
    }
    if (filterStatus) {
      list =
        filterStatus === "NOT_VERIFIED"
          ? list.filter((s) => s.verificationStatus === null)
          : list.filter((s) => s.verificationStatus === filterStatus);
    }
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.employeeName.toLowerCase().includes(q) ||
          s.employeeCode.toLowerCase().includes(q),
      );
    }
    return list;
  }, [scans, filterSite, methodTab, filterStatus, searchText]);

  const hasActiveFilters =
    !!searchText.trim() || !!filterSite || !!filterStatus || methodTab !== "ALL";

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Scans Out
          </Text>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View
            style={[
              styles.searchBox,
              { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search personnel name or code…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        {/* Method tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.methodTabScroll}
          contentContainerStyle={styles.methodTabBar}
        >
          {METHOD_TABS.map((tab) => {
            const active = methodTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setMethodTab(tab.id)}
                style={[
                  styles.methodTabChip,
                  {
                    borderColor: active ? "#22c55e" : colors.rowBorder,
                    backgroundColor: active
                      ? "rgba(34,197,94,0.15)"
                      : colors.inputBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.methodTabText,
                    { color: active ? "#22c55e" : colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Site / Status filter dropdowns */}
        <View style={styles.filterBar}>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setSiteFilterOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                { color: filterSite ? colors.textPrimary : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {filterSite
                ? filterSite.code
                  ? `${filterSite.code} - ${filterSite.name}`
                  : filterSite.name
                : "All Sites"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setStatusFilterOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                {
                  color: filterStatus ? colors.textPrimary : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {filterStatus
                ? STATUS_OPTIONS.find((o) => o.id === filterStatus)?.name
                : "All Status"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>

        <SearchablePickerModal
          visible={siteFilterOpen}
          title="Filter by Site"
          searchPlaceholder="Search sites or job number…"
          allLabel="All Sites"
          options={sites}
          selectedId={filterSite?.id ?? null}
          onSelect={setFilterSite}
          onClose={() => setSiteFilterOpen(false)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={statusFilterOpen}
          title="Filter by Verification Status"
          searchPlaceholder="Search status…"
          allLabel="All Status"
          options={STATUS_OPTIONS}
          selectedId={filterStatus}
          onSelect={(opt) => setFilterStatus((opt?.id as StatusFilter) ?? null)}
          onClose={() => setStatusFilterOpen(false)}
          colors={colors}
          isDark={isDark}
        />

        {/* Date dropdown */}
        <Pressable
          style={styles.dateHeadingRow}
          onPress={() => setDatePickerOpen(true)}
        >
          <View style={styles.dateHeadingLabel}>
            <Text style={[styles.dateHeading, { color: colors.textPrimary }]}>
              {dateOptionLabel(selectedDate)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </View>
          <Text style={[styles.dateHeadingCount, { color: colors.textSecondary }]}>
            {filteredScans.length} scan{filteredScans.length === 1 ? "" : "s"} out
          </Text>
        </Pressable>
        <SearchablePickerModal
          visible={datePickerOpen}
          title="Select a date"
          searchPlaceholder="Search dates…"
          showAllOption={false}
          options={fortnightDates}
          selectedId={selectedDate}
          onSelect={(option) => option && setSelectedDate(option.id)}
          onClose={() => setDatePickerOpen(false)}
          colors={colors}
          isDark={isDark}
        />

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading scan-outs…" message="Please wait" />
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={() => load(selectedDate)} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredScans.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="log-out-outline" size={64} color={colors.emptyText} />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {hasActiveFilters
                ? "No scan-outs match your filters"
                : `No scan-outs on ${dateOptionLabel(selectedDate)}`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredScans}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ScanOutRow
                item={item}
                colors={colors}
                onPress={() => setSelectedScan(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => refresh(selectedDate)}
              />
            }
          />
        )}

        {selectedScan && (
          <ScanOutDetailModal
            scan={selectedScan}
            visible={!!selectedScan}
            onClose={() => setSelectedScan(null)}
            colors={colors}
            isDark={isDark}
          />
        )}
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
  },
  title: { fontSize: 18, fontWeight: "900" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  methodTabScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  methodTabBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    alignItems: "center",
  },
  methodTabChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  methodTabText: { fontSize: 12, fontWeight: "800" },

  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterTrigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
  },
  filterTriggerText: { flex: 1, fontSize: 13, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  dateHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  dateHeadingLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateHeading: { fontSize: 18, fontWeight: "900" },
  dateHeadingCount: { fontSize: 13, fontWeight: "700" },

  scanCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  scanIdentityRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontSize: 14, fontWeight: "900" },
  scanName: { fontSize: 15, fontWeight: "800" },
  scanSite: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  scanRight: { alignItems: "flex-end", gap: 6, flexShrink: 0 },
  scanTime: { fontSize: 15, fontWeight: "800" },

  verifyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  verifyBadgeText: { fontSize: 10, fontWeight: "800" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 8,
  },
  methodBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  methodText: { fontSize: 12, fontWeight: "700" },
  deviceText: { fontSize: 11, fontWeight: "600", maxWidth: 130 },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowPhotoThumb: {
    width: 28,
    height: 28,
    borderRadius: 5,
    backgroundColor: "#0f172a",
  },

  errorWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#22c55e",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: { fontSize: 16, textAlign: "center", marginTop: 16 },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94a3b8",
    alignSelf: "center",
    marginBottom: 16,
  },
  profileSection: { alignItems: "center", marginBottom: 20 },
  avatar: { width: 110, height: 110, borderRadius: 5 },
  avatarPlaceholder: { justifyContent: "center", alignItems: "center" },
  employeeName: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  employeeCode: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  infoCard: { borderRadius: 5, padding: 16, gap: 14, marginBottom: 16 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: { flexDirection: "row", alignItems: "center", gap: 8, flex: 0.45 },
  infoLabelText: { fontSize: 13, fontWeight: "600" },
  infoValue: {
    fontSize: 13,
    fontWeight: "700",
    flex: 0.55,
    textAlign: "right",
  },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22c55e",
    paddingVertical: 12,
    borderRadius: 5,
    gap: 8,
    marginBottom: 12,
  },
  mapBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  closeBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 5,
    backgroundColor: "rgba(148,163,184,0.15)",
    marginTop: 4,
  },
  closeBtnText: { fontSize: 15, fontWeight: "700", color: "#64748b" },

  photoSection: { marginBottom: 16, gap: 8 },
  photoSectionLabel: { fontSize: 13, fontWeight: "800" },
  scanOutPhoto: {
    width: "100%",
    height: 220,
    borderRadius: 8,
    backgroundColor: "#0f172a",
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: { width: "90%", height: "75%" },
  fullscreenCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});
