import React, { createContext, useCallback, useContext, useState } from "react";

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface DataCacheContextType {
  // Supervisor home data (includes timestamp for freshness check)
  supervisorOverview: (CacheEntry<any> & { data: any }) | null;
  setSupervisorOverview: (data: any) => void;

  // Supervisor sites list (includes timestamp for freshness check)
  supervisorSites: (CacheEntry<any[]> & { data: any[] }) | null;
  setSupervisorSites: (data: any[]) => void;

  // Supervisor site detail (keyed by siteId, each entry includes timestamp)
  supervisorSiteDetail: Record<string, CacheEntry<any> & { data: any }>;
  setSupervisorSiteDetail: (siteId: string, data: any) => void;

  // Supervisor timesheets (keyed by status, each entry includes timestamp)
  supervisorTimesheets: Record<string, CacheEntry<any> & { data: any }>;
  setSupervisorTimesheets: (key: string, data: any) => void;

  // Check if data is fresh (within 5 minutes)
  isFresh: (timestamp: number) => boolean;

  // Clear all cache
  clearCache: () => void;

  // Get cache age in seconds
  getCacheAge: (timestamp: number) => number;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(
  undefined,
);

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  const [supervisorOverviewEntry, setSupervisorOverviewEntry] =
    useState<CacheEntry<any> | null>(null);
  const [supervisorSitesEntry, setSupervisorSitesEntry] = useState<CacheEntry<
    any[]
  > | null>(null);
  const [supervisorSiteDetailEntries, setSupervisorSiteDetailEntries] =
    useState<Record<string, CacheEntry<any>>>({});
  const [supervisorTimesheetsEntries, setSupervisorTimesheetsEntries] =
    useState<Record<string, CacheEntry<any>>>({});

  const isFresh = useCallback((timestamp: number) => {
    return Date.now() - timestamp < CACHE_DURATION;
  }, []);

  const getCacheAge = useCallback((timestamp: number) => {
    return Math.floor((Date.now() - timestamp) / 1000);
  }, []);

  const setSupervisorOverview = useCallback((data: any) => {
    setSupervisorOverviewEntry({
      data,
      timestamp: Date.now(),
    });
  }, []);

  const setSupervisorSites = useCallback((data: any[]) => {
    setSupervisorSitesEntry({
      data,
      timestamp: Date.now(),
    });
  }, []);

  const setSupervisorSiteDetail = useCallback((siteId: string, data: any) => {
    setSupervisorSiteDetailEntries((prev) => ({
      ...prev,
      [siteId]: {
        data,
        timestamp: Date.now(),
      },
    }));
  }, []);

  const setSupervisorTimesheets = useCallback((key: string, data: any) => {
    setSupervisorTimesheetsEntries((prev) => ({
      ...prev,
      [key]: {
        data,
        timestamp: Date.now(),
      },
    }));
  }, []);

  const clearCache = useCallback(() => {
    setSupervisorOverviewEntry(null);
    setSupervisorSitesEntry(null);
    setSupervisorSiteDetailEntries({});
    setSupervisorTimesheetsEntries({});
  }, []);

  const value: DataCacheContextType = {
    supervisorOverview: supervisorOverviewEntry
      ? { ...supervisorOverviewEntry, data: supervisorOverviewEntry.data }
      : null,
    setSupervisorOverview,
    supervisorSites: supervisorSitesEntry
      ? { ...supervisorSitesEntry, data: supervisorSitesEntry.data }
      : null,
    setSupervisorSites,
    supervisorSiteDetail: Object.entries(supervisorSiteDetailEntries).reduce(
      (acc, [key, entry]) => {
        acc[key] = {
          ...entry,
          data: entry.data,
        };
        return acc;
      },
      {} as Record<string, CacheEntry<any> & { data: any }>,
    ),
    setSupervisorSiteDetail,
    supervisorTimesheets: Object.entries(supervisorTimesheetsEntries).reduce(
      (acc, [key, entry]) => {
        acc[key] = {
          ...entry,
          data: entry.data,
        };
        return acc;
      },
      {} as Record<string, CacheEntry<any> & { data: any }>,
    ),
    setSupervisorTimesheets,
    isFresh: (timestamp: number) => {
      if (!timestamp) return false;
      return isFresh(timestamp);
    },
    getCacheAge,
    clearCache,
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache(): DataCacheContextType {
  const context = useContext(DataCacheContext);
  if (context === undefined) {
    throw new Error("useDataCache must be used within a DataCacheProvider");
  }
  return context;
}

// Helper to check if specific site data is still fresh
export function isSiteDataFresh(siteDetail: any): boolean {
  if (!siteDetail || !siteDetail.timestamp) return false;
  return Date.now() - siteDetail.timestamp < CACHE_DURATION;
}
