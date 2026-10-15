import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { PdfReadyModal } from "@/components/PdfReadyModal";
import {
  SearchablePickerModal,
  type SearchablePickerOption,
} from "@/components/SearchablePickerModal";
import { apiAdminCatalogue, type CatalogueProductDto } from "@/lib/apiClient";
import {
  CATALOGUE_ACCENT,
  catalogueThemes,
  formatCoverageRate,
  formatRand,
  lowestPrice,
  matchesCatalogueSearch,
  rememberCatalogue,
  type CatalogueColors,
} from "@/lib/paintsCatalogue";
import { postForPdf, savePdfToDevice } from "@/lib/pdfFiles";
import { useTheme } from "@/lib/themeContext";

function ProductCard({
  item,
  colors,
  onPress,
}: {
  item: CatalogueProductDto;
  colors: CatalogueColors;
  onPress: () => void;
}) {
  const from = lowestPrice(item);
  const coded = item.colors.filter((c) => c.colorCode).length;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.rowBorder,
          opacity: pressed ? 0.8 : item.isActive ? 1 : 0.65,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name="color-palette-outline" size={18} color="#8b5cf6" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.name, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            {item.sku ? (
              <Text style={[styles.code, { color: colors.textSecondary }]}>
                {item.sku}
              </Text>
            ) : null}
            {item.category ? (
              <Text
                style={[styles.category, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.category.name}
              </Text>
            ) : null}
            {!item.isActive && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveText}>Inactive</Text>
              </View>
            )}
          </View>
        </View>
        {from != null && (
          <View style={styles.priceWrap}>
            <Text style={[styles.fromLabel, { color: colors.textSecondary }]}>
              from
            </Text>
            <Text style={[styles.price, { color: colors.textPrimary }]}>
              {formatRand(from)}
            </Text>
          </View>
        )}
      </View>

      {item.brands.length > 0 && (
        <View style={styles.brandRow}>
          {item.brands.map((b) => (
            <View key={b.id} style={styles.brandBadge}>
              <Text style={styles.brandText}>{b.name}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.footer, { borderTopColor: colors.rowBorder }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          {item.sizesCount} size{item.sizesCount === 1 ? "" : "s"} · {coded}{" "}
          variant{coded === 1 ? "" : "s"} · {item.pricesCount} price
          {item.pricesCount === 1 ? "" : "s"}
        </Text>
        {item.coverages[0] && (
          <View style={styles.coverageBadge}>
            <Ionicons name="water-outline" size={11} color="#0284c7" />
            <Text style={styles.coverageText}>
              {item.coverages.length === 1
                ? formatCoverageRate(item.coverages[0])
                : `${item.coverages.length} rates`}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function PaintsAndPreparationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];
  const isDark = theme === "dark";

  const [products, setProducts] = useState<CatalogueProductDto[]>([]);
  const [suppliers, setSuppliers] = useState<SearchablePickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<SearchablePickerOption | null>(null);
  const [supplier, setSupplier] = useState<SearchablePickerOption | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [picker, setPicker] = useState<"brand" | "supplier" | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [pdf, setPdf] = useState<{
    uri: string;
    filename: string;
    saved: boolean;
  } | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const res = await apiAdminCatalogue(supplier?.id);
        setProducts(res.products ?? []);
        setSuppliers(res.suppliers ?? []);
        rememberCatalogue(res);
      } catch (e: any) {
        setError(e?.message ?? "Could not load the catalogue.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [supplier],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const brands = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of products) for (const b of p.brands) byId.set(b.id, b.name);
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (showInactive || p.isActive) &&
        (!brand || p.brands.some((b) => b.id === brand.id)) &&
        matchesCatalogueSearch(p, term),
    );
  }, [products, search, brand, showInactive]);

  const downloadPdf = async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const filename = `paints-and-preparations-${stamp}.pdf`;
    setDownloading(true);
    try {
      const uri = await postForPdf(
        "/api/app/admin/new-products/pdf",
        {
          search,
          brandId: brand?.id ?? null,
          supplierId: supplier?.id ?? null,
          showInactive,
        },
        filename,
      );
      const saved = await savePdfToDevice(uri, filename);
      setPdf({ uri, filename, saved: saved != null });
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? "Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Paints &amp; Preparations
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {loading
                ? "Loading…"
                : `${filtered.length} of ${products.length} products`}
            </Text>
          </View>
          <Pressable
            style={[styles.headerBtn, { borderColor: colors.rowBorder }]}
            onPress={downloadPdf}
            disabled={downloading || filtered.length === 0}
            accessibilityLabel="Download PDF"
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Ionicons
                name="download-outline"
                size={18}
                color={colors.textPrimary}
              />
            )}
          </Pressable>
          <Pressable
            style={[styles.headerBtn, styles.addBtn]}
            onPress={() => router.push("/(admin-stack)/paints/form" as any)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>New</Text>
          </Pressable>
        </View>

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
              value={search}
              onChangeText={setSearch}
              placeholder="Search by product, code, colour or brand…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.filterBar}>
          {(
            [
              {
                key: "brand",
                value: brand,
                all: "All Brands",
                icon: "pricetag-outline",
              },
              {
                key: "supplier",
                value: supplier,
                all: "All Suppliers",
                icon: "storefront-outline",
              },
            ] as const
          ).map((f) => (
            <Pressable
              key={f.key}
              style={[
                styles.filterTrigger,
                {
                  borderColor: colors.rowBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
              onPress={() => setPicker(f.key)}
            >
              <Ionicons name={f.icon} size={15} color={colors.textSecondary} />
              <Text
                style={[
                  styles.filterText,
                  {
                    color: f.value ? colors.textPrimary : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {f.value ? f.value.name : f.all}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setShowInactive((v) => !v)}
            style={styles.toggle}
            hitSlop={6}
          >
            <Ionicons
              name={showInactive ? "checkbox" : "square-outline"}
              size={20}
              color={showInactive ? CATALOGUE_ACCENT : colors.textSecondary}
            />
            <Text style={[styles.toggleText, { color: colors.textPrimary }]}>
              Show inactive
            </Text>
          </Pressable>
        </View>

        <SearchablePickerModal
          visible={picker === "brand"}
          title="Filter by Brand"
          searchPlaceholder="Search brands…"
          allLabel="All Brands"
          options={brands}
          selectedId={brand?.id ?? null}
          onSelect={setBrand}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={picker === "supplier"}
          title="Filter by Supplier"
          searchPlaceholder="Search suppliers…"
          allLabel="All Suppliers"
          options={suppliers}
          selectedId={supplier?.id ?? null}
          onSelect={setSupplier}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />

        {loading ? (
          <LoadingOverlay title="Loading catalogue…" message="Please wait" />
        ) : error && products.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <ProductCard
                item={item}
                colors={colors}
                onPress={() =>
                  router.push({
                    pathname: "/(admin-stack)/paints/[id]",
                    params: { id: item.id },
                  } as any)
                }
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="color-palette-outline"
                  size={64}
                  color={colors.emptyText}
                />
                <Text style={[styles.emptyText, { color: colors.emptyText }]}>
                  {supplier && products.length === 0
                    ? "No products are linked to this supplier yet"
                    : "No products match your filters"}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <PdfReadyModal
        pdf={pdf}
        shareTitle="Share catalogue"
        colors={colors}
        onClose={() => setPdf(null)}
      />
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 36,
    minWidth: 36,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  addBtn: { backgroundColor: CATALOGUE_ACCENT, borderColor: CATALOGUE_ACCENT },
  addText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterTrigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
  },
  filterText: { flex: 1, fontSize: 13, fontWeight: "700" },
  toggleRow: { paddingHorizontal: 16, paddingBottom: 10 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  toggleText: { fontSize: 13, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
  card: { padding: 14, borderWidth: 1, borderRadius: 5, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(139,92,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 15, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap",
  },
  code: { fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  category: { fontSize: 11, fontWeight: "600" },
  inactiveBadge: {
    backgroundColor: "rgba(107,114,128,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  inactiveText: { fontSize: 10, fontWeight: "800", color: "#6b7280" },
  priceWrap: { alignItems: "flex-end" },
  fromLabel: { fontSize: 10, fontWeight: "700" },
  price: { fontSize: 14, fontWeight: "900" },
  brandRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  brandBadge: {
    backgroundColor: "rgba(59,130,246,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  brandText: { fontSize: 11, fontWeight: "800", color: "#2563eb" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  footerText: { flex: 1, fontSize: 12, fontWeight: "700" },
  coverageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(2,132,199,0.12)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  coverageText: { fontSize: 11, fontWeight: "800", color: "#0284c7" },

  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  emptyText: { fontSize: 15, textAlign: "center", marginTop: 16 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: CATALOGUE_ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryText: { color: "#fff", fontWeight: "700" },
});
