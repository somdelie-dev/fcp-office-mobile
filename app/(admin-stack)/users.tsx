import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminAllUsers,
  apiAdminCreateForeman,
  apiAdminDeleteUser,
  apiAdminListUsers,
  type AdminUserListItemDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    emptyText: "#64748b",
    inputBg: "rgba(15,23,42,0.85)",
    inputBorder: "#334155",
    rowBorder: "rgba(148,163,184,0.15)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    emptyText: "#94a3b8",
    inputBg: "rgba(255,255,255,0.9)",
    inputBorder: "#e2e8f0",
    rowBorder: "rgba(0,0,0,0.08)",
  },
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#ef4444",
  SUPERVISOR: "#8b5cf6",
  FOREMAN: "#f59e0b",
  WORKER: "#3b82f6",
  USER: "#6b7280",
};

type RoleFilter = "ALL" | "ADMIN" | "SUPERVISOR" | "FOREMAN";

function UserRow({
  item,
  colors,
  isDark,
  onDelete,
}: {
  item: AdminUserListItemDto;
  colors: (typeof themes)["light"];
  isDark: boolean;
  onDelete: () => void;
}) {
  const roleColor = ROLE_COLORS[item.role] ?? ROLE_COLORS.USER;
  const initials = (item.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={[styles.userRow, { borderBottomColor: colors.rowBorder }]}>
      <View style={[styles.avatar, { backgroundColor: roleColor + "25" }]}>
        <Text style={[styles.avatarText, { color: roleColor }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text
          style={[styles.userName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.name ?? "Unnamed"}
        </Text>
        <Text
          style={[styles.userEmail, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {item.email}
        </Text>
      </View>
      <View style={styles.userActions}>
        <View style={[styles.roleBadge, { backgroundColor: roleColor + "20" }]}>
          <Text style={[styles.roleBadgeText, { color: roleColor }]}>
            {item.role}
          </Text>
        </View>
        <Pressable
          onPress={onDelete}
          hitSlop={8}
          style={({ pressed }) => [
            styles.deleteBtn,
            {
              opacity: pressed ? 0.6 : 1,
              backgroundColor: isDark
                ? "rgba(239,68,68,0.15)"
                : "rgba(239,68,68,0.1)",
            },
          ]}
        >
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </Pressable>
      </View>
    </View>
  );
}

export default function UsersScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";

  const [users, setUsers] = useState<AdminUserListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q: { role?: string; q?: string } = {};
      if (roleFilter !== "ALL") q.role = roleFilter;
      if (search.trim()) q.q = search.trim();
      const res = await apiAdminAllUsers(
        Object.keys(q).length > 0 ? q : undefined,
      );
      setUsers(res.users ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const q: { role?: string; q?: string } = {};
      if (roleFilter !== "ALL") q.role = roleFilter;
      if (search.trim()) q.q = search.trim();
      const res = await apiAdminAllUsers(
        Object.keys(q).length > 0 ? q : undefined,
      );
      setUsers(res.users ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, [roleFilter, search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = (user: AdminUserListItemDto) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete "${user.name ?? user.email}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await apiAdminDeleteUser(user.id);
              setUsers((prev) => prev.filter((u) => u.id !== user.id));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete user.");
            }
          },
        },
      ],
    );
  };

  const ROLES: { key: RoleFilter; label: string; color: string }[] = [
    { key: "ALL", label: "All", color: "#3b82f6" },
    { key: "ADMIN", label: "Admin", color: "#ef4444" },
    { key: "SUPERVISOR", label: "Supervisor", color: "#8b5cf6" },
    { key: "FOREMAN", label: "Foreman", color: "#f59e0b" },
  ];

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Users
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {users.length} users
              </Text>
            </View>
            <Pressable
              onPress={() => setShowCreate(true)}
              style={({ pressed }) => [
                styles.addBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>New Foreman</Text>
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchText, { color: colors.textPrimary }]}
              placeholder="Search by name or email…"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={load}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearch("");
                }}
                hitSlop={8}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        {/* Role Filter */}
        <View style={styles.filterRow}>
          {ROLES.map((role) => {
            const active = roleFilter === role.key;
            return (
              <Pressable
                key={role.key}
                onPress={() => setRoleFilter(role.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active
                      ? role.color
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {role.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading users…" message="Please wait" />
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
        ) : users.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="people-outline"
              size={64}
              color={colors.emptyText}
            />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {search ? "No users match your search" : "No users found"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <UserRow
                item={item}
                colors={colors}
                isDark={isDark}
                onDelete={() => handleDelete(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          />
        )}

        {/* Create Foreman Modal */}
        <CreateForemanModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          isDark={isDark}
          colors={colors}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      </View>
    </AuthStyleBackground>
  );
}

/* ─── Create Foreman Modal ─── */
function CreateForemanModal({
  visible,
  onClose,
  isDark,
  colors,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  colors: (typeof themes)["light"];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [supervisors, setSupervisors] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [loadingSups, setLoadingSups] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSupDropdown, setShowSupDropdown] = useState(false);

  const selectedSupervisor = supervisors.find((s) => s.id === supervisorId);

  // Load supervisors when modal opens
  useEffect(() => {
    if (!visible) return;
    setLoadingSups(true);
    apiAdminListUsers("SUPERVISOR")
      .then((res) => setSupervisors(res.users ?? []))
      .catch(() => setSupervisors([]))
      .finally(() => setLoadingSups(false));
  }, [visible]);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setDayRate("");
    setSupervisorId("");
    setShowPassword(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    // Validate
    if (name.trim().length < 2) {
      Alert.alert("Validation", "Name must be at least 2 characters.");
      return;
    }
    if (!email.trim().includes("@") || email.trim().length < 3) {
      Alert.alert("Validation", "Please enter a valid email.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }
    if (!dayRate || Number(dayRate) <= 0) {
      Alert.alert(
        "Validation",
        "Day rate is required and must be greater than 0.",
      );
      return;
    }
    if (!supervisorId) {
      Alert.alert("Validation", "Please select a supervisor.");
      return;
    }

    setCreating(true);
    try {
      await apiAdminCreateForeman({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        dayRate: Number(dayRate),
        supervisorId,
      });
      Alert.alert("Success", `Foreman "${name.trim()}" created successfully.`);
      reset();
      onCreated();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create foreman.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={modalStyles.keyboardView}
      >
        <View style={modalStyles.overlay}>
          <View
            style={[
              modalStyles.sheet,
              {
                backgroundColor: isDark ? "#0f172a" : "#fff",
              },
            ]}
          >
            {/* Header */}
            <View style={modalStyles.sheetHeader}>
              <Text
                style={[modalStyles.sheetTitle, { color: colors.textPrimary }]}
              >
                New Foreman
              </Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={modalStyles.scrollBody}
              contentContainerStyle={modalStyles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Name */}
              <Text
                style={[modalStyles.label, { color: colors.textSecondary }]}
              >
                Full Name
              </Text>
              <TextInput
                style={[
                  modalStyles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "#f8fafc",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="e.g. John Doe"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

              {/* Email */}
              <Text
                style={[modalStyles.label, { color: colors.textSecondary }]}
              >
                Email
              </Text>
              <TextInput
                style={[
                  modalStyles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "#f8fafc",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="foreman@example.com"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {/* Supervisor Select */}
              <Text
                style={[modalStyles.label, { color: colors.textSecondary }]}
              >
                Supervisor
              </Text>
              {loadingSups ? (
                <ActivityIndicator
                  size="small"
                  color="#3b82f6"
                  style={{ marginBottom: 16 }}
                />
              ) : supervisors.length === 0 ? (
                <Text
                  style={[modalStyles.noSups, { color: colors.textSecondary }]}
                >
                  No supervisors available
                </Text>
              ) : (
                <View style={{ marginBottom: 4 }}>
                  {/* Trigger */}
                  <Pressable
                    onPress={() => setShowSupDropdown((v) => !v)}
                    style={[
                      modalStyles.selectTrigger,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.06)"
                          : "#f8fafc",
                        borderColor: showSupDropdown
                          ? "#8b5cf6"
                          : isDark
                            ? "#334155"
                            : "#e2e8f0",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        modalStyles.selectTriggerText,
                        {
                          color: selectedSupervisor
                            ? colors.textPrimary
                            : colors.textSecondary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {selectedSupervisor
                        ? (selectedSupervisor.name ?? selectedSupervisor.email)
                        : "Select a supervisor"}
                    </Text>
                    <Ionicons
                      name={showSupDropdown ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>

                  {/* Dropdown List */}
                  {showSupDropdown && (
                    <View
                      style={[
                        modalStyles.dropdown,
                        {
                          backgroundColor: isDark ? "#1e293b" : "#fff",
                          borderColor: isDark ? "#334155" : "#e2e8f0",
                        },
                      ]}
                    >
                      {supervisors.map((sup) => {
                        const selected = supervisorId === sup.id;
                        return (
                          <Pressable
                            key={sup.id}
                            onPress={() => {
                              setSupervisorId(sup.id);
                              setShowSupDropdown(false);
                            }}
                            style={[
                              modalStyles.dropdownItem,
                              {
                                backgroundColor: selected
                                  ? isDark
                                    ? "rgba(139,92,246,0.2)"
                                    : "rgba(139,92,246,0.1)"
                                  : "transparent",
                              },
                            ]}
                          >
                            <View style={modalStyles.dropdownItemLeft}>
                              <View
                                style={[
                                  modalStyles.dropdownAvatar,
                                  {
                                    backgroundColor: selected
                                      ? "#8b5cf6"
                                      : isDark
                                        ? "rgba(139,92,246,0.25)"
                                        : "rgba(139,92,246,0.15)",
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="person"
                                  size={12}
                                  color={selected ? "#fff" : "#8b5cf6"}
                                />
                              </View>
                              <Text
                                style={[
                                  modalStyles.dropdownItemText,
                                  { color: colors.textPrimary },
                                ]}
                                numberOfLines={1}
                              >
                                {sup.name ?? sup.email}
                              </Text>
                            </View>
                            {selected && (
                              <Ionicons
                                name="checkmark"
                                size={18}
                                color="#8b5cf6"
                              />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Day Rate */}
              <Text
                style={[modalStyles.label, { color: colors.textSecondary }]}
              >
                Day Rate
              </Text>
              <TextInput
                style={[
                  modalStyles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "#f8fafc",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="e.g. 150.00"
                placeholderTextColor={colors.textSecondary}
                value={dayRate}
                onChangeText={setDayRate}
                keyboardType="decimal-pad"
              />

              {/* Password */}
              <Text
                style={[modalStyles.label, { color: colors.textSecondary }]}
              >
                Password
              </Text>
              <View
                style={[
                  modalStyles.passwordRow,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "#f8fafc",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                  },
                ]}
              >
                <TextInput
                  style={[
                    modalStyles.passwordInput,
                    { color: colors.textPrimary },
                  ]}
                  placeholder="Min 8 characters"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              {/* Confirm Password */}
              <Text
                style={[modalStyles.label, { color: colors.textSecondary }]}
              >
                Confirm Password
              </Text>
              <TextInput
                style={[
                  modalStyles.input,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "#f8fafc",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Repeat the password"
                placeholderTextColor={colors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </ScrollView>

            {/* Footer Buttons */}
            <View
              style={[
                modalStyles.footer,
                {
                  borderTopColor: isDark ? "#1e293b" : "#f1f5f9",
                },
              ]}
            >
              <Pressable
                onPress={handleClose}
                style={[
                  modalStyles.footerBtn,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                  },
                ]}
              >
                <Text
                  style={[
                    modalStyles.footerBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={({ pressed }) => [
                  modalStyles.footerBtn,
                  modalStyles.createBtn,
                  { opacity: pressed || creating ? 0.7 : 1 },
                ]}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={16} color="#fff" />
                    <Text style={modalStyles.createBtnText}>
                      Create Foreman
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  keyboardView: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingTop: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800" },
  scrollBody: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 8 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "500",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 10,
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectTriggerText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 6,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  dropdownAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  noSups: { fontSize: 13, marginBottom: 12 },
  footer: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  footerBtnText: { fontSize: 15, fontWeight: "700" },
  createBtn: { backgroundColor: "#f59e0b" },
  createBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f59e0b",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 14, marginTop: 4 },

  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
  },

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: { fontSize: 12, fontWeight: "700" },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800" },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: "700" },
  userEmail: { fontSize: 12, fontWeight: "500" },
  userActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
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
    backgroundColor: "#3b82f6",
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
