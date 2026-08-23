import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
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
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminAttendanceScans,
  apiEmployees,
  type AdminAttendanceScanDto,
} from "@/lib/apiClient";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryImage";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
  },
};

type FilterSite = { id: string; name: string } | null;

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function getScanOutMethodLabel(
  method: AdminAttendanceScanDto["scanOutMethod"],
): string | null {
  switch (method) {
    case "FINGERPRINT":
      return "Fingerprint";
    case "FACE":
      return "Face";
    case "PHOTO":
      return "Photo";
    default:
      return null;
  }
}

function getScanOutMethodIcon(
  method: AdminAttendanceScanDto["scanOutMethod"],
): keyof typeof Ionicons.glyphMap {
  switch (method) {
    case "FINGERPRINT":
      return "finger-print";
    case "FACE":
      return "scan";
    case "PHOTO":
      return "camera";
    default:
      return "log-out";
  }
}

function getVerificationLabel(
  status: AdminAttendanceScanDto["verificationStatus"],
): string | null {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "PENDING_REVIEW":
      return "Pending Review";
    case "REJECTED":
      return "Rejected";
    default:
      return null;
  }
}

function getVerificationColor(
  status: AdminAttendanceScanDto["verificationStatus"],
): string | undefined {
  switch (status) {
    case "VERIFIED":
      return "#22c55e";
    case "PENDING_REVIEW":
      return "#f59e0b";
    case "REJECTED":
      return "#ef4444";
    default:
      return undefined;
  }
}

function ScanDetailModal({
  scan,
  photoUrl,
  visible,
  onClose,
  colors,
  isDark,
}: {
  scan: AdminAttendanceScanDto;
  photoUrl: string | null;
  visible: boolean;
  onClose: () => void;
  colors: (typeof themes)["light"];
  isDark: boolean;
}) {
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const isManual = scan.scanType === "MANUAL";
  const hasOvertime = scan.overtimeType && scan.overtimeType !== "NONE";
  const overtimeLabel =
    scan.overtimeType === "HALF_DAY"
      ? "½ Day OT"
      : scan.overtimeType === "FULL_DAY"
        ? "Full Day OT"
        : null;
  const hasLocation = scan.latitude && scan.longitude;

  const openMap = () => {
    if (hasLocation) {
      Linking.openURL(
        `https://www.google.com/maps?q=${scan.latitude},${scan.longitude}`,
      );
    }
  };

  const workDate = new Date(scan.workDateISO).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const scanTime = new Date(scan.scannedAtISO).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

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
          {/* Close handle */}
          <View style={modalStyles.handleBar} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Employee Photo + Name */}
            <View style={modalStyles.profileSection}>
              {photoUrl ? (
                <Pressable onPress={() => setPhotoFullscreen(true)}>
                  <Image
                    source={{
                      uri:
                        optimizeCloudinaryUrl(photoUrl, "detail") ?? photoUrl,
                    }}
                    style={modalStyles.avatar}
                  />
                </Pressable>
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

            {/* Info Rows */}
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
              <InfoRow
                icon="calendar"
                label="Work Date"
                value={workDate}
                colors={colors}
              />
              <InfoRow
                icon="time"
                label="Scanned At"
                value={scanTime}
                colors={colors}
              />
              <InfoRow
                icon="business"
                label="Site"
                value={scan.siteName}
                colors={colors}
              />
              <InfoRow
                icon="person"
                label="Foreman"
                value={scan.foremanName}
                colors={colors}
              />
              {scan.supervisorName && (
                <InfoRow
                  icon="shield"
                  label="Supervisor"
                  value={scan.supervisorName}
                  colors={colors}
                />
              )}
              <InfoRow
                icon={isManual ? "person-add" : "qr-code"}
                label="Scan Type"
                value={isManual ? "Manual Entry" : "QR Code"}
                colors={colors}
              />
              {hasOvertime && overtimeLabel && (
                <InfoRow
                  icon="timer"
                  label="Overtime"
                  value={overtimeLabel}
                  colors={colors}
                  valueColor="#22c55e"
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
              {scan.scannedOutAtISO ? (
                <>
                  <InfoRow
                    icon="log-out"
                    label="Scanned Out"
                    value={new Date(scan.scannedOutAtISO).toLocaleTimeString(
                      "en-US",
                      { hour: "2-digit", minute: "2-digit", hour12: true },
                    )}
                    colors={colors}
                  />
                  <InfoRow
                    icon={getScanOutMethodIcon(scan.scanOutMethod)}
                    label="Scan Out Method"
                    value={getScanOutMethodLabel(scan.scanOutMethod) ?? "—"}
                    colors={colors}
                  />
                  <InfoRow
                    icon="shield-checkmark"
                    label="Verification"
                    value={getVerificationLabel(scan.verificationStatus) ?? "—"}
                    colors={colors}
                    valueColor={getVerificationColor(scan.verificationStatus)}
                  />
                </>
              ) : (
                <InfoRow
                  icon="log-out-outline"
                  label="Scan Out"
                  value="Not scanned out"
                  colors={colors}
                />
              )}
            </View>

            {/* Map Button */}
            {hasLocation && (
              <Pressable onPress={openMap} style={modalStyles.mapBtn}>
                <Ionicons name="map" size={18} color="#fff" />
                <Text style={modalStyles.mapBtnText}>View on Map</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Close button */}
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Text style={modalStyles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      {/* Fullscreen Photo Viewer */}
      {photoUrl && (
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
              source={{
                uri: optimizeCloudinaryUrl(photoUrl, "original") ?? photoUrl,
              }}
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

function ScanRow({
  item,
  colors,
  onPress,
}: {
  item: AdminAttendanceScanDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
}) {
  const isManual = item.scanType === "MANUAL";
  const hasOvertime = item.overtimeType && item.overtimeType !== "NONE";
  const overtimeLabel =
    item.overtimeType === "HALF_DAY"
      ? "½ OT"
      : item.overtimeType === "FULL_DAY"
        ? "Full OT"
        : null;
  const hasLocation = item.latitude && item.longitude;

  const openMap = () => {
    if (hasLocation) {
      Linking.openURL(
        `https://www.google.com/maps?q=${item.latitude},${item.longitude}`,
      );
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={[styles.scanRow, { borderBottomColor: colors.rowBorder }]}
    >
      {/* Left: Employee + Code */}
      <View style={styles.scanLeft}>
        <View style={styles.scanInfo}>
          <Text
            style={[styles.scanName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.employeeName}
          </Text>
          <Text style={[styles.scanCode, { color: colors.textSecondary }]}>
            {item.employeeCode}
          </Text>
        </View>
      </View>

      {/* Middle: Site + Foreman */}
      <View style={styles.scanMiddle}>
        <Text
          style={[styles.scanSite, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {item.siteName}
        </Text>
        <Text
          style={[styles.scanForeman, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {item.foremanName}
        </Text>
      </View>

      {/* Right: Time, Type, Location */}
      <View style={styles.scanRight}>
        <Text style={[styles.scanTime, { color: colors.textPrimary }]}>
          {formatTime(item.scannedAtISO)}
        </Text>
        <View style={styles.typeBadgeRow}>
          <View
            style={[
              styles.scanTypeBadge,
              {
                backgroundColor: isManual
                  ? "rgba(107,114,128,0.15)"
                  : "rgba(59,130,246,0.15)",
              },
            ]}
          >
            <Ionicons
              name={isManual ? "person-add" : "qr-code"}
              size={10}
              color={isManual ? "#6b7280" : "#22c55e"}
            />
            <Text
              style={[
                styles.scanTypeText,
                { color: isManual ? "#6b7280" : "#22c55e" },
              ]}
            >
              {isManual ? "Manual" : "QR"}
            </Text>
          </View>
          {hasOvertime && overtimeLabel && (
            <View style={styles.overtimeBadge}>
              <Text style={styles.overtimeText}>{overtimeLabel}</Text>
            </View>
          )}
        </View>
        {item.scannedOutAtISO ? (
          <View
            style={[
              styles.scanOutBadge,
              {
                borderColor:
                  getVerificationColor(item.verificationStatus) ?? "#94a3b8",
              },
            ]}
          >
            <Ionicons
              name={getScanOutMethodIcon(item.scanOutMethod)}
              size={9}
              color={getVerificationColor(item.verificationStatus) ?? "#94a3b8"}
            />
            <Text
              style={[
                styles.scanOutBadgeText,
                {
                  color:
                    getVerificationColor(item.verificationStatus) ?? "#94a3b8",
                },
              ]}
            >
              {getScanOutMethodLabel(item.scanOutMethod) ?? "Out"}
            </Text>
          </View>
        ) : null}
        {hasLocation ? (
          <Pressable onPress={openMap} style={styles.locationRow}>
            <Ionicons name="location" size={10} color="#22c55e" />
            <Text style={styles.locationLink} numberOfLines={1}>
              {item.address ? item.address : "View map"}
            </Text>
          </Pressable>
        ) : item.address ? (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={10} color={colors.textSecondary} />
            <Text
              style={[styles.locationText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.address}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AttendanceScansScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";

  const [scans, setScans] = useState<AdminAttendanceScanDto[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSite, setFilterSite] = useState<FilterSite>(null);
  const [selectedScan, setSelectedScan] =
    useState<AdminAttendanceScanDto | null>(null);
  const [employeePhotos, setEmployeePhotos] = useState<Record<string, string>>(
    {},
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scansRes, empRes] = await Promise.all([
        apiAdminAttendanceScans(),
        apiEmployees().catch(() => ({ employees: [] })),
      ]);
      setScans(scansRes.scans ?? []);
      setSites(scansRes.sites ?? []);

      // Build employee photo lookup
      const photoMap: Record<string, string> = {};
      for (const emp of empRes.employees) {
        if (emp.photoUrl) photoMap[emp.id] = emp.photoUrl;
      }
      setEmployeePhotos(photoMap);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scans.");
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiAdminAttendanceScans();
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
      load();
    }, [load]),
  );

  // Client-side filter by selected site
  const filteredScans = useMemo(() => {
    if (!filterSite) return scans;
    return scans.filter((s) => s.siteId === filterSite.id);
  }, [scans, filterSite]);

  // Group scans by date
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { heading: string; data: AdminAttendanceScanDto[] }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const s of filteredScans) {
      const d = new Date(s.workDateISO);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().split("T")[0];
      let heading: string;
      if (d.getTime() === today.getTime()) heading = "Today";
      else if (d.getTime() === yesterday.getTime()) heading = "Yesterday";
      else heading = formatDate(s.workDateISO);

      if (!map.has(key)) map.set(key, { heading, data: [] });
      map.get(key)!.data.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }, [filteredScans]);

  const flatData = useMemo(() => {
    const items: {
      type: "header" | "scan";
      heading?: string;
      scan?: AdminAttendanceScanDto;
    }[] = [];
    for (const group of grouped) {
      items.push({ type: "header", heading: group.heading });
      for (const scan of group.data) {
        items.push({ type: "scan", scan });
      }
    }
    return items;
  }, [grouped]);

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Attendance Scans
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Last 7 days • {filteredScans.length} scans
          </Text>
        </View>

        {/* Site Filter */}
        {sites.length > 0 && (
          <View style={{ paddingBottom: 12 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <Pressable
                onPress={() => setFilterSite(null)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: !filterSite
                      ? "#22c55e"
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: !filterSite ? "#fff" : colors.textSecondary },
                  ]}
                >
                  All Sites
                </Text>
              </Pressable>
              {sites.map((site) => (
                <Pressable
                  key={site.id}
                  onPress={() => setFilterSite(site)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        filterSite?.id === site.id
                          ? "#22c55e"
                          : isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.06)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          filterSite?.id === site.id
                            ? "#fff"
                            : colors.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {site.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading scans…" message="Please wait" />
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredScans.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="qr-code-outline"
              size={64}
              color={colors.emptyText}
            />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              No scans in the last 7 days
            </Text>
          </View>
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={(item, idx) =>
              item.type === "header"
                ? `h-${item.heading}`
                : `s-${item.scan!.id}-${idx}`
            }
            renderItem={({ item }) => {
              if (item.type === "header") {
                return (
                  <Text
                    style={[styles.dateHeading, { color: colors.textPrimary }]}
                  >
                    {item.heading}
                  </Text>
                );
              }
              return (
                <ScanRow
                  item={item.scan!}
                  colors={colors}
                  onPress={() => setSelectedScan(item.scan!)}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          />
        )}
        {/* Scan Detail Modal */}
        {selectedScan && (
          <ScanDetailModal
            scan={selectedScan}
            photoUrl={employeePhotos[selectedScan.employeeId] ?? null}
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
  },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 14, marginTop: 4 },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    minHeight: 34,
    justifyContent: "center",
  },
  filterChipText: { fontSize: 13, fontWeight: "700", lineHeight: 18 },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  dateHeading: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 8,
  },

  scanRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  scanLeft: {
    flex: 0.8,
    minWidth: 0,
  },
  scanInfo: {},
  scanName: { fontSize: 14, fontWeight: "700" },
  scanCode: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  scanMiddle: {
    flex: 1.2,
    minWidth: 0,
    alignItems: "center",
  },
  scanSite: { fontSize: 13, fontWeight: "700" },
  scanForeman: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  scanRight: { alignItems: "flex-end", gap: 3, flexShrink: 0 },
  scanTime: { fontSize: 13, fontWeight: "800" },
  typeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scanTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  scanTypeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  overtimeBadge: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overtimeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  scanOutBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  scanOutBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 120,
  },
  locationLink: {
    fontSize: 10,
    color: "#22c55e",
    fontWeight: "600",
    flexShrink: 1,
  },
  locationText: {
    fontSize: 10,
    fontWeight: "500",
    flexShrink: 1,
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
    borderRadius: 8,
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
  profileSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  employeeName: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  employeeCode: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 0.45,
  },
  infoLabelText: {
    fontSize: 13,
    fontWeight: "600",
  },
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
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  mapBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  closeBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(148,163,184,0.15)",
    marginTop: 4,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748b",
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "90%",
    height: "75%",
  },
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
