/**
 * Network Status Module (No Circular Dependencies)
 *
 * Provides network status tracking without circular imports.
 * Separated from sync.ts to prevent circular dependency with api.ts
 */

export type NetworkStatus = "online" | "offline";

let networkStatus: NetworkStatus = "online";
let isOnline: boolean = true;

type NetworkStatusListener = (status: NetworkStatus) => void;
const listeners: Set<NetworkStatusListener> = new Set();

export function getCurrentNetworkStatus(): NetworkStatus {
  return networkStatus;
}

export function isCurrentlyOnline(): boolean {
  return isOnline;
}

export function onNetworkStatusChange(
  callback: NetworkStatusListener,
): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setNetworkStatus(status: NetworkStatus, online: boolean) {
  networkStatus = status;
  isOnline = online;
  listeners.forEach((cb) => cb(status));
}

export function notifyListeners(status: NetworkStatus) {
  listeners.forEach((cb) => cb(status));
}
