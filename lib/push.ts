import Constants from "expo-constants";
import * as Device from "expo-device";
import type { Notification, NotificationResponse } from "expo-notifications";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Global handler: show alerts by default
// Wrapped in try-catch for Expo Go compatibility (SDK 53+ removed push support)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // Newer Expo SDKs include these iOS presentation options
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (error) {
  console.warn("Notifications not available (Expo Go limitation):", error);
}

export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  try {
    // Only attempt push registration on physical devices
    if (!Device.isDevice) {
      console.log("Push notifications require a physical device.");
      return null;
    }

    // Android 13+ only displays the permission prompt after a channel exists.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    // Get existing permissions status
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Ask for permissions if not already granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted.");
      return null;
    }

    // Get Expo push token (requires EAS projectId in newer SDKs)
    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;

    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse?.data ?? (tokenResponse as any)?.token;

    if (!token) {
      console.warn("Failed to obtain Expo push token.");
      return null;
    }

    return token;
  } catch (err) {
    console.warn("Error registering for push notifications", err);
    return null;
  }
}

export function setupNotificationListeners(
  onOpen: (data: any) => void,
): () => void {
  let receivedSub: Notifications.Subscription | null = null;
  let responseSub: Notifications.Subscription | null = null;

  try {
    // Optional: listen when a notification is received while app is foregrounded
    receivedSub = Notifications.addNotificationReceivedListener(
      (_notification: Notification) => {
        // You can surface in-app UI here if needed in future.
      },
    );

    // Fired when user taps on a notification
    responseSub = Notifications.addNotificationResponseReceivedListener(
      (response: NotificationResponse) => {
        try {
          const data = response.notification.request.content
            .data as unknown as any;
          if (onOpen && data) {
            onOpen(data);
          }
        } catch (err) {
          console.warn("Error handling notification response", err);
        }
      },
    );
  } catch (error) {
    console.warn(
      "Notification listeners not available (Expo Go limitation):",
      error,
    );
  }

  return () => {
    if (receivedSub) {
      // Latest expo-notifications subscriptions expose a .remove() method
      receivedSub.remove();
      receivedSub = null;
    }
    if (responseSub) {
      responseSub.remove();
      responseSub = null;
    }
  };
}

// Site Day Photo Reminder Notification
// Scheduled for 12 AM (midnight) to remind foreman to take site day photo

const SITE_PHOTO_NOTIFICATION_ID = "site-day-photo-reminder";

/**
 * Schedule a local notification at midnight (12 AM) to remind foreman to take site day photo.
 * Only schedules if foreman has scanned workers for the day.
 * @param siteName - Name of the site to include in notification
 */
export async function scheduleSiteDayPhotoReminder(
  siteName: string,
): Promise<string | null> {
  try {
    // Cancel any existing scheduled notification first
    await cancelSiteDayPhotoReminder();

    // Calculate time until midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Set to next midnight

    const secondsUntilMidnight = Math.floor(
      (midnight.getTime() - now.getTime()) / 1000,
    );

    // Don't schedule if it's already past midnight or very close
    if (secondsUntilMidnight <= 60) {
      console.log("Too close to midnight, not scheduling notification");
      return null;
    }

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Site Day Photo Reminder",
        body: `Don't forget to upload a site day photo for ${siteName}`,
        data: {
          type: "site-day-photo-reminder",
          siteName,
        },
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilMidnight,
        repeats: false,
      },
      identifier: SITE_PHOTO_NOTIFICATION_ID,
    });

    console.log(
      `Scheduled site day photo reminder for ${siteName} in ${secondsUntilMidnight} seconds`,
    );
    return identifier;
  } catch (error) {
    console.warn("Failed to schedule site day photo reminder:", error);
    return null;
  }
}

/**
 * Cancel any scheduled site day photo reminder notification.
 */
export async function cancelSiteDayPhotoReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(
      SITE_PHOTO_NOTIFICATION_ID,
    );
  } catch (error) {
    // Notification may not exist, which is fine
    console.warn("Failed to cancel site day photo reminder:", error);
  }
}

/**
 * Check if a site day photo reminder is already scheduled.
 */
export async function isSiteDayPhotoReminderScheduled(): Promise<boolean> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some((n) => n.identifier === SITE_PHOTO_NOTIFICATION_ID);
  } catch (error) {
    console.warn("Failed to check scheduled notifications:", error);
    return false;
  }
}
