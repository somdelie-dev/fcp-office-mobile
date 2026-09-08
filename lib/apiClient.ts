// lib/apiClient.ts
import { apiFetch } from "./api";
import { apiFetchCached, buildCacheKey, OfflineError } from "./apiFetchCached";
import type { Role } from "./auth";
import { cacheKeyScope, cacheRemove, cacheSet, TTL } from "./mobileCache";

// Re-export for convenience
export { OfflineError };

export type ApiEmployee = {
  id: string;
  code: string;
  fullName: string;
  phone?: string;
  dayRate: number;
  active: boolean;
  photoUrl?: string | null;
  isForeman?: boolean;
  createdAt?: string;
  lastScannedAt?: string | null;
};

export async function apiEmployees(): Promise<{ employees: ApiEmployee[] }> {
  return apiFetch("/api/employees", { auth: true });
}

export async function apiToggleEmployeeActive(
  employeeId: string,
  active: boolean,
) {
  return apiFetch(
    `/api/employees/${encodeURIComponent(employeeId)}/toggle-active`,
    {
      method: "POST",
      body: JSON.stringify({ active }),
    },
  );
}

// ADMIN DASHBOARD

export type AdminDashboardMetricsDto = {
  totalEmployees: number;
  activeSites: number;
  totalForemen: number;
  totalSupervisors: number;
};

export async function apiAdminDashboardMetrics(): Promise<AdminDashboardMetricsDto> {
  return apiFetch("/api/app/admin/dashboard/metrics");
}

export type AdminWeeklyAttendancePointDto = {
  day: string; // e.g. "Mon"
  scans: number;
  sites: number;
};

export type AdminWeeklyAttendanceDto = AdminWeeklyAttendancePointDto[];

export async function apiAdminWeeklyAttendance(
  period?: string,
): Promise<AdminWeeklyAttendanceDto> {
  const params = period ? `?period=${period}` : "";
  return apiFetch(`/api/app/admin/dashboard/weekly-attendance${params}`);
}

// ADMIN: SITES

export type AdminSiteListItemDto = {
  id: string;
  name: string;
  code?: string | null;
  client?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive: boolean;
  createdAt: string;
};

// Admin site detail: assignments + basic site info + project wage costs.
// Backend response example for GET /api/app/admin/sites/{id}:
// {
//   ok: true,
//   site: AdminSiteListItemDto,
//   totalProjectWages: 45250.00,
//   foremen: [...],
//   supervisors: [...]
// }
export type AdminSiteDetailDto = {
  ok: true;
  site: AdminSiteListItemDto;
  totalProjectWages?: number | null;
  foremen: Array<{
    foremanId: string;
    userId: string;
    name: string;
    email?: string | null;
    startsOn: string;
    endsOn?: string | null;
  }>;
  supervisors: Array<{
    userId: string;
    name: string;
    email?: string | null;
    startsOn: string;
    endsOn?: string | null;
  }>;
};

export async function apiAdminSites(query?: {
  q?: string;
  /** When set, filters by active flag (true/false). */
  isActive?: boolean | "true" | "false";
}): Promise<{ ok: true; sites: AdminSiteListItemDto[] }> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);

  if (typeof query?.isActive !== "undefined") {
    const v =
      typeof query.isActive === "boolean"
        ? query.isActive
          ? "true"
          : "false"
        : query.isActive;
    params.set("isActive", v);
  }

  const qs = params.toString();
  return apiFetch(`/api/app/admin/sites${qs ? `?${qs}` : ""}`);
}

export async function apiAdminSiteDetail(
  id: string,
): Promise<AdminSiteDetailDto> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(id)}`,
  ) as Promise<AdminSiteDetailDto>;
}

/** Mark a site as finished (sets isActive = false) via PATCH */
export async function apiAdminMarkSiteFinished(
  id: string,
): Promise<{ ok: true; site: AdminSiteListItemDto }> {
  return apiFetch(`/api/app/admin/sites/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: false }),
  });
}

/** Permanently delete a site */
export async function apiAdminDeleteSite(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/app/admin/sites/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Update site fields (name, code, location, address, lat, lng) via PATCH */
export async function apiAdminUpdateSite(
  id: string,
  data: {
    name?: string;
    code?: string | null;
    location?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<{ ok: true; site: AdminSiteListItemDto }> {
  return apiFetch(`/api/app/admin/sites/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Create a new site via POST */
export async function apiAdminCreateSite(data: {
  name: string;
  code?: string | null;
  client?: string | null;
  location?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  assignmentType?: "SUPERVISOR" | "ADMIN" | null;
  assignmentUserId?: string | null;
}): Promise<{ ok: true; site: AdminSiteListItemDto }> {
  return apiFetch("/api/app/admin/sites", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ADMIN: USERS (by role)

export type AdminUserListItemDto = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/** List users filtered by role */
export async function apiAdminListUsers(
  role: string,
): Promise<{ ok: true; users: AdminUserListItemDto[] }> {
  return apiFetch(`/api/app/admin/users?role=${encodeURIComponent(role)}`);
}

/**
 * List all users (optionally filter by role and search)
 *
 * Cache-first, reference data (personnel roster). Not invalidated on mutation:
 * role/search filters produce many distinct cache keys, so a targeted
 * cacheRemove would only ever clear one variant. Falls back to TTL expiry
 * (TTL.EMPLOYEES_LIST) — see caching audit Priority 1 notes.
 */
export async function apiAdminAllUsers(
  query?: {
    role?: string;
    q?: string;
  },
  forceRefresh = false,
): Promise<{ ok: true; users: AdminUserListItemDto[] }> {
  const params = new URLSearchParams();
  if (query?.role) params.set("role", query.role);
  if (query?.q) params.set("q", query.q);
  const qs = params.toString();
  const path = `/api/app/admin/users${qs ? `?${qs}` : ""}`;

  const baseKey = buildCacheKey("admin_all_users", query?.role, query?.q);
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached<{ ok: true; users: AdminUserListItemDto[] }>(path, {
    cacheKey: key,
    ttlMs: TTL.EMPLOYEES_LIST,
    forceRefresh,
  });
}

/** Delete a user by id */
export async function apiAdminDeleteUser(
  userId: string,
): Promise<{ ok: true }> {
  return apiFetch(`/api/app/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/** Create a new foreman user */
export async function apiAdminCreateForeman(data: {
  name: string;
  email: string;
  password: string;
  dayRate: number;
  supervisorId: string;
}): Promise<{
  ok: true;
  user: { id: string; email: string; name: string; role: string };
}> {
  const result = await apiFetch("/api/app/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  // Invalidate the admin foremen-list cache (apiAdminForemenList) so the
  // Foremen screen shows the new foreman on next load instead of a stale list.
  await cacheRemove(await cacheKeyScope(buildCacheKey("admin_foremen_list")));
  return result;
}

// ADMIN: AUDIT LOGS (activity logs)

export type AuditLogEntryDto = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  entityName: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
};

export type RecentLoginDto = {
  id: string;
  action: string;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
};

export type AuditLogsResponse = {
  logs: AuditLogEntryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  actions: string[];
  recentLogins: RecentLoginDto[];
};

export async function apiAdminAuditLogs(query?: {
  page?: number;
  search?: string;
  action?: string;
}): Promise<AuditLogsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.search) params.set("search", query.search);
  if (query?.action) params.set("action", query.action);
  const qs = params.toString();
  return apiFetch(`/api/app/admin/audit-logs${qs ? `?${qs}` : ""}`);
}

// ADMIN: SITE-DAY PHOTOS (verification)

export type AdminSiteDayPhotoDto = {
  id: string;
  imageUrl: string;
  dateTakenISO: string;
  uploadedAtISO: string;
  siteName: string;
  siteId: string;
  foremanName: string;
  foremanId: string;
  supervisorName: string | null;
  supervisorId: string | null;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

/** List site-day photos for admin (last 7 days) */
export async function apiAdminSiteDayPhotos(query?: {
  supervisorId?: string;
  foremanId?: string;
}): Promise<{
  photos: AdminSiteDayPhotoDto[];
  foremen: { id: string; name: string }[];
  supervisors: { id: string; name: string }[];
}> {
  const params = new URLSearchParams();
  if (query?.supervisorId) params.set("supervisorId", query.supervisorId);
  if (query?.foremanId) params.set("foremanId", query.foremanId);
  const qs = params.toString();
  return apiFetch(`/api/app/admin/site-day-photos${qs ? `?${qs}` : ""}`);
}

/** Verify or reject a site-day photo */
export async function apiAdminVerifyPhoto(
  photoId: string,
  data: { status: "VERIFIED" | "REJECTED"; notes?: string },
): Promise<{
  ok: true;
  verification: {
    id: string;
    status: string;
    verifiedAt: string | null;
    notes: string | null;
  };
}> {
  return apiFetch(
    `/api/app/admin/site-day-photos/${encodeURIComponent(photoId)}/verify`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

/** Delete a site-day photo (admin) */
export async function apiAdminDeletePhoto(
  photoId: string,
): Promise<{ ok: true }> {
  return apiFetch(
    `/api/app/admin/site-day-photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE" },
  );
}

// ADMIN: ATTENDANCE SCANS

export type AdminAttendanceScanDto = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  siteId: string;
  siteName: string;
  siteCode: string | null;
  foremanId: string;
  foremanName: string;
  supervisorId: string | null;
  supervisorName: string | null;
  workDateISO: string;
  scannedAtISO: string;
  scannedOutAtISO: string | null;
  scanType: string;
  overtimeType: string | null;
  scanOutMethod: "PHOTO" | "FINGERPRINT" | "FACE" | null;
  verificationStatus: "VERIFIED" | "PENDING_REVIEW" | "REJECTED" | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

/** List attendance scans for admin (last 7 days) */
export async function apiAdminAttendanceScans(query?: {
  siteId?: string;
  foremanId?: string;
  supervisorId?: string;
  date?: string;
  q?: string;
}): Promise<{
  scans: AdminAttendanceScanDto[];
  sites: { id: string; name: string; code: string | null }[];
  foremen: { id: string; name: string }[];
  supervisors: { id: string; name: string }[];
}> {
  const params = new URLSearchParams();
  if (query?.siteId) params.set("siteId", query.siteId);
  if (query?.foremanId) params.set("foremanId", query.foremanId);
  if (query?.supervisorId) params.set("supervisorId", query.supervisorId);
  if (query?.date) params.set("date", query.date);
  if (query?.q) params.set("q", query.q);
  const qs = params.toString();
  return apiFetch(`/api/app/admin/attendance-scans${qs ? `?${qs}` : ""}`);
}

// ADMIN: MANUAL ATTENDANCE SCANS

/** Get employee IDs that already have an attendance scan for a given date */
export async function apiAdminManualScanScannedIds(
  date: string,
): Promise<{ scannedEmployeeIds: string[] }> {
  return apiFetch(
    `/api/admin/attendance-scans/manual?date=${encodeURIComponent(date)}`,
  );
}

export type AdminManualScanResultDto = {
  id: string;
  scannedAt: string;
  employee: { id: string; fullName: string };
  site: string;
  foreman: string;
  workDate: string;
};

export type AdminManualScanSkippedDto = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  reason: string;
};

/** Create manual attendance scans for one or more employees across one or more dates */
export async function apiAdminCreateManualScans(input: {
  siteId: string;
  foremanId: string;
  employeeIds: string[];
  workDates: string[];
  reason?: string;
}): Promise<{
  ok: true;
  scan: AdminManualScanResultDto;
  scans: AdminManualScanResultDto[];
  skipped: AdminManualScanSkippedDto[];
}> {
  return apiFetch("/api/admin/attendance-scans/manual", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ADMIN: SITE ASSIGNMENTS

export type SiteSupervisorAssignmentDto = {
  id: string;
  supervisorId: string;
  userId: string;
  name: string;
  email?: string;
  startsOn: string;
  endsOn: string | null;
};

export type SiteForemanAssignmentDto = {
  id: string;
  foremanId: string;
  name: string;
  startDate: string;
  endDate: string | null;
};

/** List active supervisor assignments for a site */
export async function apiAdminSiteSupervisors(
  siteId: string,
): Promise<{ ok: true; supervisors: SiteSupervisorAssignmentDto[] }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/supervisors`,
  );
}

/** Assign a supervisor to a site */
export async function apiAdminAssignSupervisor(
  siteId: string,
  userId: string,
): Promise<{ ok: true; assignment: SiteSupervisorAssignmentDto }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/supervisors`,
    { method: "POST", body: JSON.stringify({ userId }) },
  );
}

/** End a supervisor assignment */
export async function apiAdminEndSupervisorAssignment(
  siteId: string,
  userId: string,
): Promise<{ ok: true }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/supervisors/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

/** List active foreman assignments for a site */
export async function apiAdminSiteForemen(
  siteId: string,
): Promise<{ ok: true; foremen: SiteForemanAssignmentDto[] }> {
  return apiFetch(`/api/app/admin/sites/${encodeURIComponent(siteId)}/foremen`);
}

/** Assign a foreman to a site */
export async function apiAdminAssignForeman(
  siteId: string,
  userId: string,
): Promise<{ ok: true; assignment: SiteForemanAssignmentDto }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/foremen`,
    { method: "POST", body: JSON.stringify({ userId }) },
  );
}

/** End a foreman assignment */
export async function apiAdminEndForemanAssignment(
  siteId: string,
  foremanId: string,
): Promise<{ ok: true }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/foremen/${encodeURIComponent(foremanId)}`,
    { method: "DELETE" },
  );
}

// ADMIN: FOREMEN

export type AdminForemanListItemDto = {
  foremanId: string;
  userId: string;
  name: string;
  email: string;
  createdAt: string;
  defaultDayRate?: string | null;
  isAssistant: boolean;
};

export async function apiAdminForemenList(
  query?: {
    q?: string;
  },
  forceRefresh = false,
): Promise<{ ok: true; foremen: AdminForemanListItemDto[] }> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  const qs = params.toString();
  const path = `/api/app/admin/foremen${qs ? `?${qs}` : ""}`;

  const baseKey = buildCacheKey("admin_foremen_list", query?.q);
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached<{ ok: true; foremen: AdminForemanListItemDto[] }>(
    path,
    {
      cacheKey: key,
      ttlMs: TTL.EMPLOYEES_LIST, // reference/personnel list, reuse existing TTL
      forceRefresh,
    },
  );
}

export async function apiAdminCreateAssistant(
  foremanId: string,
  data: {
    employeeId: string;
    assistantName: string;
    assistantEmail: string;
    assistantPassword: string;
  },
): Promise<{
  ok: true;
  assistant: { assistantName: string; assistantEmail: string };
}> {
  return apiFetch(
    `/api/app/admin/foremen/${encodeURIComponent(foremanId)}/assistant`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export type ForemanDayListItemDto = {
  id: string;
  dateISO: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  flags: number;
  readyToSubmit: boolean;
  scannedCount: number;
  site: { id: string; name: string };
};

// -------------------------
// ADMIN: SITE DAY PHOTO REQUESTS
// -------------------------
export async function apiAdminCancelPhotoRequest(requestId: string) {
  return apiFetch(
    `/api/app/admin/photo-requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  ) as Promise<{ ok: true }>;
}

export async function apiSupervisorCancelPhotoRequest(requestId: string) {
  return apiFetch(
    `/api/app/supervisor/photo-requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  ) as Promise<{ ok: true }>;
}

/** Location data for API requests (all fields optional) */
export type LocationPayload = {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export async function apiForemanUploadSiteDayPhoto(input: {
  siteDayId: string;
  file: { uri: string; name: string; type: string };
  requestId?: string; // optional: link to photo request
  location?: LocationPayload | null;
}) {
  const fd = new FormData();
  fd.append("file", {
    uri: input.file.uri,
    name: input.file.name,
    type: input.file.type,
  } as any);

  if (input.requestId) fd.append("requestId", input.requestId);

  // Add location data if available
  if (input.location?.latitude != null) {
    fd.append("latitude", String(input.location.latitude));
  }
  if (input.location?.longitude != null) {
    fd.append("longitude", String(input.location.longitude));
  }
  if (input.location?.address) {
    fd.append("address", input.location.address);
  }

  return apiFetch(
    `/api/app/foreman/site-days/${encodeURIComponent(input.siteDayId)}/photos`,
    { method: "POST", body: fd as any, auth: true },
  ) as Promise<{ ok: true; photo: SiteDayPhotoDto }>;
}

// -------------------------
// FOREMAN/ASSISTANT: UPLOAD SITE DAY PHOTO
// -------------------------

export type AttendanceScanDto = {
  id: string;
  scannedAt: string;
  employee: { id: string; fullName: string; code: string };
};

export async function apiForemanDeleteSiteDayPhoto(photoId: string) {
  return apiFetch(
    `/api/app/foreman/site-day-photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE", auth: true },
  ) as Promise<{ ok: true }>;
}

export type ForemanRecentSiteDayPhotoDto = {
  id: string;
  imageUrl: string;
  dateTakenISO: string;
  uploadedAtISO?: string;
  siteId: string;
  siteName: string;
  verificationStatus?: PhotoVerificationStatus | "PENDING";
  verificationNotes?: string | null;
};

export async function apiForemanRecentSiteDayPhotos() {
  return apiFetch("/api/app/foreman/site-day-photos/recent", {
    auth: true,
  }) as Promise<{ photos: ForemanRecentSiteDayPhotoDto[] }>;
}

// SUPERVISOR: SITE DAY PHOTOS

export type SupervisorSiteDayPhotoDto = {
  id: string;
  imageUrl: string;
  dateTakenISO: string;
  uploadedAtISO?: string;
  siteName: string;
  siteId: string;
  foremanName: string;
  foremanId: string;

  /**
   * GET /api/app/supervisor/site-day-photos includes verification status
   * (so supervisors can approve/reject photos).
   */
  verificationStatus?: PhotoVerificationStatus | "PENDING";
};

export async function apiSupervisorSiteDayPhotos() {
  return apiFetch("/api/app/supervisor/site-day-photos", {
    auth: true,
  }) as Promise<{ photos: SupervisorSiteDayPhotoDto[] }>;
}

export type PhotoRequestStatus =
  | "REQUESTED"
  | "SUBMITTED"
  | "EXPIRED"
  | "CANCELLED";

export type PhotoVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "FLAGGED"
  | "REJECTED";

export type SiteDayPhotoRequestDto = {
  id: string;
  siteDayId: string;
  status: PhotoRequestStatus;
  requestedAt: string;
  dueAt?: string | null;
  note?: string | null;
  requestedBy?: { id: string; name: string } | null;
  photoCount?: number;
};

export type SiteDayPhotoDto = {
  id: string;
  siteDayId: string;
  imageUrl: string;
  uploadedAt: string;
  uploadedBy?: { id: string; name: string } | null;
  requestId?: string | null;
  // Verification workflow
  verification?: {
    status: PhotoVerificationStatus;
    verifiedAt?: string | null;
    notes?: string | null;
  } | null;
};

export async function apiAdminSitePhotoRequests(input: {
  siteId: string;
  dateISO?: string; // optional filter (if backend supports it)
}) {
  const p = new URLSearchParams();
  if (input.dateISO) p.set("dateISO", input.dateISO);

  const qs = p.toString();
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(input.siteId)}/photo-requests${qs ? `?${qs}` : ""}`,
  ) as Promise<{ ok: true; requests: SiteDayPhotoRequestDto[] }>;
}

export type AdminPhotoRequestDetailDto = {
  id: string;
  status: PhotoRequestStatus;
  requestedAt: string;
  dueAt?: string | null;
  note?: string | null;
  siteDay: {
    id: string;
    workDate: string;
    site: {
      id: string;
      name: string;
      code?: string | null;
    };
  };
};

export type AdminPhotoRequestPhotosResponse = {
  ok: true;
  request: AdminPhotoRequestDetailDto;
  photos: SiteDayPhotoDto[];
};

export async function apiAdminPhotoRequestPhotos(requestId: string) {
  return apiFetch(
    `/api/app/admin/photo-requests/${encodeURIComponent(requestId)}/photos`,
  ) as Promise<AdminPhotoRequestPhotosResponse>;
}

export type AttendanceDayDto = {
  id: string;
  dateISO: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  flags: number;
  site: { id: string; name: string };
  scans: AttendanceScanDto[];
};

export type BulkScanItem = {
  qrCodeValue: string;
  scannedAtISO?: string;
};

export type TimesheetDetailDto = {
  id: string;
  startISO: string;
  endISO: string;

  sitesLabel: string;

  foremanName?: string;
  foremanCode?: string;

  foreman?: { id: string; name: string; employeeId?: string | null };
  supervisor?: { id: string; name: string };

  sites?: Array<{ id: string; code?: string | null; name: string }>;

  status: "DRAFT" | "SUBMITTED" | "ACCEPTED" | "APPROVED" | "REJECTED" | "PAID";
  submittedAt?: string | null;

  /** Day acceptance records for daily acceptance workflow */
  dayAcceptances?: DayAcceptance[];

  columns: { iso: string; day: string }[];
  rows: {
    employeeId: string;
    fullName: string;
    dayRate: number;
    present: boolean[];
    daysWorked: number;
    pay: number;
    /** Computed server-side via employeeId match; prefer this over name matching. */
    isForeman?: boolean;
  }[];

  totals?: { totalDays: number; totalPay: number };
};

export async function apiBulkScan(input: {
  siteId: string;
  workDateISO: string;
  scans: BulkScanItem[];
}) {
  return apiFetch("/api/attendance/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type Site = {
  id: string;
  name: string;
  jobNumber?: string | null;
  active: boolean;
};

export type TimesheetStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ACCEPTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

/**
 * Day acceptance record for daily acceptance workflow.
 * Supervisors can accept/reject individual days during the fortnight.
 */
export type DayAcceptance = {
  id: string;
  workDate: string; // ISO date string (YYYY-MM-DD)
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  acceptedAt?: string | null;
  acceptedBySupervisorId?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
};

export type TimesheetListRowDto = {
  id: string;
  startISO: string;
  endISO: string;
  isCurrent: boolean;
  daysCount: number;
  totalScans: number;
  readyDays: number;
  flaggedDays: number;

  foremanName?: string;
  foremanId?: string;
  foreman?: { id: string; name: string };
  /** Optional sites array used by new admin/supervisor list APIs */
  sites?: Array<{ id: string; code?: string | null; name: string }>;
  /**
   * Per-site timesheet rows
   * - id: YYYY-MM-DD_YYYY-MM-DD__foreman-id (timesheet identifier)
   * - siteId: the specific site for this row
   */
  siteId?: string;
  siteCode?: string | null;
  siteName?: string;

  /**
   * Per-site totals for this (foreman, site) row
   */
  totalWorkerDays?: number;
  totalWorkerWages?: number;

  /**
   * Unique row key to avoid duplicate React keys when the same
   * timesheet id appears multiple times (one per site).
   */
  rowKey?: string | null;

  status?: TimesheetStatus;

  /**
   * For foreman mobile list: who effectively created/scanned this timesheet
   * for the site/period. Backend populates as:
   * - "You" when the foreman scanned
   * - Assistant full name when only assistant scans exist
   */
  createdByLabel?: string;
};

export type ApiUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
  // For assistant foremen: which foreman they are currently acting for
  actingForeman?: {
    foremanId: string;
    name: string;
    photoUrl?: string | null;
  } | null;
  // For assistant foremen: list of foremen they can act for
  availableForemen?: Array<{
    foremanId: string;
    name: string;
    photoUrl?: string | null;
  }>;
};

export type AppSettingsDto = {
  scanOutFaceEnabled: boolean;
  scanOutPhotoEnabled: boolean;
};

export type ApiMeResponse = {
  user: ApiUser;
  sites: Site[];
  // Admin-controlled feature flags. Older cached responses (pre-dating this
  // field) won't have it, so callers should fall back to both enabled.
  appSettings?: AppSettingsDto;
};

export async function apiMe(): Promise<ApiMeResponse> {
  return apiFetch("/api/app/me");
}

export async function apiRegisterPushToken(input: {
  token: string;
  platform: "ios" | "android" | "web";
}) {
  return apiFetch("/api/app/push-tokens", {
    method: "POST",
    auth: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<{ ok: true }>;
}

/**
 * Reference data: foreman's assigned sites. Delegates to apiSitesCached
 * (defined below) so both names share one cache-first implementation
 * instead of duplicating the TTL/scoping logic.
 */
export async function apiSites(): Promise<{ sites: Site[] }> {
  return apiSitesCached();
}

export async function apiAttendanceToday(
  siteId: string,
): Promise<{ day: AttendanceDayDto }> {
  const q = encodeURIComponent(siteId);
  return apiFetch(`/api/app/attendance/today?siteId=${q}`);
}

export async function apiScan(
  siteId: string,
  employeeCode: string,
  location?: LocationPayload | null,
) {
  return apiFetch("/api/app/attendance/scan", {
    method: "POST",
    body: JSON.stringify({
      siteId,
      employeeCode,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      address: location?.address ?? null,
    }),
  });
}

export async function apiScanBulk(
  siteId: string,
  workDateISO: string,
  qrCodeValues: string[],
  location?: LocationPayload | null,
) {
  return apiFetch("/api/app/attendance/bulk", {
    method: "POST",
    body: JSON.stringify({
      siteId,
      workDateISO,
      scans: qrCodeValues.map((qrCodeValue) => ({ qrCodeValue })),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      address: location?.address ?? null,
    }),
  });
}

/**
 * SUPERVISOR: Scan a single employee card for a selected site + foreman + workDateISO
 */
export async function apiSupervisorScan(input: {
  siteId: string;
  foremanId: string;
  employeeCode: string;
  workDateISO: string; // YYYY-MM-DD (UTC)
  location?: LocationPayload | null;
  supervisorAuthConfirmed?: boolean;
  supervisorAuthDevice?: string;
}) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(input.siteId)}/scan`,
    {
      method: "POST",
      body: JSON.stringify({
        foremanId: input.foremanId,
        employeeCode: input.employeeCode,
        workDateISO: input.workDateISO,
        latitude: input.location?.latitude ?? null,
        longitude: input.location?.longitude ?? null,
        address: input.location?.address ?? null,
        supervisorAuthConfirmed: input.supervisorAuthConfirmed,
        supervisorAuthDevice: input.supervisorAuthDevice,
      }),
    },
  );
}

/**
 * SUPERVISOR: Scan many employee cards for a selected site + foreman + workDateISO
 */
export async function apiSupervisorScanBulk(input: {
  siteId: string;
  foremanId: string;
  workDateISO: string; // YYYY-MM-DD (UTC)
  employeeCodes: string[]; // employee qr payloads/codes
  location?: LocationPayload | null;
  supervisorAuthConfirmed?: boolean;
  supervisorAuthDevice?: string;
}) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(input.siteId)}/scan-bulk`,
    {
      method: "POST",
      body: JSON.stringify({
        foremanId: input.foremanId,
        workDateISO: input.workDateISO,
        employeeCodes: input.employeeCodes,
        latitude: input.location?.latitude ?? null,
        longitude: input.location?.longitude ?? null,
        address: input.location?.address ?? null,
        supervisorAuthConfirmed: input.supervisorAuthConfirmed,
        supervisorAuthDevice: input.supervisorAuthDevice,
      }),
    },
  );
}

export async function apiDeleteScan(scanId: string) {
  return apiFetch(`/api/app/attendance/scan/${encodeURIComponent(scanId)}`, {
    method: "DELETE",
  });
}

/**
 * Scan out all employees for a given site day.
 * Used after the foreman takes the end-of-day site photo.
 */
export async function apiScanOutAll(input: {
  siteDayId: string;
  photoId?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}): Promise<{
  ok: boolean;
  scannedOutCount: number;
  scannedOutAt?: string;
  message: string;
}> {
  return apiFetch("/api/app/attendance/scan-out-all", {
    method: "POST",
    body: JSON.stringify(input),
    auth: true,
  }) as any;
}

/**
 * Transfer an employee from one site to another (supervisor/admin only).
 * The employee's scan at the source is removed, and a new scan is created at the destination.
 */
export async function apiTransferEmployee(input: {
  employeeId: string;
  fromSiteId: string;
  toSiteId: string;
  toForemanId: string;
  workDateISO: string;
  reason?: string;
}): Promise<{
  ok: boolean;
  transfer: {
    employeeId: string;
    employeeName: string;
    fromSiteId: string;
    fromSiteName: string;
    toSiteId: string;
    toSiteName: string;
    newScanId: string;
    transferredAt: string;
    reason: string | null;
  };
  message: string;
}> {
  return apiFetch("/api/app/supervisor/transfer-employee", {
    method: "POST",
    body: JSON.stringify(input),
    auth: true,
  }) as any;
}

export async function apiForemanDays() {
  return apiFetch("/api/app/foreman/days");
}

export async function apiForemanDay(siteId: string, dateISO: string) {
  const qSite = encodeURIComponent(siteId);
  const qDate = encodeURIComponent(dateISO);
  return apiFetch(`/api/app/foreman/day?siteId=${qSite}&dateISO=${qDate}`);
}

export type ScanOutPendingEmployee = {
  id: string;
  fullName: string;
  faceImageUrl: string | null;
  scannedInAtISO: string;
  /** Which site this scan-in was at — only meaningful when siteId is omitted (see below) and the pool spans several sites. */
  siteName?: string | null;
};

/**
 * Employees scanned in today who haven't been scanned out yet, plus a
 * total-scanned-in count for the scanner's session counter.
 *
 * siteId is optional: a real foreman scanning out from one site passes it
 * as before. An assistant acting on a foreman's behalf has no site to pick
 * ahead of time, so omitting it spans every site that foreman is currently
 * assigned to (see the matching comment on apiScanOutIdentify).
 */
export async function apiForemanScanOutPending(
  siteId: string | null,
  dateISO: string,
): Promise<{ employees: ScanOutPendingEmployee[]; totalScannedInToday: number }> {
  const qDate = encodeURIComponent(dateISO);
  const qSite = siteId ? `&siteId=${encodeURIComponent(siteId)}` : "";
  return apiFetch(
    `/api/app/foreman/day/scan-out-pending?dateISO=${qDate}${qSite}`,
  ) as Promise<{ employees: ScanOutPendingEmployee[]; totalScannedInToday: number }>;
}

export type ForemanScanOutDto = {
  id: string;
  employeeName: string;
  faceImageUrl: string | null;
  siteId: string;
  siteName: string;
  scannedOutAtISO: string;
  method: "PHOTO" | "FINGERPRINT" | "FACE" | null;
  confidence: number | null;
  verificationStatus: "VERIFIED" | "PENDING_REVIEW" | "REJECTED" | null;
};

/** Last 7 days of scan-out events across every site this foreman worked. */
export async function apiForemanRecentScanOuts(): Promise<{
  scanOuts: ForemanScanOutDto[];
}> {
  return apiFetch("/api/app/foreman/scan-outs/recent", {
    auth: true,
  }) as Promise<{ scanOuts: ForemanScanOutDto[] }>;
}

export type SupervisorScanOutDto = ForemanScanOutDto;

/**
 * Last 7 days of scan-out events across every site this supervisor is
 * assigned to, filtered to a single scan-out method.
 */
export async function apiSupervisorRecentScanOuts(
  method: "PHOTO" | "FINGERPRINT" | "FACE",
): Promise<{ scanOuts: SupervisorScanOutDto[] }> {
  return apiFetch(
    `/api/app/supervisor/scan-outs/recent?method=${encodeURIComponent(method)}`,
    { auth: true },
  ) as Promise<{ scanOuts: SupervisorScanOutDto[] }>;
}

// ─── SUPERVISOR CONTINUOUS FACE SCAN-OUT ────────────────────────────────────
//
// Same "here's a face, tell me who this is" flow as the foreman scanner
// below, but a supervisor oversees several sites/foremen at once: there is
// no siteId to pass in, the candidate pool spans every site the supervisor
// is assigned to, and a match reports back which site/foreman it was
// auto-detected against.

export type SupervisorScanOutPendingEmployee = {
  id: string;
  fullName: string;
  faceImageUrl: string | null;
  scannedInAtISO: string;
};

export async function apiSupervisorScanOutPending(
  dateISO: string,
): Promise<{ employees: SupervisorScanOutPendingEmployee[]; totalScannedInToday: number }> {
  return apiFetch(
    `/api/app/supervisor/scan-out-pending?dateISO=${encodeURIComponent(dateISO)}`,
    { auth: true },
  ) as Promise<{ employees: SupervisorScanOutPendingEmployee[]; totalScannedInToday: number }>;
}

type ScanOutSiteForemanInfo = {
  site: { id: string; name: string };
  foreman: { id: string; name: string } | null;
};

export type SupervisorScanOutIdentifyResult =
  | ({
      ok: true;
      recorded: true;
      employee: { id: string; fullName: string };
      method: "FACE";
      confidence: number;
      verificationStatus: "VERIFIED";
      scannedOutAt: string;
    } & ScanOutSiteForemanInfo)
  | ({
      ok: true;
      recorded: false;
      needsConfirmation: true;
      employee: { id: string; fullName: string };
      method: "FACE";
      confidence: number;
      matchedEnrollmentId: string;
    } & ScanOutSiteForemanInfo)
  | {
      ok: false;
      error: "no_candidates" | "no_face_detected" | "multiple_faces_detected" | "low_quality" | "no_match" | "service_unavailable";
      warnings?: string[];
    };

export async function apiSupervisorScanOutIdentify(input: {
  dateISO: string;
  device: string;
  image: string;
  checkLiveness?: boolean;
}): Promise<SupervisorScanOutIdentifyResult> {
  return apiFetch("/api/app/supervisor/scan-out-identify", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    auth: true,
  }) as Promise<SupervisorScanOutIdentifyResult>;
}

export async function apiSupervisorScanOutConfirm(input: {
  siteId: string;
  dateISO: string;
  employeeId: string;
  device: string;
  confidence: number;
  matchedEnrollmentId?: string;
}): Promise<ScanOutConfirmResult> {
  return apiFetch("/api/app/supervisor/scan-out-confirm", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    auth: true,
  }) as Promise<ScanOutConfirmResult>;
}

// ─── CONTINUOUS FACE SCAN-OUT ───────────────────────────────────────────────
//
// "Here's a face, tell me who this is" instead of "verify this specific
// employee" — the continuous-scanner counterpart to apiScanOutFace, which
// stays in place for the per-worker manual "Verify" screen. See
// FCP's scan-out-identify/route.ts for the matching/margin/auto-record
// logic; this client is a thin pass-through.

export type ScanOutIdentifyResult =
  | {
      ok: true;
      recorded: true;
      employee: { id: string; fullName: string };
      method: "FACE";
      confidence: number;
      verificationStatus: "VERIFIED";
      scannedOutAt: string;
      /** Which site this scan-out was recorded against — always the site passed in, or the auto-detected one when siteId was omitted. */
      site: { id: string; name: string };
    }
  | {
      ok: true;
      recorded: false;
      needsConfirmation: true;
      employee: { id: string; fullName: string };
      method: "FACE";
      confidence: number;
      matchedEnrollmentId: string;
      site: { id: string; name: string };
    }
  | {
      ok: false;
      error: "no_candidates" | "no_face_detected" | "multiple_faces_detected" | "low_quality" | "no_match" | "service_unavailable";
      warnings?: string[];
    };

export async function apiScanOutIdentify(input: {
  /** Omit when there's no site to pick ahead of time (e.g. an assistant acting on a foreman's behalf) — the candidate pool then spans every site that foreman is currently assigned to, and the match reports back which one it found. */
  siteId?: string;
  dateISO: string;
  device: string;
  image: string;
  checkLiveness?: boolean;
}): Promise<ScanOutIdentifyResult> {
  return apiFetch("/api/app/attendance/scan-out-identify", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    auth: true,
  }) as Promise<ScanOutIdentifyResult>;
}

export type ScanOutConfirmResult =
  | { ok: true; recorded: true; scannedOutAt: string }
  | { ok: true; recorded: false; alreadyClockedOut: true }
  | { ok: false; error: string };

export async function apiScanOutConfirm(input: {
  siteId: string;
  dateISO: string;
  employeeId: string;
  device: string;
  confidence: number;
  matchedEnrollmentId?: string;
}): Promise<ScanOutConfirmResult> {
  return apiFetch("/api/app/attendance/scan-out-confirm", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    auth: true,
  }) as Promise<ScanOutConfirmResult>;
}

/**
 * Ensure a SiteDay exists for the given site and date.
 * Creates one if it doesn't exist, returns the existing one if it does.
 */
export async function apiEnsureSiteDay(
  siteId: string,
  dateISO: string,
): Promise<{ siteDayId: string }> {
  return apiFetch("/api/app/foreman/day/ensure", {
    method: "POST",
    body: JSON.stringify({ siteId, dateISO }),
  }) as Promise<{ siteDayId: string }>;
}

export async function apiForemanDayNote(
  siteId: string,
  dateISO: string,
  payload: { reason?: string; note?: string },
) {
  return apiFetch("/api/app/foreman/day/note", {
    method: "POST",
    body: JSON.stringify({ siteId, dateISO, ...payload }),
  });
}

export async function apiForemanDayReady(
  siteId: string,
  dateISO: string,
  readyToSubmit: boolean,
) {
  return apiFetch("/api/app/foreman/day/ready", {
    method: "POST",
    body: JSON.stringify({ siteId, dateISO, readyToSubmit }),
  });
}

export async function apiForemanDeleteScan(scanId: string) {
  return apiFetch(`/api/app/attendance/scan/${encodeURIComponent(scanId)}`, {
    method: "DELETE",
  });
}

export async function apiForemanSubmitTimesheet(id: string) {
  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(id)}/submit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function apiSupervisorTimesheets(query?: {
  q?: string;
  status?: "ALL" | TimesheetStatus;
  period?: string; // YYYY-MM-DD_YYYY-MM-DD (optional, defaults to current fortnight on server)
  limit?: number;
}): Promise<{ timesheets: TimesheetListRowDto[] }> {
  const params = new URLSearchParams();
  if (query?.q) params.append("q", query.q);
  if (query?.status) params.append("status", query.status);
  if (query?.period) params.append("period", query.period);
  if (query?.limit != null) params.append("limit", String(query.limit));

  const qs = params.toString();
  return apiFetch(`/api/app/supervisor/timesheets${qs ? "?" + qs : ""}`);
}

export async function apiSupervisorTimesheetDetail(
  id: string,
  siteId?: string,
) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();
  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
  );
}

export async function apiSupervisorApproveTimesheet(
  id: string,
  siteId?: string,
) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();
  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(id)}/approve${qs ? `?${qs}` : ""}`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function apiSupervisorRejectTimesheet(
  id: string,
  reason: string,
  siteId?: string,
) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();
  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(id)}/reject${qs ? `?${qs}` : ""}`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function apiSupervisorMarkPaid(id: string, siteId?: string) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();
  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(id)}/paid${qs ? `?${qs}` : ""}`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/**
 * Accept or reject a specific day of a timesheet during the fortnight period.
 * Only available before the last day of the fortnight.
 */
export async function apiSupervisorAcceptDay(
  timesheetId: string,
  date: string,
  action: "accept" | "reject",
  reason?: string,
  siteId?: string,
): Promise<{
  message: string;
  dayAcceptance: DayAcceptance;
  timesheetStatus: TimesheetStatus;
}> {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();

  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(timesheetId)}/accept-day${qs ? `?${qs}` : ""}`,
    {
      method: "POST",
      body: JSON.stringify({ date, action, reason }),
    },
  );
}

/**
 * Get all day acceptance records for a timesheet.
 */
export async function apiSupervisorGetDayAcceptances(
  timesheetId: string,
  siteId?: string,
): Promise<{
  timesheetId: string;
  timesheetStatus: TimesheetStatus;
  dayAcceptances: DayAcceptance[];
}> {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();

  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(timesheetId)}/day-acceptances${qs ? `?${qs}` : ""}`,
  );
}

// -------------------------
// ADMIN: TIMESHEETS (JWT Bearer)
// -------------------------

export type AdminTimesheetsPeriodDto = {
  id: string;
  startISO: string;
  endISO: string;
};

export async function apiAdminTimesheets(query?: {
  q?: string;
  status?: "ALL" | TimesheetStatus;
  period?: string; // YYYY-MM-DD_YYYY-MM-DD (optional)
  supervisorId?: string;
  limit?: number;
}): Promise<{
  timesheets: TimesheetListRowDto[];
  period?: AdminTimesheetsPeriodDto;
}> {
  const params = new URLSearchParams();
  if (query?.q) params.append("q", query.q);
  if (query?.status && query.status !== "ALL")
    params.append("status", query.status);
  if (query?.period) params.append("period", query.period);
  if (query?.supervisorId) params.append("supervisorId", query.supervisorId);
  if (query?.limit != null) params.append("limit", String(query.limit));

  const qs = params.toString();
  return apiFetch(`/api/app/admin/timesheets${qs ? "?" + qs : ""}`, {
    auth: true,
  });
}

export async function apiAdminTimesheetDetail(id: string, siteId?: string) {
  const params = new URLSearchParams();
  if (siteId) params.append("siteId", siteId);

  const qs = params.toString();
  return apiFetch(
    `/api/app/admin/timesheets/${encodeURIComponent(id)}${qs ? "?" + qs : ""}`,
    {
      auth: true,
    },
  );
}

export async function apiAdminApproveTimesheet(id: string) {
  return apiFetch(
    `/api/app/admin/timesheets/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({}), auth: true },
  );
}

export async function apiAdminRejectTimesheet(id: string, reason: string) {
  return apiFetch(
    `/api/app/admin/timesheets/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }), auth: true },
  );
}

export async function apiAdminMarkPaid(id: string) {
  return apiFetch(`/api/app/admin/timesheets/${encodeURIComponent(id)}/paid`, {
    method: "POST",
    body: JSON.stringify({}),
    auth: true,
  });
}

/**
 * Path for downloading a timesheet PDF as an admin.
 *
 * There is no dedicated `/api/app/admin/timesheets/:id/pdf` route, but the
 * supervisor PDF route (`/api/app/supervisor/timesheets/:id/pdf`) already
 * accepts the ADMIN role and parses the same composite id
 * (`startISO_endISO_foremanId_siteId`) that `apiAdminTimesheets` produces, so
 * this reuses it instead of adding a second PDF generator. Callers still need
 * to build the full URL (getApiBase() + this path) and pass the bearer token
 * themselves via File.downloadFileAsync, same as the foreman PDF flow.
 */
export function adminTimesheetPdfPath(id: string, siteId?: string): string {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();
  return `/api/app/supervisor/timesheets/${encodeURIComponent(id)}/pdf${qs ? `?${qs}` : ""}`;
}

export type CreateEmployeeInput = {
  firstName: string;
  lastName: string;
  phone?: string;
  dayRate?: number;
  active?: boolean;
  code?: string;
};

/**
 * ✅ This DTO now matches your SINGLE employee endpoint response.
 * It includes firstName/lastName/fullName and NO phone by default.
 */
export type EmployeeDto = {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  dayRate: number;
  active: boolean;
  fullName: string;
  faceImageUrl?: string | null;
  phone?: string | null; // kept optional (client-only / future)
};

export async function apiForemanCreateEmployee(input: CreateEmployeeInput) {
  const result = (await apiFetch("/api/app/foreman/employees", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    auth: true,
  })) as { employee: { id: string } & Partial<EmployeeDto> };
  // Invalidate apiForemanEmployees' cache so the worker list shows the new
  // employee on next load instead of a stale list.
  await cacheRemove(await cacheKeyScope("foreman_employees_list"));
  return result;
}

/** ✅ Update an existing employee */
export async function apiForemanUpdateEmployee(
  employeeId: string,
  input: CreateEmployeeInput,
) {
  const result = (await apiFetch(
    `/api/app/foreman/employees/${encodeURIComponent(employeeId)}`,
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      auth: true,
    },
  )) as { employee: { id: string } & Partial<EmployeeDto> };
  await cacheRemove(await cacheKeyScope("foreman_employees_list"));
  return result;
}

export async function apiForemanUploadEmployeePhoto(
  employeeId: string,
  file: { uri: string; name: string; type: string },
) {
  const fd = new FormData();
  fd.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as any);

  const result = await apiFetch(
    `/api/app/foreman/employees/${encodeURIComponent(employeeId)}/photo`,
    { method: "POST", body: fd as any, auth: true },
  );
  // faceImageUrl shown in the worker list changes after a photo upload.
  await cacheRemove(await cacheKeyScope("foreman_employees_list"));
  return result;
}

export async function apiForemanEmployees(forceRefresh = false): Promise<{
  employees: Array<{
    id: string;
    code: string;
    fullName: string;
    dayRate: number;
    active: boolean;
    faceImageUrl?: string | null;
  }>;
}> {
  const key = await cacheKeyScope("foreman_employees_list");
  return apiFetchCached("/api/app/foreman/employees", {
    cacheKey: key,
    ttlMs: TTL.EMPLOYEES_LIST,
    forceRefresh,
  });
}

/** ✅ FIX: single employee response includes { ok: true, employee: ... } */
export async function apiForemanEmployee(employeeId: string): Promise<{
  ok: true;
  employee: EmployeeDto;
}> {
  return apiFetch(
    `/api/app/foreman/employees/${encodeURIComponent(employeeId)}`,
  );
}

// -------------------------
// SUPERVISOR: SITES
// -------------------------
export type ForemanDayDetailDto = {
  id: string;
  dateISO: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  flags: number;
  readyToSubmit: boolean;
  foremanFlagReason: string | null;
  foremanNote: string | null;
  site: { id: string; name: string };
  scans: Array<{
    id: string;
    scannedAt: string;
    employee: { id: string; code: string; fullName: string };
  }>;

  // ✅ ADD: site-day photo workflow
  photoRequests?: SiteDayPhotoRequestDto[];
  photos?: SiteDayPhotoDto[];
};

// -------------------------
// SITE DAY PHOTOS (shared DTOs)
// -------------------------

export type SupervisorTodayAttendanceDto = {
  siteId: string;
  dateISO: string;
  scannedCount: number;
  readyToSubmit: boolean;
  isLocked: boolean;
  foremenOnSite: Array<{ foremanId: string; name: string }>;
};

export async function apiAdminRequestPhoto(input: {
  siteId: string;
  dateISO: string; // work date (required)
  note?: string;
  dueAtISO?: string; // optional
}) {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(input.siteId)}/photo-requests`,
    {
      method: "POST",
      body: JSON.stringify({
        // Backend requires workDate (YYYY-MM-DD); also send dateISO for clarity
        workDate: input.dateISO,
        dateISO: input.dateISO,
        note: input.note ?? "",
        dueAtISO: input.dueAtISO,
      }),
    },
  ) as Promise<{
    ok: true;
    created: number; // number of requests created
    requestIds?: string[]; // optional if backend returns them
  }>;
}

export type SupervisorSitePhotoRequestDto = {
  id: string;
  siteDayId: string;
  status: PhotoRequestStatus;
  requestedAt: string;
  dueAt?: string | null;
  note?: string | null;
  requestedBy?: { id: string; name: string } | null;
  photoCount: number;
};

export type SupervisorSiteListItemDto = {
  id: string;
  name: string;
  code?: string | null;
  location?: string | null;
  isActive: boolean;
  foremenCount: number;
  totalWages?: number | null;
};

export type SupervisorSiteDetailDto = {
  site: {
    id: string;
    name: string;
    code?: string | null;
    location?: string | null;
    isActive: boolean;
    manualAttendanceRequiresSupervisorFingerprint?: boolean;
  };
  assignedForemen: Array<{
    foremanId: string; // Foreman.id
    userId: string; // User.id (foreman user)
    name: string;
    email?: string | null;
    startsOn: string;
    endsOn?: string | null;
  }>;
  availableForemen: Array<{
    foremanId: string; // Foreman.id
    userId: string; // User.id
    name: string;
    email?: string | null;
  }>;
};

export type ForemanOptionDto = {
  foremanId: string;
  userId: string;
  name: string;
  email?: string | null;
};

/**
 * Cache-first, reference data (foreman roster for supervisor pickers). Not
 * invalidated on mutation here: a new foreman is created from the admin
 * Users screen (apiAdminCreateForeman), on a different device/session than
 * the supervisor viewing this list, so a local cacheRemove on this device
 * can't reach that other device's cache. Falls back to TTL expiry
 * (TTL.EMPLOYEES_LIST) — see caching audit Priority 1 notes.
 */
export async function apiSupervisorAllForemen(forceRefresh = false): Promise<{
  ok: true;
  foremen: ForemanOptionDto[];
}> {
  const key = await cacheKeyScope("supervisor_all_foremen");
  return apiFetchCached<{ ok: true; foremen: ForemanOptionDto[] }>(
    "/api/app/foreman",
    {
      cacheKey: key,
      ttlMs: TTL.EMPLOYEES_LIST,
      forceRefresh,
    },
  );
}

export async function apiSupervisorSites(query?: {
  q?: string;
  show?: "active" | "all";
  /** When set, only sites with at least one attendance scan on this work date are returned. */
  dateISO?: string;
}): Promise<{ ok: true; sites: SupervisorSiteListItemDto[] }> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.show) params.set("show", query.show);
  if (query?.dateISO) params.set("dateISO", query.dateISO);
  const qs = params.toString();
  return apiFetch(`/api/app/supervisor/sites${qs ? `?${qs}` : ""}`);
}

export async function apiSupervisorSiteDetail(
  siteId: string,
): Promise<SupervisorSiteDetailDto> {
  return apiFetch(`/api/app/supervisor/sites/${encodeURIComponent(siteId)}`);
}

export async function apiSupervisorAssignForemanToSite(input: {
  siteId: string;
  foremanId: string; // ✅ Foreman.id
}) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(input.siteId)}/assign-foreman`,
    {
      method: "POST",
      body: JSON.stringify({ foremanId: input.foremanId }),
    },
  );
}

export async function apiSupervisorEndForemanAssignment(input: {
  siteId: string;
  foremanId: string; // Foreman.id
}) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(input.siteId)}/end-foreman`,
    { method: "POST", body: JSON.stringify({ foremanId: input.foremanId }) },
  );
}

export async function apiSupervisorSiteToday(siteId: string, dateISO?: string) {
  const params = new URLSearchParams();
  if (dateISO) params.set("dateISO", dateISO);
  const qs = params.toString();
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(siteId)}/today${qs ? `?${qs}` : ""}`,
  ) as Promise<{ ok: true; data: SupervisorTodayAttendanceDto }>;
}

/**
 * Get today's scans for a site (supervisor view).
 * Shows individual employees scanned in/out with transfer status.
 */
export type SiteScanTodayDto = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeePhotoUrl: string | null;
  scannedAt: string;
  scannedOutAt: string | null;
  isScannedOut: boolean;
  direction: "IN" | "OUT";
  dayRate: string;
  scanType: string;
  isTransferred: boolean;
  transferredFromSiteId: string | null;
  transferredAt: string | null;
};

export type SiteForemanDto = {
  id: string;
  name: string;
};

export async function apiSupervisorSiteScansToday(
  siteId: string,
  dateISO?: string,
): Promise<{
  ok: boolean;
  dateISO: string;
  siteId: string;
  scans: SiteScanTodayDto[];
  foremen: SiteForemanDto[];
  totalScans: number;
  scannedInCount: number;
  scannedOutCount: number;
}> {
  const params = new URLSearchParams();
  if (dateISO) params.set("dateISO", dateISO);
  const qs = params.toString();
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(siteId)}/scans-today${qs ? `?${qs}` : ""}`,
  ) as any;
}

export async function apiSupervisorSitePhotoRequests(siteId: string) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(siteId)}/photo-requests`,
  ) as Promise<{ ok: true; requests: SupervisorSitePhotoRequestDto[] }>;
}

export async function apiSupervisorRequestPhoto(input: {
  siteId: string;
  note?: string;
  dueAtISO?: string; // optional
}) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(input.siteId)}/photo-requests`,
    {
      method: "POST",
      body: JSON.stringify({
        note: input.note ?? "",
        dueAtISO: input.dueAtISO,
      }),
    },
  ) as Promise<{ ok: true; requestId: string }>;
}

export type SupervisorSiteWageTotalsDto = {
  ok: true;
  totals: {
    totalWages: number;
    totalWorkerDays: number;
    averageDayRate?: number | null;
  };
};

export async function apiSupervisorSiteWageTotals(input: {
  siteId: string;
  from: string;
  to: string;
}) {
  const p = new URLSearchParams({ from: input.from, to: input.to });
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(input.siteId)}/wage-totals?${p.toString()}`,
  ) as Promise<SupervisorSiteWageTotalsDto>;
}

export type SupervisorSiteTotalsDataDto = {
  siteId: string;
  startISO: string;
  endISO: string;
  totals: {
    totalWages: number;
    totalDays: number;
  };
};

export type SupervisorSiteTotalsDto = {
  ok: boolean;
  data: SupervisorSiteTotalsDataDto;
};

export async function apiSupervisorSiteTotals(siteId: string) {
  return apiFetch(
    `/api/app/supervisor/sites/${encodeURIComponent(siteId)}/wage-totals`,
  ) as Promise<SupervisorSiteTotalsDto>;
}

/**
 * Mobile supervisor detail view.
 *
 * Uses the main supervisor timesheet endpoint with optional per-site filtering:
 *   GET /api/app/supervisor/timesheets/{id}?siteId={siteId}
 */
export async function apiSupervisorTimesheetDetailMobile(
  id: string,
  siteId?: string,
) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();

  return apiFetch(
    `/api/app/supervisor/timesheets/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
  );
}

export async function apiForemanTimesheetsMobile() {
  return apiFetch("/api/app/foreman/timesheets-mobile", { auth: true });
}

/**
 * Mobile foreman detail view.
 *
 * Mirrors supervisor behavior by supporting optional per-site filtering:
 *   GET /api/app/foreman/timesheets-mobile/{id}?siteId={siteId}
 */
export async function apiForemanTimesheetDetailMobile(
  id: string,
  siteId?: string,
) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();

  return apiFetch(
    `/api/app/foreman/timesheets-mobile/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
}

// ✅ IMPORTANT: Foreman mobile must use /timesheets-mobile endpoints (JWT auth)
export async function apiForemanTimesheets(): Promise<{
  timesheets: TimesheetListRowDto[];
}> {
  return apiFetch("/api/app/foreman/timesheets-mobile", { auth: true });
}

// ✅ IMPORTANT: Foreman mobile must use /timesheets-mobile/[id] endpoint (JWT auth)
export async function apiForemanTimesheetDetail(id: string) {
  return apiFetch(
    `/api/app/foreman/timesheets-mobile/${encodeURIComponent(id)}`,
    { auth: true },
  );
}

/**
 * Foreman's timesheet rows for one fortnight (one row per site worked that
 * period, all sharing the same composite `id`) — omit periodId for the
 * current fortnight. Used to resolve the timesheet id to download as a PDF
 * without the client having to construct the id itself.
 */
export async function apiForemanTimesheetsForPeriod(
  periodId?: string,
): Promise<{
  timesheets: TimesheetListRowDto[];
  period?: { id: string; startISO: string; endISO: string };
}> {
  const qs = periodId ? `?period=${encodeURIComponent(periodId)}` : "";
  return apiFetch(`/api/app/foreman/timesheets-mobile${qs}`, { auth: true });
}

// -------------------------
// ADMIN: TIMESHEET YEAR ANCHOR + GENERATION
// -------------------------

export type AdminYearAnchorDto = {
  ok: true;
  year: number;
  anchorISO: string | null; // null if not set yet
};

export async function apiAdminGetYearAnchor(year: number) {
  return apiFetch(
    `/api/app/admin/timesheets/year-anchor?year=${encodeURIComponent(String(year))}`,
    { auth: true },
  ) as Promise<AdminYearAnchorDto>;
}

// -------------------------
// ADMIN: SETTINGS (JWT Bearer)
// -------------------------

export type AdminCompanySettingsDto = {
  ok: true;
  settings: {
    id: string;
    defaultEmployeeDayRate: string; // backend returns string
    updatedAt: string;
  };
};

export async function apiAdminGetCompanySettings() {
  return apiFetch("/api/app/admin/settings", {
    auth: true,
  }) as Promise<AdminCompanySettingsDto>;
}

// =========================================
// CACHED API FUNCTIONS (Cache-First)
// =========================================
// These functions use cache-first strategy:
// - Return cached data immediately if available
// - Refresh in background if stale
// - Only block on network if no cache exists

/**
 * Cached: Get current user profile
 */
export async function apiMeCached(
  forceRefresh = false,
): Promise<ApiMeResponse> {
  const key = await cacheKeyScope("me_profile");
  return apiFetchCached<ApiMeResponse>("/api/app/me", {
    cacheKey: key,
    ttlMs: TTL.PROFILE,
    forceRefresh,
  });
}

/**
 * Cached: Get sites list
 */
export async function apiSitesCached(
  forceRefresh = false,
): Promise<{ sites: Site[] }> {
  const key = await cacheKeyScope("sites_list");
  return apiFetchCached<{ sites: Site[] }>("/api/app/sites", {
    cacheKey: key,
    ttlMs: TTL.SITES_LIST,
    forceRefresh,
  });
}

/**
 * Cached: Get foreman days list
 */
export async function apiForemanDaysCached(forceRefresh = false) {
  const key = await cacheKeyScope("foreman_days");
  return apiFetchCached("/api/app/foreman/days", {
    cacheKey: key,
    ttlMs: TTL.FOREMAN_DAYS,
    forceRefresh,
  });
}

/**
 * Cached: Get foreman day detail
 */
export async function apiForemanDayCached(
  siteId: string,
  dateISO: string,
  forceRefresh = false,
) {
  const qSite = encodeURIComponent(siteId);
  const qDate = encodeURIComponent(dateISO);
  const baseKey = buildCacheKey("foreman_day", siteId, dateISO);
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached(
    `/api/app/foreman/day?siteId=${qSite}&dateISO=${qDate}`,
    {
      cacheKey: key,
      ttlMs: TTL.TIMESHEET_DETAIL,
      forceRefresh,
    },
  );
}

/**
 * Cached: Get attendance for today
 */
export async function apiAttendanceTodayCached(
  siteId: string,
  forceRefresh = false,
): Promise<{ day: AttendanceDayDto }> {
  const q = encodeURIComponent(siteId);
  const baseKey = buildCacheKey("attendance_today", siteId);
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached<{ day: AttendanceDayDto }>(
    `/api/app/attendance/today?siteId=${q}`,
    {
      cacheKey: key,
      ttlMs: TTL.ATTENDANCE_TODAY,
      forceRefresh,
    },
  );
}

/**
 * Cached: Get foreman timesheets
 */
export async function apiForemanTimesheetsCached(forceRefresh = false) {
  const key = await cacheKeyScope("foreman_timesheets_mobile");
  return apiFetchCached(
    "/api/app/foreman/timesheets-mobile",
    {
      cacheKey: key,
      ttlMs: TTL.TIMESHEET_LIST,
      forceRefresh,
      staleWhileRevalidate: true,
      allowStaleWhenOffline: true,
    },
    { auth: true },
  );
}

/**
 * Cached: Get the foreman's recent site photos.
 * The gallery refreshes live only when the user pulls to refresh or after upload/delete.
 */
export async function apiForemanRecentSiteDayPhotosCached(forceRefresh = false) {
  const key = await cacheKeyScope("foreman_recent_site_day_photos");
  return apiFetchCached<{ photos: ForemanRecentSiteDayPhotoDto[] }>(
    "/api/app/foreman/site-day-photos/recent",
    {
      cacheKey: key,
      ttlMs: TTL.SITE_DAY_PHOTOS,
      forceRefresh,
      staleWhileRevalidate: false,
      allowStaleWhenOffline: true,
    },
    { auth: true },
  );
}

export async function cacheForemanRecentSiteDayPhotos(
  photos: ForemanRecentSiteDayPhotoDto[],
) {
  const key = await cacheKeyScope("foreman_recent_site_day_photos");
  await cacheSet(key, { photos }, TTL.SITE_DAY_PHOTOS);
}

/**
 * Cached: Get foreman timesheet detail (mobile)
 */
export async function apiForemanTimesheetDetailMobileCached(
  id: string,
  siteId?: string,
  forceRefresh = false,
) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const qs = params.toString();

  const baseKey = buildCacheKey(
    "foreman_timesheet_detail_mobile",
    id,
    siteId ?? "",
  );
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached(
    `/api/app/foreman/timesheets-mobile/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    {
      cacheKey: key,
      ttlMs: TTL.TIMESHEET_DETAIL,
      forceRefresh,
      staleWhileRevalidate: true,
      allowStaleWhenOffline: true,
    },
    { auth: true },
  );
}

/**
 * Cached: Get supervisor timesheets
 */
export async function apiSupervisorTimesheetsCached(
  query?: {
    status?: string;
    siteId?: string;
    q?: string;
    period?: string;
    limit?: number;
  },
  forceRefresh = false,
) {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.siteId) params.set("siteId", query.siteId);
  if (query?.q) params.set("q", query.q);
  if (query?.period) params.set("period", query.period);
  if (query?.limit != null) params.set("limit", String(query.limit));
  const qs = params.toString();
  const path = `/api/app/supervisor/timesheets${qs ? `?${qs}` : ""}`;

  const baseKey = buildCacheKey(
    "supervisor_timesheets",
    query?.status,
    query?.siteId,
    query?.q,
    query?.period,
    query?.limit ?? "",
  );
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached(path, {
    cacheKey: key,
    ttlMs: TTL.TIMESHEET_LIST,
    forceRefresh,
  });
}

/**
 * Cached: Admin dashboard metrics
 */
export async function apiAdminDashboardMetricsCached(
  forceRefresh = false,
): Promise<AdminDashboardMetricsDto> {
  const key = await cacheKeyScope("admin_dashboard_metrics");
  return apiFetchCached<AdminDashboardMetricsDto>(
    "/api/app/admin/dashboard/metrics",
    {
      cacheKey: key,
      ttlMs: TTL.TIMESHEET_DETAIL, // 5 min - dashboard data refreshes frequently
      forceRefresh,
    },
  );
}

/**
 * Cached: Admin weekly attendance
 */
export async function apiAdminWeeklyAttendanceCached(
  period?: string,
  forceRefresh = false,
): Promise<AdminWeeklyAttendanceDto> {
  const params = period ? `?period=${period}` : "";
  const baseKey = buildCacheKey("admin_weekly_attendance", period ?? "default");
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached<AdminWeeklyAttendanceDto>(
    `/api/app/admin/dashboard/weekly-attendance${params}`,
    {
      cacheKey: key,
      ttlMs: TTL.TIMESHEET_DETAIL, // 5 min - same as dashboard metrics
      forceRefresh,
    },
  );
}

// ADMIN: TOP SITE WAGES (current fortnight)

export type TopSiteWageDto = { site: string; wages: number };

export type TopSiteWagesResponse = {
  topSites: TopSiteWageDto[];
  fortnight: { startISO: string; endISO: string };
};

export async function apiAdminTopSiteWages(): Promise<TopSiteWagesResponse> {
  return apiFetch("/api/app/admin/dashboard/top-site-wages");
}

export async function apiAdminTopSiteWagesCached(
  forceRefresh = false,
): Promise<TopSiteWagesResponse> {
  const key = await cacheKeyScope("admin_top_site_wages");
  return apiFetchCached<TopSiteWagesResponse>(
    "/api/app/admin/dashboard/top-site-wages",
    {
      cacheKey: key,
      ttlMs: TTL.TIMESHEET_DETAIL, // 5 min
      forceRefresh,
    },
  );
}

// ADMIN: WAGE COMPARISON (fortnight + month)

export type WageComparisonPeriod = {
  current: number;
  previous: number;
  currentLabel: string;
  previousLabel: string;
};

export type WageComparisonResponse = {
  fortnight: WageComparisonPeriod;
  month: WageComparisonPeriod;
};

export async function apiAdminWageComparison(): Promise<WageComparisonResponse> {
  return apiFetch("/api/app/admin/dashboard/wage-comparison");
}

/**
 * Cached: Employees list
 */
export async function apiEmployeesCached(
  forceRefresh = false,
): Promise<{ employees: ApiEmployee[] }> {
  const key = await cacheKeyScope("employees_list");
  return apiFetchCached<{ employees: ApiEmployee[] }>("/api/employees", {
    cacheKey: key,
    ttlMs: TTL.SITES_LIST, // 10 min - employee data doesn't change often
    forceRefresh,
  });
}

/**
 * Cached: Admin sites list
 */
export async function apiAdminSitesCached(
  query?: { q?: string; isActive?: boolean | "true" | "false" },
  forceRefresh = false,
): Promise<{ ok: true; sites: AdminSiteListItemDto[] }> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (typeof query?.isActive !== "undefined") {
    const v =
      typeof query.isActive === "boolean"
        ? query.isActive
          ? "true"
          : "false"
        : query.isActive;
    params.set("isActive", v);
  }
  const qs = params.toString();
  const path = `/api/app/admin/sites${qs ? `?${qs}` : ""}`;

  const baseKey = buildCacheKey(
    "admin_sites",
    query?.q,
    String(query?.isActive),
  );
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached<{ ok: true; sites: AdminSiteListItemDto[] }>(path, {
    cacheKey: key,
    ttlMs: TTL.SITES_LIST,
    forceRefresh,
  });
}

/**
 * Cached: Admin timesheets
 */
export async function apiAdminTimesheetsCached(
  query?: { status?: string; siteId?: string },
  forceRefresh = false,
) {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.siteId) params.set("siteId", query.siteId);
  const qs = params.toString();
  const path = `/api/app/admin/timesheets${qs ? `?${qs}` : ""}`;

  const baseKey = buildCacheKey(
    "admin_timesheets",
    query?.status,
    query?.siteId,
  );
  const key = await cacheKeyScope(baseKey);
  return apiFetchCached(path, {
    cacheKey: key,
    ttlMs: TTL.TIMESHEET_LIST,
    forceRefresh,
  });
}

// ─── SITE COSTS ──────────────────────────────────────────────────────────────

export type SiteCostsDto = {
  siteId: string;
  siteName: string;
  materialCost: number;
  wagesCost: number;
  projectCost: number;
  revenueClaimed: number;
  revenueReceived: number;
  profitOrLoss: number;
  materialPct: number | null;
  wagesPct: number | null;
  profitPct: number | null;
};

export async function apiAdminSiteCosts(
  siteId: string,
  from?: string,
  to?: string,
): Promise<{ ok: true; startISO: string; endISO: string; data: SiteCostsDto }> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/costs${qs ? `?${qs}` : ""}`,
  );
}

// ─── SITE PRODUCT ORDERS ─────────────────────────────────────────────────────

export type SiteProductOrderItemDto = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPriceAtOrder: number;
  uomAtOrder: string | null;
  unitSizeAtOrder: number | null;
  note: string | null;
};

export type SiteProductOrderDto = {
  id: string;
  siteId: string;
  siteName: string;
  supplierId: string | null;
  supplierName: string | null;
  createdBy: string | null;
  reference: string | null;
  note: string | null;
  totalCost: number | null;
  createdAt: string;
  items: SiteProductOrderItemDto[];
};

export async function apiAdminSiteProductOrders(
  siteId: string,
): Promise<{ ok: true; data: SiteProductOrderDto[] }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/product-orders`,
  );
}

// ─── MATERIAL ORDERS ─────────────────────────────────────────────────────────

export async function apiAdminMaterialOrders(query?: {
  siteId?: string;
  from?: string;
  to?: string;
}): Promise<{ ok: true; data: SiteProductOrderDto[] }> {
  const params = new URLSearchParams();
  if (query?.siteId) params.set("siteId", query.siteId);
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);
  const qs = params.toString();
  return apiFetch(`/api/app/admin/material-orders${qs ? `?${qs}` : ""}`);
}

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

export type SupplierDto = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { products: number; orders: number };
};

export async function apiAdminSuppliers(query?: {
  q?: string;
}): Promise<{ ok: true; data: SupplierDto[]; total: number }> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  const qs = params.toString();
  return apiFetch(`/api/app/admin/suppliers${qs ? `?${qs}` : ""}`);
}

export async function apiAdminCreateSupplier(body: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<{ ok: true; supplier: SupplierDto }> {
  return apiFetch("/api/app/admin/suppliers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── PROCUREMENT PRODUCTS ─────────────────────────────────────────────────────

export type ProcurementProductDto = {
  id: string;
  name: string;
  uom: string | null;
  unitSize: number | null;
  isActive: boolean;
};

export async function apiAdminProcurementProducts(query?: {
  q?: string;
}): Promise<{ ok: true; data: ProcurementProductDto[]; total: number }> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  params.set("limit", "200");
  const qs = params.toString();
  return apiFetch(`/api/app/admin/procurement-products${qs ? `?${qs}` : ""}`);
}

export async function apiAdminCreateSiteProductOrder(
  siteId: string,
  data: { supplierId?: string; reference?: string; note?: string },
): Promise<{ ok: true; data: { id: string } }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/product-orders`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function apiAdminAddOrderItem(
  siteId: string,
  orderId: string,
  data: {
    productId: string;
    quantity: number;
    unitPrice?: number | null;
    note?: string;
  },
): Promise<{ ok: true; data: unknown }> {
  return apiFetch(
    `/api/app/admin/sites/${encodeURIComponent(siteId)}/product-orders/${encodeURIComponent(orderId)}/items`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

// ─── PLANT ASSIGNMENTS ────────────────────────────────────────────────────────

export type PlantAssignmentDto = {
  id: string;
  siteId: string;
  status: string;
  deployedOn: string;
  returnedOn: string | null;
  quantity: number | null;
  note: string | null;
  product: { id: string; name: string; thumbnailUrl: string | null };
  site: { id: string; name: string; code: string | null };
};

export async function apiAdminPlantAssignments(query?: {
  siteId?: string;
  status?: string;
}): Promise<{ ok: true; data: PlantAssignmentDto[] }> {
  const params = new URLSearchParams();
  if (query?.siteId) params.set("siteId", query.siteId);
  if (query?.status) params.set("status", query.status);
  const qs = params.toString();
  return apiFetch(`/api/app/admin/plant-assignments${qs ? `?${qs}` : ""}`);
}

// ─── FACE SCAN-OUT ──────────────────────────────────────────────────────────
//
// Phase 2: `image` (base64 JPEG) is optional so this endpoint still works
// exactly like Phase 1 (cosmetic-only) if omitted. When present and the
// employee has approved reference enrollments, the server runs a real
// face-service comparison. `checkLiveness` requests the Phase 3 first-cut
// head-turn heuristic (see FACE_VERIFICATION_TECHNICAL_DESIGN.md §9).

export async function apiScanOutFace(input: {
  employeeId: string;
  device: string;
  image?: string;
  checkLiveness?: boolean;
}): Promise<{
  ok: true;
  scannedOutAt: string;
  verificationStatus: string;
  confidence: number | null;
  /** Present when face-service found no usable face, more than one, or rejected the photo's quality before attempting a match — distinct from an ambiguous-confidence match. */
  reason?: "no_face_detected" | "multiple_faces_detected" | "low_quality";
  /** Present when reason is "low_quality" — which specific checks failed, for a specific retake instruction. */
  warnings?: string[];
}> {
  return apiFetch("/api/app/attendance/scan-out-face", {
    method: "POST",
    body: JSON.stringify({
      employeeId: input.employeeId,
      device: input.device,
      image: input.image,
      checkLiveness: input.checkLiveness,
    }),
    headers: { "content-type": "application/json" },
    auth: true,
  });
}

// ─── FACE ENROLLMENT ────────────────────────────────────────────────────────
//
// Mirrors apiForemanUploadEmployeePhoto's multipart convention. Up to 5
// photos, each tagged with a pose (FRONT/LEFT/RIGHT/SMILE/NEUTRAL, same
// order as photos). Enrollments land as PENDING_APPROVAL — an admin must
// approve before they're used for matching (see FaceEnrollment in schema).

export type FaceEnrollmentPose = "FRONT" | "LEFT" | "RIGHT" | "SMILE" | "NEUTRAL";

export async function apiCreateFaceEnrollments(
  employeeId: string,
  photos: { uri: string; name: string; type: string; pose: FaceEnrollmentPose }[],
  meta?: { device?: string; latitude?: number; longitude?: number },
): Promise<{
  results: (
    | { id: string; pose: string; qualityScore: number | null }
    | { pose: string; error: string; warnings?: string[] }
  )[];
}> {
  const fd = new FormData();
  for (const photo of photos) {
    fd.append("photos", { uri: photo.uri, name: photo.name, type: photo.type } as any);
  }
  fd.append("poses", JSON.stringify(photos.map((p) => p.pose)));
  if (meta?.device) fd.append("device", meta.device);
  if (meta?.latitude !== undefined) fd.append("latitude", String(meta.latitude));
  if (meta?.longitude !== undefined) fd.append("longitude", String(meta.longitude));

  return apiFetch(
    `/api/app/foreman/employees/${encodeURIComponent(employeeId)}/face-enrollments`,
    { method: "POST", body: fd as any, auth: true },
  );
}

export async function apiListFaceEnrollments(employeeId: string): Promise<{
  enrollments: {
    id: string;
    pose: string;
    imageUrl: string;
    qualityScore: number | null;
    status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
    rejectedReason: string | null;
    createdAt: string;
  }[];
}> {
  return apiFetch(
    `/api/app/foreman/employees/${encodeURIComponent(employeeId)}/face-enrollments`,
    { auth: true },
  );
}

// ─── SUPERVISOR: EMPLOYEE FACE REFERENCES ──────────────────────────────────
//
// Same shapes as apiForemanEmployee / apiCreateFaceEnrollments /
// apiListFaceEnrollments above, scoped to employees visible to the
// supervisor (see employeeWhereFor on the backend) rather than a foreman's
// own crew. apiSupervisorEmployee reuses the generic /api/employees/:id
// route, which is already scoped per-role server-side.

export async function apiSupervisorEmployee(employeeId: string): Promise<{
  ok: true;
  employee: EmployeeDto;
}> {
  return apiFetch(`/api/employees/${encodeURIComponent(employeeId)}`);
}

export async function apiSupervisorCreateFaceEnrollments(
  employeeId: string,
  photos: { uri: string; name: string; type: string; pose: FaceEnrollmentPose }[],
  meta?: { device?: string; latitude?: number; longitude?: number },
): Promise<{
  results: (
    | { id: string; pose: string; qualityScore: number | null }
    | { pose: string; error: string; warnings?: string[] }
  )[];
}> {
  const fd = new FormData();
  for (const photo of photos) {
    fd.append("photos", { uri: photo.uri, name: photo.name, type: photo.type } as any);
  }
  fd.append("poses", JSON.stringify(photos.map((p) => p.pose)));
  if (meta?.device) fd.append("device", meta.device);
  if (meta?.latitude !== undefined) fd.append("latitude", String(meta.latitude));
  if (meta?.longitude !== undefined) fd.append("longitude", String(meta.longitude));

  return apiFetch(
    `/api/app/supervisor/employees/${encodeURIComponent(employeeId)}/face-enrollments`,
    { method: "POST", body: fd as any, auth: true },
  );
}

export async function apiSupervisorListFaceEnrollments(
  employeeId: string,
): Promise<{
  enrollments: {
    id: string;
    pose: string;
    imageUrl: string;
    qualityScore: number | null;
    status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
    rejectedReason: string | null;
    createdAt: string;
  }[];
}> {
  return apiFetch(
    `/api/app/supervisor/employees/${encodeURIComponent(employeeId)}/face-enrollments`,
    { auth: true },
  );
}

export type FaceVerificationStatus = "MISSING" | "PENDING" | "RECOGNISED";

export type FaceVerificationEmployeeDto = {
  id: string;
  fullName: string;
  code: string;
  photoUrl: string | null;
  active: boolean;
  faceStatus: FaceVerificationStatus;
  completedPoses: number;
  totalPoses: number;
};

/** Backs the supervisor's Face Verification list - one row per employee with a rolled-up MISSING/PENDING/RECOGNISED status. */
export async function apiSupervisorFaceVerifications(
  show: "active" | "all" = "active",
): Promise<{ ok: true; employees: FaceVerificationEmployeeDto[] }> {
  return apiFetch(
    `/api/app/supervisor/employees/face-status?show=${show}`,
    { auth: true },
  );
}

/** Foreman equivalent of apiSupervisorFaceVerifications, scoped to the foreman's own crew. */
export async function apiForemanFaceVerifications(
  show: "active" | "all" = "active",
): Promise<{ ok: true; employees: FaceVerificationEmployeeDto[] }> {
  return apiFetch(
    `/api/app/foreman/employees/face-status?show=${show}`,
    { auth: true },
  );
}

// ADMIN: FACE VERIFICATIONS
// Mirrors the web admin Face Verifications page (approve/reject reference
// photos, browse verified employees, view scan-out verification history).

export type FaceEnrollmentStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export type FaceEnrollmentDto = {
  id: string;
  employeeId: string;
  employeeName: string;
  pose: FaceEnrollmentPose;
  imageUrl: string;
  qualityScore: number | null;
  status: FaceEnrollmentStatus;
  rejectedReason: string | null;
  enrolledAtISO: string;
  approvedAtISO: string | null;
  device: string | null;
  foremanName: string;
  approvedByName: string | null;
};

export type FaceVerificationAttemptDto = {
  id: string;
  confidence: number;
  livenessPassed: boolean | null;
  processingTimeMs: number | null;
  createdAtISO: string;
  matchedPose: string | null;
  workDateISO: string | null;
};

/** List face enrollments (reference photos) by status. Defaults to the review queue. */
export async function apiAdminFaceEnrollments(
  status: FaceEnrollmentStatus = "PENDING_APPROVAL",
): Promise<{ enrollments: FaceEnrollmentDto[] }> {
  return apiFetch(`/api/app/admin/face-enrollments?status=${status}`, {
    auth: true,
  });
}

export async function apiAdminApproveFaceEnrollment(
  enrollmentId: string,
): Promise<{ enrollment: { id: string; status: string; approvedAt: string | null } }> {
  return apiFetch(
    `/api/app/admin/face-enrollments/${encodeURIComponent(enrollmentId)}/approve`,
    { method: "POST", auth: true },
  );
}

export async function apiAdminRejectFaceEnrollment(
  enrollmentId: string,
  reason: string,
): Promise<{ enrollment: { id: string; status: string; rejectedReason: string | null } }> {
  return apiFetch(
    `/api/app/admin/face-enrollments/${encodeURIComponent(enrollmentId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }), auth: true },
  );
}

/** Permanently deletes one reference photo (Verified tab profile view). */
export async function apiAdminDeleteFaceEnrollment(
  enrollmentId: string,
): Promise<{ success: true }> {
  return apiFetch(
    `/api/app/admin/face-enrollments/${encodeURIComponent(enrollmentId)}`,
    { method: "DELETE", auth: true },
  );
}

/** Recent scan-out verification attempts for one employee (profile dialog history). */
export async function apiAdminEmployeeFaceVerificationHistory(
  employeeId: string,
): Promise<{ attempts: FaceVerificationAttemptDto[] }> {
  return apiFetch(
    `/api/app/admin/employees/${encodeURIComponent(employeeId)}/face-verification-history`,
    { auth: true },
  );
}
