import type { CatalogueCoverageDto, CataloguePriceDto } from "@/lib/apiClient";

/**
 * Paint quantity maths, mirroring the web's Paint Planning
 * (lib/procurement/paintPlanPricing.ts + newProductCoverage.ts):
 *   rate   = midpoint of the coverage range, per litre
 *   litres = area x coatFactor / rate, then + wastage %
 * coatFactor is the coat count for PER_COAT rates and 1 for TOTAL_SYSTEM.
 */

/** Only m² per litre rates can turn an area into litres, as on the web. */
export function isUsableCoverage(c: CatalogueCoverageDto) {
  return (
    c.coverageUnit === "M2" && c.perUnitUom === "L" && Number(c.perUnit) > 0
  );
}

export function m2PerLitre(c: CatalogueCoverageDto) {
  return (
    (Number(c.coverageMin) + Number(c.coverageMax)) / 2 / Number(c.perUnit)
  );
}

export function litresNeeded(input: {
  areaM2: number;
  coats: number;
  coverage: CatalogueCoverageDto;
  wastagePercent: number;
}) {
  const coatFactor =
    input.coverage.coverageBasis === "TOTAL_SYSTEM"
      ? 1
      : Math.max(1, input.coats);
  const rate = m2PerLitre(input.coverage);
  const before = (input.areaM2 * coatFactor) / rate;
  const wastage = before * (input.wastagePercent / 100);
  return { rate, coatFactor, before, wastage, total: before + wastage };
}

export type Pack = { sizeL: number; price: number };
export type PackPlan = {
  lines: { sizeL: number; count: number; price: number }[];
  litres: number;
  cost: number;
};

/** Litre-sized packs for one variant ("All" = prices not tied to a variant). */
export function packsFor(
  prices: CataloguePriceDto[],
  variant: string | null,
): Pack[] {
  const bySize = new Map<number, number>();
  for (const p of prices) {
    if ((p.variant ?? null) !== variant) continue;
    const sizeL =
      p.uom === "L"
        ? Number(p.unitSize)
        : p.uom === "ML"
          ? Number(p.unitSize) / 1000
          : NaN;
    const price = Number(p.price);
    if (!(sizeL > 0) || !(price > 0)) continue;
    // Several sources can price the same size; plan with the cheapest.
    bySize.set(sizeL, Math.min(price, bySize.get(sizeL) ?? Infinity));
  }
  return [...bySize.entries()]
    .map(([sizeL, price]) => ({ sizeL, price }))
    .sort((a, b) => b.sizeL - a.sizeL);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Cheapest combination of packs holding at least `litres`. Exact search in
 * steps of the packs' common size (e.g. 1L for 1/5/20L); falls back to
 * "largest packs first" if the search space would be too big.
 */
export function cheapestPacks(litres: number, packs: Pack[]): PackPlan | null {
  if (packs.length === 0 || !(litres > 0)) return null;
  const units = packs.map((p) => Math.round(p.sizeL * 1000));
  const step = units.reduce((g, u) => gcd(g, u));
  const sizes = units.map((u) => u / step);
  const need = Math.ceil((litres * 1000 - 1e-6) / step);
  const limit = need + Math.max(...sizes);

  if (limit > 200_000) return greedyPacks(litres, packs);

  const cost = new Float64Array(limit + 1).fill(Infinity);
  const pick = new Int32Array(limit + 1).fill(-1);
  cost[0] = 0;
  for (let q = 1; q <= limit; q++) {
    for (let i = 0; i < packs.length; i++) {
      const prev = q - sizes[i];
      if (prev >= 0 && cost[prev] + packs[i].price < cost[q]) {
        cost[q] = cost[prev] + packs[i].price;
        pick[q] = i;
      }
    }
  }

  let best = -1;
  for (let q = need; q <= limit; q++) {
    // Cheaper wins; on a tie, less leftover paint.
    if (cost[q] < Infinity && (best < 0 || cost[q] < cost[best] - 1e-9))
      best = q;
  }
  if (best < 0) return greedyPacks(litres, packs);

  const counts = new Map<number, number>();
  for (let q = best; q > 0; q -= sizes[pick[q]]) {
    counts.set(pick[q], (counts.get(pick[q]) ?? 0) + 1);
  }
  return toPlan(packs, counts);
}

function greedyPacks(litres: number, packs: Pack[]): PackPlan {
  const counts = new Map<number, number>();
  let left = litres;
  packs.forEach((p, i) => {
    const isSmallest = i === packs.length - 1;
    const n = isSmallest
      ? Math.ceil(left / p.sizeL - 1e-9)
      : Math.floor(left / p.sizeL);
    if (n > 0) {
      counts.set(i, n);
      left -= n * p.sizeL;
    }
  });
  return toPlan(packs, counts);
}

function toPlan(packs: Pack[], counts: Map<number, number>): PackPlan {
  const lines = [...counts.entries()]
    .map(([i, count]) => ({
      sizeL: packs[i].sizeL,
      count,
      price: packs[i].price,
    }))
    .sort((a, b) => b.sizeL - a.sizeL);
  return {
    lines,
    litres: lines.reduce((s, l) => s + l.sizeL * l.count, 0),
    cost: lines.reduce((s, l) => s + l.price * l.count, 0),
  };
}

export function formatLitres(l: number) {
  return `${Number(l.toFixed(2))} L`;
}
