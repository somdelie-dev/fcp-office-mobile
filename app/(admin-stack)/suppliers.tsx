import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  apiAdminSuppliers,
  apiAdminCreateSupplier,
  type SupplierDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function SuppliersScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const textMain = isDark ? "#e5e7eb" : "#111827";
  const textSub = isDark ? "#94a3b8" : "#6b7280";
  const cardBg = isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.9)";
  const inputBg = isDark ? "rgba(30,41,59,0.8)" : "#f8fafc";
  const borderColor = isDark ? "rgba(148,163,184,0.2)" : "rgba(0,0,0,0.08)";

  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Add supplier modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const res = await apiAdminSuppliers();
      setSuppliers(res.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load suppliers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").includes(q)
    );
  });

  async function handleAddSupplier() {
    if (!addName.trim()) {
      Alert.alert("Error", "Supplier name is required.");
      return;
    }
    setAdding(true);
    try {
      await apiAdminCreateSupplier({
        name: addName.trim(),
        phone: addPhone.trim() || undefined,
        email: addEmail.trim() || undefined,
        address: addAddress.trim() || undefined,
      });
      setAddModalOpen(false);
      setAddName(""); setAddPhone(""); setAddEmail(""); setAddAddress("");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create supplier.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <AuthStyleBackground>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={textMain} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: textMain }]}>Suppliers</Text>
          <Text style={[styles.headerSub, { color: textSub }]}>{filtered.length} suppliers</Text>
        </View>
        <Pressable
          onPress={() => setAddModalOpen(true)}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
          <Ionicons name="search" size={16} color={textSub} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search suppliers…"
            placeholderTextColor={textSub}
            style={[styles.searchInput, { color: textMain }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={textSub} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={[styles.loadingText, { color: textSub }]}>Loading suppliers…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#ec4899"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={textSub} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyText, { color: textSub }]}>No suppliers found.</Text>
              <Pressable onPress={() => setAddModalOpen(true)} style={styles.addBtn}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add Supplier</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: s }) => (
            <GlassCard style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: isDark ? "rgba(236,72,153,0.15)" : "rgba(236,72,153,0.1)" }]}>
                  <Text style={styles.avatarText}>
                    {s.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.supplierName, { color: textMain }]}>{s.name}</Text>
                  {s.phone && (
                    <View style={styles.metaRow}>
                      <Ionicons name="call-outline" size={12} color={textSub} />
                      <Text style={[styles.metaText, { color: textSub }]}>{s.phone}</Text>
                    </View>
                  )}
                  {s.email && (
                    <View style={styles.metaRow}>
                      <Ionicons name="mail-outline" size={12} color={textSub} />
                      <Text style={[styles.metaText, { color: textSub }]}>{s.email}</Text>
                    </View>
                  )}
                  {s.address && (
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={12} color={textSub} />
                      <Text style={[styles.metaText, { color: textSub }]} numberOfLines={1}>{s.address}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.countsBadges}>
                  <View style={[styles.countBadge, { backgroundColor: isDark ? "rgba(236,72,153,0.15)" : "rgba(236,72,153,0.08)" }]}>
                    <Text style={[styles.countBadgeText, { color: "#ec4899" }]}>
                      {s._count.products} products
                    </Text>
                  </View>
                  <View style={[styles.countBadge, { backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.08)" }]}>
                    <Text style={[styles.countBadgeText, { color: "#10b981" }]}>
                      {s._count.orders} orders
                    </Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          )}
        />
      )}

      {/* Add Supplier Modal */}
      <Modal
        visible={addModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !adding && setAddModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => !adding && setAddModalOpen(false)}
            />
            <View style={[styles.modalSheet, { backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
              <View style={styles.modalHandle}>
                <View style={[styles.modalHandleBar, { backgroundColor: isDark ? "#475569" : "#cbd5e1" }]} />
              </View>
              <Text style={[styles.modalTitle, { color: textMain }]}>New Supplier</Text>
              <Text style={[styles.modalSub, { color: textSub }]}>Add a new supplier to the system</Text>

              {[
                { label: "Name *", value: addName, setter: setAddName, placeholder: "Supplier name", autoFocus: true },
                { label: "Phone", value: addPhone, setter: setAddPhone, placeholder: "+27 xx xxx xxxx" },
                { label: "Email", value: addEmail, setter: setAddEmail, placeholder: "supplier@example.com" },
                { label: "Address", value: addAddress, setter: setAddAddress, placeholder: "Physical address" },
              ].map(({ label, value, setter, placeholder, autoFocus }) => (
                <View key={label} style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: textSub }]}>{label}</Text>
                  <TextInput
                    value={value}
                    onChangeText={setter}
                    placeholder={placeholder}
                    placeholderTextColor={textSub}
                    autoFocus={autoFocus}
                    style={[
                      styles.fieldInput,
                      { color: textMain, backgroundColor: inputBg, borderColor },
                    ]}
                  />
                </View>
              ))}

              <View style={styles.modalButtons}>
                <Pressable
                  onPress={() => setAddModalOpen(false)}
                  style={[styles.modalBtn, { backgroundColor: isDark ? "rgba(148,163,184,0.15)" : "#f1f5f9" }]}
                  disabled={adding}
                >
                  <Text style={[styles.modalBtnText, { color: textMain }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleAddSupplier}
                  style={[styles.modalBtn, styles.modalBtnPrimary, adding && { opacity: 0.6 }]}
                  disabled={adding}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: "#fff" }]}>Save Supplier</Text>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "900" },
  headerSub: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#262D68",
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, fontWeight: "600" },
  errorText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: "#262D68" },
  retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 14, fontWeight: "600" },
  card: { padding: 12 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "900", color: "#ec4899" },
  supplierName: { fontSize: 15, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, fontWeight: "600" },
  countsBadges: { gap: 4, alignItems: "flex-end" },
  countBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  countBadgeText: { fontSize: 11, fontWeight: "800" },
  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    gap: 4,
  },
  modalHandle: { alignItems: "center", marginBottom: 12 },
  modalHandleBar: { width: 40, height: 4, borderRadius: 2 },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalSub: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  fieldGroup: { marginTop: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "800", marginBottom: 4 },
  fieldInput: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnPrimary: { backgroundColor: "#262D68" },
  modalBtnText: { fontSize: 14, fontWeight: "800" },
});
