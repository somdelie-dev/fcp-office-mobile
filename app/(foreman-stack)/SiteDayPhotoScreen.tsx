// app/(tabs)/foreman/SiteDayPhotoScreen.tsx
// ✅ Foreman/Assistant Site Day Photo screen
// - Shows today's (or chosen date) site day
// - Lists photo requests + existing photos
// - Lets foreman/assistant upload a photo (optionally linked to a requestId)

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiEnsureSiteDay,
  apiForemanDayCached,
  apiForemanRecentSiteDayPhotosCached,
  apiMeCached,
  apiScanOutAll,
  apiSitesCached,
  type ApiMeResponse,
  type ForemanDayDetailDto,
  type ForemanRecentSiteDayPhotoDto,
  type PhotoVerificationStatus,
  type Site,
  type SiteDayPhotoDto,
  type SiteDayPhotoRequestDto,
} from "@/lib/apiClient";
import { getSitesScannedToday } from "@/lib/assistantHistoryStore";
import { useAuth } from "@/lib/auth";
import { compressImage } from "@/lib/imageCompression";
import { cancelSiteDayPhotoReminder } from "@/lib/push";
import { useTheme } from "@/lib/themeContext";
import { useLocation } from "@/lib/useLocation";
import { uploadWithProgress } from "@/lib/upload";
import { getApiBase, getToken } from "@/lib/api";

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDate(iso: string) {
  // iso is YYYY-MM-DD
  return iso;
}

export default function SiteDayPhotoScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { getLocationWithAddress } = useLocation();
  const { user, setActingForeman } = useAuth();

  // Assistant detection: user has availableForemen
  const isAssistant = useMemo(
    () => (user?.availableForemen ?? []).length > 0,
    [user?.availableForemen],
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [me, setMe] = useState<ApiMeResponse | null>(null);

  const [siteId, setSiteId] = useState<string | null>(null);
  const [dateISO] = useState<string>(yyyyMmDd(new Date()));

  // For assistants: map of siteId -> foremanId from scan history
  const [siteToForemanMap, setSiteToForemanMap] = useState<
    Map<string, { foremanId: string; foremanName: string }>
  >(new Map());

  const [day, setDay] = useState<ForemanDayDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [recentPhotos, setRecentPhotos] = useState<
    ForemanRecentSiteDayPhotoDto[]
  >([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // Track when a photo was just uploaded (to hide button immediately)
  const [justUploadedPhoto, setJustUploadedPhoto] = useState(false);

  const photoRequests: SiteDayPhotoRequestDto[] = day?.photoRequests ?? [];

  const isFreshRequested = (r: SiteDayPhotoRequestDto) => {
    if (r.status !== "REQUESTED") return false;
    if (!r.requestedAt) return false;
    const requested = new Date(r.requestedAt).getTime();
    if (Number.isNaN(requested)) return false;
    const now = Date.now();
    const diffMs = now - requested;
    return diffMs >= 0 && diffMs <= 60 * 60 * 1000; // within 1 hour
  };

  const freshRequests = photoRequests.filter(isFreshRequested);
  const hasFreshRequest = freshRequests.length > 0;
  const selectedRequest =
    photoRequests.find((r) => r.id === selectedRequestId) ?? null;

  const latestRequestedDate = useMemo(() => {
    const dates = photoRequests
      .map((r) => (r.requestedAt ? new Date(r.requestedAt) : null))
      .filter((d): d is Date => !!d);
    if (!dates.length) return null;
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    return yyyyMmDd(latest);
  }, [photoRequests]);

  const summaryStatusLabel = useMemo(() => {
    if (!photoRequests.length) return "No request";

    const hasPending = photoRequests.some(
      (r) =>
        r.status === "REQUESTED" &&
        (!r.photoCount ||
          typeof r.photoCount !== "number" ||
          r.photoCount <= 0),
    );

    const hasSubmitted = photoRequests.some(
      (r) =>
        r.status === "SUBMITTED" ||
        (typeof r.photoCount === "number" && r.photoCount > 0),
    );

    if (!hasPending && hasSubmitted) return "Submitted";
    if (hasPending) return "Pending";
    if (photoRequests.some((r) => r.status === "EXPIRED")) return "Expired";
    if (photoRequests.some((r) => r.status === "CANCELLED")) return "Cancelled";

    return "—";
  }, [photoRequests]);

  const headerSub = useMemo(() => {
    const acting = me?.user?.actingForeman?.name;
    if (!acting) return null;
    return `Acting for: ${acting}`;
  }, [me?.user?.actingForeman?.name]);

  // ✅ NEW: Photo submission state logic
  const todayISO = useMemo(() => yyyyMmDd(new Date()), []);
  const isToday = dateISO === todayISO;

  // Get photos for the current day (linked to selected request if any)
  const photosForDay: SiteDayPhotoDto[] = day?.photos ?? [];
  const photosForSelectedRequest = useMemo(() => {
    if (!selectedRequestId) return photosForDay;
    return photosForDay.filter((p) => p.requestId === selectedRequestId);
  }, [photosForDay, selectedRequestId]);

  // Latest photo verification status
  const latestPhoto = useMemo(() => {
    if (!photosForSelectedRequest.length) return null;
    // Sort by uploadedAt desc to get the latest
    const sorted = [...photosForSelectedRequest].sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
    return sorted[0];
  }, [photosForSelectedRequest]);

  const latestVerificationStatus: PhotoVerificationStatus | null =
    latestPhoto?.verification?.status ?? null;

  // Check if ANY photo exists for the current date from either day.photos or recentPhotos
  const hasRecentPhotoForDate = useMemo(() => {
    return recentPhotos.some((p) => p.dateTakenISO === dateISO);
  }, [recentPhotos, dateISO]);

  // Has ANY photo been submitted for this day (regardless of request)
  // Also check justUploadedPhoto for immediate UI update after upload
  const hasAnyPhotoForDay =
    photosForDay.length > 0 || hasRecentPhotoForDate || justUploadedPhoto;

  // Has a photo been submitted for this specific request?
  const hasSubmittedPhoto = photosForSelectedRequest.length > 0;

  // Is the latest photo rejected?
  const isRejected = latestVerificationStatus === "REJECTED";

  // Can foreman retake? Only if rejected AND still on same date
  const canRetake = isRejected && isToday;

  // Show warning if rejected but date has passed
  const showRejectedWarning = isRejected && !isToday;

  // Determine if we should show the take photo button:
  // - Hide completely if ANY photo was successfully uploaded today
  // - Only show if rejected (can retake)
  const shouldShowTakePhotoButton =
    isToday && (!hasAnyPhotoForDay || canRetake);

  // Helper to get verification status label and color
  const getVerificationDisplay = (
    status: PhotoVerificationStatus | null,
  ): { label: string; color: string; bgColor: string } => {
    switch (status) {
      case "PENDING":
        return {
          label: "Pending Review",
          color: "#f59e0b",
          bgColor: "rgba(245,158,11,0.15)",
        };
      case "VERIFIED":
        return {
          label: "Verified",
          color: "#22c55e",
          bgColor: "rgba(34,197,94,0.15)",
        };
      case "FLAGGED":
        return {
          label: "Flagged",
          color: "#f97316",
          bgColor: "rgba(249,115,22,0.15)",
        };
      case "REJECTED":
        return {
          label: "Rejected",
          color: "#ef4444",
          bgColor: "rgba(239,68,68,0.15)",
        };
      default:
        return {
          label: "—",
          color: "#64748b",
          bgColor: "rgba(100,116,139,0.1)",
        };
    }
  };

  // Ref to track if initial load has happened
  const initialLoadDoneRef = useRef(false);
  // Ref to access latest availableForemen without triggering re-renders
  const availableForemanRef = useRef(user?.availableForemen ?? []);
  availableForemanRef.current = user?.availableForemen ?? [];

  // Load sites - for assistants, get sites they've scanned today from local history
  const loadSitesAndSelect = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiMeCached();
      setMe(res);

      let activeSites: Site[] = [];

      if (isAssistant) {
        // For assistants: get sites they've scanned today from local history
        const scannedSites = await getSitesScannedToday();

        // Build map of siteId -> foremanId for API auth
        const newMap = new Map<
          string,
          { foremanId: string; foremanName: string }
        >();
        for (const s of scannedSites) {
          if (s.actingForemanId) {
            newMap.set(s.siteId, {
              foremanId: s.actingForemanId,
              foremanName: s.actingForemanName ?? "",
            });
          }
        }
        setSiteToForemanMap(newMap);

        activeSites = scannedSites.map((s) => ({
          id: s.siteId,
          name: s.siteName,
          active: true,
        }));

        // Set acting foreman for first site so API calls work (only on initial load)
        if (
          !initialLoadDoneRef.current &&
          activeSites.length > 0 &&
          newMap.has(activeSites[0].id)
        ) {
          const foreman = newMap.get(activeSites[0].id)!;
          const availableForemen = availableForemanRef.current;
          const match = availableForemen.find(
            (f) => f.foremanId === foreman.foremanId,
          );
          if (match) {
            await setActingForeman(match);
          }
        }
      } else {
        // For foremen: use the sites API
        const sres = await apiSitesCached();
        activeSites = (sres.sites ?? []).filter(
          (s: Site) => s.active !== false,
        );
      }

      setSites(activeSites);

      // default site to first if not set
      if (!siteId && activeSites.length) setSiteId(activeSites[0].id);

      initialLoadDoneRef.current = true;
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sites.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAssistant, setActingForeman]);

  const loadDay = useCallback(
    async (forceRefresh = false) => {
      if (!siteId) return;
      setError(null);
      const res = (await apiForemanDayCached(
        siteId,
        dateISO,
        forceRefresh,
      )) as any;

      // backend might return { ok:true, day: ... } or directly the dto
      const dto: ForemanDayDetailDto =
        res?.day ?? res?.data ?? res?.siteDay ?? res;

      // Debug: inspect what the API is returning for photo requests

      setDay(dto ?? null);

      // default selected request = first fresh (REQUESTED within last hour) request
      const reqs: SiteDayPhotoRequestDto[] = dto?.photoRequests ?? [];
      const firstFresh = reqs.find(isFreshRequested);
      setSelectedRequestId(firstFresh?.id ?? null);
    },
    [siteId, dateISO],
  );

  // Single effect to load sites - runs once on mount
  useEffect(() => {
    loadSitesAndSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track last loaded siteId to avoid reloading on same site
  const lastLoadedSiteRef = useRef<string | null>(null);

  // Load day data when site changes
  useEffect(() => {
    if (!siteId) return;
    if (lastLoadedSiteRef.current === siteId) return;

    // Reset upload state for new site
    setJustUploadedPhoto(false);

    const loadForSite = async () => {
      // For assistants: set acting foreman for this site before API call
      if (isAssistant && siteToForemanMap.has(siteId)) {
        const foreman = siteToForemanMap.get(siteId)!;
        const availableForemen = availableForemanRef.current;
        const match = availableForemen.find(
          (f) => f.foremanId === foreman.foremanId,
        );
        if (match) {
          await setActingForeman(match);
        }
      }
      lastLoadedSiteRef.current = siteId;
      await loadDay();
    };

    loadForSite().catch((e: any) =>
      setError(e?.message ?? "Failed to load day."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, siteToForemanMap]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadSitesAndSelect();
      await loadDay(true);

      try {
        const recent = await apiForemanRecentSiteDayPhotosCached(true);
        setRecentPhotos(recent?.photos ?? []);
      } catch (err) {
        console.warn("Failed to load recent site-day photos", err);
        setRecentPhotos([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [loadSitesAndSelect, loadDay]);

  const ensureCameraPermissions = useCallback(async () => {
    if (Platform.OS === "web") return true;

    const cam = await ImagePicker.requestCameraPermissionsAsync();

    if (cam.status !== "granted") {
      Alert.alert(
        "Camera needed",
        "Please allow camera access so you can take site photos.",
      );
      return false;
    }
    return true;
  }, []);

  const takePhoto = useCallback(async () => {
    const ok = await ensureCameraPermissions();
    if (!ok) return null;

    const opts: ImagePicker.ImagePickerOptions = {
      allowsEditing: false,
      quality: 0.85,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    };

    const res = await ImagePicker.launchCameraAsync(opts);
    if (res.canceled) return null;

    const asset = res.assets?.[0];
    if (!asset?.uri) return null;

    const uri = asset.uri;
    const nameGuess = uri.split("/").pop() || `photo-${Date.now()}.jpg`;
    const typeGuess = asset.mimeType || "image/jpeg";

    return { uri, name: nameGuess, type: typeGuess };
  }, [ensureCameraPermissions]);

  const doUpload = useCallback(
    async (file: { uri: string; name: string; type: string }): Promise<boolean> => {
      if (!siteId) {
        Alert.alert("No site selected", "Please select a site first.");
        return false;
      }

      setUploading(true);
      setError(null);

      try {
        // Ensure SiteDay exists (create if needed)
        let siteDayId = day?.id;
        if (!siteDayId) {
          try {
            const result = await apiEnsureSiteDay(siteId, dateISO);
            siteDayId = result.siteDayId;
          } catch (e: any) {
            Alert.alert(
              "Failed to create site day",
              e?.message ?? "Please try again.",
            );
            setUploading(false);
            return false;
          }
        }

        // Get device location with address
        const location = await getLocationWithAddress();
        if (!location) {
          Alert.alert(
            "Location Required",
            "Please enable location services to upload photos.",
          );
          setUploading(false);
          return false;
        }

        // Compress image before upload (max 1600px, 70% quality)
        const compressed = await compressImage(file.uri, {
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.7,
        });

        // Use compressed URI for upload
        const compressedFile = {
          uri: compressed.uri,
          name: file.name.replace(/\.\w+$/, ".jpg"), // Force .jpg extension
          type: "image/jpeg",
        };

        // Use XHR upload with progress to provide better UX on mobile
        const token = await getToken();
        const actingForemanId = await AsyncStorage.getItem("acting_foreman_id");
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (actingForemanId) headers["x-acting-foreman-id"] = actingForemanId;

        const uploadUrl = `${getApiBase()}/api/app/foreman/site-days/${encodeURIComponent(
          siteDayId,
        )}/photos`;

        const formFields: Record<string, string | undefined> = {};
        if (selectedRequestId) formFields.requestId = selectedRequestId;
        if (location.latitude != null)
          formFields.latitude = String(location.latitude);
        if (location.longitude != null)
          formFields.longitude = String(location.longitude);
        if (location.address) formFields.address = location.address;

        setUploadProgress(0);
        const uploadResult = await uploadWithProgress(
          uploadUrl,
          compressedFile,
          formFields,
          headers,
          (pct) => setUploadProgress(pct),
        );
        setUploadProgress(null);

        // Mark photo as uploaded immediately for UI update
        setJustUploadedPhoto(true);

        // ✅ Scan out all employees using this photo as proof
        try {
          const scanOutResult = await apiScanOutAll({
            siteDayId,
            photoId: (uploadResult as any)?.photo?.id ?? undefined,
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address,
          });

          const outCount = scanOutResult?.scannedOutCount ?? 0;
          if (outCount > 0) {
            Alert.alert(
              "Photo Saved & People Scanned Out",
              `Photo uploaded successfully.\n${outCount} person(s) have been scanned out for the day.`,
            );
          } else {
            Alert.alert("Saved", "Photo taken and uploaded successfully.");
          }
        } catch (scanOutErr: any) {
          console.warn("Scan-out after photo upload failed:", scanOutErr);
          Alert.alert(
            "Photo Saved",
            "Photo uploaded, but automatic scan-out failed. You may need to scan out manually.",
          );
        }

        // Cancel the scheduled site day photo reminder since photo has been uploaded
        await cancelSiteDayPhotoReminder();

        // Refresh both day data and recent photos to update UI
        await loadDay(true);
        try {
          const recent = await apiForemanRecentSiteDayPhotosCached(true);
          setRecentPhotos(recent?.photos ?? []);
        } catch {
          // Ignore errors loading recent photos
        }

        return true;
      } catch (e: any) {
        Alert.alert("Upload failed", e?.message ?? "Please try again.");
        return false;
      } finally {
        setUploading(false);
      }
    },
    [
      siteId,
      dateISO,
      day?.id,
      selectedRequestId,
      loadDay,
      getLocationWithAddress,
    ],
  );

  const captureAndPreview = useCallback(async () => {
    if (!siteId) {
      Alert.alert("No Site Selected", "Please select a site first.");
      return;
    }
    const file = await takePhoto();
    if (file) setPendingPhoto(file);
  }, [siteId, takePhoto]);

  const onPressTakePhoto = useCallback(() => {
    // Open camera and store a preview; user can submit after checking.
    captureAndPreview();
  }, [captureAndPreview]);

  const onPressRetakePhoto = useCallback(() => {
    captureAndPreview();
  }, [captureAndPreview]);

  const onPressSubmitPhoto = useCallback(async () => {
    if (!pendingPhoto) {
      Alert.alert("No photo", "Take a photo first before submitting.");
      return;
    }
    const succeeded = await doUpload(pendingPhoto);
    // Only clear the captured photo once it's actually made it to the server -
    // otherwise the foreman would have to retake/recompress it to retry.
    if (succeeded) setPendingPhoto(null);
  }, [pendingPhoto, doUpload]);

  const requestLabel = (r: SiteDayPhotoRequestDto) => {
    const due = r.dueAt ? ` • due ${r.dueAt.slice(11, 16)}` : "";
    return `${r.status}${due}`;
  };

  const selectedSiteName = useMemo(() => {
    const s = sites.find((x) => x.id === siteId);
    return s?.name ?? "Select site";
  }, [sites, siteId]);

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay />
      </AuthStyleBackground>
    );
  }

  // Assistant has no sites scanned today
  if (isAssistant && sites.length === 0) {
    return (
      <AuthStyleBackground>
        <ScrollView contentContainerStyle={styles.container}>
          <GlassCard style={styles.card}>
            <Text style={[styles.title, { color: isDark ? "#fff" : "#111" }]}>
              No Sites Scanned Today
            </Text>
            <Text
              style={[
                styles.muted,
                { color: isDark ? "#cbd5e1" : "#475569", marginBottom: 16 },
              ]}
            >
              No one scanned in today. Scan guys in on a site first, then come
              back here to take site day photos.
            </Text>
          </GlassCard>
        </ScrollView>
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {!!error && (
          <GlassCard style={styles.card}>
            <Text style={[styles.error, { color: "#ff6b6b" }]}>{error}</Text>
          </GlassCard>
        )}

        <GlassCard style={styles.card}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: isDark ? "#fff" : "#111" }]}>
                Site Day Photos
              </Text>
              {!!headerSub && (
                <Text
                  style={[
                    styles.sub,
                    { color: isDark ? "#cbd5e1" : "#334155" },
                  ]}
                >
                  {headerSub}
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={onRefresh}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,.5)",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: isDark ? "#e2e8f0" : "#0f172a",
                }}
              >
                Refresh
              </Text>
            </TouchableOpacity>
          </View>

          {/* Site selector (simple buttons; replace with your own picker if you have one) */}
          <Text
            style={[styles.label, { color: isDark ? "#cbd5e1" : "#475569" }]}
          >
            Site
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {sites.map((s) => {
                const active = s.id === siteId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.chip,
                      {
                        borderColor: active
                          ? "#38bdf8"
                          : "rgba(148,163,184,.5)",
                        backgroundColor: active
                          ? "rgba(56,189,248,.18)"
                          : "rgba(2,6,23,.06)",
                      },
                    ]}
                    onPress={() => setSiteId(s.id)}
                  >
                    <Text
                      style={{
                        color: isDark ? "#fff" : "#0f172a",
                        fontWeight: active ? "700" : "600",
                      }}
                    >
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Date (always today) */}
          <Text
            style={[
              styles.label,
              { marginTop: 12, color: isDark ? "#cbd5e1" : "#475569" },
            ]}
          >
            Date
          </Text>
          <View style={styles.row}>
            <View style={styles.datePill}>
              <Text
                style={{
                  color: isDark ? "#fff" : "#0f172a",
                  fontWeight: "700",
                }}
              >
                {shortDate(dateISO)}
              </Text>
            </View>
          </View>

          {/* Summary */}
          <View style={{ marginTop: 12 }}>
            <Text
              style={[styles.kv, { color: isDark ? "#e2e8f0" : "#0f172a" }]}
            >
              Site:{" "}
              <Text style={{ fontWeight: "800" }}>{selectedSiteName}</Text>
            </Text>
            <Text
              style={[styles.kv, { color: isDark ? "#e2e8f0" : "#0f172a" }]}
            >
              Status:{" "}
              <Text style={{ fontWeight: "800" }}>{summaryStatusLabel}</Text>
            </Text>
          </View>
        </GlassCard>

        {/* Take Photo - Primary action card */}
        <GlassCard style={styles.card}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#111" }]}
          >
            Take Photo
          </Text>

          {/* Show verification status if photo was submitted */}
          {hasSubmittedPhoto && latestVerificationStatus && (
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: getVerificationDisplay(
                    latestVerificationStatus,
                  ).bgColor,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: getVerificationDisplay(latestVerificationStatus)
                      .color,
                  },
                ]}
              >
                {getVerificationDisplay(latestVerificationStatus).label}
              </Text>
            </View>
          )}

          {/* Show rejected warning if date has passed */}
          {showRejectedWarning && (
            <View style={styles.warningBox}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>Photo Rejected</Text>
                <Text style={styles.warningText}>
                  This photo was rejected but the date has passed. Please
                  contact your admin/supervisor to resolve this issue.
                </Text>
                {!!latestPhoto?.verification?.notes && (
                  <Text style={styles.warningNotes}>
                    Reason: {latestPhoto.verification.notes}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Also show rejection reason when rejected but still can retake (today) */}
          {isRejected && isToday && !!latestPhoto?.verification?.notes && (
            <Text style={styles.warningNotes}>
              Reason: {latestPhoto.verification.notes}
            </Text>
          )}

          {/* Show success message if photo uploaded today and not rejected */}
          {hasAnyPhotoForDay && !isRejected && (
            <View style={styles.successBox}>
              <Text style={styles.successIcon}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>Photo Submitted</Text>
                <Text style={styles.successText}>
                  Your photo has been submitted successfully and is awaiting
                  review.
                </Text>
              </View>
            </View>
          )}

          {/* Show take/retake photo button only when appropriate */}
          {shouldShowTakePhotoButton ? (
            <>
              <Text
                style={[
                  styles.muted,
                  { color: isDark ? "#cbd5e1" : "#475569" },
                ]}
              >
                {canRetake
                  ? "Your previous photo was rejected. You can retake the photo today."
                  : hasFreshRequest
                    ? "Take a group photo for this site day."
                    : "Take a site day photo to document today's work."}
              </Text>

              <TouchableOpacity
                style={[styles.primaryBtn, canRetake && styles.retakeBtn]}
                onPress={onPressTakePhoto}
              >
                <Text style={styles.primaryBtnText}>
                  {canRetake ? "Retake Photo" : "Take Photo"}
                </Text>
              </TouchableOpacity>

              {pendingPhoto && (
                <View style={styles.previewBlock}>
                  <Image
                    source={{ uri: pendingPhoto.uri }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                  <View style={styles.previewButtonsRow}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={onPressRetakePhoto}
                    >
                      <Text
                        style={[
                          styles.secondaryBtnText,
                          { color: isDark ? "#e2e8f0" : "#0f172a" },
                        ]}
                      >
                        Retake
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.secondaryBtn,
                        styles.secondaryBtnPrimary,
                        uploading && { opacity: 0.6 },
                      ]}
                      disabled={uploading}
                      onPress={onPressSubmitPhoto}
                    >
                      <Text style={styles.secondaryBtnPrimaryText}>
                        {uploading ? "Saving..." : "Submit Photo"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {uploadProgress !== null && (
                    <View style={{ marginTop: 8 }}>
                      <Text
                        style={[
                          styles.muted,
                          { color: isDark ? "#cbd5e1" : "#475569" },
                        ]}
                      >
                        Uploading: {uploadProgress}%
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          ) : !hasAnyPhotoForDay && !isToday ? (
            <Text
              style={[styles.muted, { color: isDark ? "#cbd5e1" : "#475569" }]}
            >
              No photo was taken for this date.
            </Text>
          ) : null}
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#111" }]}
          >
            Recent site photos
          </Text>

          {recentPhotos.length === 0 ? (
            <Text
              style={[styles.muted, { color: isDark ? "#cbd5e1" : "#475569" }]}
            >
              No photos from the last 5 days.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentStrip}
            >
              {recentPhotos.map((p, idx) => (
                <View key={idx.toString()} style={styles.recentItem}>
                  <TouchableOpacity
                    onPress={() => setPreviewUri(p.imageUrl)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: p.imageUrl }}
                      style={styles.recentImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  <Text
                    style={[
                      styles.recentDate,
                      { color: isDark ? "#e2e8f0" : "#0f172a" },
                    ]}
                  >
                    {shortDate(p.dateTakenISO)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </GlassCard>

        {/* Photo requests */}
        <GlassCard style={styles.card}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#111" }]}
          >
            Photo Requests
          </Text>

          {(!day?.photoRequests || day.photoRequests.length === 0) && (
            <Text
              style={[styles.muted, { color: isDark ? "#cbd5e1" : "#475569" }]}
            >
              No photo requests for this site/day.
            </Text>
          )}

          {!!day?.photoRequests?.length && (
            <View style={{ gap: 10 }}>
              {day.photoRequests.map((r) => {
                const active = selectedRequestId === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => setSelectedRequestId(r.id)}
                    style={[
                      styles.requestRow,
                      {
                        borderColor: active
                          ? "#38bdf8"
                          : "rgba(148,163,184,.35)",
                        backgroundColor: active
                          ? "rgba(56,189,248,.14)"
                          : "rgba(2,6,23,.04)",
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: isDark ? "#fff" : "#0f172a",
                          fontWeight: "800",
                        }}
                      >
                        {r.status}
                      </Text>
                      <Text
                        style={{
                          color: isDark ? "#cbd5e1" : "#475569",
                          marginTop: 2,
                        }}
                      >
                        {requestLabel(r)}
                      </Text>
                      {!!r.requestedBy?.name && (
                        <Text
                          style={{
                            color: isDark ? "#cbd5e1" : "#475569",
                            marginTop: 2,
                          }}
                        >
                          Requested by: {r.requestedBy.name}
                        </Text>
                      )}
                    </View>

                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {r.photoCount ?? 0} photos
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {latestRequestedDate && (
                <Text
                  style={[
                    styles.muted,
                    { color: isDark ? "#cbd5e1" : "#475569" },
                  ]}
                >
                  Last photo request date: {shortDate(latestRequestedDate)}
                </Text>
              )}
            </View>
          )}
        </GlassCard>

        {/* Existing photos */}
        <GlassCard style={styles.card}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#111" }]}
          >
            Uploaded Photos
          </Text>

          {(!day?.photos || day.photos.length === 0) && (
            <Text
              style={[styles.muted, { color: isDark ? "#cbd5e1" : "#475569" }]}
            >
              No photos uploaded yet.
            </Text>
          )}

          {!!day?.photos?.length && (
            <View style={{ gap: 12 }}>
              {day.photos.map((p: SiteDayPhotoDto) => {
                const verificationDisplay = getVerificationDisplay(
                  p.verification?.status ?? null,
                );
                return (
                  <View key={p.id} style={styles.photoRow}>
                    <TouchableOpacity
                      onPress={() => setPreviewUri(p.imageUrl)}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: p.imageUrl }}
                        style={styles.thumb}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: isDark ? "#fff" : "#0f172a",
                            fontWeight: "800",
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {p.uploadedBy?.name
                            ? `By ${p.uploadedBy.name}`
                            : "Uploaded"}
                        </Text>
                        {p.verification?.status && (
                          <View
                            style={[
                              styles.photoStatusBadge,
                              { backgroundColor: verificationDisplay.bgColor },
                            ]}
                          >
                            <Text
                              style={[
                                styles.photoStatusBadgeText,
                                { color: verificationDisplay.color },
                              ]}
                            >
                              {verificationDisplay.label}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={{
                          color: isDark ? "#cbd5e1" : "#475569",
                          marginTop: 2,
                        }}
                      >
                        {p.uploadedAt}
                      </Text>
                      {!!p.requestId && (
                        <Text
                          style={{
                            color: isDark ? "#cbd5e1" : "#475569",
                            marginTop: 2,
                          }}
                        >
                          Linked to request
                        </Text>
                      )}
                      {p.verification?.status === "REJECTED" &&
                        p.verification?.notes && (
                          <Text
                            style={{
                              color: "#ef4444",
                              marginTop: 4,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            Reason: {p.verification.notes}
                          </Text>
                        )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </GlassCard>

        <View style={{ height: 20 }} />
      </ScrollView>

      {uploading && <LoadingOverlay />}

      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {previewUri && (
              <Image
                source={{ uri: previewUri }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setPreviewUri(null)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    gap: 12,
  },
  card: {
    padding: 14,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
  },
  sub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePill: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,.35)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallBtnText: {
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  muted: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  kv: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  error: {
    fontSize: 13,
    fontWeight: "800",
  },
  requestRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(15,23,42,.08)",
  },
  badgeText: {
    fontWeight: "900",
    fontSize: 12,
  },
  recentStrip: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  recentItem: {
    marginRight: 10,
    alignItems: "center",
  },
  recentImage: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,.12)",
  },
  recentDate: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  photoRow: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,.25)",
    borderRadius: 16,
    padding: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "rgba(148,163,184,.25)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxHeight: "90%",
    alignItems: "center",
  },
  modalImage: {
    width: "100%",
    height: "80%",
  },
  modalCloseBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  modalCloseText: {
    color: "#e2e8f0",
    fontWeight: "900",
    fontSize: 13,
  },
  previewBlock: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,.35)",
    padding: 10,
    gap: 10,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,.08)",
  },
  previewButtonsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,.5)",
  },
  secondaryBtnText: {
    fontWeight: "800",
    fontSize: 12,
    color: "#0f172a",
  },
  secondaryBtnPrimary: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  secondaryBtnPrimaryText: {
    fontWeight: "900",
    fontSize: 12,
    color: "white",
  },
  primaryBtn: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0284c7", // sky-600
  },
  primaryBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
  },
  retakeBtn: {
    backgroundColor: "#f97316", // orange-500
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
  },
  statusBadgeText: {
    fontWeight: "800",
    fontSize: 12,
  },
  photoStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoStatusBadgeText: {
    fontWeight: "800",
    fontSize: 10,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    marginBottom: 8,
  },
  warningIcon: {
    fontSize: 20,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ef4444",
  },
  warningText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#dc2626",
    marginTop: 2,
    lineHeight: 18,
  },
  warningNotes: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b91c1c",
    marginTop: 6,
    fontStyle: "italic",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    marginBottom: 8,
  },
  successIcon: {
    fontSize: 20,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#22c55e",
  },
  successText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
    marginTop: 2,
    lineHeight: 18,
  },
});
