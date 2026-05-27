# Office App - Application Documentation

**Version**: 1.0.0  
**Last Updated**: February 15, 2026  
**Platform**: iOS & Android (React Native / Expo)

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [User Roles](#user-roles)
4. [Application Structure](#application-structure)
5. [Screen Reference](#screen-reference)
6. [Technical Specifications](#technical-specifications)
7. [Offline Capabilities](#offline-capabilities)

---

## Overview

Office App is a comprehensive **workforce management mobile application** designed for construction and field-based businesses. The app enables real-time **attendance tracking via QR code scanning**, **timesheet management**, **worker management**, and **multi-level approval workflows**.

The application supports **offline-first functionality**, ensuring field workers can continue operations even without network connectivity. Data automatically syncs when connection is restored.

---

## Key Features

### 🎯 Core Capabilities

| Feature                  | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| **QR Code Attendance**   | Scan worker QR codes to record check-in/check-out times        |
| **Timesheet Management** | Track hours, calculate pay, manage fortnight-based pay periods |
| **Worker Management**    | Add, edit, and manage employee profiles with day rates         |
| **Site Management**      | Organize work across multiple job sites                        |
| **Multi-Role Access**    | Role-based access control for different user types             |
| **Approval Workflow**    | Submit → Approve → Mark Paid workflow for timesheets           |
| **Offline Support**      | Full offline functionality with automatic sync                 |
| **Photo Documentation**  | Capture site photos for daily records                          |
| **Push Notifications**   | Real-time alerts for approvals and updates                     |

### 📊 Dashboard & Reporting

- Real-time attendance statistics
- Weekly/fortnightly attendance charts
- Employee count and site metrics
- Pending approvals overview

---

## User Roles

The application supports **four distinct user roles**, each with specific permissions and screens:

### 1. Administrator (Admin)

**Access Level**: Full system access

| Capability           | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| Dashboard Metrics    | View company-wide statistics (employees, sites, foremen, supervisors) |
| Weekly Attendance    | Monitor attendance trends across all sites                            |
| Timesheet Management | Review and manage all timesheets                                      |
| Worker Management    | Full CRUD operations on employee profiles                             |
| Site Management      | Configure and manage work sites                                       |
| System Settings      | App configuration and preferences                                     |

---

### 2. Supervisor

**Access Level**: Regional/team oversight

| Capability          | Description                                 |
| ------------------- | ------------------------------------------- |
| Timesheet Approvals | Approve, reject, or mark timesheets as paid |
| Team Oversight      | Monitor foremen and their teams             |
| Site Monitoring     | View site details and attendance            |
| Reports             | Generate reports on attendance and payments |
| Photo Review        | Review site photos submitted by foremen     |

---

### 3. Foreman

**Access Level**: Field operations

| Capability           | Description                           |
| -------------------- | ------------------------------------- |
| QR Code Scanning     | Scan worker badges for attendance     |
| Daily Attendance     | View and manage daily worker lists    |
| Worker Management    | Add new workers, edit profiles        |
| Timesheet Submission | Submit timesheets for approval        |
| Site Day Photos      | Capture and upload daily site photos  |
| Offline Operations   | Full functionality without network    |
| Sync Queue           | Monitor and manage pending sync items |

---

### 4. Assistant

**Access Level**: Support operations for foremen

| Capability          | Description                        |
| ------------------- | ---------------------------------- |
| Attendance Scanning | Scan on behalf of assigned foremen |
| History             | View past scanning activity        |
| Profile             | Manage personal settings           |

---

## Application Structure

### Screen Count Summary

| Category           | Screen Count |
| ------------------ | ------------ |
| **Total Screens**  | **34**       |
| Layout Files       | 9            |
| Admin Screens      | 7            |
| Supervisor Screens | 10           |
| Foreman Screens    | 12           |
| Assistant Screens  | 3            |
| Common Screens     | 2            |

---

## Screen Reference

### Common Screens

| Screen | Path               | Description                             |
| ------ | ------------------ | --------------------------------------- |
| Login  | `login.tsx`        | User authentication with email/password |
| Index  | `(tabs)/index.tsx` | Initial routing based on user role      |

---

### Administrator Screens

#### Main Navigation (Tab Bar)

| Screen     | Path                     | Description                                                  |
| ---------- | ------------------------ | ------------------------------------------------------------ |
| Home       | `(admin)/home.tsx`       | Dashboard with metrics, weekly attendance chart, quick stats |
| Sites      | `(admin)/sites.tsx`      | List and manage work sites                                   |
| Timesheets | `(admin)/timesheets.tsx` | View all timesheets with status filtering                    |
| Workers    | `(admin)/workers.tsx`    | Employee directory with search and filtering                 |
| Settings   | `(admin)/settings.tsx`   | App preferences and configuration                            |

#### Detail Screens (Stack Navigation)

| Screen            | Path                                | Description                                |
| ----------------- | ----------------------------------- | ------------------------------------------ |
| Site Details      | `(admin-stack)/sites/[id].tsx`      | Individual site information and statistics |
| Timesheet Details | `(admin-stack)/timesheets/[id].tsx` | Detailed timesheet view with line items    |

---

### Supervisor Screens

#### Main Navigation (Tab Bar)

| Screen     | Path                          | Description                                       |
| ---------- | ----------------------------- | ------------------------------------------------- |
| Home       | `(supervisor)/home.tsx`       | Dashboard with pending approvals summary          |
| Approvals  | `(supervisor)/approvals.tsx`  | Timesheet approval workflow (approve/reject/paid) |
| Sites      | `(supervisor)/sites.tsx`      | Sites under supervision                           |
| Timesheets | `(supervisor)/timesheets.tsx` | Timesheet listing with status filters             |
| Reports    | `(supervisor)/reports.tsx`    | Attendance and payment reports                    |

#### Detail Screens (Stack Navigation)

| Screen            | Path                                     | Description                       |
| ----------------- | ---------------------------------------- | --------------------------------- |
| Foremen           | `(supervisor-stack)/foremen.tsx`         | List of foremen under supervision |
| Photos            | `(supervisor-stack)/photos.tsx`          | Site photo gallery                |
| Site Details      | `(supervisor-stack)/sites/[id].tsx`      | Individual site details           |
| Timesheet Details | `(supervisor-stack)/timesheets/[id].tsx` | Detailed timesheet review         |

---

### Foreman Screens

#### Main Navigation (Tab Bar)

| Screen     | Path                       | Description                                                |
| ---------- | -------------------------- | ---------------------------------------------------------- |
| Home       | `(foreman)/home.tsx`       | Today's overview, site selection, daily attendance summary |
| Scan       | `(foreman)/scan.tsx`       | QR code scanner for attendance check-in/check-out          |
| Workers    | `(foreman)/workers.tsx`    | Worker directory for assigned site                         |
| Timesheets | `(foreman)/timesheets.tsx` | Submit and track timesheets                                |
| History    | `(foreman)/history.tsx`    | Past attendance records                                    |

#### Detail Screens (Stack Navigation)

| Screen            | Path                                     | Description                          |
| ----------------- | ---------------------------------------- | ------------------------------------ |
| Day Details       | `(foreman-stack)/day/[key].tsx`          | Detailed view of a specific work day |
| Profile           | `(foreman-stack)/profile.tsx`            | User profile and settings            |
| Site Day Photos   | `(foreman-stack)/SiteDayPhotoScreen.tsx` | Capture/view photos for a site day   |
| Sync Queue        | `(foreman-stack)/sync-queue.tsx`         | View and manage offline sync queue   |
| Timesheet Details | `(foreman-stack)/timesheets/[id].tsx`    | Individual timesheet view            |
| Worker Details    | `(foreman-stack)/workers/[id].tsx`       | Employee profile view                |
| Edit Worker       | `(foreman-stack)/workers/edit.tsx`       | Modify worker information            |
| New Worker        | `(foreman-stack)/workers/new.tsx`        | Add new employee                     |

---

### Assistant Screens

#### Main Navigation (Tab Bar)

| Screen  | Path                      | Description                       |
| ------- | ------------------------- | --------------------------------- |
| Home    | `(assistant)/home.tsx`    | Select foreman and begin scanning |
| History | `(assistant)/history.tsx` | View past scanning sessions       |
| Profile | `(assistant)/profile.tsx` | Personal settings and preferences |

---

## Technical Specifications

### Technology Stack

| Component            | Technology                        |
| -------------------- | --------------------------------- |
| **Framework**        | React Native with Expo SDK 54     |
| **Language**         | TypeScript                        |
| **Navigation**       | Expo Router (file-based routing)  |
| **State Management** | React Context + Zustand stores    |
| **Local Database**   | Expo SQLite                       |
| **Styling**          | StyleSheet (React Native)         |
| **Icons**            | Lucide React Native, Ionicons     |
| **Camera**           | Expo Camera                       |
| **Audio**            | Expo Audio (scan feedback sounds) |
| **Notifications**    | Expo Notifications                |

### Supported Platforms

| Platform | Minimum Version             |
| -------- | --------------------------- |
| iOS      | 13.0+                       |
| Android  | API Level 21 (Android 5.0)+ |

### Key Dependencies

```
expo: ~54.0.33
react: 19.1.0
react-native: 0.81.5
expo-router: ~6.0.22
expo-sqlite: ~16.0.10
expo-camera: ~17.0.10
expo-notifications: ~0.32.16
```

---

## Offline Capabilities

The application implements a **robust offline-first architecture** specifically designed for field operations where network connectivity is unreliable.

### Supported Offline Operations

| Operation              | Description                       |
| ---------------------- | --------------------------------- |
| ✅ Attendance Scanning | Single and bulk QR code scans     |
| ✅ Delete Scans        | Remove incorrect scan entries     |
| ✅ Day Notes           | Add notes to daily records        |
| ✅ Ready Toggle        | Mark days as ready for submission |

### Sync Features

| Feature                  | Description                                 |
| ------------------------ | ------------------------------------------- |
| **Auto-Sync**            | Background sync every 2 seconds when online |
| **Network Detection**    | Automatic online/offline status detection   |
| **Exponential Backoff**  | Smart retry logic (1s → 30s intervals)      |
| **Conflict Resolution**  | Server-truth merge strategy                 |
| **Duplicate Prevention** | Handles 409 conflicts gracefully            |
| **Queue Management**     | Visual sync queue with pending count        |

### Offline UI Indicators

- **Offline Banner**: Displays "Offline" status when disconnected
- **Pending Sync Badge**: Shows count of items waiting to sync
- **Sync Queue Screen**: Debug screen for viewing queue status

---

## User Interface

### Design System

- **Theme Support**: Light and Dark mode
- **Glass Card Design**: Modern translucent card components
- **Gradient Backgrounds**: Role-specific color schemes
- **Responsive Layout**: Adapts to various screen sizes

### Navigation Pattern

| Type                     | Implementation                          |
| ------------------------ | --------------------------------------- |
| **Primary Navigation**   | Bottom Tab Bar (5 tabs per role)        |
| **Secondary Navigation** | Stack Navigation for detail screens     |
| **Modals**               | In-app modal overlays for quick actions |

---

## Security

| Feature               | Description                      |
| --------------------- | -------------------------------- |
| **Authentication**    | Email/password login             |
| **Secure Storage**    | Expo SecureStore for credentials |
| **Role-Based Access** | Server-enforced permissions      |
| **Token Management**  | Automatic token refresh          |

---

## Getting Started

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start

# Run on Android
pnpm android

# Run on iOS
pnpm ios
```

### Development Build

```bash
# Create development build for Android
eas build --platform android --profile development

# Create development build for iOS
eas build --platform ios --profile development
```

---

## Support

For technical support or feature requests, please contact your system administrator or the development team.

---

_Document generated for Office App v1.0.0_
