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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  apiAdminForemenList,
  apiAdminCreateAssistant,
  apiEmployees,
  type AdminForemanListItemDto,
  type ApiEmployee,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

// ─── Theme ───
function useColors() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return {
    isDark,
    bg: isDark ? "#0f172a" : "#f8fafc",
    title: isDark ? "#f1f5f9" : "#0f172a",
    subtitle: isDark ? "#94a3b8" : "#64748b",
    textMuted: isDark ? "#94a3b8" : "#64748b",
    label: isDark ? "#e2e8f0" : "#1e293b",
    cardBg: isDark ? "rgba(30, 41, 59, 0.95)" : "#ffffff",
    cardBorder: isDark ? "rgba(71, 85, 105, 0.5)" : "#e2e8f0",
    searchBg: isDark ? "rgba(30, 41, 59, 0.6)" : "#f5f5f5",
    searchBorder: isDark ? "rgba(71, 85, 105, 0.5)" : "#e0e0e0",
    searchBorderActive: isDark ? "#38bdf8" : "#007AFF",
    searchBgActive: isDark ? "rgba(30, 41, 59, 0.9)" : "#fff",
    inputText: isDark ? "#f1f5f9" : "#111",
    inputBg: isDark ? "rgba(15, 23, 42, 0.6)" : "#f9fafb",
    inputBorder: isDark ? "rgba(71, 85, 105, 0.5)" : "#d1d5db",
    placeholder: isDark ? "#64748b" : "#999",
    rowBorder: isDark ? "rgba(71, 85, 105, 0.3)" : "#e0e0e0",
    nameText: isDark ? "#f1f5f9" : "#111",
    emailText: isDark ? "#94a3b8" : "#666",
    assistantBadgeBg: isDark ? "rgba(168, 85, 247, 0.15)" : "#f3e8ff",
    assistantBadgeText: isDark ? "#a855f7" : "#7c3aed",
    errorBg: isDark ? "rgba(239, 68, 68, 0.1)" : "rgba(176, 0, 32, 0.08)",
    errorText: isDark ? "#ef4444" : "#b00020",
    clearBtn: isDark ? "#64748b" : "#999",
    countText: isDark ? "#64748b" : "#999",
    overlay: "rgba(0,0,0,0.5)",
    modalBg: isDark ? "#1e293b" : "#ffffff",
    primary: isDark ? "#38bdf8" : "#2563eb",
    primaryText: "#ffffff",
    dangerBg: isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
    infoBg: isDark ? "rgba(56, 189, 248, 0.1)" : "#eff6ff",
    infoBorder: isDark ? "rgba(56, 189, 248, 0.3)" : "#bfdbfe",
    infoText: isDark ? "#38bdf8" : "#1d4ed8",
    successBg: isDark ? "rgba(34, 197, 94, 0.1)" : "#f0fdf4",
    successBorder: isDark ? "rgba(34, 197, 94, 0.3)" : "#bbf7d0",
    successText: isDark ? "#22c55e" : "#15803d",
    codeBg: isDark ? "rgba(15, 23, 42, 0.8)" : "#f1f5f9",
    divider: isDark ? "rgba(71, 85, 105, 0.3)" : "#e5e7eb",
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

// ─── Foreman Row ───
function ForemanRow({
  item,
  isLast,
  colors,
  onPress,
}: {
  item: AdminForemanListItemDto;
  isLast: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const initials = item.name
    ? item.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.foremanRow,
        !isLast && {
          borderBottomWidth: 1,
          borderBottomColor: colors.rowBorder,
        },
      ]}
    >
      <View style={styles.foremanContent}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.foremanTextContainer}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.foremanName, { color: colors.nameText }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.isAssistant && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: colors.assistantBadgeBg },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: colors.assistantBadgeText },
                  ]}
                >
                  Assistant
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.foremanEmail, { color: colors.emailText }]}
            numberOfLines={1}
          >
            {item.email}
          </Text>
          {item.defaultDayRate && !item.isAssistant ? (
            <Text style={[styles.foremanRate, { color: colors.textMuted }]}>
              R {Number(item.defaultDayRate).toFixed(2)}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 18, color: colors.textMuted }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Detail Section Row ───
function DetailRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
          {label}
        </Text>
        <Text style={[styles.detailValue, { color: colors.title }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ─── Employee Picker Item ───
function EmployeePickerItem({
  emp,
  selected,
  colors,
  onSelect,
}: {
  emp: ApiEmployee;
  selected: boolean;
  colors: ReturnType<typeof useColors>;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onSelect}
      style={[
        styles.empPickerItem,
        { borderColor: selected ? colors.primary : colors.inputBorder },
        selected && { backgroundColor: colors.infoBg },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.empPickerName, { color: colors.nameText }]}>
          {emp.fullName}
        </Text>
        <Text style={[styles.empPickerCode, { color: colors.textMuted }]}>
          Code: {emp.code}
        </Text>
      </View>
      {selected && <Text style={{ fontSize: 20 }}>✓</Text>}
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════
export default function AdminForemenScreen() {
  const colors = useColors();
  const searchInputRef = useRef<TextInput>(null);

  // List state
  const [foremen, setForemen] = useState<AdminForemanListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // View detail modal
  const [selectedForeman, setSelectedForeman] =
    useState<AdminForemanListItemDto | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Add assistant modal
  const [assistantModalVisible, setAssistantModalVisible] = useState(false);
  const [assistantForeman, setAssistantForeman] =
    useState<AdminForemanListItemDto | null>(null);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(
    null,
  );
  const [isNewUser, setIsNewUser] = useState(true);
  const [assistantName, setAssistantName] = useState("");
  const [assistantEmail, setAssistantEmail] = useState("");
  const [assistantPassword, setAssistantPassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  // Credentials modal
  const [credsVisible, setCredsVisible] = useState(false);
  const [credsData, setCredsData] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ─── Debounce search ───
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const filtered = useMemo(() => {
    if (!debouncedQ) return foremen;
    return foremen.filter(
      (f) =>
        f.name.toLowerCase().includes(debouncedQ) ||
        f.email.toLowerCase().includes(debouncedQ),
    );
  }, [foremen, debouncedQ]);

  // ─── Load foremen ───
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdminForemenList();
      setForemen(res.foremen ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load foremen.");
      setForemen([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiAdminForemenList();
      setForemen(res.foremen ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Open detail ───
  const openDetail = (foreman: AdminForemanListItemDto) => {
    setSelectedForeman(foreman);
    setDetailVisible(true);
  };

  // ─── Filtered employees for assistant picker ───
  const filteredEmployees = useMemo(() => {
    const s = empSearch.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter(
      (e) =>
        (e.fullName || "").toLowerCase().includes(s) ||
        (e.code || "").toLowerCase().includes(s),
    );
  }, [employees, empSearch]);

  // ─── Open add assistant ───
  const openAddAssistant = async (foreman: AdminForemanListItemDto) => {
    setDetailVisible(false);
    setAssistantForeman(foreman);
    setSelectedEmployee(null);
    setAssistantName("");
    setAssistantEmail("");
    setAssistantPassword("");
    setEmpSearch("");
    setIsNewUser(true);
    setAssistantModalVisible(true);

    // Load employees
    setEmpLoading(true);
    try {
      const res = await apiEmployees();
      setEmployees(res.employees ?? []);
    } catch {
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  };

  // ─── Select employee for assistant ───
  const handleSelectEmployee = (emp: ApiEmployee) => {
    setSelectedEmployee(emp);
    // If the employee already has a user account, auto-fill
    const hasUser = false; // employees don't expose userId in this DTO
    setIsNewUser(true);
    setAssistantName(emp.fullName || "");
    setAssistantEmail("");
    setAssistantPassword("");
  };

  // ─── Create assistant ───
  const handleCreateAssistant = async () => {
    if (!assistantForeman) return;
    if (!selectedEmployee) {
      Alert.alert("Error", "Please select an employee");
      return;
    }
    if (!assistantName.trim()) {
      Alert.alert("Error", "Please enter assistant name");
      return;
    }
    if (!assistantEmail.trim()) {
      Alert.alert("Error", "Please enter assistant email");
      return;
    }
    if (isNewUser && assistantPassword.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }

    setCreateLoading(true);
    try {
      const res = await apiAdminCreateAssistant(assistantForeman.foremanId, {
        employeeId: selectedEmployee.id,
        assistantName: assistantName.trim(),
        assistantEmail: assistantEmail.trim(),
        assistantPassword: assistantPassword,
      });

      setAssistantModalVisible(false);
      setCredsData({
        name: res.assistant?.assistantName || assistantName,
        email: res.assistant?.assistantEmail || assistantEmail,
        password: assistantPassword,
      });
      setCredsVisible(true);
      load(); // refresh list
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to create assistant");
    } finally {
      setCreateLoading(false);
    }
  };

  // ─── Copy to clipboard ───
  const copyToClipboard = async (text: string, field: string) => {
    // No clipboard package installed – show an alert so user can manually copy
    Alert.alert("Copied", text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={[styles.pageTitle, { color: colors.title }]}>Foremen</Text>
        <Text style={[styles.pageSubtitle, { color: colors.subtitle }]}>
          Manage all foremen and assistants
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Pressable
          onPress={() => searchInputRef.current?.focus()}
          style={[
            styles.searchContainer,
            {
              backgroundColor: searchActive
                ? colors.searchBgActive
                : colors.searchBg,
              borderColor: searchActive
                ? colors.searchBorderActive
                : colors.searchBorder,
            },
          ]}
        >
          <Text style={styles.searchIconText} pointerEvents="none">
            🔍
          </Text>
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInputField, { color: colors.inputText }]}
            placeholder="Search by name or email…"
            placeholderTextColor={colors.placeholder}
            value={q}
            onChangeText={setQ}
            onFocus={() => setSearchActive(true)}
            onBlur={() => setSearchActive(false)}
            selectionColor="#007AFF"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {q.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQ("");
                searchInputRef.current?.focus();
              }}
              style={styles.clearButton}
            >
              <Text
                style={[styles.clearButtonText, { color: colors.clearBtn }]}
              >
                ✕
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
        {filtered.length > 0 && !loading && (
          <Text style={[styles.resultCount, { color: colors.countText }]}>
            {filtered.length} foreman{filtered.length !== 1 ? "s" : ""} found
          </Text>
        )}
      </View>

      {/* Error */}
      {error && (
        <View
          style={[styles.errorContainer, { backgroundColor: colors.errorBg }]}
        >
          <Text style={[styles.errorText, { color: colors.errorText }]}>
            {error}
          </Text>
        </View>
      )}

      {/* Foremen List */}
      <FlatList
        data={filtered}
        keyExtractor={(x) => x.foremanId}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.title} />
              <Text style={[styles.emptyTitle, { color: colors.title }]}>
                Loading foremen…
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{q ? "🔍" : "👥"}</Text>
              <Text style={[styles.emptyTitle, { color: colors.title }]}>
                {q ? "No foremen found" : "No foremen"}
              </Text>
              <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
                {q
                  ? "Try adjusting your search criteria"
                  : "No foremen available"}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <ForemanRow
            item={item}
            isLast={index === filtered.length - 1}
            colors={colors}
            onPress={() => openDetail(item)}
          />
        )}
      />

      {/* ═══ VIEW DETAIL MODAL ═══ */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.modalBg,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.title }]}>
                Foreman Details
              </Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Text style={{ fontSize: 22, color: colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedForeman && (
              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <DetailRow
                  icon="👤"
                  label="NAME"
                  value={selectedForeman.name}
                  colors={colors}
                />
                <DetailRow
                  icon="✉️"
                  label="EMAIL"
                  value={selectedForeman.email}
                  colors={colors}
                />
                <DetailRow
                  icon="💼"
                  label="ROLE"
                  value={selectedForeman.isAssistant ? "Assistant" : "Foreman"}
                  colors={colors}
                />
                {selectedForeman.defaultDayRate &&
                  !selectedForeman.isAssistant && (
                    <DetailRow
                      icon="💰"
                      label="DEFAULT DAY RATE"
                      value={`R ${Number(selectedForeman.defaultDayRate).toFixed(2)}`}
                      colors={colors}
                    />
                  )}
                <DetailRow
                  icon="📅"
                  label="CREATED"
                  value={formatDate(selectedForeman.createdAt)}
                  colors={colors}
                />

                {/* Action Buttons */}
                <View
                  style={[
                    styles.modalActions,
                    { borderTopColor: colors.divider },
                  ]}
                >
                  {!selectedForeman.isAssistant && (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        { backgroundColor: colors.primary },
                      ]}
                      onPress={() => openAddAssistant(selectedForeman)}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          { color: colors.primaryText },
                        ]}
                      >
                        👤+ Add Assistant
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                    onPress={() => setDetailVisible(false)}
                  >
                    <Text
                      style={[styles.actionBtnText, { color: colors.title }]}
                    >
                      Close
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ═══ ADD ASSISTANT MODAL ═══ */}
      <Modal
        visible={assistantModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssistantModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          >
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: colors.modalBg,
                  borderColor: colors.cardBorder,
                  maxHeight: "90%",
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.title }]}>
                  Create Assistant
                </Text>
                <TouchableOpacity
                  onPress={() => setAssistantModalVisible(false)}
                >
                  <Text style={{ fontSize: 22, color: colors.textMuted }}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalSubhead, { color: colors.textMuted }]}>
                Create an assistant for{" "}
                <Text style={{ fontWeight: "700", color: colors.title }}>
                  {assistantForeman?.name || assistantForeman?.email}
                </Text>
              </Text>

              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Employee picker */}
                <Text style={[styles.fieldLabel, { color: colors.label }]}>
                  Select Employee
                </Text>
                {!empLoading && employees.length > 0 && (
                  <View
                    style={[
                      styles.empSearchContainer,
                      {
                        backgroundColor: colors.inputBg,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Text style={styles.empSearchIcon}>🔍</Text>
                    <TextInput
                      style={[
                        styles.empSearchInput,
                        { color: colors.inputText },
                      ]}
                      placeholder="Search employees…"
                      placeholderTextColor={colors.placeholder}
                      value={empSearch}
                      onChangeText={setEmpSearch}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {empSearch.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setEmpSearch("")}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ fontSize: 16, color: colors.clearBtn }}>
                          ✕
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {empLoading ? (
                  <ActivityIndicator
                    style={{ marginVertical: 16 }}
                    color={colors.primary}
                  />
                ) : employees.length === 0 ? (
                  <Text
                    style={[
                      styles.fieldHint,
                      { color: colors.textMuted, marginBottom: 12 },
                    ]}
                  >
                    No employees available
                  </Text>
                ) : filteredEmployees.length === 0 ? (
                  <Text
                    style={[
                      styles.fieldHint,
                      { color: colors.textMuted, marginVertical: 12 },
                    ]}
                  >
                    No employees match "{empSearch}"
                  </Text>
                ) : (
                  <View style={styles.empPickerList}>
                    {filteredEmployees.map((emp) => (
                      <EmployeePickerItem
                        key={emp.id}
                        emp={emp}
                        selected={selectedEmployee?.id === emp.id}
                        colors={colors}
                        onSelect={() => handleSelectEmployee(emp)}
                      />
                    ))}
                  </View>
                )}

                {selectedEmployee && (
                  <View
                    style={[
                      styles.infoBox,
                      {
                        backgroundColor: colors.infoBg,
                        borderColor: colors.infoBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.infoBoxText, { color: colors.infoText }]}
                    >
                      ℹ️ Creating new user account for this employee
                    </Text>
                  </View>
                )}

                {/* Name */}
                <Text style={[styles.fieldLabel, { color: colors.label }]}>
                  Assistant Name
                </Text>
                <TextInput
                  style={[
                    styles.textField,
                    {
                      color: colors.inputText,
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                  placeholder="Assistant name"
                  placeholderTextColor={colors.placeholder}
                  value={assistantName}
                  onChangeText={setAssistantName}
                  autoCapitalize="words"
                />

                {/* Email */}
                <Text style={[styles.fieldLabel, { color: colors.label }]}>
                  Assistant Email
                </Text>
                <TextInput
                  style={[
                    styles.textField,
                    {
                      color: colors.inputText,
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                  placeholder="assistant@example.com"
                  placeholderTextColor={colors.placeholder}
                  value={assistantEmail}
                  onChangeText={setAssistantEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                {/* Password */}
                {isNewUser && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.label }]}>
                      Assistant Password
                    </Text>
                    <TextInput
                      style={[
                        styles.textField,
                        {
                          color: colors.inputText,
                          backgroundColor: colors.inputBg,
                          borderColor: colors.inputBorder,
                        },
                      ]}
                      placeholder="Min 8 characters"
                      placeholderTextColor={colors.placeholder}
                      value={assistantPassword}
                      onChangeText={setAssistantPassword}
                      secureTextEntry
                    />
                  </>
                )}

                {/* Buttons */}
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: colors.cardBorder,
                        flex: 1,
                      },
                    ]}
                    onPress={() => setAssistantModalVisible(false)}
                  >
                    <Text
                      style={[styles.actionBtnText, { color: colors.title }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: colors.primary,
                        flex: 1,
                        opacity: createLoading ? 0.6 : 1,
                      },
                    ]}
                    onPress={handleCreateAssistant}
                    disabled={createLoading}
                  >
                    {createLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text
                        style={[
                          styles.actionBtnText,
                          { color: colors.primaryText },
                        ]}
                      >
                        Create Assistant
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ CREDENTIALS MODAL ═══ */}
      <Modal
        visible={credsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCredsVisible(false)}
      >
        <View
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.modalBg,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.title }]}>
                Assistant Created ✓
              </Text>
              <TouchableOpacity onPress={() => setCredsVisible(false)}>
                <Text style={{ fontSize: 22, color: colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text
              style={[
                styles.modalSubhead,
                { color: colors.textMuted, marginBottom: 16 },
              ]}
            >
              Save these credentials securely:
            </Text>

            {credsData && (
              <View style={styles.modalBody}>
                {/* Name */}
                <Text style={[styles.credLabel, { color: colors.label }]}>
                  Name
                </Text>
                <View style={styles.credRow}>
                  <View
                    style={[
                      styles.credValueBox,
                      { backgroundColor: colors.codeBg },
                    ]}
                  >
                    <Text
                      style={[styles.credValue, { color: colors.inputText }]}
                      selectable
                    >
                      {credsData.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyBtn, { borderColor: colors.cardBorder }]}
                    onPress={() => copyToClipboard(credsData.name, "name")}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {copiedField === "name" ? "✓" : "Copy"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Email */}
                <Text style={[styles.credLabel, { color: colors.label }]}>
                  Email
                </Text>
                <View style={styles.credRow}>
                  <View
                    style={[
                      styles.credValueBox,
                      { backgroundColor: colors.codeBg },
                    ]}
                  >
                    <Text
                      style={[styles.credValue, { color: colors.inputText }]}
                      selectable
                    >
                      {credsData.email}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyBtn, { borderColor: colors.cardBorder }]}
                    onPress={() => copyToClipboard(credsData.email, "email")}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {copiedField === "email" ? "✓" : "Copy"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Password */}
                <Text style={[styles.credLabel, { color: colors.label }]}>
                  Password
                </Text>
                <View style={styles.credRow}>
                  <View
                    style={[
                      styles.credValueBox,
                      { backgroundColor: colors.codeBg },
                    ]}
                  >
                    <Text
                      style={[styles.credValue, { color: colors.inputText }]}
                      selectable
                    >
                      {credsData.password}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyBtn, { borderColor: colors.cardBorder }]}
                    onPress={() =>
                      copyToClipboard(credsData.password, "password")
                    }
                  >
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {copiedField === "password" ? "✓" : "Copy"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Warning */}
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: colors.infoBg,
                      borderColor: colors.infoBorder,
                      marginTop: 16,
                    },
                  ]}
                >
                  <Text
                    style={[styles.infoBoxText, { color: colors.infoText }]}
                  >
                    ℹ️ Share these credentials securely. They will not be shown
                    again.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: colors.primary,
                      marginTop: 20,
                    },
                  ]}
                  onPress={() => setCredsVisible(false)}
                >
                  <Text
                    style={[
                      styles.actionBtnText,
                      { color: colors.primaryText },
                    ]}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  headerSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  pageSubtitle: { marginTop: 6, fontSize: 14, fontWeight: "600" },

  // Search
  searchSection: { paddingHorizontal: 16, paddingVertical: 12 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 48,
  },
  searchIconText: { fontSize: 18, marginRight: 10 },
  searchInputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  clearButton: { padding: 8, marginLeft: 8 },
  clearButtonText: { fontSize: 18, fontWeight: "600" },
  resultCount: { marginTop: 8, fontSize: 12, fontWeight: "600" },

  // Error
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { fontWeight: "600", fontSize: 13 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },

  // Foreman Row
  foremanRow: { paddingVertical: 14 },
  foremanContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  foremanTextContainer: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  foremanName: { fontSize: 16, fontWeight: "700" },
  foremanEmail: { fontSize: 13, fontWeight: "500", marginBottom: 2 },
  foremanRate: { fontSize: 12, fontWeight: "500" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalSubhead: { paddingHorizontal: 20, fontSize: 14, marginBottom: 4 },
  modalBody: { paddingHorizontal: 20 },

  // Detail
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  detailIcon: { fontSize: 20, marginTop: 2 },
  detailLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  detailValue: { fontSize: 15, fontWeight: "600", marginTop: 2 },

  // Modal actions
  modalActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 10,
  },

  actionBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { fontSize: 15, fontWeight: "700" },

  // Form
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 6,
  },
  fieldHint: { fontSize: 13 },
  textField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "500",
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    marginBottom: 16,
  },

  // Employee picker
  empSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  empSearchIcon: { fontSize: 15, marginRight: 8 },
  empSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  empPickerList: { gap: 8, marginBottom: 8 },
  empPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  empPickerName: { fontSize: 15, fontWeight: "600" },
  empPickerCode: { fontSize: 12, marginTop: 2 },

  // Info box
  infoBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  infoBoxText: { fontSize: 13, fontWeight: "500", lineHeight: 18 },

  // Credentials
  credLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  credRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  credValueBox: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  credValue: {
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  copyBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
