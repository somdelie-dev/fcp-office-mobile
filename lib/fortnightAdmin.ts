/**
 * Admin utility to manage fortnight anchor dates
 * Used at the start of each year or pay cycle
 */

export type FortnightAdminConfig = {
  anchorISO: string; // YYYY-MM-DD, must be a Saturday
  createdAt: string;
  description?: string;
};

/**
 * Check if a date is Saturday
 */
export function isSaturday(dateISO: string): boolean {
  const date = new Date(`${dateISO}T00:00:00`);
  return date.getDay() === 6; // 6 = Saturday
}

/**
 * Get the day name for a date
 */
export function getDayName(dateISO: string): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const date = new Date(`${dateISO}T00:00:00`);
  return days[date.getDay()];
}

/**
 * Find the nearest Saturday on or after the given date
 */
export function getNearestSaturday(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00`);
  const dayOfWeek = date.getDay();

  // If already Saturday, return as-is
  if (dayOfWeek === 6) {
    return dateISO;
  }

  // Calculate days to add to reach Saturday
  // Saturday = 6, so we need (6 - dayOfWeek) days, but if negative, add 7
  const daysToAdd = (6 - dayOfWeek + 7) % 7 || 7;

  const saturday = new Date(date);
  saturday.setDate(saturday.getDate() + daysToAdd);

  const y = saturday.getFullYear();
  const m = String(saturday.getMonth() + 1).padStart(2, "0");
  const d = String(saturday.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

/**
 * Validate and create a new fortnight anchor date
 * Returns validation result with the validated/adjusted date
 */
export function validateFortnightAnchor(inputDateISO: string): {
  valid: boolean;
  anchorISO: string;
  dayName: string;
  message: string;
} {
  try {
    // Validate ISO format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDateISO)) {
      return {
        valid: false,
        anchorISO: "",
        dayName: "",
        message: "Invalid date format. Use YYYY-MM-DD",
      };
    }

    // Check if date is valid
    const date = new Date(`${inputDateISO}T00:00:00`);
    if (isNaN(date.getTime())) {
      return {
        valid: false,
        anchorISO: "",
        dayName: "",
        message: "Invalid date",
      };
    }

    // Check if it's a Saturday
    if (!isSaturday(inputDateISO)) {
      const nearestSat = getNearestSaturday(inputDateISO);
      return {
        valid: true,
        anchorISO: nearestSat,
        dayName: getDayName(nearestSat),
        message: `${inputDateISO} is not a Saturday. Using nearest Saturday: ${nearestSat} (${getDayName(nearestSat)})`,
      };
    }

    return {
      valid: true,
      anchorISO: inputDateISO,
      dayName: getDayName(inputDateISO),
      message: `Valid Saturday date: ${inputDateISO}`,
    };
  } catch (error) {
    return {
      valid: false,
      anchorISO: "",
      dayName: "",
      message: `Error validating date: ${error}`,
    };
  }
}

/**
 * Format the anchor date for display
 */
export function formatFortnightAnchor(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00`);
  return date.toLocaleDateString("en-ZA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
