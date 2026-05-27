import { listDays, type DayRecord } from "./attendanceStore";
import { getFortnightForDate, isISOInRange, type Fortnight } from "./fortnight";

export type TimesheetRow = {
  id: string; // fortnight id
  startISO: string;
  endISO: string;

  daysCount: number;
  totalScans: number;
  readyDays: number;
  flaggedDays: number;

  // used for sorting: current fortnight should rank highest
  isCurrent: boolean;
};

export type TimesheetDetails = {
  fortnight: Fortnight;
  days: DayRecord[]; // all days in that period
};

export async function buildTimesheets(): Promise<TimesheetRow[]> {
  const days = await listDays();
  const current = getFortnightForDate(new Date().toISOString().slice(0, 10));

  const map = new Map<string, { f: Fortnight; days: DayRecord[] }>();

  for (const d of days) {
    const f = getFortnightForDate(d.dateISO);
    const bucket = map.get(f.id);
    if (!bucket) map.set(f.id, { f, days: [d] });
    else bucket.days.push(d);
  }

  const rows: TimesheetRow[] = Array.from(map.values()).map(({ f, days }) => {
    const totalScans = days.reduce((sum, d) => sum + (d.scans?.length ?? 0), 0);
    const flaggedDays = days.reduce(
      (sum, d) => sum + ((d.flags ?? 0) > 0 ? 1 : 0),
      0,
    );
    const readyDays = days.reduce(
      (sum, d) => sum + (d.readyToSubmit ? 1 : 0),
      0,
    );

    return {
      id: f.id,
      startISO: f.startISO,
      endISO: f.endISO,
      daysCount: days.length,
      totalScans,
      readyDays,
      flaggedDays,
      isCurrent: f.id === current.id,
    };
  });

  // ✅ sort: current first, then newest fortnight
  rows.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return b.startISO.localeCompare(a.startISO);
  });

  return rows;
}

export async function getTimesheetDetails(
  id: string,
): Promise<TimesheetDetails | null> {
  const [startISO, endISO] = id.split("__");
  if (!startISO || !endISO) return null;

  const days = await listDays();
  const matched = days
    .filter((d) => isISOInRange(d.dateISO, startISO, endISO))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  return {
    fortnight: { id, startISO, endISO },
    days: matched,
  };
}
