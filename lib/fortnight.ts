export type Fortnight = {
  id: string; // "2026-01-19__2026-02-01"
  startISO: string; // YYYY-MM-DD
  endISO: string; // YYYY-MM-DD (inclusive)
};

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(dateISO: string) {
  return new Date(`${dateISO}T00:00:00`);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// ✅ Anchor date: pick a known fortnight start used by your company.
// Change this once and your whole app aligns.
export const FORTNIGHT_ANCHOR_ISO = "2026-01-31"; // Saturday

export function getFortnightForDate(dateISO: string): Fortnight {
  const anchor = parseISO(FORTNIGHT_ANCHOR_ISO);
  const target = parseISO(dateISO);

  const diffDays = Math.floor(
    (target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24),
  );

  const periodIndex = Math.floor(diffDays / 14);
  const start = addDays(anchor, periodIndex * 14);
  const end = addDays(start, 13);

  const startISO = toISO(start);
  const endISO = toISO(end);

  return {
    id: `${startISO}__${endISO}`,
    startISO,
    endISO,
  };
}

export function getCurrentFortnight(): Fortnight {
  const todayISO = toISO(new Date());
  return getFortnightForDate(todayISO);
}

export function isISOInRange(
  dateISO: string,
  startISO: string,
  endISO: string,
) {
  const t = parseISO(dateISO).getTime();
  return t >= parseISO(startISO).getTime() && t <= parseISO(endISO).getTime();
}
