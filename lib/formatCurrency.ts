export function formatCurrency(
  amount: number | string | null | undefined,
  locale: string = "en-ZA",
  currency: string = "ZAR",
): string {
  if (amount === null || amount === undefined) return "R0.00";

  const n = typeof amount === "string" ? Number(amount) : amount;

  if (!Number.isFinite(n)) return "R0.00";

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(n);

    // Replace ZAR with R (optional)
    return formatted.replace("ZAR", "R");
  } catch {
    return `R${n.toFixed(2)}`;
  }
}
