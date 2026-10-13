// Mirrors the server's lib/overtimeRules.ts prompt rule so the foreman is only
// asked about overtime when the server will accept it. The server re-checks.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/** Weekdays from 17:00, weekends from 16:00, Africa/Johannesburg time. */
export function isOvertimePromptTime(at: Date = new Date()): boolean {
  const sast = new Date(at.getTime() + SAST_OFFSET_MS);
  const weekday = sast.getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  return sast.getUTCHours() >= (isWeekend ? 16 : 17);
}
