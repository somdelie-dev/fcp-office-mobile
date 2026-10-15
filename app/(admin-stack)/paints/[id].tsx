import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminCatalogue,
  apiAdminDeleteCatalogueProduct,
  type CatalogueProductDto,
} from "@/lib/apiClient";
import {
  CATALOGUE_ACCENT,
  cachedCatalogue,
  cachedProduct,
  catalogueThemes,
  formatCoverageRate,
  formatRand,
  rememberCatalogue,
  sizeLabel,
  sortPrices,
  variantLabel,
  uomLabel,
  type CatalogueColors,
} from "@/lib/paintsCatalogue";
import { useTheme } from "@/lib/themeContext";

// Size and price are fixed widths so every row lines up; variant takes the rest.
const PRICE_COLUMNS = [{ width: 56 }, { flex: 1 }, { width: 96 }] as const;

function Section({
  title,
  count,
  colors,
  children,
}: {
  title: string;
  count?: number;
  colors: CatalogueColors;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
      ]}
    >
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        {count != null && (
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
            {count}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Empty({ text, colors }: { text: string; colors: CatalogueColors }) {
  return (
    <Text style={[styles.empty, { color: colors.textSecondary }]}>{text}</Text>
  );
}

export default function CatalogueProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];

  const [product, setProduct] = useState<CatalogueProductDto | null>(
    id ? cachedProduct(id) : null,
  );
  const [loading, setLoading] = useState(!product);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Picks up edits made on the form screen, which refresh the cache.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const cached = cachedProduct(id);
      if (cached) {
        setProduct(cached);
        setLoading(false);
        return;
      }
      apiAdminCatalogue()
        .then((res) => {
          rememberCatalogue(res);
          setProduct(res.products.find((p) => p.id === id) ?? null);
        })
        .catch((e: any) =>
          setError(e?.message ?? "Could not load the product."),
        )
        .finally(() => setLoading(false));
    }, [id]),
  );

  const deleteProduct = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      await apiAdminDeleteCatalogueProduct(product.id);
      const snapshot = cachedCatalogue();
      if (snapshot) {
        rememberCatalogue({
          ...snapshot,
          products: snapshot.products.filter((p) => p.id !== product.id),
        });
      }
      setConfirmDelete(false);
      router.back();
    } catch (e: any) {
      setConfirmDelete(false);
      Alert.alert("Can't delete", e?.message ?? "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay title="Loading product…" message="Please wait" />
      </AuthStyleBackground>
    );
  }

  if (!product) {
    return (
      <AuthStyleBackground>
        <View style={styles.stateWrap}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            {error ?? "Product not found. It may have been deleted."}
          </Text>
        </View>
      </AuthStyleBackground>
    );
  }

  const supplierNames = (cachedCatalogue()?.suppliers ?? [])
    .filter((s) => product.supplierIds.includes(s.id))
    .map((s) => s.name);

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
          ]}
        >
          <View style={styles.heroTop}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>
              {product.name}
            </Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: product.isActive
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(107,114,128,0.15)",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: product.isActive ? "#16a34a" : "#6b7280" },
                ]}
              >
                {product.isActive ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
          {product.brands.length > 0 && (
            <View style={styles.brandRow}>
              {product.brands.map((b) => (
                <View key={b.id} style={styles.brandBadge}>
                  <Text style={styles.brandText}>{b.name}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={[styles.facts, { borderTopColor: colors.rowBorder }]}>
            {[
              ["Code", product.sku ?? "-"],
              ["Unit", product.uom ? uomLabel(product.uom) : "-"],
              ["Category", product.category?.name ?? "-"],
              [
                "Suppliers",
                supplierNames.length ? supplierNames.join(", ") : "-",
              ],
            ].map(([label, value]) => (
              <View key={label} style={styles.fact}>
                <Text
                  style={[styles.factLabel, { color: colors.textSecondary }]}
                >
                  {label}
                </Text>
                <Text style={[styles.factValue, { color: colors.textPrimary }]}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Section title="Prices" count={product.prices.length} colors={colors}>
          {product.prices.length === 0 ? (
            <Empty text="No prices yet." colors={colors} />
          ) : (
            <View style={[styles.priceTable, { borderColor: colors.border }]}>
              <View
                style={[styles.priceRow, { backgroundColor: colors.inputBg }]}
              >
                {(["SIZE", "VARIANT", "PRICE"] as const).map((label, c) => (
                  <Text
                    key={label}
                    style={[
                      styles.priceCell,
                      styles.priceHeadText,
                      PRICE_COLUMNS[c],
                      {
                        color: colors.textSecondary,
                        borderColor: colors.border,
                      },
                      c < 2 && styles.cellDivider,
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>
              {sortPrices(product.prices).map((p, i) => (
                <View
                  key={p.id ?? i}
                  style={[
                    styles.priceRow,
                    { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.priceCell,
                      styles.sizeText,
                      PRICE_COLUMNS[0],
                      styles.cellDivider,
                      { color: colors.textPrimary, borderColor: colors.border },
                    ]}
                  >
                    {sizeLabel(p)}
                  </Text>
                  <Text
                    style={[
                      styles.priceCell,
                      styles.variantText,
                      PRICE_COLUMNS[1],
                      styles.cellDivider,
                      { color: colors.textPrimary, borderColor: colors.border },
                    ]}
                  >
                    {variantLabel(p)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[
                      styles.priceCell,
                      styles.priceText,
                      PRICE_COLUMNS[2],
                      { color: colors.textPrimary },
                    ]}
                  >
                    {formatRand(p.price)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section
          title="Pack sizes"
          count={product.sizes.length}
          colors={colors}
        >
          {product.sizes.length === 0 ? (
            <Empty text="No pack sizes yet." colors={colors} />
          ) : (
            <View style={styles.chipRow}>
              {product.sizes.map((s) => (
                <View
                  key={s}
                  style={[styles.chip, { borderColor: colors.rowBorder }]}
                >
                  <Text
                    style={[styles.chipText, { color: colors.textPrimary }]}
                  >
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section
          title="Coverage"
          count={product.coverages.length}
          colors={colors}
        >
          {product.coverages.length === 0 ? (
            <Empty text="No coverage rates yet." colors={colors} />
          ) : (
            product.coverages.map((c) => (
              <View
                key={c.id}
                style={[
                  styles.coverageRow,
                  { borderTopColor: colors.rowBorder },
                ]}
              >
                <Text style={[styles.rowMain, { color: colors.textPrimary }]}>
                  {formatCoverageRate(c)}
                </Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                  {[
                    `${c.coats} coat${c.coats === 1 ? "" : "s"}`,
                    c.surface,
                    c.applicationMethod,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {c.notes ? (
                  <Text
                    style={[styles.rowSub, { color: colors.textSecondary }]}
                  >
                    {c.notes}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </Section>

        <Text style={[styles.webNote, { color: colors.textSecondary }]}>
          Prices, pack sizes, coverage and variants are edited on the web admin.
        </Text>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.barBg,
            borderTopColor: colors.rowBorder,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Pressable
          style={[
            styles.actionBtn,
            { flex: 1, backgroundColor: CATALOGUE_ACCENT },
          ]}
          onPress={() =>
            router.push({
              pathname: "/(admin-stack)/paints/form",
              params: { id: product.id },
            } as any)
          }
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.actionText}>Edit product</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: "#dc2626" }]}
          onPress={() => setConfirmDelete(true)}
          accessibilityLabel="Delete product"
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={deleting ? undefined : () => setConfirmDelete(false)}
      >
        <View style={styles.confirmOverlay}>
          <View
            style={[styles.confirmCard, { backgroundColor: colors.sheetBg }]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="trash-outline" size={28} color="#dc2626" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              Delete this product?
            </Text>
            <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
              &quot;{product.name}&quot; and its {product.colors.length} colour
              {product.colors.length === 1 ? "" : "s"}, prices and coverage will
              be removed. Products already used in an order cannot be deleted.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[
                  styles.confirmBtn,
                  styles.outlineBtn,
                  { borderColor: colors.rowBorder },
                ]}
                onPress={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                <Text
                  style={[styles.confirmBtnText, { color: colors.textPrimary }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: "#dc2626" }]}
                onPress={deleteProduct}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: "#fff" }]}>
                    Delete
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  hero: { borderWidth: 1, borderRadius: 5, padding: 14 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { flex: 1, fontSize: 19, fontWeight: "900" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  statusText: { fontSize: 11, fontWeight: "800" },
  brandRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  brandBadge: {
    backgroundColor: "rgba(59,130,246,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  brandText: { fontSize: 11, fontWeight: "800", color: "#2563eb" },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    rowGap: 10,
  },
  fact: { width: "50%", paddingRight: 8 },
  factLabel: { fontSize: 11, fontWeight: "700" },
  factValue: { fontSize: 14, fontWeight: "800", marginTop: 1 },

  section: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: "900" },
  sectionCount: { fontSize: 13, fontWeight: "800" },
  empty: { fontSize: 13, paddingVertical: 6 },
  coverageRow: { paddingVertical: 10, borderTopWidth: 1, gap: 2 },
  rowMain: { fontSize: 14, fontWeight: "800" },
  rowSub: { fontSize: 12, fontWeight: "600" },
  priceTable: {
    borderWidth: 1,
    borderRadius: 5,
    overflow: "hidden",
    marginTop: 4,
  },
  priceRow: { flexDirection: "row", alignItems: "stretch" },
  priceCell: { paddingVertical: 8, paddingHorizontal: 8 },
  cellDivider: { borderRightWidth: 1 },
  priceHeadText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  sizeText: { fontSize: 13, fontWeight: "800" },
  variantText: { fontSize: 12, fontWeight: "600" },
  priceText: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, fontWeight: "800" },
  webNote: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    height: 48,
    minWidth: 52,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "900" },

  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: { borderRadius: 14, padding: 20, alignItems: "center" },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(220,38,38,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  confirmNote: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  confirmActions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtn: { borderWidth: 1, backgroundColor: "transparent" },
  confirmBtnText: { fontSize: 15, fontWeight: "900" },
});
