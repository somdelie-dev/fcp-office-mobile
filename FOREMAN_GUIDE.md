# Foreman User Guide

> A step-by-step guide to using the Office App as a Foreman.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Home Screen](#home-screen)
3. [Scanning Attendance](#scanning-attendance)
4. [Managing Workers](#managing-workers)
5. [Timesheets](#timesheets)
6. [History & Day Details](#history--day-details)
7. [Site Day Photos](#site-day-photos)
8. [Profile & Settings](#profile--settings)
9. [Offline Mode](#offline-mode)
10. [Help & Support](#help--support)

---

## Getting Started

### Logging In

1. Open the app on your phone.
2. Enter your **email** and **password**.
3. Tap **Login**.
4. You will be taken directly to your **Home** screen.

> If you forget your password, contact your administrator to have it reset.

---

## Home Screen

The Home screen is your daily dashboard. It shows:

- A greeting based on the time of day
- Today's date
- Your assigned **site(s)**

### Site Overview

Use the **site dropdown** at the top to switch between your assigned sites. For each site you will see:

| Info            | Description                                               |
| --------------- | --------------------------------------------------------- |
| Workers Scanned | How many workers have been scanned today                  |
| Day Status      | **Pending** / **Submitted** / **Approved** / **Rejected** |
| Flags           | Any issues that need your attention                       |

If there are fresh **photo requests** from your supervisor (within the last hour), they will appear highlighted on this screen so you can respond quickly.

---

## Scanning Attendance

This is your core daily task. Tap the **Scan** tab at the bottom of the screen.

### How to Scan

1. **Select your site** (if you have more than one).
2. Point the camera at a worker's **QR code badge**.
3. The app will beep and vibrate on a successful scan.
4. The worker's name appears in the **Local Batch** list below.
5. Continue scanning all workers present.

### What You'll See On Screen

- **Server Scans** — Workers already synced to the system today.
- **Local Batch** — Workers you've just scanned (waiting to sync).

### Good to Know

- The scanner has a short delay (~1 second) between scans to prevent accidental duplicates.
- If a worker has already been scanned, you'll hear an error sound and the duplicate will be blocked.
- You can **delete** an individual scan from the local batch if you made a mistake.
- Scanning works **offline** — scans are saved locally and will sync automatically when you're back online.

### If You Are an Assistant

If you have an assistant role, you must first **select a foreman** from the modal before you can start scanning. You will be scanning on behalf of that foreman's team.

---

## Managing Workers

Tap the **Workers** tab to see everyone assigned to your site(s).

### Viewing Workers

- Browse the list of workers with their name, employee code, and day rate.
- Use the **search bar** to find workers by name, code, or phone number.
- Tap a worker to see their full details (name, code, phone, day rate, status).

### Adding a New Worker

1. Tap the **+** button.
2. Fill in the required fields:
   - First name
   - Last name
   - Phone number
3. Optionally, take a **photo** of the worker using your camera.
4. Tap **Save**.
5. The employee ID will be generated automatically.

---

## Timesheets

Tap the **Timesheets** tab to view and track pay period records.

### What You'll See

Each timesheet covers a **fortnight** (14-day pay period) and shows:

- Date range (e.g., "1 Mar – 14 Mar")
- Site code and name
- Status badge
- Total worker days
- Total wages

### Timesheet Statuses

| Status        | Meaning                           |
| ------------- | --------------------------------- |
| **Submitted** | Waiting for supervisor review     |
| **Approved**  | Supervisor has approved           |
| **Paid**      | Payment has been processed        |
| **Rejected**  | Needs changes — resubmit required |

### Viewing Timesheet Details

Tap any timesheet to open the detail view:

- A 14-column grid shows each day of the fortnight.
- Each row is a worker with checkmarks for days worked.
- Totals at the bottom show total days and total pay.

### Filtering

Use the **month filter pills** at the top to quickly jump between recent months. The current fortnight always appears first.

---

## History & Day Details

Tap the **History** tab to review past attendance records.

### Browsing History

- By default you see the **last 7 days**. You can switch to **30 days** or **All time**.
- Each entry shows the date, site, number of workers scanned, and day status.
- Flagged days (with issues) are highlighted and shown at the top.
- Recent **site photos** appear as a scrollable strip at the top.

### Day Details

Tap any day to open its full details:

1. **Scan List** — All workers scanned that day, with search and the option to delete individual scans.
2. **Foreman Notes** — Add a note explaining anything unusual. Choose a reason:
   - Extra workers (urgent)
   - Workers moved from another site
   - Subcontractor team
   - Short-staffed / late arrivals
   - Other
3. **Mark as Ready** — When you're done, toggle the day as "Ready to Submit" so your supervisor can review it. You need at least 1 scan before you can submit.

---

## Site Day Photos

You can access site photos from the **Home** screen (via photo requests) or from **History**.

### Responding to Photo Requests

When a supervisor requests a photo:

1. Open the photo request (highlighted in red if fresh).
2. Take a photo using your camera.
3. The photo is compressed automatically and your location is captured.
4. Preview the photo and confirm the upload.

### Photo Request Statuses

| Status        | Meaning                              |
| ------------- | ------------------------------------ |
| **Requested** | Supervisor is waiting for your photo |
| **Verified**  | Photo has been approved              |
| **Flagged**   | Photo needs attention                |
| **Rejected**  | Photo rejected — please retake       |

### Uploading Standalone Photos

You can also upload photos without a request to document your site for the day.

> Photos taken offline are queued and uploaded automatically once you're back online.

---

## Profile & Settings

### Profile

Access from the tab bar or menu. Your profile shows:

- Your name and email
- Your role (Foreman)
- A list of all **sites assigned to you** (searchable by name or job number)

Tap **Logout** to sign out.

### Settings

Accessible from the settings icon:

| Setting           | Options                                            |
| ----------------- | -------------------------------------------------- |
| **Appearance**    | Switch between Dark and Light mode                 |
| **Notifications** | Toggle push notifications, sound, and vibration    |
| **Clear Cache**   | Remove locally stored data (you'll need to reload) |
| **App Info**      | View current app version and build number          |

---

## Offline Mode

The app is built to work on construction sites with unreliable internet. Here's what works offline:

| Feature             | Offline Support   |
| ------------------- | ----------------- |
| Scanning attendance | ✅ Full           |
| Viewing history     | ✅ Cached data    |
| Viewing timesheets  | ✅ Cached data    |
| Uploading photos    | ✅ Queued         |
| Adding workers      | ❌ Needs internet |

### How It Works

- When you're offline, a banner appears at the top of the screen.
- Scans and photos are saved locally in a **sync queue**.
- When internet returns, everything syncs automatically.
- You can check your sync status in **Settings → Sync Queue**, which shows:
  - Total items waiting
  - Items pending
  - Items successfully synced

---

## Help & Support

Tap the **Help** icon to access:

- **FAQ** — 8 common questions with expandable answers covering scanning, photos, offline mode, timesheets, passwords, worker visibility, verification statuses, and site switching.
- **Contact Support** — Quick links to email or call support directly.

---

## Daily Workflow Summary

Here's a typical day using the app:

```
  ┌─────────────────────────────────────┐
  │  1. Open app → Check Home screen    │
  │     See your site and any requests  │
  ├─────────────────────────────────────┤
  │  2. Go to Scan tab                  │
  │     Scan all workers on site        │
  ├─────────────────────────────────────┤
  │  3. Take site photos if requested   │
  │     Respond to supervisor requests  │
  ├─────────────────────────────────────┤
  │  4. Review the day in History       │
  │     Add notes if needed             │
  │     Mark day as "Ready to Submit"   │
  ├─────────────────────────────────────┤
  │  5. Check Timesheets at fortnight   │
  │     end to verify pay records       │
  └─────────────────────────────────────┘
```

---

_If you have any questions not covered here, use the in-app Help section or contact your administrator._
