// lib/timesheetPeriods.ts
const MS_DAY = 24 * 60 * 60 * 1000;

function startOfDayUTC(d: Date) {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isSaturdayUTC(d: Date) {
  return d.getUTCDay() === 6;
}

/**
 * Resolve the fortnight for a date using the year's anchorSat.
 * Returns the fortnight START (Saturday) and END (Friday).
 */
export function getFortnightForDateUTC(date: Date, anchorSat: Date) {
  const anchor = startOfDayUTC(anchorSat);
  if (!isSaturdayUTC(anchor)) throw new Error("Anchor must be Saturday (UTC)");

  const d = startOfDayUTC(date);

  const diffDays = Math.floor((d.getTime() - anchor.getTime()) / MS_DAY);
  const k = Math.floor(diffDays / 14);

  const start = addDaysUTC(anchor, k * 14);
  const end = addDaysUTC(start, 13);

  return {
    startDate: start,
    endDate: end,
    startISO: toISODateUTC(start),
    endISO: toISODateUTC(end),
    id: `${toISODateUTC(start)}_${toISODateUTC(end)}`,
  };
}
