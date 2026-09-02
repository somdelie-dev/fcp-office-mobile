import type { Ionicons } from "@expo/vector-icons";

export type TutorialTopic = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  accent: string;
  steps: string[];
};

// Short how-to steps per topic, built from the existing ForemanTutorial
// walkthrough and the Help screen FAQs so the wording stays consistent
// across the app.
export const TUTORIAL_TOPICS: TutorialTopic[] = [
  {
    id: "login",
    icon: "log-in",
    title: "How to log in",
    accent: "#22c55e",
    steps: [
      "Open the app to the Sign In screen.",
      "Enter your email address and password.",
      "Tap Sign In.",
      "You'll be taken to your Home screen once your account is verified.",
    ],
  },
  {
    id: "home",
    icon: "home",
    title: "Understanding your Home screen",
    accent: "#22c55e",
    steps: [
      "Check today's date and your assigned site at the top.",
      "Review the quick stats: how many team members are scanned in and scanned out.",
      "Look for any alerts, such as a site photo request, and tap to open them.",
      "Pull down to refresh if the numbers look out of date.",
    ],
  },
  {
    id: "scan",
    icon: "qr-code",
    title: "How to scan a guy's attendance",
    accent: "#22c55e",
    steps: [
      "Open the Scan tab and confirm the correct site is selected.",
      "Point the camera at the guy's QR code.",
      "Wait for the beep and green confirmation - the scan is recorded automatically.",
      "Keep scanning as more workers arrive; the count updates in real time.",
      "Submit the batch when you're done, or let it sync automatically once you're online.",
    ],
  },
  {
    id: "scan-out",
    icon: "exit",
    title: "How to scan a guy out",
    accent: "#ef4444",
    steps: [
      "Tap Scan Out Guys on the Home screen when workers are leaving site.",
      "Confirm the site, then choose Face Scan Out or Photo Scan Out (whichever your site has enabled).",
      "For Face Scan Out, point the camera at the worker's face and hold still until it's verified.",
      "For Photo Scan Out, take a clear photo to confirm the exit.",
      "Open the Scan Outs tab anytime to see who left, when, and which method was used.",
    ],
  },
  {
    id: "team",
    icon: "people",
    title: "Managing your team",
    accent: "#a78bfa",
    steps: [
      "Open the Team tab to see everyone assigned to your site.",
      "Search by name or personnel code to find a specific guy.",
      "Check each worker's status: Missing (needs a face profile), Pending (under review), or Recognised (verified and ready).",
      "Tap + Add New Guy to add someone newly assigned to the site.",
    ],
  },
  {
    id: "face-setup",
    icon: "person-circle",
    title: "Setting up face recognition",
    accent: "#0ea5e9",
    steps: [
      "Open the worker's profile from the Team tab.",
      "Check the Reference Photos card - it shows how many of the 5 angles (Front, Left, Right, Smile, Neutral) are captured.",
      "Tap the capture button and follow the on-screen prompt for each pose.",
      "Hold still once a face is detected - the photo captures automatically.",
      "Once all 5 photos are saved, the worker's status moves from Missing to Pending review, then Recognised once approved.",
    ],
  },
  {
    id: "timesheets",
    icon: "document-text",
    title: "Tracking Attendance",
    accent: "#f59e0b",
    steps: [
      "Open the Timesheets tab to see fortnightly pay periods.",
      "Each entry shows the date range, status, days worked, and wages.",
      "Tap a timesheet to see the full day-by-day breakdown.",
      "Use the date filter to find an older pay period.",
    ],
  },
  {
    id: "photos",
    icon: "camera",
    title: "Taking site day photos",
    accent: "#14b8a6",
    steps: [
      "Watch for a photo request alert on the Home screen.",
      "Tap the alert to open the request.",
      "Take a clear photo of the site in good lighting.",
      "The photo uploads automatically, even if you're offline - it will send once you're back online.",
    ],
  },
  {
    id: "offline",
    icon: "cloud-offline",
    title: "Working without signal",
    accent: "#6366f1",
    steps: [
      "Keep scanning and recording data as normal - no internet is required.",
      "Everything is saved locally on your phone.",
      "Once you're back online, the app syncs automatically.",
      "You can check what's waiting to sync from the Sync Queue in Settings.",
    ],
  },
  {
    id: "password",
    icon: "key",
    title: "Changing your password",
    accent: "#ec4899",
    steps: [
      "Password changes can't be done inside the mobile app for security reasons.",
      "Go to the web portal to change your password, or",
      "Contact your supervisor for help.",
    ],
  },
];
