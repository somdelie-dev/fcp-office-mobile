import type {
  CatalogueCoverageDto,
  CataloguePriceDto,
  CatalogueProductDto,
} from "@/lib/apiClient";

export const CATALOGUE_ACCENT = "#22c55e";

export const catalogueThemes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
    border: "rgba(148,163,184,0.2)",
    sheetBg: "#0f172a",
    barBg: "rgba(11,24,38,0.97)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
    border: "rgba(0,0,0,0.1)",
    sheetBg: "#ffffff",
    barBg: "rgba(255,255,255,0.97)",
  },
};

export type CatalogueColors = (typeof catalogueThemes)["light"];

// Same unit list and labels as the web catalogue's product form.
export const PRODUCT_UOMS = [
  "EACH",
  "UNIT",
  "PIECE",
  "PACK",
  "BOX",
  "BAG",
  "BUCKET",
  "DRUM",
  "CAN",
  "BOTTLE",
  "TUBE",
  "BAR",
  "ROLL",
  "SHEET",
  "BUNDLE",
  "PALLET",
  "MM",
  "CM",
  "M",
  "M2",
  "M3",
  "G",
  "KG",
  "TON",
  "ML",
  "L",
  "HOUR",
  "DAY",
] as const;

const UOM_LABELS: Record<string, string> = {
  MM: "mm",
  CM: "cm",
  M: "m",
  M2: "m²",
  M3: "m³",
  G: "g",
  KG: "kg",
  TON: "ton",
  ML: "ml",
  L: "L",
  UNIT: "unit",
  EACH: "each",
  PIECE: "piece",
  PACK: "pack",
  BOX: "box",
  BAG: "bag",
  BUCKET: "bucket",
  DRUM: "drum",
  CAN: "can",
  BOTTLE: "bottle",
  TUBE: "tube",
  BAR: "bar",
  ROLL: "roll",
  SHEET: "sheet",
  BUNDLE: "bundle",
  PALLET: "pallet",
  HOUR: "hour",
  DAY: "day",
};

export function uomLabel(uom: string) {
  return UOM_LABELS[uom] ?? uom;
}

const COVERAGE_UNIT_LABEL: Record<string, string> = {
  M2: "m²",
  M3: "m³",
  LINEAR_M: "linear m",
};

const PER_UNIT_UOM_LABEL: Record<string, string> = {
  ML: "mL",
  L: "L",
  KG: "kg",
  UNIT: "unit",
};

export function formatCoverageRate(coverage: CatalogueCoverageDto): string {
  const unit =
    COVERAGE_UNIT_LABEL[coverage.coverageUnit] ?? coverage.coverageUnit;
  const perUnitUom =
    PER_UNIT_UOM_LABEL[coverage.perUnitUom] ?? coverage.perUnitUom;
  const perUnit = Number(coverage.perUnit) === 1 ? "" : `${coverage.perUnit} `;
  const rate =
    coverage.coverageMin === coverage.coverageMax
      ? coverage.coverageMin
      : `${coverage.coverageMin}–${coverage.coverageMax}`;
  const basis = coverage.coverageBasis === "PER_COAT" ? "/coat" : "";
  return `${rate} ${unit}/${perUnit}${perUnitUom}${basis}`;
}

/** "R 494.16" / "R 1 650.00": dot decimals, as prices are quoted. */
export function formatRand(amount: string | number) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "-";
  const [whole, cents] = n.toFixed(2).split(".");
  return `R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
}

export function sizeLabel(p: CataloguePriceDto) {
  return `${Number(p.unitSize)}${uomLabel(p.uom)}`;
}

/** "Pastel - TLS100"; "All" when the price covers every variant. */
export function variantLabel(p: CataloguePriceDto) {
  if (!p.variant) return "All";
  return p.variantCode ? `${p.variant} - ${p.variantCode}` : p.variant;
}

/** Smallest pack first, then by variant name (family-wide prices first). */
export function sortPrices(prices: CataloguePriceDto[]) {
  return [...prices].sort(
    (a, b) =>
      Number(a.unitSize) - Number(b.unitSize) ||
      (a.variant ?? "").localeCompare(b.variant ?? ""),
  );
}

/** Cheapest price, used as a "from R…" hint on list cards. */
export function lowestPrice(product: CatalogueProductDto) {
  if (product.prices.length === 0) return null;
  return Math.min(...product.prices.map((p) => Number(p.price)));
}

export function matchesCatalogueSearch(
  product: CatalogueProductDto,
  term: string,
) {
  if (!term) return true;
  if (product.name.toLowerCase().includes(term)) return true;
  if ((product.sku ?? "").toLowerCase().includes(term)) return true;
  if (product.brands.some((b) => b.name.toLowerCase().includes(term)))
    return true;
  // A family matches when any of its colours/variants match, like the web.
  return product.colors.some(
    (c) =>
      c.colorName.toLowerCase().includes(term) ||
      (c.colorCode ?? "").toLowerCase().includes(term),
  );
}

type CatalogueSnapshot = {
  products: CatalogueProductDto[];
  suppliers: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

// The list screen keeps its last load here so the detail and edit screens
// open instantly instead of refetching the whole catalogue.
let snapshot: CatalogueSnapshot | null = null;

export function rememberCatalogue(next: CatalogueSnapshot) {
  snapshot = next;
}

export function cachedCatalogue() {
  return snapshot;
}

export function cachedProduct(id: string) {
  return snapshot?.products.find((p) => p.id === id) ?? null;
}
