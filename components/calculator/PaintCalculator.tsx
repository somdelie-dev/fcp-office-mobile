import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SearchablePickerModal } from "@/components/SearchablePickerModal";
import { apiAdminCatalogue, type CatalogueProductDto } from "@/lib/apiClient";
import {
  cheapestPacks,
  formatLitres,
  isUsableCoverage,
  litresNeeded,
  m2PerLitre,
  packsFor,
} from "@/lib/paintCalculator";
import {
  CATALOGUE_ACCENT,
  cachedCatalogue,
  formatCoverageRate,
  formatRand,
  rememberCatalogue,
  type CatalogueColors,
} from "@/lib/paintsCatalogue";

type AreaMode = "AREA" | "WALLS";

const WASTAGE_OPTIONS = [0, 5, 10, 15];

function parse(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function decimalInput(v: string) {
  return v.replace(/[^0-9.,]/g, "");
}

export function PaintCalculator({
  colors,
  isDark,
}: {
  colors: CatalogueColors;
  isDark: boolean;
}) {
  const [products, setProducts] = useState<CatalogueProductDto[]>(
    cachedCatalogue()?.products ?? [],
  );
  const [loading, setLoading] = useState(products.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [productId, setProductId] = useState<string | null>(null);
  const [coverageId, setCoverageId] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [picker, setPicker] = useState<
    "product" | "coverage" | "variant" | null
  >(null);

  const [mode, setMode] = useState<AreaMode>("AREA");
  const [area, setArea] = useState("");
  const [length, setLength] = useState("");
  const [height, setHeight] = useState("");
  const [openings, setOpenings] = useState("");
  const [coats, setCoats] = useState(2);
  const [wastage, setWastage] = useState(10);

  useEffect(() => {
    if (products.length > 0) return;
    apiAdminCatalogue()
      .then((res) => {
        rememberCatalogue(res);
        setProducts(res.products);
      })
      .catch((e: any) => setLoadError(e?.message ?? "Could not load products."))
      .finally(() => setLoading(false));
  }, [products.length]);

  // Only products with an m²-per-litre rate can be calculated.
  const calculable = useMemo(
    () =>
      products
        .filter((p) => p.isActive && p.coverages.some(isUsableCoverage))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const product = calculable.find((p) => p.id === productId) ?? null;
  const coverages = product?.coverages.filter(isUsableCoverage) ?? [];
  const coverage =
    coverages.find((c) => c.id === coverageId) ?? coverages[0] ?? null;

  const variants = useMemo(() => {
    if (!product) return [] as (string | null)[];
    const names = new Set<string | null>();
    for (const p of product.prices) {
      if (p.uom === "L" || p.uom === "ML") names.add(p.variant ?? null);
    }
    return [...names].sort((a, b) => (a ?? "").localeCompare(b ?? ""));
  }, [product]);

  const selectProduct = (id: string | null) => {
    const next = calculable.find((p) => p.id === id) ?? null;
    setProductId(id);
    const first = next?.coverages.find(isUsableCoverage) ?? null;
    setCoverageId(first?.id ?? null);
    setCoats(first?.coats && first.coats > 0 ? first.coats : 2);
    const names = new Set(
      next?.prices
        .filter((p) => p.uom === "L" || p.uom === "ML")
        .map((p) => p.variant ?? null),
    );
    setVariant(names.has(null) ? null : ([...names][0] ?? null));
  };

  const areaM2 =
    mode === "AREA"
      ? parse(area)
      : Math.max(0, parse(length) * parse(height) - parse(openings));

  const result = useMemo(() => {
    if (!coverage || areaM2 <= 0) return null;
    const need = litresNeeded({
      areaM2,
      coats,
      coverage,
      wastagePercent: wastage,
    });
    const packs = product ? packsFor(product.prices, variant) : [];
    return {
      need,
      plan: cheapestPacks(need.total, packs),
      hasPacks: packs.length > 0,
    };
  }, [coverage, areaM2, coats, wastage, product, variant]);

  const isTotalSystem = coverage?.coverageBasis === "TOTAL_SYSTEM";

  const shareEstimate = () => {
    if (!result || !product || !coverage) return;
    const lines = [
      `Paint estimate: ${product.name}${variant ? ` (${variant})` : ""}`,
      `Area: ${Number(areaM2.toFixed(2))} m²`,
      isTotalSystem ? "Coats: full system" : `Coats: ${coats}`,
      `Coverage: ${formatCoverageRate(coverage)}`,
      `Wastage: ${wastage}%`,
      `Paint needed: ${formatLitres(result.need.total)}`,
    ];
    if (result.plan) {
      lines.push(
        `Buy: ${result.plan.lines.map((l) => `${l.count} x ${l.sizeL}L`).join(" + ")} (${formatLitres(result.plan.litres)})`,
        `Cost: ${formatRand(result.plan.cost)}`,
      );
    }
    Share.share({ message: lines.join("\n") }).catch(() => {});
  };

  const input = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    suffix: string,
  ) => (
    <View
      style={[
        styles.inputWrap,
        { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={(v) => onChange(decimalInput(v))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
        style={[styles.input, { color: colors.textPrimary }]}
      />
      <Text style={[styles.suffix, { color: colors.textSecondary }]}>
        {suffix}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CATALOGUE_ACCENT} />
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading products…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {loadError && <Text style={styles.error}>{loadError}</Text>}

      <View
        style={[
          styles.card,
          { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
        ]}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Product
        </Text>
        <Pressable
          style={[
            styles.select,
            { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
          ]}
          onPress={() => setPicker("product")}
        >
          <Ionicons name="color-palette-outline" size={18} color="#8b5cf6" />
          <Text
            style={[
              styles.selectText,
              { color: product ? colors.textPrimary : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {product ? product.name : "Choose a paint or preparation"}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>

        {product && (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Coverage
              </Text>
              <Pressable
                style={[
                  styles.select,
                  {
                    borderColor: colors.rowBorder,
                    backgroundColor: colors.inputBg,
                  },
                ]}
                onPress={() => coverages.length > 1 && setPicker("coverage")}
              >
                <Text
                  style={[styles.selectText, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {coverage ? formatCoverageRate(coverage) : "-"}
                </Text>
                {coverages.length > 1 && (
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textSecondary}
                  />
                )}
              </Pressable>
            </View>
            {variants.length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Variant
                </Text>
                <Pressable
                  style={[
                    styles.select,
                    {
                      borderColor: colors.rowBorder,
                      backgroundColor: colors.inputBg,
                    },
                  ]}
                  onPress={() => variants.length > 1 && setPicker("variant")}
                >
                  <Text
                    style={[styles.selectText, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {variant ?? "All"}
                  </Text>
                  {variants.length > 1 && (
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={colors.textSecondary}
                    />
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
        ]}
      >
        <View style={[styles.segment, { borderColor: colors.rowBorder }]}>
          {(["AREA", "WALLS"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.segmentItem,
                mode === m && { backgroundColor: CATALOGUE_ACCENT },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: mode === m ? "#fff" : colors.textSecondary },
                ]}
              >
                {m === "AREA" ? "Area (m²)" : "Length × height"}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "AREA" ? (
          input(area, setArea, "e.g. 120", "m²")
        ) : (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Total wall length
                </Text>
                {input(length, setLength, "0", "m")}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Height
                </Text>
                {input(height, setHeight, "0", "m")}
              </View>
            </View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Less doors & windows
            </Text>
            {input(openings, setOpenings, "0", "m²")}
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Area: {Number(areaM2.toFixed(2))} m²
            </Text>
          </>
        )}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Coats
            </Text>
            {isTotalSystem ? (
              <Text
                style={[styles.systemNote, { color: colors.textSecondary }]}
              >
                Rate covers the full system
              </Text>
            ) : (
              <View style={[styles.stepper, { borderColor: colors.rowBorder }]}>
                <Pressable
                  onPress={() => setCoats((c) => Math.max(1, c - 1))}
                  style={styles.stepBtn}
                  hitSlop={6}
                >
                  <Ionicons
                    name="remove"
                    size={20}
                    color={colors.textPrimary}
                  />
                </Pressable>
                <Text style={[styles.stepValue, { color: colors.textPrimary }]}>
                  {coats}
                </Text>
                <Pressable
                  onPress={() => setCoats((c) => Math.min(6, c + 1))}
                  style={styles.stepBtn}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={20} color={colors.textPrimary} />
                </Pressable>
              </View>
            )}
          </View>
          <View style={{ flex: 1.3 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Wastage
            </Text>
            <View style={[styles.segment, { borderColor: colors.rowBorder }]}>
              {WASTAGE_OPTIONS.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setWastage(w)}
                  style={[
                    styles.segmentItem,
                    wastage === w && { backgroundColor: CATALOGUE_ACCENT },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: wastage === w ? "#fff" : colors.textSecondary },
                    ]}
                  >
                    {w}%
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.resultCard, { borderColor: CATALOGUE_ACCENT }]}>
        {!product ? (
          <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
            Choose a product and enter the area to see how much paint to buy.
          </Text>
        ) : !result ? (
          <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
            Enter the area to paint.
          </Text>
        ) : (
          <>
            <Text style={styles.resultLabel}>PAINT NEEDED</Text>
            <Text style={[styles.resultBig, { color: colors.textPrimary }]}>
              {formatLitres(result.need.total)}
            </Text>

            {result.plan ? (
              <>
                <View style={styles.packRow}>
                  {result.plan.lines.map((l) => (
                    <View key={l.sizeL} style={styles.packChip}>
                      <Text style={styles.packChipText}>
                        {l.count} × {l.sizeL}L
                      </Text>
                    </View>
                  ))}
                </View>
                <View
                  style={[styles.costRow, { borderTopColor: colors.rowBorder }]}
                >
                  <View>
                    <Text
                      style={[
                        styles.costLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Estimated cost
                    </Text>
                    <Text
                      style={[styles.costValue, { color: colors.textPrimary }]}
                    >
                      {formatRand(result.plan.cost)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={[
                        styles.costLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      You get
                    </Text>
                    <Text
                      style={[styles.costSub, { color: colors.textPrimary }]}
                    >
                      {formatLitres(result.plan.litres)}
                    </Text>
                    <Text
                      style={[styles.spare, { color: colors.textSecondary }]}
                    >
                      {formatLitres(
                        Math.max(0, result.plan.litres - result.need.total),
                      )}{" "}
                      spare
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {result.hasPacks
                  ? "Could not work out packs."
                  : "No litre prices for this variant yet, so packs and cost can't be worked out."}
              </Text>
            )}

            <View
              style={[styles.breakdown, { borderTopColor: colors.rowBorder }]}
            >
              {[
                ["Area", `${Number(areaM2.toFixed(2))} m²`],
                [
                  "Coverage used",
                  `${Number(m2PerLitre(coverage!).toFixed(2))} m²/L`,
                ],
                ["Coats", isTotalSystem ? "Full system" : String(coats)],
                ["Before wastage", formatLitres(result.need.before)],
                [`Wastage (${wastage}%)`, formatLitres(result.need.wastage)],
              ].map(([k, v]) => (
                <View key={k} style={styles.breakdownRow}>
                  <Text
                    style={[
                      styles.breakdownKey,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {k}
                  </Text>
                  <Text
                    style={[
                      styles.breakdownValue,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {v}
                  </Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.shareBtn} onPress={shareEstimate}>
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={styles.shareText}>Share estimate</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={[styles.footnote, { color: colors.textSecondary }]}>
        Uses the middle of the product&apos;s coverage range and the cheapest
        mix of catalogue pack sizes, the same maths as Paint Planning on the
        web.
      </Text>

      <SearchablePickerModal
        visible={picker === "product"}
        title="Choose a product"
        searchPlaceholder="Search paints…"
        showAllOption={false}
        options={calculable.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.sku,
        }))}
        selectedId={productId}
        onSelect={(o) => selectProduct(o?.id ?? null)}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />
      <SearchablePickerModal
        visible={picker === "coverage"}
        title="Coverage rate"
        searchPlaceholder="Search rates…"
        showAllOption={false}
        options={coverages.map((c) => ({
          id: c.id,
          name: [formatCoverageRate(c), c.surface, c.applicationMethod]
            .filter(Boolean)
            .join(" · "),
        }))}
        selectedId={coverage?.id ?? null}
        onSelect={(o) => {
          const next = coverages.find((c) => c.id === o?.id);
          if (!next) return;
          setCoverageId(next.id);
          if (next.coats > 0) setCoats(next.coats);
        }}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />
      <SearchablePickerModal
        visible={picker === "variant"}
        title="Variant"
        searchPlaceholder="Search variants…"
        showAllOption={false}
        options={variants.map((v) => ({
          id: v ?? "__all__",
          name: v ?? "All",
        }))}
        selectedId={variant ?? "__all__"}
        onSelect={(o) => o && setVariant(o.id === "__all__" ? null : o.id)}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#ef4444", fontWeight: "700", textAlign: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  label: { fontSize: 12, fontWeight: "800", marginTop: 8, marginBottom: 6 },
  row: { flexDirection: "row", gap: 10 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectText: { flex: 1, fontSize: 14, fontWeight: "700" },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    height: 42,
    marginBottom: 4,
  },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 13, fontWeight: "800" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  suffix: { fontSize: 15, fontWeight: "800" },
  hint: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  systemNote: { fontSize: 12, fontWeight: "700", marginTop: 12 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    height: 42,
  },
  stepBtn: { paddingHorizontal: 14, height: "100%", justifyContent: "center" },
  stepValue: { fontSize: 18, fontWeight: "900" },

  resultCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  placeholder: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 12,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    color: "#16a34a",
  },
  resultBig: {
    fontSize: 40,
    fontWeight: "900",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  packRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  packChip: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  packChipText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  costLabel: { fontSize: 11, fontWeight: "800" },
  costValue: { fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] },
  costSub: { fontSize: 16, fontWeight: "900" },
  spare: { fontSize: 11, fontWeight: "600" },
  breakdown: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, gap: 4 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownKey: { fontSize: 13, fontWeight: "600" },
  breakdownValue: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  shareBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  shareText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  footnote: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
