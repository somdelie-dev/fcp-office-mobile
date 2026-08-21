import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { isCurrentlyOnline } from "./offline/networkStatus";

// https://fcp.cautious-tech.com/

const PROD_API_BASE = "https://fcp.cautious-tech.com";
const DEV_API_PORT = 3000;

/**
 * In dev, derive the backend host from the address Metro is actually
 * reachable on (the same host Expo Go used to load this bundle), instead of
 * a hardcoded LAN IP. That address changes whenever WiFi/VPN interfaces
 * reorder, so hardcoding it breaks silently on phones on the real LAN.
 */
function getDevLanHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  return host || null;
}

export function getApiBase() {
  if (__DEV__) {
    const host = getDevLanHost();
    if (host) return `http://${host}:${DEV_API_PORT}`;
    // Web dev server (no Metro hostUri) talks to itself on localhost.
    if (Platform.OS === "web") return `http://localhost:${DEV_API_PORT}`;
  }
  return PROD_API_BASE;
}

const TOKEN_KEY = "auth_token_v1";

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

function isFormDataBody(body: any): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * Main API fetch function with offline queue support
 *
 * Mutations (POST/DELETE) for foreman workflows are queued when offline:
 * - POST /api/app/attendance/scan
 * - POST /api/app/attendance/bulk
 * - DELETE /api/app/attendance/scan/:id
 * - POST /api/app/foreman/day/note
 * - POST /api/app/foreman/day/ready
 *
 * All other requests (reads, supervisor operations) go directly to server.
 *
 * IMPORTANT:
 * - multipart/form-data uploads are NEVER queued (they must be online)
 */
export async function apiFetch(
  path: string,
  init?: RequestInit & { auth?: boolean; skipQueue?: boolean },
) {
  // If body is FormData (photo uploads), never queue
  const body = init?.body as any;
  const isFD = isFormDataBody(body);

  const shouldQueue =
    !init?.skipQueue &&
    !isFD &&
    Platform.OS !== "web" && // Never queue on web
    isForemanMutation(path, init?.method) &&
    !isCurrentlyOnline();

  if (shouldQueue) {
    return await enqueueAndReturnOptimistic(path, init);
  }

  return await fetchDirect(path, init);
}

/**
 * Direct fetch without queue routing (for reads and non-foreman operations)
 */
async function fetchDirect(
  path: string,
  init?: RequestInit & { auth?: boolean },
) {
  const base = getApiBase();

  // Retry on transient network failures (timeouts, dropped connections) since
  // mobile networks are flaky. Never retried on 4xx/5xx responses (see below).
  const body = init?.body as any;
  const isFD = isFormDataBody(body);

  const maxAttempts = 3;

  let attempt = 0;
  let lastError: any = null;

  while (++attempt <= maxAttempts) {
    const controller = new AbortController();
    // Use a longer timeout for multipart/form-data uploads (photos can be slow on mobile)
    const timeoutMs = isFD ? 60000 : 12000; // 60s for uploads, 12s for other requests
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const useAuth = init?.auth !== false; // default true
      const token = useAuth ? await getToken() : null;

      // body/isFD already computed above for timeout selection
      // Reuse the values here
      // const body = init?.body as any;
      // const isFD = isFormDataBody(body);

      // Start from any caller-provided headers
      const headers: Record<string, string> = {
        ...(init?.headers as any),
      };

      // Always accept JSON
      if (!headers.Accept && !headers.accept) {
        headers.Accept = "application/json";
      }

      // Only set JSON content-type when NOT FormData
      // If FormData, fetch must set boundary automatically.
      if (!isFD) {
        // Set content-type only if caller didn't set one
        const hasContentType = Object.keys(headers).some(
          (k) => k.toLowerCase() === "content-type",
        );
        if (!hasContentType) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        // Ensure we are NOT forcing content-type
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === "content-type") delete headers[k];
        }
      }

      if (token) headers.Authorization = `Bearer ${token}`;

      // ✅ Inject acting foreman ID header if present
      const actingForemanId = await AsyncStorage.getItem("acting_foreman_id");
      if (actingForemanId) {
        headers["x-acting-foreman-id"] = actingForemanId;
      }

      // ✅ Add client tag header for logging
      headers["x-client"] = Platform.OS === "web" ? "web" : "mobile";

      const res = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
        cache: "no-store",
      });

      const text = await res.text();

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        // ✅ Handle 403 Forbidden: clear acting foreman and force re-selection
        if (res.status === 403 && actingForemanId) {
          await AsyncStorage.removeItem("acting_foreman_id");
        }

        const msgBody =
          json?.error ||
          json?.message ||
          (text && text.length < 200 ? text : null);
        const msg = msgBody ?? `Request failed (${res.status})`;

        // Throw an Error but attach useful metadata (status, path, response body)
        const err: any = new Error(msg);
        err.status = res.status;
        try {
          err.statusText = (res as any).statusText ?? undefined;
        } catch {}
        err.path = path;
        err.response = json ?? (text ? { text } : undefined) ?? null;

        throw err;
      }

      return json;
    } catch (e: any) {
      lastError = e;
      // If aborted (timeout) or a network failure, prepare to retry
      const isTimeout =
        e?.name === "AbortError" ||
        String(e?.message).includes("timed out") ||
        String(e?.message).includes("Network request failed");
      // Do not retry on 4xx/5xx errors (bad auth, forbidden, validation, server errors) -
      // those are thrown as plain Error objects from the res.ok check above, not TypeErrors.
      const shouldRetry =
        isTimeout || e?.message === "Failed to fetch" || e instanceof TypeError;

      clearTimeout(t);

      if (attempt < maxAttempts && shouldRetry) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue; // retry loop
      }

      if (e?.name === "AbortError") throw new Error("Request timed out.");
      throw e;
    }
  }

  // If we exit loop without returning, throw the last error
  throw lastError ?? new Error("Request failed");
}

/**
 * Check if this is a foreman-specific mutation that should be queued
 */
function isForemanMutation(path: string, method?: string): boolean {
  const m = (method || "GET").toUpperCase();

  // Only queue POST and DELETE
  if (m !== "POST" && m !== "DELETE") return false;

  // Only queue foreman-specific endpoints (JSON bodies)
  const foremanPaths = [
    "/api/app/attendance/scan",
    "/api/app/attendance/bulk",
    "/api/app/foreman/day/note",
    "/api/app/foreman/day/ready",
  ];

  // Match exact path or a sub-path (e.g. "/scan/abc123"), but not a merely
  // similarly-prefixed sibling endpoint (e.g. "/scan-out-all" must NOT match "/scan").
  return foremanPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Enqueue a mutation and return optimistic response
 */
async function enqueueAndReturnOptimistic(
  path: string,
  init?: RequestInit & { auth?: boolean; skipQueue?: boolean },
): Promise<any> {
  // Lazy import to avoid circular dependency
  const queueModule = await import("./offline/queue");

  try {
    // Only JSON is supported in queue
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (path === "/api/app/attendance/scan" && init?.method === "POST") {
      const { siteId, employeeCode, latitude, longitude, address } = body;
      const qrCodeValue = body.employeeCode;
      const result = await queueModule.enqueueScan(
        siteId,
        employeeCode,
        qrCodeValue,
        undefined, // options
        { latitude, longitude, address }, // location
      );

      return {
        scan: {
          id: result.localScanId,
          employee: { code: employeeCode },
          isLocal: true,
        },
      };
    }

    if (path === "/api/app/attendance/bulk" && init?.method === "POST") {
      const { siteId, workDateISO, scans, latitude, longitude, address } = body;
      const result = await queueModule.enqueueBulkScan(
        siteId,
        workDateISO,
        scans,
        undefined, // options
        { latitude, longitude, address }, // location
      );

      return {
        scans: result.localScanIds.map((id: string) => ({ id, isLocal: true })),
      };
    }

    if (
      path.match(/\/api\/app\/attendance\/scan\/[^/]+$/) &&
      init?.method === "DELETE"
    ) {
      const scanId = path.split("/").pop()!;
      await queueModule.enqueueDeleteScan(scanId, false);
      return { success: true };
    }

    if (path === "/api/app/foreman/day/note" && init?.method === "POST") {
      const { siteId, dateISO, reason, note } = body;
      await queueModule.enqueueDayNote(siteId, dateISO, reason, note);
      return { success: true };
    }

    if (path === "/api/app/foreman/day/ready" && init?.method === "POST") {
      const { siteId, dateISO, readyToSubmit } = body;
      await queueModule.enqueueDayReady(siteId, dateISO, readyToSubmit);
      return { success: true };
    }

    throw new Error(`Unknown foreman mutation: ${path}`);
  } catch (e: any) {
    console.error("Failed to enqueue offline mutation:", path, e);
    throw e;
  }
}
