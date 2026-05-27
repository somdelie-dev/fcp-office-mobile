/**
 * Location hook for getting device location and reverse-geocoded address.
 *
 * Usage:
 *   const { getLocationWithAddress, permissionStatus, requestPermission } = useLocation();
 *   const location = await getLocationWithAddress();
 *   // location = { latitude, longitude, address, accuracy, timestamp }
 */

import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

export type LocationData = {
  latitude: number;
  longitude: number;
  address: string | null;
  accuracy: number | null;
  timestamp: number;
};

export type LocationPermissionStatus = "undetermined" | "granted" | "denied";

export function useLocation() {
  const [permissionStatus, setPermissionStatus] =
    useState<LocationPermissionStatus>("undetermined");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check permission status on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        setPermissionStatus(status === "granted" ? "granted" : "denied");
      } catch {
        setPermissionStatus("undetermined");
      }
    })();
  }, []);

  /**
   * Request location permissions
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setPermissionStatus(granted ? "granted" : "denied");
      return granted;
    } catch (e: any) {
      setError(e?.message ?? "Failed to request location permission");
      setPermissionStatus("denied");
      return false;
    }
  }, []);

  /**
   * Build a human-readable address from geocode result
   */
  const formatAddress = (geocode: Location.LocationGeocodedAddress): string => {
    const parts = [
      geocode.streetNumber,
      geocode.street,
      geocode.city,
      geocode.region,
      geocode.country,
    ].filter(Boolean);

    return parts.join(", ") || "";
  };

  /**
   * Get current location with reverse-geocoded address.
   * Will request permission if not granted.
   */
  const getLocationWithAddress =
    useCallback(async (): Promise<LocationData | null> => {
      setLoading(true);
      setError(null);

      try {
        // Check/request permission
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const result = await Location.requestForegroundPermissionsAsync();
          status = result.status;
          setPermissionStatus(status === "granted" ? "granted" : "denied");
        }

        if (status !== "granted") {
          setError("permission_denied");
          return null;
        }

        // Strategy for Huawei HMS devices (no Google Play Services):
        // 1. Try last-known position first — instant if any app used GPS recently
        // 2. Fall back to getCurrentPosition with Accuracy.Lowest (GPS-only, no GMS needed)
        // 3. Race against a 20s timeout so we don't hang indefinitely
        let position: Location.LocationObject | null =
          await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });

        if (!position) {
          position = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
          ]);
        }

        if (!position) {
          setError("location_unavailable");
          return null;
        }

        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = position.timestamp;

        // Reverse geocode to get address
        let address: string | null = null;
        try {
          const geocodeResults = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });

          if (geocodeResults.length > 0) {
            address = formatAddress(geocodeResults[0]);
          }
        } catch {
          // Geocoding failed, continue without address
          console.warn("Reverse geocoding failed");
        }

        return {
          latitude,
          longitude,
          address: address || null,
          accuracy,
          timestamp,
        };
      } catch (e: any) {
        setError(e?.message ?? "Failed to get location");
        return null;
      } finally {
        setLoading(false);
      }
    }, []);

  /**
   * Get location coordinates only (faster, no geocoding)
   */
  const getCoordinates = useCallback(async (): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null> => {
    setLoading(true);
    setError(null);

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
        setPermissionStatus(status === "granted" ? "granted" : "denied");
      }

      if (status !== "granted") {
        setError("Location permission denied");
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
    } catch (e: any) {
      setError(e?.message ?? "Failed to get location");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permissionStatus,
    loading,
    error,
    requestPermission,
    getLocationWithAddress,
    getCoordinates,
  };
}

/**
 * Standalone function to get location with address (for use outside React components)
 */
export async function getDeviceLocationWithAddress(): Promise<LocationData | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      const result = await Location.requestForegroundPermissionsAsync();
      status = result.status;
    }

    if (status !== "granted") {
      return null;
    }

    let position: Location.LocationObject | null =
      await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });

    if (!position) {
      position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
      ]);
    }

    if (!position) return null;

    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = position.timestamp;

    let address: string | null = null;
    try {
      const geocodeResults = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (geocodeResults.length > 0) {
        const g = geocodeResults[0];
        address =
          [g.streetNumber, g.street, g.city, g.region, g.country]
            .filter(Boolean)
            .join(", ") || null;
      }
    } catch {
      // Geocoding failed silently
    }

    return { latitude, longitude, address, accuracy, timestamp };
  } catch {
    return null;
  }
}
