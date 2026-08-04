// lib/employeesStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { apiForemanEmployee, apiScanOutFace, type EmployeeDto } from "./apiClient";

export type Employee = {
  id: string;
  code: string; // QR/worker code
  fullName: string;
  phone?: string; // not returned by your backend right now
  dayRate: number;
  active: boolean;
  faceImageUrl?: string | null;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "foreman_employees_v1";
type EmployeesMap = Record<string, Employee>;

let cache: EmployeesMap = {};
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = raw ? (JSON.parse(raw) as EmployeesMap) : {};
  loaded = true;
}

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export async function initEmployeesStore() {
  await ensureLoaded();
}

export async function listEmployees(): Promise<Employee[]> {
  await ensureLoaded();
  return Object.values(cache).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEmployee(id: string): Promise<Employee | null> {
  await ensureLoaded();
  return cache[id] ?? null;
}

function genId() {
  return `e_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/**
 * ✅ Local upsert: create or update employee in cache (for local form submission)
 */
export async function upsertEmployee(input: {
  id?: string;
  code: string;
  fullName: string;
  phone?: string;
  dayRate: number;
  active?: boolean;
}): Promise<{ ok: true; employee: Employee } | { ok: false; reason: string }> {
  await ensureLoaded();

  const code = input.code.trim().toUpperCase();
  const fullName = input.fullName.trim();
  const dayRate = input.dayRate;

  if (!code) return { ok: false, reason: "Worker code is required." };
  if (!fullName) return { ok: false, reason: "Full name is required." };
  if (!Number.isFinite(dayRate) || dayRate < 0) {
    return { ok: false, reason: "Day rate must be a valid number." };
  }

  const existing = Object.values(cache).find(
    (e) => e.code === code && e.id !== input.id,
  );
  if (existing) return { ok: false, reason: "Worker code already exists." };

  const now = Date.now();

  if (input.id && cache[input.id]) {
    const prev = cache[input.id];
    const updated: Employee = {
      ...prev,
      code,
      fullName,
      phone: input.phone?.trim() || "",
      dayRate,
      active: input.active ?? prev.active,
      updatedAt: now,
    };
    cache[input.id] = updated;
    await persist();
    return { ok: true, employee: updated };
  }

  const id = genId();
  const created: Employee = {
    id,
    code,
    fullName,
    phone: input.phone?.trim() || "",
    dayRate,
    active: input.active ?? true,
    faceImageUrl: null,
    createdAt: now,
    updatedAt: now,
  };

  cache[id] = created;
  await persist();
  return { ok: true, employee: created };
}

export async function upsertEmployeeFromServerDto(dto: EmployeeDto) {
  await ensureLoaded();
  const now = Date.now();

  const prev = cache[dto.id];
  const next: Employee = {
    id: dto.id,
    code: dto.code,
    fullName: dto.fullName,
    phone: prev?.phone ?? "", // backend doesn't provide it; keep whatever you had
    dayRate: dto.dayRate,
    active: dto.active,
    faceImageUrl: dto.faceImageUrl ?? prev?.faceImageUrl ?? null,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };

  cache[dto.id] = next;
  await persist();
  return next;
}

/**
 * ✅ Fetch a single employee from the server (Bearer) and cache it locally.
 * This is the one you want for details.
 */
export async function fetchEmployeeFromServer(
  employeeId: string,
): Promise<Employee | null> {
  await ensureLoaded();

  try {
    const res = await apiForemanEmployee(employeeId);
    const dto = res.employee;

    const cached = await upsertEmployeeFromServerDto(dto);
    return cached;
  } catch (error) {
    console.error(`Failed to fetch employee ${employeeId}:`, error);
    return null;
  }
}

/**
 * ✅ Records a face scan-out via the attendance endpoint and returns the
 * server-issued timestamp. `image` (base64) is optional — Phase 2 real
 * verification only runs when it's provided; omitting it falls back to the
 * original Phase 1 cosmetic-only behavior.
 */
export async function recordFaceScanOut(
  id: string,
  options?: { image?: string; checkLiveness?: boolean },
): Promise<{ timestamp: string; verificationStatus: string; confidence: number | null }> {
  await ensureLoaded();

  const res = await apiScanOutFace({
    employeeId: id,
    device: `${Platform.OS} ${Platform.Version}`,
    image: options?.image,
    checkLiveness: options?.checkLiveness,
  });

  return {
    timestamp: res.scannedOutAt,
    verificationStatus: res.verificationStatus,
    confidence: res.confidence,
  };
}

/**
 * Local delete is only for cache.
 * Real delete/deactivate should call server DELETE endpoint if you want it.
 */
export async function deleteEmployeeFromCache(id: string) {
  await ensureLoaded();
  if (!cache[id]) return;
  delete cache[id];
  await persist();
}
