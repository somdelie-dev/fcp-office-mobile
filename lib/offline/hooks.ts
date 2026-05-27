/**
 * Custom hooks for offline-first features
 *
 * - useNetworkStatus(): Get current network status
 * - usePendingQueue(): Get pending queue items and refetch count
 * - useOfflineStats(): Get summary stats about queue and scans
 */

import { useEffect, useState } from "react";
import {
  getCurrentNetworkStatus,
  onNetworkStatusChange,
  type NetworkStatus,
} from "./networkStatus";
import {
  getOfflineStats,
  getPendingQueueItems,
  type QueueItem,
} from "./storage";

/**
 * Hook to track network status changes
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(
    getCurrentNetworkStatus(),
  );

  useEffect(() => {
    const unsubscribe = onNetworkStatusChange((newStatus: NetworkStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, []);

  return status;
}

/**
 * Hook to get pending queue items with auto-refetch
 */
export function usePendingQueue() {
  const [items, setItems] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshQueue = async () => {
    try {
      const pending = await getPendingQueueItems();
      setItems(pending);
      setCount(pending.filter((i: QueueItem) => i.status === "pending").length);
    } catch (e) {
      console.error("Failed to load pending queue:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshQueue();

    // Refresh every 2 seconds to show progress
    const interval = setInterval(refreshQueue, 2000);
    return () => clearInterval(interval);
  }, []);

  return { items, count, loading, refresh: refreshQueue };
}

/**
 * Hook to get offline sync statistics
 */
export function useOfflineStats() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refreshStats = async () => {
    try {
      const s = await getOfflineStats();
      setStats(s);
    } catch (e) {
      console.error("Failed to load offline stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStats();

    // Refresh every 3 seconds
    const interval = setInterval(refreshStats, 3000);
    return () => clearInterval(interval);
  }, []);

  return { stats, loading, refresh: refreshStats };
}
