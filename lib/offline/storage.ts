/**
 * Offline Storage Layer
 *
 * Provides SQLite-backed persistence for:
 * 1. Queue items (mutations to be synced)
 * 2. Local scans (attendance records created offline)
 *
 * Uses expo-sqlite for reliability on mobile.
 */

import { openDatabaseAsync } from "expo-sqlite";

export type QueueItemType =
  | "scan-single"
  | "scan-bulk"
  | "delete-scan"
  | "day-note"
  | "day-ready";

export type QueueItemStatus =
  | "pending" // Waiting to sync
  | "inflight" // Currently being synced
  | "done" // Successfully synced
  | "failed" // Failed, needs manual retry
  | "canceled"; // User canceled

export type QueueItem = {
  id: string;
  type: QueueItemType;
  payload: Record<string, any>;
  createdAt: string; // ISO timestamp
  attemptCount: number;
  lastError: string | null;
  status: QueueItemStatus;
  dependsOn: string | null; // ID of QueueItem this depends on
};

export type LocalScan = {
  id: string;
  siteId: string;
  workDateISO: string;
  employeeCode: string;
  qrCodeValue: string;
  createdAt: string; // ISO timestamp
  syncStatus: "pending" | "synced" | "failed";
  serverScanId: string | null; // Maps local to server after sync
};

/**
 * Initialize SQLite database with schema
 */
async function initDatabase() {
  const db = await openDatabaseAsync("offline.db");

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      attemptCount INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      status TEXT NOT NULL,
      dependsOn TEXT,
      FOREIGN KEY(dependsOn) REFERENCES queue(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS local_scans (
      id TEXT PRIMARY KEY,
      siteId TEXT NOT NULL,
      workDateISO TEXT NOT NULL,
      employeeCode TEXT NOT NULL,
      qrCodeValue TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      syncStatus TEXT NOT NULL,
      serverScanId TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_dependsOn ON queue(dependsOn);
    CREATE INDEX IF NOT EXISTS idx_local_scans_site_date ON local_scans(siteId, workDateISO);
  `);

  return db;
}

let dbInstance: Awaited<ReturnType<typeof openDatabaseAsync>> | null = null;

async function getDb() {
  if (!dbInstance) {
    dbInstance = await initDatabase();
  }
  return dbInstance;
}

// ============================================================================
// Queue Operations
// ============================================================================

export async function enqueueItem(
  item: Omit<QueueItem, "id">,
): Promise<string> {
  const db = await getDb();
  const id = generateId();

  await db.runAsync(
    `INSERT INTO queue (id, type, payload, createdAt, attemptCount, lastError, status, dependsOn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      item.type,
      JSON.stringify(item.payload),
      item.createdAt,
      item.attemptCount,
      item.lastError,
      item.status,
      item.dependsOn,
    ],
  );

  return id;
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(`SELECT * FROM queue WHERE id = ?`, [
    id,
  ]);

  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    createdAt: row.createdAt,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    status: row.status,
    dependsOn: row.dependsOn,
  };
}

export async function getPendingQueueItems(): Promise<QueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM queue WHERE status IN ('pending', 'failed') ORDER BY createdAt ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    createdAt: row.createdAt,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    status: row.status,
    dependsOn: row.dependsOn,
  }));
}

export async function getNextQueueItem(): Promise<QueueItem | null> {
  const db = await getDb();

  // Find first pending item with no unresolved dependencies
  const row = await db.getFirstAsync<any>(
    `SELECT q.* FROM queue q
     LEFT JOIN queue dep ON q.dependsOn = dep.id
     WHERE q.status IN ('pending', 'failed')
       AND (q.dependsOn IS NULL OR dep.status = 'done')
     ORDER BY q.createdAt ASC
     LIMIT 1`,
  );

  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    createdAt: row.createdAt,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    status: row.status,
    dependsOn: row.dependsOn,
  };
}

export async function updateQueueItem(
  id: string,
  updates: Partial<Omit<QueueItem, "id">>,
): Promise<void> {
  const db = await getDb();

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    setClauses.push("status = ?");
    values.push(updates.status);
  }
  if (updates.attemptCount !== undefined) {
    setClauses.push("attemptCount = ?");
    values.push(updates.attemptCount);
  }
  if (updates.lastError !== undefined) {
    setClauses.push("lastError = ?");
    values.push(updates.lastError);
  }
  if (updates.payload !== undefined) {
    setClauses.push("payload = ?");
    values.push(JSON.stringify(updates.payload));
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE queue SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM queue WHERE id = ?`, [id]);
}

export async function getAllQueueItems(): Promise<QueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM queue ORDER BY createdAt ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    createdAt: row.createdAt,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    status: row.status,
    dependsOn: row.dependsOn,
  }));
}

// ============================================================================
// Local Scans
// ============================================================================

export async function createLocalScan(
  scan: Omit<LocalScan, "id" | "createdAt">,
): Promise<string> {
  const db = await getDb();
  const id = generateId();
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO local_scans (id, siteId, workDateISO, employeeCode, qrCodeValue, createdAt, syncStatus, serverScanId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      scan.siteId,
      scan.workDateISO,
      scan.employeeCode,
      scan.qrCodeValue,
      createdAt,
      scan.syncStatus,
      scan.serverScanId,
    ],
  );

  return id;
}

export async function getLocalScan(id: string): Promise<LocalScan | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM local_scans WHERE id = ?`,
    [id],
  );

  return row ? mapRowToLocalScan(row) : null;
}

export async function getLocalScans(
  siteId: string,
  workDateISO: string,
): Promise<LocalScan[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM local_scans WHERE siteId = ? AND workDateISO = ? ORDER BY createdAt DESC`,
    [siteId, workDateISO],
  );

  return rows.map(mapRowToLocalScan);
}

export async function deleteLocalScan(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM local_scans WHERE id = ?`, [id]);
}

export async function updateLocalScan(
  id: string,
  updates: Partial<Omit<LocalScan, "id" | "createdAt">>,
): Promise<void> {
  const db = await getDb();

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.syncStatus !== undefined) {
    setClauses.push("syncStatus = ?");
    values.push(updates.syncStatus);
  }
  if (updates.serverScanId !== undefined) {
    setClauses.push("serverScanId = ?");
    values.push(updates.serverScanId);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE local_scans SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function hasLocalScan(
  siteId: string,
  workDateISO: string,
  employeeCode: string,
): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT 1 FROM local_scans
     WHERE siteId = ? AND workDateISO = ? AND employeeCode = ?
     LIMIT 1`,
    [siteId, workDateISO, employeeCode],
  );

  return !!row;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function mapRowToLocalScan(row: any): LocalScan {
  return {
    id: row.id,
    siteId: row.siteId,
    workDateISO: row.workDateISO,
    employeeCode: row.employeeCode,
    qrCodeValue: row.qrCodeValue,
    createdAt: row.createdAt,
    syncStatus: row.syncStatus,
    serverScanId: row.serverScanId,
  };
}

/**
 * Clear all queue and local scan data (for testing/reset)
 */
export async function clearOfflineData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`DELETE FROM queue; DELETE FROM local_scans;`);
}

/**
 * Get offline sync stats for UI display
 */
export async function getOfflineStats() {
  const db = await getDb();

  const queueStats = await db.getFirstAsync<any>(
    `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'inflight' THEN 1 ELSE 0 END) as inflight,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
       SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled
     FROM queue`,
  );

  const scanStats = await db.getFirstAsync<any>(
    `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN syncStatus = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN syncStatus = 'synced' THEN 1 ELSE 0 END) as synced,
       SUM(CASE WHEN syncStatus = 'failed' THEN 1 ELSE 0 END) as failed
     FROM local_scans`,
  );

  return {
    queue: queueStats || {
      total: 0,
      pending: 0,
      inflight: 0,
      failed: 0,
      done: 0,
      canceled: 0,
    },
    scans: scanStats || { total: 0, pending: 0, synced: 0, failed: 0 },
  };
}
