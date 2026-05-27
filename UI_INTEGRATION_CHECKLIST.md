# UI Integration Checklist

This checklist guides you through adding offline support to the foreman screens step-by-step.

---

## Phase 1: Core Infrastructure (Already Done ✅)

- [x] Create `lib/offline/storage.ts` - SQLite persistence
- [x] Create `lib/offline/queue.ts` - Queue operations
- [x] Create `lib/offline/sync.ts` - Network detection + sync loop
- [x] Create `lib/offline/hooks.ts` - React hooks
- [x] Create `lib/offline/merge.ts` - Data merge utility
- [x] Create `components/OfflineStatus.tsx` - Offline banner component
- [x] Create `app/(foreman-stack)/sync-queue.tsx` - Debug screen
- [x] Update `lib/api.ts` - Route mutations through queue
- [x] Update `lib/auth.tsx` - Initialize sync engine

**Status**: ✅ COMPLETE - All files created and updated

---

## Phase 2: Navigation Setup (~15 minutes)

### File: `app/(foreman-stack)/_layout.tsx`

**Action 1: Ensure sync-queue screen is in navigation**

```tsx
import { Stack } from "expo-router";

export default function ForemanStackLayout() {
  return (
    <Stack>
      {/* ... existing screens ... */}

      {/* ADD THIS: */}
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
```

**Status**: [ ] TODO

---

**Action 2: Add SyncQueueIcon to header (optional for all screens)**

```tsx
import { SyncQueueIcon } from "@/components/OfflineStatus";

export default function ForemanStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="home"
        options={{
          title: "Foreman Home",
          headerRight: () => <SyncQueueIcon />,
        }}
      />

      <Stack.Screen
        name="scan"
        options={{
          title: "Scan Attendance",
          headerRight: () => <SyncQueueIcon />,
        }}
      />

      {/* ... add to other foreman screens ... */}
    </Stack>
  );
}
```

**Status**: [ ] TODO

---

## Phase 3: Scan Screen Integration (~30 minutes)

### File: `app/(foreman)/scan.tsx`

**Action 1: Add imports at top**

```tsx
// Add these imports:
import { OfflineBanner } from "@/components/OfflineStatus";
import { useNetworkStatus } from "@/lib/offline/hooks";
import { mergeScans } from "@/lib/offline/merge";
import type { MergedScan } from "@/lib/offline/merge";
```

**Status**: [ ] TODO

---

**Action 2: Add network status hook in component**

```tsx
export default function ForemanScan() {
  // ... existing state ...

  // ADD THIS:
  const networkStatus = useNetworkStatus();

  // ... rest of component ...
}
```

**Status**: [ ] TODO

---

**Action 3: Add offline banner at top of screen**

Find the `return` statement and add banner:

```tsx
return (
  <AuthStyleBackground>
    {/* ADD THIS: */}
    {networkStatus === "offline" && <OfflineBanner />}

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ... existing content ... */}
    </ScrollView>
  </AuthStyleBackground>
);
```

**Status**: [ ] TODO

---

**Action 4: Show pending badges on server scans list**

Find the "Saved Today (server)" FlatList and update the `renderItem`:

```tsx
<FlatList
  data={serverScans}
  keyExtractor={(i) => i.id}
  scrollEnabled={false}
  contentContainerStyle={{ paddingBottom: 20 }}
  renderItem={({ item }) => (
    <Pressable
      onLongPress={() => onDeleteServerScan(item)}
      style={styles.scanRow}
    >
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.scanName} numberOfLines={1}>
          {item.employee.fullName}
        </Text>
        <Text style={styles.scanMeta}>
          {item.employee.code} •{" "}
          {new Date(item.scannedAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>

        {/* ADD THIS: Show pending badge if locally created */}
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
    </Pressable>
  )}
/>
```

**Status**: [ ] TODO

---

**Action 5: Add pending badge styles to StyleSheet**

Find `const styles = StyleSheet.create({` and add:

```tsx
const styles = StyleSheet.create({
  // ... existing styles ...

  // ADD THESE:
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
```

**Status**: [ ] TODO

---

## Phase 4: Day Details Screen Integration (~30 minutes)

### File: `app/(foreman-stack)/day/[key].tsx`

**Action 1: Add imports**

```tsx
import { OfflineBanner } from "@/components/OfflineStatus";
import { useNetworkStatus } from "@/lib/offline/hooks";
import { mergeScans } from "@/lib/offline/merge";
import type { MergedScan } from "@/lib/offline/merge";
```

**Status**: [ ] TODO

---

**Action 2: Add network status hook**

```tsx
export default function ForemanDayDetails() {
  // ... existing state ...

  // ADD THIS:
  const networkStatus = useNetworkStatus();

  // ... rest of component ...
}
```

**Status**: [ ] TODO

---

**Action 3: Merge scans in refresh callback**

Find the `refresh` callback and update the try block:

```tsx
const refresh = useCallback(
  async (mode: "initial" | "pull" | "manual" = "manual") => {
    if (!siteId || !dateISO) return;

    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);

    setError(null);
    try {
      const res = await apiForemanDay(siteId, dateISO);

      // ADD THIS: Merge local pending scans with server scans
      const merged = await mergeScans(res.day.scans, siteId, dateISO);
      const dayWithMerged = {
        ...res.day,
        scans: merged,
      };

      // Use dayWithMerged instead of res.day:
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
```

**Status**: [ ] TODO

---

**Action 4: Add offline banner at top of screen**

Find the `return` statement and add:

```tsx
return (
  <AuthStyleBackground>
    {/* ADD THIS: */}
    {networkStatus === "offline" && <OfflineBanner />}

    <ScrollView>{/* ... existing content ... */}</ScrollView>
  </AuthStyleBackground>
);
```

**Status**: [ ] TODO

---

**Action 5: Show pending badges on scans**

Find the scans FlatList and add to renderItem:

```tsx
<FlatList
  data={day?.scans ?? []}
  keyExtractor={(item) => item.id}
  scrollEnabled={false}
  renderItem={({ item }) => (
    <Pressable style={styles.scanRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.scanName}>{item.employee.fullName}</Text>
        <Text style={styles.scanMeta}>
          {item.employee.code} • {new Date(item.scannedAt).toLocaleTimeString()}
        </Text>

        {/* ADD THIS: Show pending if local scan */}
        {item.pendingSync && (
          <View style={styles.pendingBadge}>
            <Ionicons name="cloud-upload-outline" size={14} color="#f59e0b" />
            <Text style={styles.pendingText}>
              {item.syncStatus === "failed" ? "Sync failed" : "Pending sync"}
            </Text>
          </View>
        )}
      </View>

      {/* ... existing badge ... */}
    </Pressable>
  )}
/>
```

**Status**: [ ] TODO

---

**Action 6: Add styles**

```tsx
const styles = StyleSheet.create({
  // ... existing styles ...

  // ADD THESE:
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
```

**Status**: [ ] TODO

---

## Phase 5: Testing (~30 minutes)

### Offline Mode Test

- [ ] Close app and disable network (toggle WiFi/mobile data)
- [ ] Open app and navigate to Scan screen
- [ ] Verify "Offline" banner appears at top
- [ ] Scan an employee card (should work offline)
- [ ] Verify scan appears in list with "⟳ Pending sync" badge
- [ ] Navigate to sync queue (via banner tap or header icon)
- [ ] Verify scan appears in queue with "pending" status
- [ ] Enable network
- [ ] Watch sync happen automatically (item moves to "done")
- [ ] Verify "Pending sync" badge disappears from list

### Online Mode Test

- [ ] With network enabled, refresh day screen
- [ ] Scan should not appear (not created offline, no badge needed)

### Other Foreman Screens Test

- [ ] Check scan appears on scan screen: ✅
- [ ] Check scan appears on day details screen: [ ]
- [ ] Check scan appears on home screen (if scan list shown): [ ]
- [ ] Check offline banner shows on all foreman screens: [ ]

---

## Phase 6: Additional Screens (Optional)

If other screens show scans or foreman mutations:

### File: `app/(foreman-stack)/profile.tsx` [Optional]

- [ ] Add offline banner if shows day data

### File: `app/(foreman-stack)/timesheets/[id].tsx` [Optional]

- [ ] Add offline banner if editable
- [ ] If has mutations, merge data appropriately

### File: `app/(foreman-stack)/workers/[id].tsx` [Optional]

- [ ] Add offline banner if editable

---

## Phase 7: Verification

### Run Checklist

- [ ] App starts without errors
- [ ] Offline banner appears/disappears based on network
- [ ] Can navigate to sync queue screen
- [ ] Scan appears in queue when offline
- [ ] Queue items show in sync queue screen
- [ ] Sync happens automatically when online
- [ ] Pending badges disappear after sync
- [ ] All TypeScript types compile without errors
- [ ] No console errors or warnings

### Device Testing

- [ ] Tested on Android emulator: [ ]
- [ ] Tested on iOS simulator (if applicable): [ ]
- [ ] Test with slow network (simulate in DevTools): [ ]
- [ ] Test network toggle (on/off/on/off multiple times): [ ]

---

## Summary

**Total estimated integration time**: 1.5–2 hours

### By Phase:

- Phase 1 (Core): ✅ Done (0 hours)
- Phase 2 (Navigation): ~15 min
- Phase 3 (Scan Screen): ~30 min
- Phase 4 (Day Screen): ~30 min
- Phase 5 (Testing): ~30 min
- Phase 6 (Other screens): ~15 min (optional)
- Phase 7 (Verification): ~15 min

**Next step**: Start with Phase 2 (Navigation Setup)

---

## Need Help?

Refer to:

- **Code snippets**: [OFFLINE_SNIPPETS.md](OFFLINE_SNIPPETS.md)
- **Full architecture**: [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md)
- **Integration guide**: [OFFLINE_INTEGRATION.md](OFFLINE_INTEGRATION.md)
- **Types reference**: [OFFLINE_TYPES_AND_EXPORTS.md](OFFLINE_TYPES_AND_EXPORTS.md)
