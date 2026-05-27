# Fortnight Anchor Configuration - Admin Setup Instructions

## Overview

These instructions help you set up an admin interface to configure the fortnight anchor date at the start of each year or pay cycle.

## Backend API Endpoint Setup

### 1. Create the API Route (Next.js)

Create a new file: `pages/api/admin/fortnight-config.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import {
  validateFortnightAnchor,
  formatFortnightAnchor,
} from "@/lib/fortnightAdmin";

type ResponseData = {
  success: boolean;
  message: string;
  anchorISO?: string;
  dayName?: string;
  formattedDate?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {
  // Check admin authorization
  // const user = await getAuthUser(req);
  // if (!user || user.role !== "ADMIN") {
  //   return res.status(403).json({ success: false, message: "Unauthorized" });
  // }

  if (req.method === "POST") {
    const { dateISO } = req.body;

    if (!dateISO) {
      return res.status(400).json({
        success: false,
        message: "dateISO is required",
      });
    }

    // Validate the date
    const validation = validateFortnightAnchor(dateISO);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    // Save to database or environment
    // await saveFrtnightAnchor(validation.anchorISO);
    // Or update environment variable:
    // process.env.FORTNIGHT_ANCHOR_ISO = validation.anchorISO;

    return res.status(200).json({
      success: true,
      message: validation.message,
      anchorISO: validation.anchorISO,
      dayName: validation.dayName,
      formattedDate: formatFortnightAnchor(validation.anchorISO),
    });
  }

  if (req.method === "GET") {
    // Return current anchor date
    const currentAnchor = process.env.FORTNIGHT_ANCHOR_ISO || "2026-01-31";

    return res.status(200).json({
      success: true,
      message: "Current fortnight anchor",
      anchorISO: currentAnchor,
      dayName: new Date(`${currentAnchor}T00:00:00`).toLocaleDateString(
        "en-ZA",
        { weekday: "long" },
      ),
      formattedDate: formatFortnightAnchor(currentAnchor),
    });
  }

  return res.status(405).json({
    success: false,
    message: "Method not allowed",
  });
}
```

### 2. Database Setup (Optional but Recommended)

Store the configuration in your database for persistence:

```prisma
// schema.prisma
model FortnightConfig {
  id          String   @id @default(cuid())
  anchorISO   String   @unique
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String   // admin user ID

  @@index([createdAt])
}
```

Then update your API to save/load from the database:

```typescript
// Update the POST handler to save to database
const config = await db.fortnightConfig.create({
  data: {
    anchorISO: validation.anchorISO,
    description: req.body.description,
    createdBy: user.id,
  },
});

// Update the GET handler to load from database
const config = await db.fortnightConfig.findFirst({
  orderBy: { createdAt: "desc" },
});
```

### 3. Update Environment or Constants

After setting the anchor, ensure it's used by:

- Mobile app: `lib/fortnight.ts` constant
- Backend: All timesheet generation using the same anchor

### 4. Admin UI Component (React/Next.js)

Create a component for admins to set the fortnight:

```typescript
// components/admin/FortnightAnchorConfig.tsx
import { useState } from "react";

export function FortnightAnchorConfig() {
  const [dateInput, setDateInput] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/fortnight-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateISO: dateInput }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message);
      } else {
        setResult(data);
        setDateInput(""); // Clear input on success
      }
    } catch (err) {
      setError(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px" }}>
      <h2>Configure Fortnight Anchor</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "10px" }}>
          <label>
            Select Saturday Start Date:
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              required
            />
          </label>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Set Fortnight Anchor"}
        </button>
      </form>

      {error && <div style={{ color: "red", marginTop: "10px" }}>{error}</div>}

      {result && (
        <div style={{ color: "green", marginTop: "10px" }}>
          <p><strong>Success!</strong></p>
          <p>Anchor Date: {result.formattedDate}</p>
          <p>Day: {result.dayName}</p>
          <p>ISO: {result.anchorISO}</p>
          <p style={{ fontSize: "12px", color: "#666" }}>{result.message}</p>
        </div>
      )}
    </div>
  );
}
```

## Usage Flow

1. **Admin navigates to settings** → Fortnight Configuration
2. **Selects a date** (any day, but preferably Saturday)
3. **System validates**:
   - If it's a Saturday: accepts it
   - If not: auto-adjusts to nearest Saturday and shows the change
4. **Confirmation shown** with formatted date and day name
5. **System updates**:
   - Database record
   - Environment variable (for immediate use)
   - Both mobile and backend use this anchor for all fortnight calculations

## Security Considerations

- ✅ Require ADMIN role authorization
- ✅ Log all anchor changes with timestamp and admin user
- ✅ Prevent accidental changes by showing confirmation
- ✅ Validate date format and ensure it's a valid date
- ✅ Consider adding rate limiting to this endpoint

## Testing

```bash
# Test the endpoint
curl -X POST http://localhost:3000/api/admin/fortnight-config \
  -H "Content-Type: application/json" \
  -d '{"dateISO": "2026-02-07"}'

# Response should auto-correct to nearest Saturday:
# {
#   "success": true,
#   "message": "2026-02-07 is not a Saturday. Using nearest Saturday: 2026-02-07",
#   "anchorISO": "2026-02-07",
#   "dayName": "Saturday",
#   "formattedDate": "Saturday, 7 February 2026"
# }
```

That's it! Admins can now easily configure the fortnight anchor date.
