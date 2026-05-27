# Supervisor Timesheets - Expo App Integration Guide

## Overview

The supervisor timesheet system has two main operations:

1. **List Timesheets** - View all timesheets for your supervised foremen
2. **View Details & Take Actions** - Review individual timesheets and approve/reject/mark as paid

---

## Current Issue

The endpoint `/api/app/supervisor/timesheets/{id}` returns valid structure but with an **empty `rows` array**, causing no employee data to display in the supervisor's timesheet detail view.

**Note**: The list endpoint `GET /api/app/supervisor/timesheets?period=2026-01-31_2026-02-13` works correctly and returns proper data (200 in 6.1s). The detail endpoint should use **the same data joining/population logic** to fill the `rows` array.

## API Endpoints

### 1. GET /api/app/supervisor/timesheets (List View)

**Purpose:** Fetch list of all supervisor's timesheets with filters

**URL:** `GET /api/app/supervisor/timesheets`

**Query Parameters:**

```
period=YYYY-MM-DD_YYYY-MM-DD  (optional, default: current fortnight)
q=foreman-name                 (optional, search by foreman name)
status=ALL|SUBMITTED|APPROVED|REJECTED|PAID  (optional, default: ALL)
```

**Example:**

```
GET /api/app/supervisor/timesheets?period=2026-01-31_2026-02-13&status=SUBMITTED
```

**Authentication:** Bearer token with SUPERVISOR role

**Response (200 OK):**

```json
{
  "timesheets": [
    {
      "id": "2026-01-31_2026-02-13__foreman-abc123",
      "startISO": "2026-01-31",
      "endISO": "2026-02-13",
      "foreman": {
        "id": "foreman-abc123",
        "name": "John Smith"
      },
      "status": "SUBMITTED",
      "sites": [
        {
          "id": "site-1",
          "code": "S1",
          "name": "Main Site"
        }
      ],
      "totalWorkerDays": 45,
      "totalWorkerWages": 1350.5
    }
  ]
}
```

---

### 2. GET /api/app/supervisor/timesheets/{id} (Detail View)

**Purpose:** Fetch complete timesheet with 14-day attendance grid and all employee attendance records

**URL:** `GET /api/app/supervisor/timesheets/{id}`

**Path Parameter:**

```
id = YYYY-MM-DD_YYYY-MM-DD__foreman-id
Example: 2026-01-31_2026-02-13__foreman-abc123
```

**Authentication:** Bearer token with SUPERVISOR role

**Response (200 OK):**

```json
{
  "timesheet": {
    "id": "2026-01-31_2026-02-13__foreman-abc123",
    "startISO": "2026-01-31",
    "endISO": "2026-02-13",
    "status": "SUBMITTED",
    "foreman": {
      "id": "foreman-abc123",
      "name": "John Smith"
    },
    "supervisor": {
      "id": "supervisor-xyz",
      "name": "Jane Doe"
    },
    "sites": [
      {
        "id": "site-1",
        "code": "S1",
        "name": "Main Site"
      }
    ],
    "columns": [
      { "iso": "2026-01-31", "day": "Sat" },
      { "iso": "2026-02-01", "day": "Sun" },
      { "iso": "2026-02-02", "day": "Mon" },
      { "iso": "2026-02-03", "day": "Tue" },
      { "iso": "2026-02-04", "day": "Wed" },
      { "iso": "2026-02-05", "day": "Thu" },
      { "iso": "2026-02-06", "day": "Fri" },
      { "iso": "2026-02-07", "day": "Sat" },
      { "iso": "2026-02-08", "day": "Sun" },
      { "iso": "2026-02-09", "day": "Mon" },
      { "iso": "2026-02-10", "day": "Tue" },
      { "iso": "2026-02-11", "day": "Wed" },
      { "iso": "2026-02-12", "day": "Thu" },
      { "iso": "2026-02-13", "day": "Fri" }
    ],
    "rows": [
      {
        "employeeId": "emp-1",
        "fullName": "Alice Johnson",
        "dayRate": 100,
        "present": [
          true,
          true,
          false,
          true,
          true,
          true,
          true,
          true,
          false,
          true,
          true,
          true,
          true,
          true
        ],
        "daysWorked": 12,
        "pay": 1200
      },
      {
        "employeeId": "emp-2",
        "fullName": "Bob Martinez",
        "dayRate": 120,
        "present": [
          true,
          false,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          false,
          true,
          true,
          true
        ],
        "daysWorked": 12,
        "pay": 1440
      }
    ],
    "totals": {
      "totalDays": 24,
      "totalPay": 2640
    }
  }
}
```

**Key Notes:**

- **`columns`**: Array of exactly 14 dates spanning from start (Saturday) to end (Friday)
  - Index 0-6: Week 1 (Sat-Fri)
  - Index 7-13: Week 2 (Sat-Fri)

- **`rows`**: Array of all employees who worked during the fortnight period
  - **Ordered alphabetically by `fullName`** for consistency
  - Each employee must have worked at least once during the period

- **`present`**: Boolean array of length 14 matching column order exactly
  - `present[i]` corresponds to `columns[i]` date
  - `true` = employee has a scan record for that day
  - `false` = employee has no scan record for that day

- **`daysWorked`**: Count of `true` values in `present` array
  - Calculated as: `present.filter(p => p).length`

- **`pay`**: Total compensation for the fortnight
  - Calculated as: `daysWorked × dayRate`

- **`totals`**: Aggregated summary across all employees
  - `totalDays`: Sum of all `daysWorked` across all rows
  - `totalPay`: Sum of all `pay` across all rows

---

### 3. POST /api/app/supervisor/timesheets/{id}/approve (Approve)

**Purpose:** Approve a submitted timesheet

**URL:** `POST /api/app/supervisor/timesheets/{id}/approve`

**Path Parameter:**

```
id = YYYY-MM-DD_YYYY-MM-DD__foreman-id
```

**Authentication:** Bearer token with SUPERVISOR role

**Body:** Empty or null

**Response (200 OK):**

```json
{
  "ok": true,
  "status": "APPROVED",
  "approvedAt": "2026-02-06T10:30:00Z"
}
```

**Error Responses:**

- `400`: Wrong status (only SUBMITTED can be approved)
- `403`: Forbidden (not supervisor of this foreman)
- `404`: Timesheet not found

---

### 4. POST /api/app/supervisor/timesheets/{id}/reject (Reject)

**Purpose:** Reject a submitted timesheet

**URL:** `POST /api/app/supervisor/timesheets/{id}/reject`

**Path Parameter:**

```
id = YYYY-MM-DD_YYYY-MM-DD__foreman-id
```

**Authentication:** Bearer token with SUPERVISOR role

**Body:**

```json
{
  "reason": "Attendance records don't match site reports"
}
```

**Response (200 OK):**

```json
{
  "ok": true,
  "status": "REJECTED",
  "rejectedAt": "2026-02-06T10:35:00Z"
}
```

**Error Responses:**

- `400`: Wrong status (only SUBMITTED can be rejected)
- `403`: Forbidden (not supervisor of this foreman)
- `404`: Timesheet not found

---

### 5. POST /api/app/supervisor/timesheets/{id}/paid (Mark as Paid)

**Purpose:** Mark an approved timesheet as paid

**URL:** `POST /api/app/supervisor/timesheets/{id}/paid`

**Path Parameter:**

```
id = YYYY-MM-DD_YYYY-MM-DD__foreman-id
```

**Authentication:** Bearer token with SUPERVISOR role

**Body:** Empty or null

**Response (200 OK):**

```json
{
  "ok": true,
  "status": "PAID",
  "paidAt": "2026-02-06T11:00:00Z"
}
```

**Error Responses:**

- `400`: Wrong status (only APPROVED can be marked as paid)
- `403`: Forbidden (not supervisor of this foreman)
- `404`: Timesheet not found

---

## Backend Implementation Requirements

### Issue: Empty `rows` Array in Detail Endpoint

**Current Problem:** The endpoint returns a valid response structure but with an **empty `rows` array**, causing no employee data to display in the supervisor's timesheet detail view.

**Root Cause:** The backend is not properly joining and aggregating attendance scan data for the employees.

### Solution: Populate rows with Employee Attendance Data

The backend must execute the following logic:

#### Step 1: Parse the timesheet ID

Extract `startISO`, `endISO`, and `foremanId` from the path parameter `id`

#### Step 2: Query Employees for the Foreman

Retrieve all employees who have **work assignments or scan records** for the foreman during the fortnight period.

**Data needed per employee:**

- `employeeId` (from employee record)
- `fullName` (from employee record)
- `dayRate` (from scan records or employee profile)

#### Step 3: Query Attendance Scans

For each employee in the fortnight period, count scans by date to determine presence.

#### Step 4: Build the `present` Boolean Array

Create a boolean array of length 14 by iterating through `columns` dates:

```
For each column date:
  If employee has a scan record on that date → true
  Else → false

Result: present = [true, false, true, ..., true]  (14 values)
```

#### Step 5: Calculate Per-Employee Totals

```
daysWorked = present.filter(p => p).length
pay = daysWorked × dayRate
```

#### Step 6: Calculate Grand Totals

```
totalDays = sum(all employee daysWorked)
totalPay = sum(all employee pay)
```

#### Step 7: Sort & Return

Order employees alphabetically by `fullName`, then return in response.

### Data Schema References

| Table           | Columns Needed                                  |
| --------------- | ----------------------------------------------- |
| Employee        | `id`, `firstName`, `lastName`, `defaultDayRate` |
| AttendanceScan  | `employeeId`, `dayRateAtScan`                   |
| SiteDay         | `workDate`, `foremanId`                         |
| TimesheetPeriod | `startDate`, `endDate`                          |

**Important Notes:**

- Use UTC dates throughout
- `dayRate` priority: Use `dayRateAtScan` if available, fallback to `employee.defaultDayRate`
- Only include employees with at least one scan during the period
- Handle case where no employees have scans gracefully (empty `rows` array is valid)

### Testing Checklist

- ✅ Test with employee who has 14 days of scans → `daysWorked = 14`, `present` all true
- ✅ Test with employee who has 0 scans → `daysWorked = 0`, `present` all false
- ✅ Test with employee who has partial scans → `daysWorked = n`, `present` has mixed true/false
- ✅ Test with multiple employees → `rows` has correct length
- ✅ Verify `present.length === 14` for all rows
- ✅ Verify `totals.totalDays === sum(rows[*].daysWorked)`
- ✅ Verify `totals.totalPay === sum(rows[*].pay)`
- ✅ Verify employees ordered alphabetically by `fullName`

---

## Frontend App Usage

The mobile app calls these endpoints from:

- **File**: [lib/apiClient.ts](lib/apiClient.ts)
- **Base URL**: `/api/app/supervisor/timesheets`

The responses are displayed in:

- **List View**: [app/(supervisor-stack)/timesheets.tsx](<app/(supervisor-stack)/timesheets.tsx>)
- **Detail View**: [app/(supervisor-stack)/timesheets/[id].tsx](<app/(supervisor-stack)/timesheets/[id].tsx>)
  - Shows employee table with 2-week attendance grid (Saturday-Friday)
  - Color-coded: Orange (#fef3e2) for days, Green (#e8f5e9) for pay totals, Navy (#262D68) for totals row
  - Handles empty `rows` array gracefully with "No Employee Data" message

---

## Summary Table

| Operation       | Method | Endpoint                                      | Parameters        |
| --------------- | ------ | --------------------------------------------- | ----------------- |
| List timesheets | GET    | `/api/app/supervisor/timesheets`              | period, q, status |
| View detail     | GET    | `/api/app/supervisor/timesheets/{id}`         | -                 |
| Approve         | POST   | `/api/app/supervisor/timesheets/{id}/approve` | -                 |
| Reject          | POST   | `/api/app/supervisor/timesheets/{id}/reject`  | reason            |
| Mark paid       | POST   | `/api/app/supervisor/timesheets/{id}/paid`    | -                 |
