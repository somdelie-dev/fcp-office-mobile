import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  apiMeCached,
  apiSupervisorSites,
  type ApiMeResponse,
} from "../../lib/apiClient";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/themeContext";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrator",
  SUPERVISOR: "Supervisor",
  FOREMAN: "Foreman",
  ASSISTANT: "Assistant Foreman",
};

const ProfileScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [profileData, setProfileData] = useState<ApiMeResponse | null>(null);
  const [supervisorSites, setSupervisorSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sitesPage, setSitesPage] = useState(1);
  const [sitesSearch, setSitesSearch] = useState("");
  const SITES_PER_PAGE = 5;

  const fetchProfile = useCallback(
    async (forceRefresh = false) => {
      try {
        setError(null);
        const data = await apiMeCached(forceRefresh);
        setProfileData(data);

        // For supervisors, also fetch their sites from the supervisor endpoint
        if (user?.role === "SUPERVISOR") {
          try {
            const supervisorData = await apiSupervisorSites({ show: "all" });
            setSupervisorSites(supervisorData.sites ?? []);
          } catch (e) {
            console.warn("Failed to fetch supervisor sites", e);
          }
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load profile");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.role],
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProfile(true);
  }, [fetchProfile]);

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  const userName = user?.name || profileData?.user?.name || "User";
  const userEmail = user?.email || profileData?.user?.email || "";
  const userRole = user?.role || profileData?.user?.role || "FOREMAN";
  // Use supervisor sites for supervisors, otherwise use apiMe sites
  const sites: Array<{
    id: string;
    name: string;
    jobNumber?: string | null;
    active: boolean;
    totalWages?: number | null;
  }> =
    userRole === "SUPERVISOR"
      ? supervisorSites.map((s) => ({
          id: s.id,
          name: s.name,
          jobNumber: s.code || s.jobNumber,
          active: s.active ?? true,
          totalWages: s.totalWages ?? 0,
        }))
      : (profileData?.sites ?? []);

  // Filter and paginate sites
  const filteredSites = useMemo(() => {
    if (!sitesSearch.trim()) return sites;
    const q = sitesSearch.trim().toLowerCase();
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.jobNumber && s.jobNumber.toLowerCase().includes(q)),
    );
  }, [sites, sitesSearch]);

  const totalSitesPages = Math.max(
    1,
    Math.ceil(filteredSites.length / SITES_PER_PAGE),
  );
  const paginatedSites = useMemo(() => {
    const start = (sitesPage - 1) * SITES_PER_PAGE;
    return filteredSites.slice(start, start + SITES_PER_PAGE);
  }, [filteredSites, sitesPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setSitesPage(1);
  }, [sitesSearch]);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = isDark
    ? {
        bg: "#0b1220",
        cardBg: "rgba(15,23,42,0.9)",
        textPrimary: "#ffffff",
        textSecondary: "#94a3b8",
        textTertiary: "#64748b",
        accent: "#38bdf8",
        border: "#1f2a44",
        gradientStart: "#0a1628",
        gradientMid: "#1a2f4f",
      }
    : {
        bg: "#f8fafc",
        cardBg: "rgba(255,255,255,0.95)",
        textPrimary: "#0f172a",
        textSecondary: "#475569",
        textTertiary: "#64748b",
        accent: "#0ea5e9",
        border: "#e2e8f0",
        gradientStart: "#1e3a5f",
        gradientMid: "#2d4a6f",
      };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <LinearGradient
          colors={[
            colors.gradientStart,
            colors.gradientMid,
            colors.gradientStart,
          ]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading profile...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header Background */}
      <LinearGradient
        colors={[
          colors.gradientStart,
          colors.gradientMid,
          colors.gradientStart,
        ]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 0 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Profile Section */}
        <Animated.View
          style={[
            styles.profileSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Avatar Row */}
          <View style={styles.avatarRow}>
            {/* Avatar with Initials */}
            <View style={styles.avatarContainer}>
              <View style={styles.avatarRing}>
                <View
                  style={[
                    styles.avatarPlaceholder,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              </View>
              <View style={styles.statusDot} />
            </View>

            {/* User Info */}
            <View style={styles.userInfoContainer}>
              <Text style={styles.name}>{userName}</Text>
              <Text style={styles.title}>
                {roleLabels[userRole] || userRole}
              </Text>
              {userEmail && (
                <View style={styles.emailContainer}>
                  <Ionicons name="mail-outline" size={14} color="#8fa3bf" />
                  <Text style={styles.email}>{userEmail}</Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Error Message */}
        {error && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.cardBg, borderColor: colors.border },
            ]}
          >
            <View style={styles.errorContent}>
              <Ionicons name="alert-circle" size={20} color="#ef4444" />
              <Text style={[styles.errorText, { color: "#ef4444" }]}>
                {error}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                fetchProfile();
              }}
              style={styles.retryButton}
            >
              <Text style={{ color: colors.accent, fontWeight: "700" }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sites Section */}
        {sites.length > 0 && (
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.cardBg,
                borderColor: colors.border,
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={18} color={colors.accent} />
              <Text
                style={[styles.sectionTitle, { color: colors.textPrimary }]}
              >
                Assigned Sites
              </Text>
              <View
                style={[
                  styles.sitesCountBadge,
                  { backgroundColor: colors.accent + "20" },
                ]}
              >
                <Text style={[styles.sitesCountText, { color: colors.accent }]}>
                  {sites.length}
                </Text>
              </View>
            </View>

            {/* Search bar for sites */}
            {sites.length > SITES_PER_PAGE && (
              <View
                style={[
                  styles.sitesSearchContainer,
                  {
                    backgroundColor: isDark
                      ? "rgba(15,23,42,0.8)"
                      : "rgba(255,255,255,0.8)",
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="search"
                  size={16}
                  color={colors.textSecondary}
                />
                <TextInput
                  value={sitesSearch}
                  onChangeText={(text) => {
                    setSitesSearch(text);
                    setSitesPage(1);
                  }}
                  placeholder="Search sites..."
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.sitesSearchInput,
                    { color: colors.textPrimary },
                  ]}
                />
                {sitesSearch.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setSitesSearch("");
                      setSitesPage(1);
                    }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Data Table with Horizontal Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              scrollEventThrottle={16}
            >
              <View style={styles.tableWrapper}>
                {/* Table Header with Filters */}
                <View
                  style={[
                    styles.tableHeader,
                    {
                      backgroundColor: isDark
                        ? "rgba(30,41,59,0.9)"
                        : "rgba(241,245,249,0.95)",
                    },
                  ]}
                >
                  <View style={[styles.tableHeaderCellWrapper, { width: 100 }]}>
                    <Text
                      style={[
                        styles.tableHeaderCell,
                        {
                          color: isDark ? "#cbd5e1" : "#475569",
                        },
                      ]}
                    >
                      Job #
                    </Text>
                    <TouchableOpacity style={styles.filterButton}>
                      <Ionicons
                        name="funnel"
                        size={12}
                        color={isDark ? "#94a3b8" : "#64748b"}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.tableHeaderCellWrapper, { width: 220 }]}>
                    <Text
                      style={[
                        styles.tableHeaderCell,
                        {
                          color: isDark ? "#cbd5e1" : "#475569",
                        },
                      ]}
                    >
                      Site Name
                    </Text>
                    <TouchableOpacity style={styles.filterButton}>
                      <Ionicons
                        name="funnel"
                        size={12}
                        color={isDark ? "#94a3b8" : "#64748b"}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.tableHeaderCellWrapper, { width: 100 }]}>
                    <Text
                      style={[
                        styles.tableHeaderCell,
                        {
                          color: isDark ? "#cbd5e1" : "#475569",
                        },
                      ]}
                    >
                      Status
                    </Text>
                    <TouchableOpacity style={styles.filterButton}>
                      <Ionicons
                        name="funnel"
                        size={12}
                        color={isDark ? "#94a3b8" : "#64748b"}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.tableHeaderCellWrapper, { width: 70 }]}>
                    <Text
                      style={[
                        styles.tableHeaderCell,
                        {
                          color: isDark ? "#cbd5e1" : "#475569",
                        },
                      ]}
                    >
                      View
                    </Text>
                  </View>
                </View>

                {/* Table Rows */}
                {paginatedSites.length === 0 ? (
                  <View style={styles.tableEmptyState}>
                    <Ionicons
                      name="search-outline"
                      size={32}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 14,
                        fontWeight: "600",
                        marginTop: 8,
                      }}
                    >
                      No sites match your search
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Try a different search term
                    </Text>
                  </View>
                ) : (
                  <View>
                    {paginatedSites.map((site, index) => (
                      <View
                        key={site.id}
                        style={[
                          styles.tableRow,
                          {
                            backgroundColor:
                              index % 2 === 0
                                ? isDark
                                  ? "rgba(30,41,59,0.3)"
                                  : "rgba(248,250,252,0.8)"
                                : isDark
                                  ? "transparent"
                                  : "#ffffff",
                            borderBottomColor: colors.border,
                          },
                        ]}
                      >
                        {/* Job Number */}
                        <Text
                          style={[
                            styles.tableCell,
                            {
                              color: colors.accent,
                              width: 100,
                              fontWeight: "700",
                              fontFamily: "monospace",
                            },
                          ]}
                        >
                          {site.jobNumber || "-"}
                        </Text>

                        {/* Site Name */}
                        <Text
                          style={[
                            styles.tableCell,
                            {
                              color: colors.textPrimary,
                              width: 220,
                              fontWeight: "500",
                            },
                          ]}
                        >
                          {site.name}
                        </Text>

                        {/* Status */}
                        <View
                          style={[
                            styles.tableCellView,
                            {
                              width: 100,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: site.active
                                  ? "#22c55e15"
                                  : "#ef444415",
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: site.active ? "#22c55e" : "#ef4444",
                                fontSize: 11,
                                fontWeight: "700",
                              }}
                            >
                              {site.active ? "Active" : "Inactive"}
                            </Text>
                          </View>
                        </View>

                        {/* View Action */}
                        <View
                          style={[
                            styles.tableCellView,
                            {
                              width: 70,
                            },
                          ]}
                        >
                          <TouchableOpacity
                            style={[
                              styles.actionButton,
                              {
                                backgroundColor: colors.accent + "20",
                              },
                            ]}
                          >
                            <Ionicons
                              name="arrow-forward"
                              size={14}
                              color={colors.accent}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Pagination controls */}
            {totalSitesPages > 1 && (
              <View
                style={[
                  styles.paginationContainer,
                  { borderTopColor: isDark ? "#334155" : "#e2e8f0" },
                ]}
              >
                {/* Page info row */}
                <View style={styles.paginationInfoRow}>
                  <Text
                    style={[
                      styles.paginationText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {(sitesPage - 1) * SITES_PER_PAGE + 1}-
                    {Math.min(sitesPage * SITES_PER_PAGE, filteredSites.length)}{" "}
                    of {filteredSites.length}
                    {sitesSearch && ` (filtered)`}
                  </Text>
                </View>

                {/* Navigation row */}
                <View style={styles.paginationNavRow}>
                  <TouchableOpacity
                    onPress={() => setSitesPage(1)}
                    disabled={sitesPage === 1}
                    style={[
                      styles.paginationNavBtn,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        opacity: sitesPage === 1 ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="play-skip-back"
                      size={14}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setSitesPage((p) => Math.max(1, p - 1))}
                    disabled={sitesPage === 1}
                    style={[
                      styles.paginationNavBtn,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        opacity: sitesPage === 1 ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>

                  <Text
                    style={[
                      styles.paginationIndicator,
                      { color: isDark ? "#e2e8f0" : "#1e293b" },
                    ]}
                  >
                    {sitesPage} / {totalSitesPages}
                  </Text>

                  <TouchableOpacity
                    onPress={() =>
                      setSitesPage((p) => Math.min(totalSitesPages, p + 1))
                    }
                    disabled={sitesPage === totalSitesPages}
                    style={[
                      styles.paginationNavBtn,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        opacity: sitesPage === totalSitesPages ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setSitesPage(totalSitesPages)}
                    disabled={sitesPage === totalSitesPages}
                    style={[
                      styles.paginationNavBtn,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        opacity: sitesPage === totalSitesPages ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="play-skip-forward"
                      size={14}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {/* Account Info */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.border,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Account Information
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              User ID
            </Text>
            <Text
              style={[styles.infoValue, { color: colors.textTertiary }]}
              numberOfLines={1}
            >
              {user?.id ?? "-"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              Email
            </Text>
            <Text style={[styles.infoValue, { color: colors.textTertiary }]}>
              {userEmail || "-"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              Role
            </Text>
            <Text style={[styles.infoValue, { color: colors.textTertiary }]}>
              {roleLabels[userRole] || userRole}
            </Text>
          </View>

          {user?.actingForeman && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                Acting For
              </Text>
              <Text style={[styles.infoValue, { color: colors.accent }]}>
                {user.actingForeman.name}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Logout Button */}
        <Animated.View
          style={[
            styles.logoutSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: "#ef4444" }]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Bottom Padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 350,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
  },
  profileSection: {
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  avatarContainer: {
    position: "relative",
  },
  avatarRing: {
    padding: 3,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 1,
  },
  statusDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4ade80",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  userInfoContainer: {
    flex: 1,
    flexDirection: "column",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 14,
    color: "#b8c9e0",
    marginBottom: 8,
    fontWeight: "600",
  },
  emailContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  email: {
    fontSize: 13,
    color: "#8fa3bf",
    fontWeight: "500",
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 5,
    padding: 18,
    borderWidth: 1,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  retryButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sitesCountBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 5,
    marginLeft: "auto",
  },
  sitesCountText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sitesSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    marginBottom: 12,
    borderWidth: 1,
    gap: 8,
  },
  sitesSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  tableWrapper: {
    borderRadius: 0,
    overflow: "hidden",
    minWidth: 610,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 2,
  },
  tableHeaderCellWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: "rgba(148,163,184,0.2)",
    justifyContent: "space-between",
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterButton: {
    padding: 4,
    marginLeft: 6,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    minHeight: 44,
  },
  tableCell: {
    fontSize: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
    textAlign: "left",
    borderRightWidth: 1,
    borderRightColor: "rgba(148,163,184,0.2)",
  },
  tableCellView: {
    justifyContent: "flex-start",
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: "rgba(148,163,184,0.2)",
  },
  tableEmptyState: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 4,
    minWidth: 630,
    justifyContent: "center",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  paginationContainer: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    marginTop: 12,
    gap: 8,
  },
  paginationInfoRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  paginationNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  paginationIndicator: {
    fontSize: 13,
    fontWeight: "800",
    minWidth: 60,
    textAlign: "center",
  },
  paginationText: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 100,
    textAlign: "center",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.15)",
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },
  logoutSection: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 5,
    borderWidth: 1.5,
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  logoutText: {
    color: "#ef4444",
    fontSize: 15,
    fontWeight: "700",
  },
  bottomPadding: {
    height: 40,
  },
});

export default ProfileScreen;
