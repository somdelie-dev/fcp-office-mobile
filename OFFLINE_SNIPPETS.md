/\*\*

- QUICK START: CODE SNIPPETS FOR UI INTEGRATION
-
- Copy-paste these snippets into your existing screens to add offline support.
- These are ready-to-use examples from the actual screen implementations.
  \*/

// ============================================================================
// SNIPPET 1: Add Imports to scan.tsx or day/[key].tsx
// ============================================================================

import { OfflineBanner } from "@/components/OfflineStatus";
import { useNetworkStatus } from "@/lib/offline/hooks";
import { mergeScans } from "@/lib/offline/merge";
import type { MergedScan } from "@/lib/offline/merge";

// ============================================================================
// SNIPPET 2: Track Network Status in Component
// ============================================================================

export default function ForemanScan() {
// ... existing state ...
const networkStatus = useNetworkStatus(); // Returns "online" | "offline"

// ... rest of component
}

// ============================================================================
// SNIPPET 3: Add Offline Banner at Top of Screen
// ============================================================================

return (
<AuthStyleBackground>
{networkStatus === "offline" && <OfflineBanner />}

    <ScrollView>
      {/* ... rest of screen ... */}
    </ScrollView>

  </AuthStyleBackground>
);

// ============================================================================
// SNIPPET 4: Merge Local and Server Scans in useEffect
// ============================================================================

const [displayScans, setDisplayScans] = useState<MergedScan[]>([]);

useEffect(() => {
const loadScans = async () => {
if (!site || !day) {
setDisplayScans([]);
return;
}

    try {
      const merged = await mergeScans(day.scans, site.id, dateISO);
      setDisplayScans(merged);
    } catch (e) {
      console.error("Failed to merge scans:", e);
      setDisplayScans(day.scans);
    }

};

loadScans();
}, [day, site, dateISO]);

// ============================================================================
// SNIPPET 5: Show Pending Badge in FlatList
// ============================================================================

<FlatList
data={displayScans}
keyExtractor={(item) => item.id}
scrollEnabled={false}
renderItem={({ item }) => (
<View style={styles.scanRow}>
<View style={{ flex: 1 }}>
<Text style={styles.scanName}>{item.employee.fullName}</Text>
<Text style={styles.scanMeta}>
{item.employee.code} •{" "}
{new Date(item.scannedAt).toLocaleTimeString(undefined, {
hour: "2-digit",
minute: "2-digit",
})}
</Text>

        {/* Show pending badge if locally created scan */}
        {item.pendingSync && (
          <View style={styles.pendingBadge}>
            <Ionicons name="cloud-upload-outline" size={14} color="#f59e0b" />
            <Text style={styles.pendingText}>
              {item.syncStatus === "failed" ? "Sync failed" : "Pending sync"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.badge}>
        <Text style={styles.badgeTxt}>{item.pendingSync ? "⟳" : "OK"}</Text>
      </View>
    </View>

)}
/>

// ============================================================================
// SNIPPET 6: Add Pending Badge Styles to StyleSheet
// ============================================================================

const styles = StyleSheet.create({
// ... existing styles ...

pendingBadge: {
flexDirection: "row",
alignItems: "center",
backgroundColor: "rgba(245, 158, 11, 0.1)",
paddingHorizontal: 8,
paddingVertical: 4,
borderRadius: 6,
borderColor: "#f59e0b",
borderWidth: 1,
marginTop: 8,
gap: 4,
},
pendingText: {
fontSize: 12,
color: "#f59e0b",
fontWeight: "600",
},
});

// ============================================================================
// SNIPPET 7: Add Sync Queue Icon to Navigation Header
// ============================================================================

// In app/(foreman-stack)/\_layout.tsx or your navigation config:

import { SyncQueueIcon } from "@/components/OfflineStatus";

export default function ForemanStackLayout() {
return (
<Stack>
{/_ ... existing screens ... _/}
<Stack.Screen
name="scan"
options={{
          title: "Scan Attendance",
          headerRight: () => <SyncQueueIcon />,
        }}
/>
<Stack.Screen
name="home"
options={{
          title: "Foreman Home",
          headerRight: () => <SyncQueueIcon />,
        }}
/>

      {/* Add sync-queue screen to navigation */}
      <Stack.Screen
        name="sync-queue"
        options={{
          title: "Sync Queue",
          presentation: "modal",
        }}
      />
    </Stack>

);
}

// ============================================================================
// SNIPPET 8: Handle Refresh with Merged Data
// ============================================================================

const refresh = useCallback(
async (mode: "initial" | "pull" | "manual" = "manual") => {
if (!siteId || !dateISO) return;

    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);

    setError(null);
    try {
      const res = await apiForemanDay(siteId, dateISO);

      // Merge local pending scans with server scans
      const merged = await mergeScans(res.day.scans, siteId, dateISO);

      const dayWithMerged = {
        ...res.day,
        scans: merged,
      };

      setDay(dayWithMerged);
      setReason(dayWithMerged.foremanFlagReason ?? "");
      setNote(dayWithMerged.foremanNote ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load day.");
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "pull") setRefreshing(false);
    }

},
[siteId, dateISO],
);

// ============================================================================
// SNIPPET 9: Open Sync Queue from Button
// ============================================================================

import { useRouter } from "expo-router";

export default function ForemanHome() {
const router = useRouter();

const handleViewQueue = () => {
router.push("/(foreman-stack)/sync-queue");
};

return (
<View>
{/_ ... other content ... _/}
<Pressable style={styles.button} onPress={handleViewQueue}>
<Ionicons name="cloud-upload-outline" size={20} color="#fff" />
<Text style={styles.buttonText}>View Sync Queue</Text>
</Pressable>
</View>
);
}

// ============================================================================
// SNIPPET 10: Test Offline Mode (Dev)
// ============================================================================

// In your app's development settings or debug menu, add:

import { getCurrentNetworkStatus, forceSyncNow } from "@/lib/offline/sync";

export function DebugMenu() {
const currentStatus = getCurrentNetworkStatus();

const handleForceSyncNow = async () => {
console.log("Forcing sync...");
await forceSyncNow();
console.log("Sync triggered");
};

return (
<View style={styles.debugMenu}>
<Text>Network: {currentStatus}</Text>
<Pressable onPress={handleForceSyncNow}>
<Text>Force Sync</Text>
</Pressable>
</View>
);
}

// ============================================================================
// SNIPPET 11: Check Offline Stats in Debug
// ============================================================================

import { useOfflineStats } from "@/lib/offline/hooks";

export function DebugStats() {
const { stats, loading } = useOfflineStats();

if (loading || !stats) return <Text>Loading...</Text>;

return (
<View>
<Text>Queue Pending: {stats.queue.pending}</Text>
<Text>Queue Done: {stats.queue.done}</Text>
<Text>Queue Failed: {stats.queue.failed}</Text>
<Text>Local Scans Pending: {stats.scans.pending}</Text>
<Text>Local Scans Synced: {stats.scans.synced}</Text>
</View>
);
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/\*\*

- EXAMPLE 1: Full Day Screen Integration
  \*/

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { OfflineBanner } from "@/components/OfflineStatus";
import { useNetworkStatus } from "@/lib/offline/hooks";
import { mergeScans } from "@/lib/offline/merge";
import type { MergedScan } from "@/lib/offline/merge";

export default function DayScreen() {
const networkStatus = useNetworkStatus();
const [scans, setScans] = useState<MergedScan[]>([]);

useEffect(() => {
const loadDay = async () => {
const res = await apiForemanDay(siteId, dateISO);
const merged = await mergeScans(res.day.scans, siteId, dateISO);
setScans(merged);
};

    loadDay();

}, [siteId, dateISO]);

return (
<AuthStyleBackground>
{networkStatus === "offline" && <OfflineBanner />}
<ScrollView>
<FlatList
data={scans}
keyExtractor={(s) => s.id}
renderItem={({ item }) => (
<View>
<Text>{item.employee.fullName}</Text>
{item.pendingSync && <Text style={styles.pending}>⟳ Pending</Text>}
</View>
)}
/>
</ScrollView>
</AuthStyleBackground>
);
}

/\*\*

- EXAMPLE 2: Minimal Integration (Scan Screen)
  \*/

import { OfflineBanner } from "@/components/OfflineStatus";
import { useNetworkStatus } from "@/lib/offline/hooks";

export default function ScanScreen() {
const networkStatus = useNetworkStatus();

return (
<AuthStyleBackground>
{networkStatus === "offline" && <OfflineBanner />}
{/_ ... existing scan UI ... _/}
</AuthStyleBackground>
);
}

/\*\*

- EXAMPLE 3: With Sync Queue Navigation
  \*/

import { useRouter } from "expo-router";
import { SyncQueueIcon } from "@/components/OfflineStatus";

// In navigation config
export default function ForemanLayout() {
return (
<Stack>
<Stack.Screen
name="home"
options={{
          headerRight: () => <SyncQueueIcon />,
        }}
/>
<Stack.Screen name="sync-queue" />
</Stack>
);
}
