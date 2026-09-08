import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  apiAdminAttendanceScans,
  apiAdminSites,
  apiDeleteScan,
  apiEmployees,
  apiSupervisorSiteScansToday,
  apiTransferEmployee,
  type AdminAttendanceScanDto,
  type AdminSiteListItemDto,
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

function jobNumberToNumber(code: string | null | undefined): number {
  const n = Number(String(code ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function sortSitesByJobNumberDesc<T extends { code: string | null }>(
  sites: T[],
): T[] {
  return [...sites].sort(
    (a, b) => jobNumberToNumber(b.code) - jobNumberToNumber(a.code),
  );
}

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

/**
 * Move a scan's employee to a different site/foreman. Reuses the same
 * backend the supervisor "Adjust Attendance" screen uses
 * (POST /api/app/supervisor/transfer-employee, which already allows ADMIN)
 * — only the destination site + foreman need picking here, since the
 * source site/employee/date all come from the scan being acted on.
 */
function TransferModal({
  visible,
  scan,
  colors,
  isDark,
  onClose,
  onTransferred,
}: {
  visible: boolean;
  scan: AdminAttendanceScanDto | null;
  colors: (typeof themes)["light"];
  isDark: boolean;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const [sites, setSites] = useState<AdminSiteListItemDto[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [destinationSiteId, setDestinationSiteId] = useState<string | null>(
    null,
  );
  const [destForemen, setDestForemen] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingForemen, setLoadingForemen] = useState(false);
  const [selectedForemanId, setSelectedForemanId] = useState<string | null>(
    null,
  );
  const [foremanPickerOpen, setForemanPickerOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDestinationSiteId(null);
    setDestForemen([]);
    setSelectedForemanId(null);
    setReason("");
    (async () => {
      setLoadingSites(true);
      try {
        const res = await apiAdminSites({ isActive: true });
        setSites(res.sites ?? []);
      } catch {
        setSites([]);
      } finally {
        setLoadingSites(false);
      }
    })();
  }, [visible]);

  const loadForemen = useCallback(
    async (siteId: string) => {
      setLoadingForemen(true);
      setSelectedForemanId(null);
      setDestForemen([]);
      try {
        const dateISO = scan?.workDateISO.slice(0, 10);
        const res = await apiSupervisorSiteScansToday(siteId, dateISO);
        const foremen = res.foremen ?? [];
        setDestForemen(foremen);
        if (foremen.length === 1) setSelectedForemanId(foremen[0].id);
      } catch {
        setDestForemen([]);
      } finally {
        setLoadingForemen(false);
      }
    },
    [scan],
  );

  const destinationSiteName = useMemo(
    () => sites.find((s) => s.id === destinationSiteId)?.name ?? null,
    [sites, destinationSiteId],
  );
  const selectedForemanName = useMemo(
    () => destForemen.find((f) => f.id === selectedForemanId)?.name ?? null,
    [destForemen, selectedForemanId],
  );

  const doTransfer = useCallback(async () => {
    if (!scan || !destinationSiteId || !selectedForemanId) return;
    setSubmitting(true);
    try {
      const res = await apiTransferEmployee({
        employeeId: scan.employeeId,
        fromSiteId: scan.siteId,
        toSiteId: destinationSiteId,
        toForemanId: selectedForemanId,
        workDateISO: scan.workDateISO.slice(0, 10),
        reason: reason.trim() || undefined,
      });
      Alert.alert("Transfer Successful", res.message);
      onTransferred();
    } catch (e: any) {
      Alert.alert("Transfer Failed", e?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }, [scan, destinationSiteId, selectedForemanId, reason, onTransferred]);

  if (!visible || !scan) return null;

  const sheetBg = isDark ? "rgba(15,23,42,0.97)" : "rgba(255,255,255,0.97)";

  // A plain overlay, not React Native's <Modal> — it hosts SearchablePickerModal
  // (Site/Foreman), also a plain overlay: a real native Modal always renders in
  // its own top native layer above ordinary content, so a plain overlay nested
  // inside one can never out-rank it via zIndex. Keeping this one plain too
  // makes it and the picker peers in the same layer, where zIndex works.
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20000, elevation: 20000 }]}>
      <View style={transferStyles.backdrop}>
        <View
          style={[
            transferStyles.sheet,
            { backgroundColor: sheetBg, borderColor: colors.border },
          ]}
        >
          <Text style={[transferStyles.title, { color: colors.textPrimary }]}>
            Transfer Attendance
          </Text>

          <View
            style={[
              transferStyles.employeeCard,
              { borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                transferStyles.employeeName,
                { color: colors.textPrimary },
              ]}
            >
              {scan.employeeName}
            </Text>
            <Text
              style={[
                transferStyles.employeeMeta,
                { color: colors.textSecondary },
              ]}
            >
              {scan.employeeCode} • From: {scan.siteName} •{" "}
              {formatDate(scan.workDateISO)}
            </Text>
          </View>

          <Text
            style={[
              transferStyles.label,
              { color: colors.textSecondary, marginTop: 14 },
            ]}
          >
            Destination site
          </Text>
          <Pressable
            style={[transferStyles.picker, { borderColor: colors.border }]}
            onPress={() => setSitePickerOpen(true)}
          >
            <Text
              style={{
                color: destinationSiteName
                  ? colors.textPrimary
                  : colors.textSecondary,
                fontWeight: "700",
              }}
            >
              {loadingSites
                ? "Loading sites…"
                : (destinationSiteName ?? "Select destination site…")}
            </Text>
            <Ionicons
              name="chevron-down"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>

          {destinationSiteId && (
            <>
              <Text
                style={[
                  transferStyles.label,
                  { color: colors.textSecondary, marginTop: 12 },
                ]}
              >
                Foreman
              </Text>
              {loadingForemen ? (
                <View style={{ paddingVertical: 10, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#22c55e" />
                </View>
              ) : destForemen.length === 0 ? (
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>
                  No foremen assigned to this site
                </Text>
              ) : (
                <Pressable
                  style={[
                    transferStyles.picker,
                    { borderColor: colors.border },
                  ]}
                  onPress={() =>
                    destForemen.length > 1 && setForemanPickerOpen(true)
                  }
                >
                  <Text
                    style={{
                      color: selectedForemanName
                        ? colors.textPrimary
                        : colors.textSecondary,
                      fontWeight: "700",
                    }}
                  >
                    {selectedForemanName ?? "Select foreman…"}
                  </Text>
                  {destForemen.length > 1 && (
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={colors.textSecondary}
                    />
                  )}
                </Pressable>
              )}
            </>
          )}

          <Text
            style={[
              transferStyles.label,
              { color: colors.textSecondary, marginTop: 12 },
            ]}
          >
            Reason (optional)
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Scanned at the wrong site"
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            style={[
              transferStyles.reasonInput,
              { color: colors.textPrimary, borderColor: colors.border },
            ]}
            multiline
          />

          <View style={transferStyles.actions}>
            <Pressable
              style={transferStyles.cancelBtn}
              onPress={onClose}
              disabled={submitting}
            >
              <Text
                style={[
                  transferStyles.cancelBtnText,
                  { color: colors.textSecondary },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[
                transferStyles.confirmBtn,
                (!destinationSiteId || !selectedForemanId || submitting) && {
                  opacity: 0.5,
                },
              ]}
              onPress={doTransfer}
              disabled={!destinationSiteId || !selectedForemanId || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={transferStyles.confirmBtnText}>
                  Confirm Transfer
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <SearchablePickerModal
        visible={sitePickerOpen}
        title="Select Destination Site"
        searchPlaceholder="Search sites…"
        showAllOption={false}
        options={sites
          .filter((s) => s.id !== scan?.siteId)
          .map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        selectedId={destinationSiteId}
        onSelect={(option) => {
          if (!option) return;
          setDestinationSiteId(option.id);
          loadForemen(option.id);
        }}
        onClose={() => setSitePickerOpen(false)}
        colors={colors}
        isDark={isDark}
      />
      <SearchablePickerModal
        visible={foremanPickerOpen}
        title="Select Foreman"
        searchPlaceholder="Search foremen…"
        showAllOption={false}
        options={destForemen}
        selectedId={selectedForemanId}
        onSelect={(option) => setSelectedForemanId(option?.id ?? null)}
        onClose={() => setForemanPickerOpen(false)}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
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

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ScanRow({
  item,
  colors,
  onPress,
  onDelete,
  onTransfer,
  deleting,
}: {
  item: AdminAttendanceScanDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
  onDelete: () => void;
  onTransfer: () => void;
  deleting: boolean;
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
  const avatar = avatarPaletteFor(item.employeeId);

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
      style={[
        styles.scanCard,
        { borderColor: colors.rowBorder, backgroundColor: colors.cardBg },
      ]}
    >
      <View style={styles.cardTopRow}>
        {/* Left: Avatar + Employee + Site + Foreman */}
        <View style={styles.scanLeft}>
          <View style={styles.scanIdentityRow}>
            <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
              <Text style={[styles.avatarText, { color: avatar.fg }]}>
                {initialsFor(item.employeeName)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.scanName, { color: colors.textPrimary }]}>
                {item.employeeName}
              </Text>
              <Text style={[styles.scanCode, { color: colors.textSecondary }]}>
                {item.employeeCode}
              </Text>
            </View>
          </View>

          <View style={styles.scanSiteRow}>
            <Ionicons name="business" size={14} color={colors.textSecondary} />
            <Text
              style={[styles.scanSite, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {item.siteName}
            </Text>
          </View>
          <Text
            style={[styles.scanForeman, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            Site Foreman: {item.foremanName}
          </Text>
        </View>

        {/* Right: Time, Type, Scan-out status */}
        <View style={styles.scanRight}>
          <Text style={[styles.scanTime, { color: colors.textPrimary }]}>
            {formatTime(item.scannedAtISO)}
          </Text>
          <Text style={[styles.scanDate, { color: colors.textSecondary }]}>
            {new Date(item.workDateISO).toLocaleDateString("en-US", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
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
                size={11}
                color={isManual ? "#6b7280" : "#2563eb"}
              />
              <Text
                style={[
                  styles.scanTypeText,
                  { color: isManual ? "#6b7280" : "#2563eb" },
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
                size={10}
                color={
                  getVerificationColor(item.verificationStatus) ?? "#94a3b8"
                }
              />
              <Text
                style={[
                  styles.scanOutBadgeText,
                  {
                    color:
                      getVerificationColor(item.verificationStatus) ??
                      "#94a3b8",
                  },
                ]}
              >
                {getScanOutMethodLabel(item.scanOutMethod) ?? "Out"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Footer: Location (left) and Actions (right) on one line */}
      <View style={styles.cardFooter}>
        <View style={styles.footerLocation}>
          {hasLocation ? (
            <Pressable onPress={openMap} style={styles.locationRow}>
              <Ionicons name="location" size={12} color="#22c55e" />
              <Text style={styles.locationLink} numberOfLines={1}>
                {item.address ? item.address : "View map"}
              </Text>
            </Pressable>
          ) : item.address ? (
            <View style={styles.locationRow}>
              <Ionicons
                name="location"
                size={12}
                color={colors.textSecondary}
              />
              <Text
                style={[styles.locationText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.address}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.rowActions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#22c55e" }]}
            onPress={onTransfer}
            hitSlop={6}
          >
            <Ionicons name="swap-horizontal" size={15} color="#fff" />
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#dc2626" }]}
            onPress={onDelete}
            disabled={deleting}
            hitSlop={6}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="trash-outline" size={15} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function AttendanceScansScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";

  const [scans, setScans] = useState<AdminAttendanceScanDto[]>([]);
  const [sites, setSites] = useState<
    { id: string; name: string; code: string | null }[]
  >([]);
  const [foremen, setForemen] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSite, setFilterSite] = useState<FilterOption>(null);
  const [filterForeman, setFilterForeman] = useState<FilterOption>(null);
  const [siteFilterOpen, setSiteFilterOpen] = useState(false);
  const [foremanFilterOpen, setForemanFilterOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => todayISODate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedScan, setSelectedScan] =
    useState<AdminAttendanceScanDto | null>(null);
  const [transferScan, setTransferScan] =
    useState<AdminAttendanceScanDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [employeePhotos, setEmployeePhotos] = useState<Record<string, string>>(
    {},
  );

  // Every day of the current fortnight up to today (no point offering
  // future dates — there can't be attendance for those yet), newest first.
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
      const [scansRes, empRes] = await Promise.all([
        apiAdminAttendanceScans({ date: dateISO }),
        apiEmployees().catch(() => ({ employees: [] })),
      ]);
      setScans(scansRes.scans ?? []);
      setSites(sortSitesByJobNumberDesc(scansRes.sites ?? []));
      setForemen(scansRes.foremen ?? []);

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

  const refresh = useCallback(async (dateISO: string) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiAdminAttendanceScans({ date: dateISO });
      setScans(res.scans ?? []);
      setSites(sortSitesByJobNumberDesc(res.sites ?? []));
      setForemen(res.foremen ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Re-fetches whenever the selected date changes, as well as on focus —
  // the endpoint only returns one day at a time, so switching dates needs
  // a real round trip rather than a client-side filter.
  useFocusEffect(
    useCallback(() => {
      load(selectedDate);
    }, [load, selectedDate]),
  );

  // All 7 days of scans are already loaded in one request (no pagination
  // on this endpoint), so site/foreman/search filtering is done client-side
  // rather than round-tripping to the server per keystroke.
  const filteredScans = useMemo(() => {
    let list = scans;
    if (filterSite) list = list.filter((s) => s.siteId === filterSite.id);
    if (filterForeman)
      list = list.filter((s) => s.foremanId === filterForeman.id);
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.employeeName.toLowerCase().includes(q) ||
          s.employeeCode.toLowerCase().includes(q),
      );
    }
    return list;
  }, [scans, filterSite, filterForeman, searchText]);

  const handleDelete = useCallback((scan: AdminAttendanceScanDto) => {
    Alert.alert(
      "Delete attendance scan?",
      `Remove ${scan.employeeName} from ${scan.siteName} on ${formatDate(scan.workDateISO)}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(scan.id);
            try {
              await apiDeleteScan(scan.id);
              setScans((prev) => prev.filter((s) => s.id !== scan.id));
            } catch (e: any) {
              Alert.alert(
                "Delete Failed",
                e?.message ?? "Unable to delete scan.",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, []);

  const handleTransferred = useCallback(() => {
    setTransferScan(null);
    load(selectedDate);
  }, [load, selectedDate]);

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Attendance Scans
          </Text>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View
            style={[
              styles.searchBox,
              {
                borderColor: colors.rowBorder,
                backgroundColor: colors.inputBg,
              },
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

        {/* Site / Foreman filter dropdowns — chips don't scale with a large
        site/foreman count, so these open a searchable picker instead. */}
        {(sites.length > 0 || foremen.length > 0) && (
          <View style={styles.filterBar}>
            <Pressable
              style={[
                styles.filterTrigger,
                {
                  borderColor: colors.rowBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
              onPress={() => setSiteFilterOpen(true)}
            >
              <Text
                style={[
                  styles.filterTriggerText,
                  {
                    color: filterSite
                      ? colors.textPrimary
                      : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {filterSite
                  ? filterSite.code
                    ? `${filterSite.code} - ${filterSite.name}`
                    : filterSite.name
                  : "All Sites"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
            <Pressable
              style={[
                styles.filterTrigger,
                {
                  borderColor: colors.rowBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
              onPress={() => setForemanFilterOpen(true)}
            >
              <Text
                style={[
                  styles.filterTriggerText,
                  {
                    color: filterForeman
                      ? colors.textPrimary
                      : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {filterForeman ? filterForeman.name : "All Foremen"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        )}

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
          visible={foremanFilterOpen}
          title="Filter by Foreman"
          searchPlaceholder="Search foremen…"
          allLabel="All Foremen"
          options={foremen}
          selectedId={filterForeman?.id ?? null}
          onSelect={setFilterForeman}
          onClose={() => setForemanFilterOpen(false)}
          colors={colors}
          isDark={isDark}
        />

        {/* Date dropdown — picks one day within the current fortnight
        instead of scrolling through a fixed 7-day window. */}
        <Pressable
          style={styles.dateHeadingRow}
          onPress={() => setDatePickerOpen(true)}
        >
          <View style={styles.dateHeadingLabel}>
            <Text style={[styles.dateHeading, { color: colors.textPrimary }]}>
              {dateOptionLabel(selectedDate)}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={colors.textSecondary}
            />
          </View>
          <Text
            style={[styles.dateHeadingCount, { color: colors.textSecondary }]}
          >
            {filteredScans.length} scan{filteredScans.length === 1 ? "" : "s"}
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
          <LoadingOverlay title="Loading scans…" message="Please wait" />
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable
              onPress={() => load(selectedDate)}
              style={styles.retryBtn}
            >
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
              {searchText.trim() || filterSite || filterForeman
                ? "No scans match your filters"
                : `No scans on ${dateOptionLabel(selectedDate)}`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredScans}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ScanRow
                item={item}
                colors={colors}
                onPress={() => setSelectedScan(item)}
                onDelete={() => handleDelete(item)}
                onTransfer={() => setTransferScan(item)}
                deleting={deletingId === item.id}
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
        {/* Transfer Modal */}
        <TransferModal
          visible={!!transferScan}
          scan={transferScan}
          colors={colors}
          isDark={isDark}
          onClose={() => setTransferScan(null)}
          onTransferred={handleTransferred}
        />
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
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

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
  filterTriggerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  dateHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  dateHeadingLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateHeading: {
    fontSize: 18,
    fontWeight: "900",
  },
  dateHeadingCount: {
    fontSize: 13,
    fontWeight: "700",
  },

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
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 8,
  },
  footerLocation: { flex: 1, minWidth: 0 },
  scanLeft: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  scanIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "900" },
  scanName: { fontSize: 15, fontWeight: "800" },
  scanCode: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  scanSiteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  scanSite: { fontSize: 13, fontWeight: "800" },
  scanForeman: { fontSize: 11, fontWeight: "600" },
  scanRight: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  scanTime: { fontSize: 15, fontWeight: "800" },
  scanDate: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  typeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scanTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  scanTypeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  overtimeBadge: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  overtimeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  scanOutBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    gap: 4,
  },
  scanOutBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 150,
  },
  locationLink: {
    fontSize: 12,
    color: "#22c55e",
    fontWeight: "700",
    flexShrink: 1,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },

  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
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
  profileSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 5,
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
    borderRadius: 5,
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
    borderRadius: 5,
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
    borderRadius: 5,
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

const transferStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "92%",
    maxWidth: 420,
    borderRadius: 5,
    borderWidth: 1,
    padding: 20,
  },
  pickerSheet: {
    width: "92%",
    maxWidth: 420,
    maxHeight: "75%",
    borderRadius: 5,
    borderWidth: 1,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: "900" },
  label: { fontSize: 13, fontWeight: "800" },

  employeeCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: "rgba(59,130,246,0.08)",
  },
  employeeName: { fontSize: 15, fontWeight: "900" },
  employeeMeta: { fontSize: 12, fontWeight: "700", marginTop: 2 },

  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 6,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 6,
  },
  optionText: { fontWeight: "700", fontSize: 14, flex: 1 },

  reasonInput: {
    marginTop: 6,
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 50,
    textAlignVertical: "top",
  },

  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 5,
  },
  cancelBtnText: { fontWeight: "800", fontSize: 14 },
  confirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    alignItems: "center",
  },
  confirmBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
