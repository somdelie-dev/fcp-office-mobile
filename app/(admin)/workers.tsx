import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { Avatar, OptimizedImage } from "@/components/OptimizedImage";
import { apiEmployeesCached, type ApiEmployee } from "@/lib/apiClient";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { useTheme } from "@/lib/themeContext";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { compressImage } from "@/lib/imageCompression";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MoreVertical,
  Eye,
  Download,
  Plus,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type FilterMode = "active" | "all";
type SortField = "name" | "dayRate" | "code" | "createdAt" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  faceImageUrl?: string;
  defaultDayRate?: number;
  qrCodeValue: string;
  isActive: boolean;
  isForeman?: boolean;
  createdAt?: string;
  phone?: string;
}

/** Convert API employee to local Employee type */
function mapApiEmployee(e: ApiEmployee): Employee {
  const nameParts = (e.fullName || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "";

  return {
    id: e.id,
    firstName,
    lastName,
    faceImageUrl: e.photoUrl ?? undefined,
    defaultDayRate: e.dayRate ?? 0,
    qrCodeValue: e.code || "",
    isActive: e.active ?? true,
    isForeman: e.isForeman ?? false,
    createdAt: e.createdAt ?? undefined,
    phone: e.phone ?? undefined,
  };
}

function formatMoney(n: number) {
  return `R ${n.toFixed(2)}`;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function AdminWorkersScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("active");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modal state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPhoto, setCreatePhoto] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  // Actions dropdown
  const [actionsId, setActionsId] = useState<string | null>(null);

  const loadEmployees = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const res = await apiEmployeesCached(forceRefresh);
      const mapped = (res.employees || []).map(mapApiEmployee);
      setEmployees(mapped);
    } catch (e: any) {
      setError(e?.message || "Failed to load employees");
      console.error("Failed to load employees:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = employees;

    // Filter by active status
    if (filter === "active") {
      result = result.filter((e) => e.isActive);
    }

    // Filter by search
    if (debouncedSearch) {
      result = result.filter(
        (e) =>
          `${e.firstName} ${e.lastName}`
            .toLowerCase()
            .includes(debouncedSearch) ||
          e.qrCodeValue.toLowerCase().includes(debouncedSearch),
      );
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(
            `${b.firstName} ${b.lastName}`,
          );
          break;
        case "dayRate":
          cmp = (a.defaultDayRate ?? 0) - (b.defaultDayRate ?? 0);
          break;
        case "code":
          cmp = a.qrCodeValue.localeCompare(b.qrCodeValue);
          break;
        case "createdAt":
          cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
          break;
        case "status":
          cmp = (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [employees, filter, debouncedSearch, sortField, sortDir]);

  // Pagination calculations
  const totalItems = filteredAndSorted.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedData = useMemo(
    () => filteredAndSorted.slice(startIndex, endIndex),
    [filteredAndSorted, startIndex, endIndex],
  );

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  async function onRefresh() {
    setRefreshing(true);
    await loadEmployees(true); // force refresh
    setRefreshing(false);
  }

  const textMain = isDark ? "#e5e7eb" : "#111827";
  const textSub = isDark ? "#94a3b8" : "#6b7280";
  const cardBg = isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)";
  const headerBg = isDark ? "rgba(30,41,59,0.9)" : "rgba(241,245,249,0.9)";
  const borderColor = isDark ? "#334155" : "#e2e8f0";

  // Create employee handler
  async function handleCreateEmployee() {
    const fn = createFirstName.trim();
    const ln = createLastName.trim();
    const ph = createPhone.trim();
    if (!fn || !ln || !ph) {
      setCreateError("First name, last name and phone are required");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      // Upload photo first if one was taken
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
          headers: {}, // let fetch set multipart boundary
        });
        faceImageUrl = uploadRes?.url || null;
      }

      await apiFetch("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          firstName: fn,
          lastName: ln,
          phone: ph,
          faceImageUrl,
        }),
      });
      setShowCreate(false);
      setCreateFirstName("");
      setCreateLastName("");
      setCreatePhone("");
      setCreatePhoto(null);
      await loadEmployees(true);
    } catch (e: any) {
      setCreateError(e?.message || "Failed to create employee");
    } finally {
      setCreating(false);
    }
  }

  const handleDownloadCard = useCallback(async (emp: Employee) => {
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Error", "Not authenticated.");
        return;
      }
      const base = getApiBase();
      const url = `${base}/api/employees/${encodeURIComponent(emp.id)}/card.pdf?token=${encodeURIComponent(token)}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to open card.");
    }
  }, []);

  const renderTableRow = useCallback(
    ({ item, index }: { item: Employee; index: number }) => (
      <TableRow
        item={item}
        index={index}
        isDark={isDark}
        textMain={textMain}
        textSub={textSub}
        borderColor={borderColor}
        actionsId={actionsId}
        setActionsId={setActionsId}
        onViewDetails={(emp) => {
          setSelectedEmployee(emp);
          setShowDetail(true);
          setActionsId(null);
        }}
        onDownloadCard={handleDownloadCard}
      />
    ),
    [isDark, textMain, textSub, borderColor, actionsId, handleDownloadCard],
  );

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <GlassCard style={[styles.headerCard, { backgroundColor: cardBg }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: textMain }]}>Employees</Text>
              <Text style={[styles.sub, { color: textSub }]}>
                {loading
                  ? "Loading..."
                  : `${filteredAndSorted.length} of ${employees.length} employees`}
              </Text>
            </View>
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                setCreateFirstName("");
                setCreateLastName("");
                setCreatePhone("");
                setCreatePhoto(null);
                setCreateError("");
                setShowCreate(true);
              }}
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.addBtnText}>New Employee</Text>
            </Pressable>
          </View>

          {/* Search & Filter */}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or QR code..."
            placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
            style={[
              styles.searchInput,
              {
                color: textMain,
                borderColor,
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.8)"
                  : "rgba(255,255,255,0.8)",
              },
            ]}
          />

          <View style={styles.filterRow}>
            <FilterPill
              label="Active"
              active={filter === "active"}
              onPress={() => setFilter("active")}
              isDark={isDark}
            />
            <FilterPill
              label="All"
              active={filter === "all"}
              onPress={() => setFilter("all")}
              isDark={isDark}
            />
          </View>
        </GlassCard>

        {/* Data Table */}
        <GlassCard style={[styles.tableCard, { backgroundColor: cardBg }]}>
          {error && !loading && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => {
                  loadEmployees();
                }}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Table Header */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 820 }}>
              <View style={[styles.tableHeader, { backgroundColor: headerBg }]}>
                <SortableHeader
                  label="Employee"
                  field="name"
                  currentField={sortField}
                  currentDir={sortDir}
                  onPress={toggleSort}
                  style={styles.colEmployee}
                  isDark={isDark}
                />
                <View style={[styles.headerCell, styles.colPhone]}>
                  <Text
                    style={[
                      styles.headerText,
                      { color: isDark ? "#cbd5e1" : "#475569" },
                    ]}
                  >
                    PHONE
                  </Text>
                </View>
                <SortableHeader
                  label="Day Rate"
                  field="dayRate"
                  currentField={sortField}
                  currentDir={sortDir}
                  onPress={toggleSort}
                  style={styles.colRate}
                  isDark={isDark}
                />
                <SortableHeader
                  label="QR Code"
                  field="code"
                  currentField={sortField}
                  currentDir={sortDir}
                  onPress={toggleSort}
                  style={styles.colCode}
                  isDark={isDark}
                />
                <SortableHeader
                  label="Added"
                  field="createdAt"
                  currentField={sortField}
                  currentDir={sortDir}
                  onPress={toggleSort}
                  style={styles.colDate}
                  isDark={isDark}
                />
                <View style={styles.colActions}>
                  <Text
                    style={[
                      styles.headerText,
                      {
                        color: isDark ? "#cbd5e1" : "#475569",
                        textAlign: "center",
                      },
                    ]}
                  >
                    ACTIONS
                  </Text>
                </View>
              </View>

              {/* Table Body */}
              {loading && !refreshing ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator
                    size="large"
                    color={isDark ? "#38bdf8" : "#0ea5e9"}
                  />
                  <Text style={[styles.loadingText, { color: textSub }]}>
                    Loading employees...
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={paginatedData}
                  keyExtractor={(e) => e.id}
                  renderItem={renderTableRow}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                    />
                  }
                  initialNumToRender={pageSize}
                  maxToRenderPerBatch={pageSize}
                  windowSize={5}
                  removeClippedSubviews
                  getItemLayout={(_, index) => ({
                    length: 56,
                    offset: 56 * index,
                    index,
                  })}
                  ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                      <Text style={[styles.emptyTitle, { color: textMain }]}>
                        {debouncedSearch
                          ? "No employees match this search"
                          : "No employees found"}
                      </Text>
                      <Text style={[styles.emptySub, { color: textSub }]}>
                        {debouncedSearch
                          ? "Try a different search term."
                          : "Adjust filters or add a new employee."}
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </ScrollView>

          {/* Pagination Controls - Outside ScrollView so always visible */}
          {totalItems > 0 && (
            <View
              style={[
                styles.paginationContainer,
                { borderTopColor: isDark ? "#334155" : "#e2e8f0" },
              ]}
            >
              {/* Page size selector */}
              <View style={styles.pageSizeRow}>
                <Text style={[styles.paginationText, { color: textSub }]}>
                  Rows per page:
                </Text>
                <View style={styles.pageSizeOptions}>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <TouchableOpacity
                      key={size}
                      onPress={() => handlePageSizeChange(size)}
                      style={[
                        styles.pageSizeBtn,
                        {
                          backgroundColor:
                            pageSize === size
                              ? isDark
                                ? "#38bdf8"
                                : "#0ea5e9"
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pageSizeBtnText,
                          {
                            color:
                              pageSize === size
                                ? "#fff"
                                : isDark
                                  ? "#94a3b8"
                                  : "#64748b",
                          },
                        ]}
                      >
                        {size}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Page navigation */}
              <View style={styles.pageNavRow}>
                <Text style={[styles.paginationText, { color: textSub }]}>
                  {startIndex + 1}-{endIndex} of {totalItems}
                </Text>

                <View style={styles.pageNavBtns}>
                  <TouchableOpacity
                    onPress={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    style={[
                      styles.pageNavBtn,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        opacity: currentPage <= 1 ? 0.4 : 1,
                      },
                    ]}
                  >
                    <ChevronLeft
                      size={18}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>

                  <Text
                    style={[
                      styles.pageIndicator,
                      { color: isDark ? "#e2e8f0" : "#1e293b" },
                    ]}
                  >
                    {currentPage} / {totalPages}
                  </Text>

                  <TouchableOpacity
                    onPress={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    style={[
                      styles.pageNavBtn,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        opacity: currentPage >= totalPages ? 0.4 : 1,
                      },
                    ]}
                  >
                    <ChevronRight
                      size={18}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </GlassCard>
      </View>

      {/* ── View Details Modal ── */}
      <Modal
        visible={showDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetail(false)}
      >
        <View style={modalStyles.overlay}>
          <View
            style={[
              modalStyles.sheet,
              {
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.98)"
                  : "rgba(255,255,255,0.98)",
              },
            ]}
          >
            <View style={modalStyles.handle} />
            <View style={modalStyles.headerRow}>
              <Text style={[modalStyles.title, { color: textMain }]}>
                Employee Details
              </Text>
              <Pressable onPress={() => setShowDetail(false)}>
                <X size={22} color={textSub} />
              </Pressable>
            </View>

            {selectedEmployee && (
              <ScrollView
                contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
              >
                {/* Avatar + Name */}
                <View style={{ alignItems: "center", gap: 10 }}>
                  <OptimizedImage
                    uri={selectedEmployee.faceImageUrl}
                    fallbackName={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
                    borderRadius={6}
                    isAvatar={false}
                    style={{ width: 72, height: 72 }}
                  />
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "900",
                      color: textMain,
                    }}
                  >
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <RoleBadge
                      isForeman={selectedEmployee.isForeman}
                      isDark={isDark}
                    />
                    <StatusBadge
                      isActive={selectedEmployee.isActive}
                      isDark={isDark}
                    />
                  </View>
                </View>

                {/* Info rows */}
                <DetailRow
                  label="Day Rate"
                  value={formatMoney(selectedEmployee.defaultDayRate ?? 0)}
                  isDark={isDark}
                />
                <DetailRow
                  label="QR Code"
                  value={selectedEmployee.qrCodeValue || "—"}
                  isDark={isDark}
                  mono
                />
                <DetailRow
                  label="Added"
                  value={formatDate(selectedEmployee.createdAt)}
                  isDark={isDark}
                />
                <DetailRow
                  label="Phone"
                  value={selectedEmployee.phone || "—"}
                  isDark={isDark}
                />
                <DetailRow
                  label="Status"
                  value={selectedEmployee.isActive ? "Active" : "Inactive"}
                  isDark={isDark}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Create Employee Modal ── */}
      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={createModalStyles.overlay}>
            <View
              style={[
                createModalStyles.container,
                {
                  backgroundColor: isDark
                    ? "rgba(15,23,42,0.98)"
                    : "rgba(255,255,255,0.98)",
                  borderColor,
                },
              ]}
            >
              <View style={modalStyles.headerRow}>
                <Text style={[modalStyles.title, { color: textMain }]}>
                  Create a New Employee
                </Text>
                <Pressable onPress={() => setShowCreate(false)}>
                  <X size={22} color={textSub} />
                </Pressable>
              </View>
              <Text style={{ color: textSub, fontSize: 13, marginBottom: 12 }}>
                Add a new worker to your organization.
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {createError ? (
                  <View
                    style={{
                      backgroundColor: "rgba(239,68,68,0.1)",
                      padding: 10,
                      borderRadius: 6,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: "#dc2626", fontSize: 13 }}>
                      {createError}
                    </Text>
                  </View>
                ) : null}

                <Text
                  style={{
                    color: textMain,
                    fontSize: 13,
                    fontWeight: "700",
                    marginBottom: 4,
                  }}
                >
                  First Name *
                </Text>
                <TextInput
                  value={createFirstName}
                  onChangeText={setCreateFirstName}
                  placeholder="Enter first name"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  autoFocus
                  style={[
                    modalStyles.input,
                    {
                      color: textMain,
                      borderColor,
                      backgroundColor: isDark
                        ? "rgba(30,41,59,0.8)"
                        : "rgba(241,245,249,0.8)",
                    },
                  ]}
                />

                <Text
                  style={{
                    color: textMain,
                    fontSize: 13,
                    fontWeight: "700",
                    marginBottom: 4,
                    marginTop: 10,
                  }}
                >
                  Last Name *
                </Text>
                <TextInput
                  value={createLastName}
                  onChangeText={setCreateLastName}
                  placeholder="Enter last name"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  style={[
                    modalStyles.input,
                    {
                      color: textMain,
                      borderColor,
                      backgroundColor: isDark
                        ? "rgba(30,41,59,0.8)"
                        : "rgba(241,245,249,0.8)",
                    },
                  ]}
                />

                <Text
                  style={{
                    color: textMain,
                    fontSize: 13,
                    fontWeight: "700",
                    marginBottom: 4,
                    marginTop: 10,
                  }}
                >
                  Phone *
                </Text>
                <TextInput
                  value={createPhone}
                  onChangeText={setCreatePhone}
                  placeholder="Enter phone number"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  keyboardType="phone-pad"
                  style={[
                    modalStyles.input,
                    {
                      color: textMain,
                      borderColor,
                      backgroundColor: isDark
                        ? "rgba(30,41,59,0.8)"
                        : "rgba(241,245,249,0.8)",
                    },
                  ]}
                />

                <Text
                  style={{
                    color: textMain,
                    fontSize: 13,
                    fontWeight: "700",
                    marginBottom: 4,
                    marginTop: 10,
                  }}
                >
                  Face Photo
                </Text>
                {createPhoto ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Image
                      source={{ uri: createPhoto.uri }}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 8,
                        backgroundColor: isDark ? "#1e293b" : "#e2e8f0",
                      }}
                    />
                    <View style={{ flex: 1, gap: 8 }}>
                      <Pressable
                        onPress={async () => {
                          try {
                            const perm =
                              await ImagePicker.requestCameraPermissionsAsync();
                            if (!perm.granted) {
                              Alert.alert(
                                "Permission",
                                "Camera permission is required.",
                              );
                              return;
                            }
                            const res = await ImagePicker.launchCameraAsync({
                              mediaTypes: ImagePicker.MediaTypeOptions.Images,
                              quality: 0.85,
                              allowsEditing: true,
                              aspect: [1, 1],
                            });
                            if (!res.canceled && res.assets?.[0]?.uri) {
                              const uri = res.assets[0].uri;
                              const ext =
                                uri.split(".").pop()?.toLowerCase() || "jpg";
                              setCreatePhoto({
                                uri,
                                name: `employee_${Date.now()}.${ext}`,
                                type:
                                  ext === "png"
                                    ? "image/png"
                                    : ext === "webp"
                                      ? "image/webp"
                                      : "image/jpeg",
                              });
                            }
                          } catch (e: any) {
                            Alert.alert(
                              "Camera",
                              e?.message ?? "Failed to take photo.",
                            );
                          }
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: isDark
                            ? "rgba(148,163,184,0.3)"
                            : "rgba(0,0,0,0.15)",
                          backgroundColor: isDark
                            ? "rgba(30,41,59,0.6)"
                            : "rgba(241,245,249,0.8)",
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 6,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: textMain,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          Change Photo
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={async () => {
                          try {
                            const perm =
                              await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (!perm.granted) {
                              Alert.alert(
                                "Permission",
                                "Gallery permission is required.",
                              );
                              return;
                            }
                            const res =
                              await ImagePicker.launchImageLibraryAsync({
                                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                                quality: 0.85,
                                allowsEditing: true,
                                aspect: [1, 1],
                              });
                            if (!res.canceled && res.assets?.[0]?.uri) {
                              const uri = res.assets[0].uri;
                              const ext =
                                uri.split(".").pop()?.toLowerCase() || "jpg";
                              setCreatePhoto({
                                uri,
                                name: `employee_${Date.now()}.${ext}`,
                                type:
                                  ext === "png"
                                    ? "image/png"
                                    : ext === "webp"
                                      ? "image/webp"
                                      : "image/jpeg",
                              });
                            }
                          } catch (e: any) {
                            Alert.alert(
                              "Gallery",
                              e?.message ?? "Failed to pick image.",
                            );
                          }
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: isDark
                            ? "rgba(148,163,184,0.3)"
                            : "rgba(0,0,0,0.15)",
                          backgroundColor: isDark
                            ? "rgba(30,41,59,0.6)"
                            : "rgba(241,245,249,0.8)",
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 6,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: textMain,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          Upload from Device
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setCreatePhoto(null)}
                        style={{
                          borderWidth: 1,
                          borderColor: "#dc2626",
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 6,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#dc2626",
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={async () => {
                        try {
                          const perm =
                            await ImagePicker.requestCameraPermissionsAsync();
                          if (!perm.granted) {
                            Alert.alert(
                              "Permission",
                              "Camera permission is required.",
                            );
                            return;
                          }
                          const res = await ImagePicker.launchCameraAsync({
                            mediaTypes: ImagePicker.MediaTypeOptions.Images,
                            quality: 0.85,
                            allowsEditing: true,
                            aspect: [1, 1],
                          });
                          if (!res.canceled && res.assets?.[0]?.uri) {
                            const uri = res.assets[0].uri;
                            const ext =
                              uri.split(".").pop()?.toLowerCase() || "jpg";
                            setCreatePhoto({
                              uri,
                              name: `employee_${Date.now()}.${ext}`,
                              type:
                                ext === "png"
                                  ? "image/png"
                                  : ext === "webp"
                                    ? "image/webp"
                                    : "image/jpeg",
                            });
                          }
                        } catch (e: any) {
                          Alert.alert(
                            "Camera",
                            e?.message ?? "Failed to take photo.",
                          );
                        }
                      }}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: isDark
                          ? "rgba(148,163,184,0.3)"
                          : "rgba(0,0,0,0.15)",
                        backgroundColor: isDark
                          ? "rgba(30,41,59,0.6)"
                          : "rgba(241,245,249,0.8)",
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: textMain,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        📷 Take Photo
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        try {
                          const perm =
                            await ImagePicker.requestMediaLibraryPermissionsAsync();
                          if (!perm.granted) {
                            Alert.alert(
                              "Permission",
                              "Gallery permission is required.",
                            );
                            return;
                          }
                          const res = await ImagePicker.launchImageLibraryAsync(
                            {
                              mediaTypes: ImagePicker.MediaTypeOptions.Images,
                              quality: 0.85,
                              allowsEditing: true,
                              aspect: [1, 1],
                            },
                          );
                          if (!res.canceled && res.assets?.[0]?.uri) {
                            const uri = res.assets[0].uri;
                            const ext =
                              uri.split(".").pop()?.toLowerCase() || "jpg";
                            setCreatePhoto({
                              uri,
                              name: `employee_${Date.now()}.${ext}`,
                              type:
                                ext === "png"
                                  ? "image/png"
                                  : ext === "webp"
                                    ? "image/webp"
                                    : "image/jpeg",
                            });
                          }
                        } catch (e: any) {
                          Alert.alert(
                            "Gallery",
                            e?.message ?? "Failed to pick image.",
                          );
                        }
                      }}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: isDark
                          ? "rgba(148,163,184,0.3)"
                          : "rgba(0,0,0,0.15)",
                        backgroundColor: isDark
                          ? "rgba(30,41,59,0.6)"
                          : "rgba(241,245,249,0.8)",
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: textMain,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        📁 Upload
                      </Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <Pressable
                  onPress={() => setShowCreate(false)}
                  style={[
                    modalStyles.cancelBtn,
                    {
                      backgroundColor: isDark
                        ? "rgba(51,65,85,0.6)"
                        : "rgba(226,232,240,0.8)",
                    },
                  ]}
                >
                  <Text
                    style={{ color: textSub, fontWeight: "700", fontSize: 13 }}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleCreateEmployee}
                  disabled={creating}
                  style={[
                    modalStyles.submitBtn,
                    { opacity: creating ? 0.6 : 1 },
                  ]}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}
                    >
                      Create Employee
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AuthStyleBackground>
  );
}

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onPress,
  style,
  isDark,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onPress: (field: SortField) => void;
  style?: any;
  isDark: boolean;
}) {
  const isActive = currentField === field;
  const textColor = isDark ? "#cbd5e1" : "#475569";
  const activeColor = isDark ? "#38bdf8" : "#0ea5e9";

  const SortIcon =
    isActive && currentDir === "asc" ? (
      <ChevronUp size={14} color={activeColor} />
    ) : isActive ? (
      <ChevronDown size={14} color={activeColor} />
    ) : null;

  return (
    <Pressable
      style={[styles.headerCell, style]}
      onPress={() => onPress(field)}
    >
      <Text
        style={[
          styles.headerText,
          { color: isActive ? activeColor : textColor },
        ]}
      >
        {label}
      </Text>
      {SortIcon}
    </Pressable>
  );
}

const TableRow = React.memo(function TableRow({
  item,
  index,
  isDark,
  textMain,
  textSub,
  actionsId,
  setActionsId,
  onViewDetails,
  onDownloadCard,
}: {
  item: Employee;
  index: number;
  isDark: boolean;
  textMain: string;
  textSub: string;
  borderColor: string;
  actionsId: string | null;
  setActionsId: (id: string | null) => void;
  onViewDetails: (emp: Employee) => void;
  onDownloadCard: (emp: Employee) => void;
}) {
  const fullName = `${item.firstName} ${item.lastName}`;
  const rowBg =
    index % 2 === 0
      ? isDark
        ? "rgba(30,41,59,0.3)"
        : "rgba(248,250,252,0.5)"
      : "transparent";
  const isOpen = actionsId === item.id;

  return (
    <View style={[styles.tableRow, { backgroundColor: rowBg }]}>
      {/* Employee column – avatar + name + badges */}
      <View style={styles.colEmployee}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <OptimizedImage
            uri={item.faceImageUrl}
            fallbackName={fullName}
            borderRadius={4}
            isAvatar={false}
            style={{ width: 40, height: 40 }}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={[styles.cellText, { color: textMain }]}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <RoleBadge isForeman={item.isForeman} isDark={isDark} />
              {!item.isActive && (
                <View
                  style={[
                    styles.roleBadge,
                    {
                      backgroundColor: isDark
                        ? "rgba(239,68,68,0.2)"
                        : "rgba(239,68,68,0.12)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleBadgeText,
                      { color: isDark ? "#f87171" : "#dc2626" },
                    ]}
                  >
                    Inactive
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Phone */}
      <View style={styles.colPhone}>
        <Text
          style={[styles.cellTextSmall, { color: textSub }]}
          numberOfLines={1}
        >
          {item.phone || "—"}
        </Text>
      </View>

      {/* Day Rate */}
      <View style={styles.colRate}>
        <Text style={[styles.cellText, { color: textMain }]} numberOfLines={1}>
          {item.defaultDayRate
            ? formatMoney(item.defaultDayRate)
            : "Company default"}
        </Text>
      </View>

      {/* QR Code */}
      <View style={styles.colCode}>
        <Text
          style={[styles.cellTextMono, { color: textSub }]}
          numberOfLines={1}
        >
          {item.qrCodeValue || "—"}
        </Text>
      </View>

      {/* Added */}
      <View style={styles.colDate}>
        <Text
          style={[styles.cellTextSmall, { color: textSub }]}
          numberOfLines={1}
        >
          {formatDate(item.createdAt)}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.colActions}>
        <Pressable
          onPress={() => setActionsId(isOpen ? null : item.id)}
          style={[
            styles.actionsBtn,
            {
              backgroundColor: isOpen
                ? isDark
                  ? "rgba(56,189,248,0.15)"
                  : "rgba(14,165,233,0.1)"
                : "transparent",
              borderColor: isDark ? "#334155" : "#e2e8f0",
            },
          ]}
        >
          <MoreVertical size={16} color={isDark ? "#94a3b8" : "#64748b"} />
        </Pressable>
        {isOpen && (
          <View
            style={[
              styles.dropdown,
              {
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.98)"
                  : "rgba(255,255,255,0.98)",
                borderColor: isDark ? "#334155" : "#e2e8f0",
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.dropdownItem,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(56,189,248,0.1)"
                      : "rgba(14,165,233,0.06)"
                    : "transparent",
                },
              ]}
              onPress={() => onViewDetails(item)}
            >
              <Eye size={15} color={isDark ? "#38bdf8" : "#0ea5e9"} />
              <Text
                style={{ color: textMain, fontSize: 13, fontWeight: "700" }}
              >
                View Details
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownItem,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(16,185,129,0.1)"
                      : "rgba(16,185,129,0.06)"
                    : "transparent",
                },
              ]}
              onPress={() => {
                setActionsId(null);
                onDownloadCard(item);
              }}
            >
              <Download size={15} color="#10b981" />
              <Text
                style={{ color: textMain, fontSize: 13, fontWeight: "700" }}
              >
                Download Card
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
});

function StatusBadge({
  isActive,
  isDark,
}: {
  isActive: boolean;
  isDark: boolean;
}) {
  const bg = isActive
    ? isDark
      ? "rgba(34,197,94,0.2)"
      : "rgba(34,197,94,0.12)"
    : isDark
      ? "rgba(239,68,68,0.2)"
      : "rgba(239,68,68,0.12)";
  const color = isActive
    ? isDark
      ? "#4ade80"
      : "#16a34a"
    : isDark
      ? "#f87171"
      : "#dc2626";

  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={[styles.statusText, { color }]}>
        {isActive ? "Active" : "Inactive"}
      </Text>
    </View>
  );
}

function RoleBadge({
  isForeman,
  isDark,
}: {
  isForeman?: boolean;
  isDark: boolean;
}) {
  if (isForeman) {
    return (
      <View
        style={[
          styles.roleBadge,
          {
            backgroundColor: isDark
              ? "rgba(56,189,248,0.2)"
              : "rgba(14,165,233,0.12)",
          },
        ]}
      >
        <Text
          style={[
            styles.roleBadgeText,
            { color: isDark ? "#38bdf8" : "#0ea5e9" },
          ]}
        >
          Foreman
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.roleBadge,
        {
          backgroundColor: isDark
            ? "rgba(148,163,184,0.15)"
            : "rgba(100,116,139,0.1)",
        },
      ]}
    >
      <Text
        style={[
          styles.roleBadgeText,
          { color: isDark ? "#94a3b8" : "#64748b" },
        ]}
      >
        Individual
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  isDark,
  mono,
}: {
  label: string;
  value: string;
  isDark: boolean;
  mono?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: isDark
          ? "rgba(51,65,85,0.5)"
          : "rgba(226,232,240,0.8)",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: isDark ? "#94a3b8" : "#6b7280",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "800",
          color: isDark ? "#e5e7eb" : "#111827",
          fontFamily: mono ? "monospace" : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function FilterPill({
  label,
  active,
  onPress,
  isDark,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        active
          ? isDark
            ? styles.pillActiveDark
            : styles.pillActive
          : isDark
            ? styles.pillInactiveDark
            : styles.pillInactive,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active
              ? isDark
                ? "#0f172a"
                : "#111827"
              : isDark
                ? "#cbd5e1"
                : "#6b7280",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    gap: 12,
  },
  headerCard: {
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  h1: {
    fontSize: 20,
    fontWeight: "900",
  },
  sub: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  searchInput: {
    height: 40,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontWeight: "700",
    fontSize: 14,
    borderWidth: 1,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  tableCard: {
    flex: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.1)",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  colEmployee: {
    width: 230,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.08)",
  },
  colCode: {
    width: 120,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.08)",
  },
  colRate: {
    width: 120,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.08)",
  },
  colDate: {
    width: 110,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.08)",
  },
  colPhone: {
    width: 120,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.08)",
  },
  colActions: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cellText: {
    fontSize: 13,
    fontWeight: "700",
  },
  cellTextMono: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  cellTextSmall: {
    fontSize: 12,
    fontWeight: "600",
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: "#bfdbfe",
    borderColor: "#60a5fa",
  },
  pillInactive: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderColor: "rgba(148,163,184,0.6)",
  },
  pillActiveDark: {
    backgroundColor: "rgba(56,189,248,0.22)",
    borderColor: "rgba(56,189,248,0.7)",
  },
  pillInactiveDark: {
    backgroundColor: "rgba(15,23,42,0.9)",
    borderColor: "rgba(51,65,85,0.9)",
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "700",
  },
  errorWrap: {
    margin: 16,
    padding: 16,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#dc2626",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  emptySub: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  paginationContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  pageSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageSizeOptions: {
    flexDirection: "row",
    gap: 4,
  },
  pageSizeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pageSizeBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  paginationText: {
    fontSize: 12,
    fontWeight: "700",
  },
  pageNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageNavBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  pageIndicator: {
    fontSize: 13,
    fontWeight: "800",
    minWidth: 60,
    textAlign: "center",
  },
  actionsBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdown: {
    position: "absolute",
    top: 38,
    right: 4,
    minWidth: 150,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

const createModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: 12,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(148,163,184,0.4)",
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
  },
  input: {
    height: 42,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontWeight: "700",
    fontSize: 14,
    borderWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  submitBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
});
