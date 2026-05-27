import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  apiAdminMaterialOrders,
  apiAdminSites,
  type SiteProductOrderDto,
  type AdminSiteListItemDto,
} from "@/lib/apiClient";
import { formatCurrency } from "@/lib/formatCurrency";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function MaterialsScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const textMain = isDark ? "#e5e7eb" : "#111827";
  const textSub = isDark ? "#94a3b8" : "#6b7280";
  const cardBg = isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.9)";
  const inputBg = isDark ? "rgba(30,41,59,0.8)" : "#f8fafc";
  const borderColor = isDark ? "rgba(148,163,184,0.2)" : "rgba(0,0,0,0.08)";

  const [orders, setOrders] = useState<SiteProductOrderDto[]>([]);
  const [sites, setSites] = useState<AdminSiteListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const [ordersRes, sitesRes] = await Promise.all([
        apiAdminMaterialOrders(selectedSiteId ? { siteId: selectedSiteId } : undefined),
        apiAdminSites(),
      ]);
      setOrders(ordersRes.data ?? []);
      setSites(sitesRes.sites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load material orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSiteId]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (o.siteName?.toLowerCase().includes(q)) ||
      (o.supplierName?.toLowerCase().includes(q)) ||
      (o.reference?.toLowerCase().includes(q)) ||
      o.items.some((i) => i.productName.toLowerCase().includes(q))
    );
  });

  const totalValue = filtered.reduce((sum, o) => sum + (o.totalCost ?? 0), 0);

  return (
    <AuthStyleBackground>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={textMain} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: textMain }]}>Material Orders</Text>
          <Text style={[styles.headerSub, { color: textSub }]}>
            {filtered.length} orders · {formatCurrency(totalValue)}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: isDark ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.5)" }]}>
        <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
          <Ionicons name="search" size={16} color={textSub} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search orders, products, suppliers…"
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
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={[styles.loadingText, { color: textSub }]}>Loading orders…</Text>
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
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#10b981"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={56} color={textSub} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyText, { color: textSub }]}>No material orders found.</Text>
            </View>
          }
          renderItem={({ item: order }) => (
            <GlassCard style={[styles.orderCard, { backgroundColor: cardBg }]}>
              <View style={styles.orderHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderRef, { color: textMain }]}>
                    {order.reference ?? `Order #${order.id.slice(-6).toUpperCase()}`}
                  </Text>
                  <Text style={[styles.orderMeta, { color: textSub }]}>
                    {order.siteName} · {order.supplierName ?? "No supplier"}
                  </Text>
                  <Text style={[styles.orderDate, { color: textSub }]}>
                    {new Date(order.createdAt).toLocaleDateString()}
                    {order.createdBy ? ` · ${order.createdBy}` : ""}
                  </Text>
                </View>
                {order.totalCost != null && (
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalBadgeText}>{formatCurrency(order.totalCost)}</Text>
                  </View>
                )}
              </View>

              <View style={[styles.itemsDivider, { borderTopColor: borderColor }]}>
                {order.items.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Ionicons name="ellipse" size={6} color={textSub} style={{ marginTop: 4 }} />
                    <Text style={[styles.itemName, { color: textMain }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <Text style={[styles.itemQty, { color: textSub }]}>
                      ×{item.quantity}{item.uomAtOrder ? ` ${item.uomAtOrder}` : ""}
                    </Text>
                  </View>
                ))}
                {order.items.length > 3 && (
                  <Text style={[styles.moreItems, { color: textSub }]}>
                    +{order.items.length - 3} more items
                  </Text>
                )}
              </View>
            </GlassCard>
          )}
        />
      )}
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
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
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
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#262D68",
  },
  retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 14, fontWeight: "600" },
  orderCard: { padding: 14, gap: 0 },
  orderHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  orderRef: { fontSize: 14, fontWeight: "900" },
  orderMeta: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  orderDate: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  totalBadge: {
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  totalBadgeText: { color: "#10b981", fontWeight: "900", fontSize: 13 },
  itemsDivider: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
    gap: 4,
  },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  itemName: { flex: 1, fontSize: 12, fontWeight: "700" },
  itemQty: { fontSize: 12, fontWeight: "600" },
  moreItems: { fontSize: 11, fontWeight: "600", marginTop: 2, marginLeft: 12 },
});
