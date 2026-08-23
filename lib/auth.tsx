import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import { apiFetch, clearToken, setToken } from "./api";
import { apiRegisterPushToken } from "./apiClient";
import { cacheCleanupExpired, cacheClearAll } from "./mobileCache";
import { initializeSyncEngine } from "./offline/sync";
import { registerForPushNotificationsAsync } from "./push";

export type Role = "ADMIN" | "SUPERVISOR" | "FOREMAN" | "ASSISTANT";

export type ForemanOption = {
  foremanId: string;
  name: string;
  photoUrl?: string | null;
};

export type AppUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  // For assistant foremen: which foreman they are currently acting for
  actingForeman?: ForemanOption | null;
  // For assistant foremen: list of foremen they can act for
  availableForemen?: ForemanOption[];
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setActingForeman: (foreman: ForemanOption | null) => Promise<void>;
  updateUser: (newUserData: Partial<AppUser>) => Promise<void>;
};

const KEY = "auth_user_v1";
const ACTING_FOREMAN_KEY = "acting_foreman_id";
const PUSH_TOKEN_KEY = "expo_push_token_v1";
const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // load user from storage on app start
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const userData = raw ? (JSON.parse(raw) as AppUser) : null;

        // If user is loaded and is an assistant, restore acting foreman
        if (
          userData &&
          userData.availableForemen &&
          userData.availableForemen.length > 0
        ) {
          const actingForemanId =
            await AsyncStorage.getItem(ACTING_FOREMAN_KEY);

          if (actingForemanId) {
            // Validate that this foreman still exists in availableForemen
            const found = userData.availableForemen.find(
              (f) => f.foremanId === actingForemanId,
            );
            if (found) {
              userData.actingForeman = found;
            } else {
              // Invalid foreman ID in storage, clear it
              userData.actingForeman = null;
              await AsyncStorage.removeItem(ACTING_FOREMAN_KEY);
            }
          } else if (userData.actingForeman?.foremanId) {
            // ✅ FIX: User data has actingForeman but AsyncStorage key was cleared
            // (e.g., by 403 handler). Re-sync by writing to AsyncStorage.
            await AsyncStorage.setItem(
              ACTING_FOREMAN_KEY,
              userData.actingForeman.foremanId,
            );
          }
        }

        setUser(userData);

        // Initialize offline sync engine for mobile only
        if (Platform.OS !== "web") {
          initializeSyncEngine();

          // Cleanup expired cache entries on app start
          cacheCleanupExpired().catch(console.warn);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function signIn(email: string, password: string) {
    console.log("Attempting login for:", email);
    try {
      const base = await apiFetch("/api/app/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      });

      console.log("Login response:", base);

      if (!base?.token || !base?.user) throw new Error("Login failed.");

      await setToken(base.token);
      const u = base.user as AppUser;

      await AsyncStorage.setItem(KEY, JSON.stringify(u));

      // Clear any previous acting foreman selection on new login
      await AsyncStorage.removeItem(ACTING_FOREMAN_KEY);
      // Re-register this device token so a shared phone follows the new account.
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);

      // Clear old cache on login switch to avoid stale/leaked data
      await cacheClearAll();
      await cacheCleanupExpired();

      setUser(u);
    } catch (err: any) {
      console.error("Login error:", err?.message || err);
      throw err;
    }
  }

  async function signOut() {
    await AsyncStorage.removeItem(KEY);
    await AsyncStorage.removeItem(ACTING_FOREMAN_KEY);
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    await clearToken();
    setUser(null);
  }

  const setActingForeman = useCallback(
    async (foreman: ForemanOption | null) => {
      if (!user) return;

      // ✅ CRITICAL: Write to AsyncStorage FIRST, before updating React state.
      // apiFetch reads acting_foreman_id from storage to build the header.
      // If we update state first, the re-render triggers apiSites() before storage is written,
      // causing the x-acting-foreman-id header to be missing.
      if (foreman) {
        await AsyncStorage.setItem(ACTING_FOREMAN_KEY, foreman.foremanId);
      } else {
        await AsyncStorage.removeItem(ACTING_FOREMAN_KEY);
      }

      // Now update React state (triggers re-render and API calls with correct header)
      const updatedUser = { ...user, actingForeman: foreman };
      setUser(updatedUser);

      // Persist the updated user data
      await AsyncStorage.setItem(KEY, JSON.stringify(updatedUser));
    },
    [user],
  );

  const updateUser = useCallback(
    async (newUserData: Partial<AppUser>) => {
      if (!user) return;

      const updatedUser = { ...user, ...newUserData };
      setUser(updatedUser);
      await AsyncStorage.setItem(KEY, JSON.stringify(updatedUser));
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, setActingForeman, updateUser }),
    [user, loading, setActingForeman, updateUser],
  );

  // When a user is logged in, register this device's Expo push token
  // and send it to the backend (mobile only).
  useEffect(() => {
    if (!user) return;
    if (Platform.OS === "web") return;

    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token) return;

        const lastToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
        if (lastToken === token) return;

        const platform: "ios" | "android" | "web" =
          Platform.OS === "ios" || Platform.OS === "android"
            ? Platform.OS
            : "web";

        await apiRegisterPushToken({ token, platform });
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      } catch (err) {
        console.warn("Failed to register Expo push token", err);
      }
    })();
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
