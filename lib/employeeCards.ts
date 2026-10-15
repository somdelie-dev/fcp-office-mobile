import { File, Paths } from "expo-file-system";

import { getApiBase, getToken } from "@/lib/api";

export const CARDS_PER_SHEET = 8;

export type CardEmployee = { id: string; code?: string | null; fullName: string };

function safeName(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "card";
}

async function requireToken() {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated. Please sign in again.");
  return token;
}

async function errorFromResponse(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return new Error(data?.error ?? `${fallback} (${res.status})`);
}

/** Downloads one employee's 2-page card PDF into the app cache. */
export async function downloadEmployeeCard(emp: CardEmployee): Promise<string> {
  const token = await requireToken();
  const url = `${getApiBase()}/api/employees/${encodeURIComponent(emp.id)}/card.pdf?token=${encodeURIComponent(token)}`;
  const label = safeName([emp.code, emp.fullName].filter(Boolean).join("_"));
  const destination = new File(Paths.cache, `card_${label}.pdf`);
  const result = await File.downloadFileAsync(url, destination, {
    idempotent: true,
  });
  return result.uri;
}

/**
 * Downloads each card, then has the server lay them out on A4 sheets
 * (8 per page, duplex-ready) using the same endpoint as the web Print Cards page.
 */
export async function buildPrintSheet(
  employees: CardEmployee[],
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  if (employees.length === 0) throw new Error("Select at least one person.");
  const token = await requireToken();

  const form = new FormData();
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const uri = await downloadEmployeeCard(emp);
    form.append("cards", {
      uri,
      name: `${safeName(emp.fullName)}.pdf`,
      type: "application/pdf",
    } as any);
    onProgress?.(i + 1, employees.length);
  }

  const res = await fetch(`${getApiBase()}/api/merge-cards`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw await errorFromResponse(res, "Failed to build print sheet");

  const bytes = new Uint8Array(await res.arrayBuffer());
  const output = new File(Paths.document, `cards_print_ready_${Date.now()}.pdf`);
  output.create();
  output.write(bytes);
  return output.uri;
}
