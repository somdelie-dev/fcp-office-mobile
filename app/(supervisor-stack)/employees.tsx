import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiEmployeesCached,
  apiToggleEmployeeActive,
  type ApiEmployee,
} from "@/lib/apiClient";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { compressImage } from "@/lib/imageCompression";
import { useTheme } from "@/lib/themeContext";

const { width, height } = Dimensions.get("window");
const GRID_GAP = 10;
const GRID_PADDING = 16;
const NUM_COLUMNS = 2;
const CARD_WIDTH =
  (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const IMAGE_HEIGHT = CARD_WIDTH * 0.75;

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    foremanCardBg: "#1e3a5f",
    foremanCardBorder: "#3b82f6",
    searchBg: "#1e293b",
    searchBorder: "#334155",
    placeholderBg: "#312e81",
    placeholderText: "#818cf8",
    foremanPlaceholderBg: "#1e3a5f",
    foremanPlaceholderText: "#60a5fa",
    filterBg: "#1e293b",
    filterBorder: "#334155",
    filterActiveBg: "#3b82f6",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    foremanCardBg: "#eff6ff",
    foremanCardBorder: "#3b82f6",
    searchBg: "#f5f5f5",
    searchBorder: "#e0e0e0",
    placeholderBg: "#e0e7ff",
    placeholderText: "#4f46e5",
    foremanPlaceholderBg: "#dbeafe",
    foremanPlaceholderText: "#2563eb",
    filterBg: "#f5f5f5",
    filterBorder: "#e0e0e0",
    filterActiveBg: "#3b82f6",
  },
};

type SortOrder = "newest" | "oldest";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function EmployeeCard({
  item,
  colors,
  onImagePress,
  onDeactivate,
  onDownloadCard,
}: {
  item: ApiEmployee;
  colors: (typeof themes)["light"];
  onImagePress: () => void;
  onDeactivate: () => void;
  onDownloadCard: () => void;
}) {
  const initials = getInitials(item.fullName);
  const isForeman = item.isForeman === true;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isForeman ? colors.foremanCardBg : colors.cardBg,
          borderColor: isForeman ? colors.foremanCardBorder : colors.cardBorder,
        },
      ]}
    >
      {/* Foreman Badge */}
      {isForeman && (
        <View style={styles.foremanBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#fff" />
          <Text style={styles.foremanBadgeText}>Foreman</Text>
        </View>
      )}

      {/* Image Section */}
      <Pressable onPress={onImagePress} style={styles.imageSection}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.photo} />
        ) : (
          <View
            style={[
              styles.placeholderImage,
              {
                backgroundColor: isForeman
                  ? colors.foremanPlaceholderBg
                  : colors.placeholderBg,
              },
            ]}
          >
            <Text
              style={[
                styles.initialsText,
                {
                  color: isForeman
                    ? colors.foremanPlaceholderText
                    : colors.placeholderText,
                },
              ]}
            >
              {initials}
            </Text>
          </View>
        )}
        {/* Status Badge */}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: item.active ? "#22c55e" : "#ef4444" },
          ]}
        >
          <Text style={styles.statusText}>
            {item.active ? "Active" : "Inactive"}
          </Text>
        </View>
      </Pressable>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text
          style={[styles.cardName, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {item.fullName}
        </Text>
        <Text
          style={[styles.cardCode, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          #{item.code}
        </Text>

        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={onDownloadCard}
            style={[styles.iconActionButton, { backgroundColor: "#dbeafe" }]}
          >
            <Ionicons name="download-outline" size={16} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDeactivate}
            style={[
              styles.statusActionButton,
              { backgroundColor: item.active ? "#fee2e2" : "#dcfce7" },
            ]}
          >
            <Text
              style={[
                styles.actionButtonText,
                { color: item.active ? "#dc2626" : "#16a34a" },
              ]}
              numberOfLines={1}
            >
              {item.active ? "Deactivate" : "Activate"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function SupervisorEmployeesScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const searchInputRef = useRef<TextInput>(null);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApiEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPhoto, setCreatePhoto] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let result = [...rows];

    // Filter by search
    const s = q.trim().toLowerCase();
    if (s) {
      result = result.filter((r) => {
        return (
          r.fullName.toLowerCase().includes(s) ||
          r.code.toLowerCase().includes(s) ||
          String(r.phone ?? "")
            .toLowerCase()
            .includes(s)
        );
      });
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.lastScannedAt ?? a.createdAt ?? 0).getTime();
      const dateB = new Date(b.lastScannedAt ?? b.createdAt ?? 0).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [rows, q, sortOrder]);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiEmployeesCached(forceRefresh);
      setRows(res.employees ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load employees.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiEmployeesCached(true); // force refresh
      setRows(res.employees ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const openCreateModal = useCallback(() => {
    setCreateFirstName("");
    setCreateLastName("");
    setCreatePhone("");
    setCreatePhoto(null);
    setCreateError("");
    setCreateVisible(true);
  }, []);

  const pickCreatePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Needed", "Please allow photo access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setCreatePhoto({
      uri: asset.uri,
      name: asset.fileName || `employee-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
    });
  }, []);

  const handleCreateEmployee = useCallback(async () => {
    const firstName = createFirstName.trim();
    const lastName = createLastName.trim();
    const phone = createPhone.trim();

    if (!firstName || !lastName) {
      setCreateError("First name and last name are required.");
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      let faceImageUrl: string | null = null;

      if (createPhoto) {
        const compressed = await compressImage(createPhoto.uri, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.8,
        });
        const fd = new FormData();
        fd.append("file", {
          uri: compressed.uri,
          name: createPhoto.name.replace(/\.\w+$/, ".jpg"),
          type: "image/jpeg",
        } as any);
        fd.append("folder", "employees");

        const uploadRes = await apiFetch("/api/uploads/image", {
          method: "POST",
          body: fd,
          headers: {},
        });
        faceImageUrl = uploadRes?.url || null;
      }

      await apiFetch("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          faceImageUrl,
        }),
      });

      setCreateVisible(false);
      await load(true);
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create employee.");
    } finally {
      setCreating(false);
    }
  }, [createFirstName, createLastName, createPhone, createPhoto, load]);

  const handleDownloadCard = useCallback(async (employee: ApiEmployee) => {
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Unauthorized", "Please sign in again.");
        return;
      }

      const base = getApiBase();
      const url = `${base}/api/employees/${encodeURIComponent(
        employee.id,
      )}/card.pdf?token=${encodeURIComponent(token)}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      Alert.alert("Download Failed", e?.message ?? "Failed to open card.");
    }
  }, []);

  const handleToggleActive = useCallback(async (employee: ApiEmployee) => {
    const newActive = !employee.active;
    const action = newActive ? "activate" : "deactivate";

    Alert.alert(
      `${newActive ? "Activate" : "Deactivate"} Employee`,
      `Are you sure you want to ${action} ${employee.fullName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newActive ? "Activate" : "Deactivate",
          style: newActive ? "default" : "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              await apiToggleEmployeeActive(employee.id, newActive);
              setRows((prev) =>
                prev.map((r) =>
                  r.id === employee.id ? { ...r, active: newActive } : r,
                ),
              );
            } catch (e: any) {
              Alert.alert(
                "Error",
                e?.message ?? `Failed to ${action} employee`,
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay icon="👷" title="Loading Team…" message="Please wait" />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
                Manage Team
              </Text>
              <Text
                style={[styles.pageSubtitle, { color: colors.textSecondary }]}
              >
                {rows.length} guy{rows.length !== 1 ? "s" : ""} total
              </Text>
            </View>
            <Pressable onPress={openCreateModal} style={styles.addButton}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: colors.searchBg,
                borderColor: searchActive ? "#007AFF" : colors.searchBorder,
              },
            ]}
          >
            <Text style={styles.searchIconText}>🔍</Text>
            <TextInput
              ref={searchInputRef}
              value={q}
              onChangeText={setQ}
              placeholder="Search by name, code or phone…"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInputField, { color: colors.textPrimary }]}
              onFocus={() => setSearchActive(true)}
              onBlur={() => setSearchActive(false)}
              returnKeyType="search"
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ("")} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
          {q.trim().length > 0 && (
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>

        {/* Sort Filter */}
        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>
            Sort by:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Pressable
              onPress={() => setSortOrder("newest")}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    sortOrder === "newest"
                      ? colors.filterActiveBg
                      : colors.filterBg,
                  borderColor:
                    sortOrder === "newest"
                      ? colors.filterActiveBg
                      : colors.filterBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color:
                      sortOrder === "newest" ? "#fff" : colors.textSecondary,
                  },
                ]}
              >
                Newest First
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSortOrder("oldest")}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    sortOrder === "oldest"
                      ? colors.filterActiveBg
                      : colors.filterBg,
                  borderColor:
                    sortOrder === "oldest"
                      ? colors.filterActiveBg
                      : colors.filterBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color:
                      sortOrder === "oldest" ? "#fff" : colors.textSecondary,
                  },
                ]}
              >
                Oldest First
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Error message */}
        {error ? <Text style={styles.errorMessage}>{error}</Text> : null}

        {/* Grid */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          renderItem={({ item }) => (
            <EmployeeCard
              item={item}
              colors={colors}
              onImagePress={() => {
                if (item.photoUrl) {
                  setSelectedImage(item.photoUrl);
                }
              }}
              onDeactivate={() => handleToggleActive(item)}
              onDownloadCard={() => handleDownloadCard(item)}
            />
          )}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || actionBusy}
              onRefresh={refresh}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {q.trim() ? "No matching employees" : "No employees yet"}
              </Text>
              <Text
                style={[styles.emptyMessage, { color: colors.textSecondary }]}
              >
                {q.trim()
                  ? "Try a different search term"
                  : "Employees will appear here once added"}
              </Text>
            </View>
          }
        />

        {/* Full Image Modal */}
        <Modal
          visible={selectedImage !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedImage(null)}
        >
          <Pressable
            style={styles.imageModalBackdrop}
            onPress={() => setSelectedImage(null)}
          >
            <View style={styles.imageModalContainer}>
              {selectedImage && (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              )}
              <Pressable
                style={styles.closeImageButton}
                onPress={() => setSelectedImage(null)}
              >
                <Ionicons name="close-circle" size={36} color="#fff" />
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={createVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCreateVisible(false)}
        >
          <View style={styles.createModalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.createKeyboardWrap}
            >
              <View
                style={[
                  styles.createSheet,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={styles.createHeader}>
                  <Text
                    style={[styles.createTitle, { color: colors.textPrimary }]}
                  >
                    Add Employee
                  </Text>
                  <Pressable
                    onPress={() => setCreateVisible(false)}
                    style={styles.createCloseButton}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                </View>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.createForm}
                >
                  {createPhoto ? (
                    <View style={styles.createPhotoWrap}>
                      <Image
                        source={{ uri: createPhoto.uri }}
                        style={styles.createPhotoPreview}
                      />
                      <Pressable
                        onPress={() => setCreatePhoto(null)}
                        style={styles.removePhotoButton}
                      >
                        <Ionicons name="trash-outline" size={16} color="#fff" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={pickCreatePhoto}
                      style={[
                        styles.photoPicker,
                        {
                          borderColor: colors.cardBorder,
                          backgroundColor: colors.searchBg,
                        },
                      ]}
                    >
                      <Ionicons
                        name="camera-outline"
                        size={22}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.photoPickerText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Add Photo
                      </Text>
                    </Pressable>
                  )}

                  <FieldLabel text="First Name" color={colors.textSecondary} />
                  <TextInput
                    value={createFirstName}
                    onChangeText={setCreateFirstName}
                    placeholder="First name"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.createInput,
                      {
                        color: colors.textPrimary,
                        borderColor: colors.searchBorder,
                        backgroundColor: colors.searchBg,
                      },
                    ]}
                  />

                  <FieldLabel text="Last Name" color={colors.textSecondary} />
                  <TextInput
                    value={createLastName}
                    onChangeText={setCreateLastName}
                    placeholder="Last name"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.createInput,
                      {
                        color: colors.textPrimary,
                        borderColor: colors.searchBorder,
                        backgroundColor: colors.searchBg,
                      },
                    ]}
                  />

                  <FieldLabel text="Phone" color={colors.textSecondary} />
                  <TextInput
                    value={createPhone}
                    onChangeText={setCreatePhone}
                    placeholder="Phone number"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    style={[
                      styles.createInput,
                      {
                        color: colors.textPrimary,
                        borderColor: colors.searchBorder,
                        backgroundColor: colors.searchBg,
                      },
                    ]}
                  />

                  {createError ? (
                    <Text style={styles.createError}>{createError}</Text>
                  ) : null}
                </ScrollView>

                <View style={styles.createActions}>
                  <Pressable
                    onPress={() => setCreateVisible(false)}
                    style={[
                      styles.cancelCreateButton,
                      { borderColor: colors.cardBorder },
                    ]}
                    disabled={creating}
                  >
                    <Text
                      style={[
                        styles.cancelCreateText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreateEmployee}
                    disabled={creating}
                    style={[
                      styles.saveCreateButton,
                      { opacity: creating ? 0.65 : 1 },
                    ]}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    )}
                    <Text style={styles.saveCreateText}>
                      {creating ? "Saving..." : "Create"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    </AuthStyleBackground>
  );
}

function FieldLabel({ text, color }: { text: string; color: string }) {
  return <Text style={[styles.fieldLabel, { color }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },

  // Header Styles
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ea580c",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },

  // Search Styles
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 48,
  },
  searchIconText: {
    fontSize: 18,
    marginRight: 10,
    color: "#666",
  },
  searchInputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#111",
    padding: 0,
    margin: 0,
  },
  clearButton: {
    padding: 8,
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 18,
    color: "#999",
    fontWeight: "600",
  },
  resultCount: {
    marginTop: 8,
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
  },

  // Error Message
  errorMessage: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(176, 0, 32, 0.08)",
    color: "#b00020",
    fontWeight: "600",
    fontSize: 13,
  },

  // Grid Styles
  gridContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 32,
    flexGrow: 1,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  // Card Styles
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  imageSection: {
    position: "relative",
    width: "100%",
    height: IMAGE_HEIGHT,
    backgroundColor: "#f0f0f0",
  },
  photo: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontSize: 36,
    fontWeight: "800",
  },
  statusBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  infoSection: {
    padding: 12,
  },
  cardName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
    lineHeight: 18,
  },
  cardCode: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },

  // Filter Section
  filterSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Foreman Badge
  foremanBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  foremanBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },

  // Action Button
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  iconActionButton: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  statusActionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Image Modal
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageModalContainer: {
    width: width,
    height: height * 0.8,
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: width - 32,
    height: height * 0.7,
  },
  closeImageButton: {
    position: "absolute",
    top: 20,
    right: 20,
  },

  // Create Employee Modal
  createModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  createKeyboardWrap: {
    width: "100%",
  },
  createSheet: {
    maxHeight: height * 0.9,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  createHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  createTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  createCloseButton: {
    padding: 6,
  },
  createForm: {
    paddingBottom: 10,
  },
  photoPicker: {
    minHeight: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  photoPickerText: {
    fontSize: 13,
    fontWeight: "800",
  },
  createPhotoWrap: {
    alignSelf: "center",
    width: 116,
    height: 116,
    marginBottom: 12,
  },
  createPhotoPreview: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  removePhotoButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(220,38,38,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "900",
  },
  createInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700",
  },
  createError: {
    marginTop: 12,
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
  },
  createActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: 12,
  },
  cancelCreateButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelCreateText: {
    fontSize: 13,
    fontWeight: "900",
  },
  saveCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 110,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#0ea5e9",
  },
  saveCreateText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    color: "#999",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
});
