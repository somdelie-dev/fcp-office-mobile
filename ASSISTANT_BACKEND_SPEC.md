# Assistant Site Day Photo - Backend Changes Required

## Problem

Assistants cannot take site day photos because the backend returns **403 Forbidden** with "You are not assigned to this site" error.

**Failing endpoints:**

- `GET /api/app/foreman/day?siteId={siteId}&dateISO={dateISO}` → 403
- `POST /api/app/foreman/day/ensure` → 403
- `POST /api/app/foreman/site-day-photos` → 403 (upload)

## Current Frontend Behavior

The mobile app sends an `x-acting-foreman-id` header with all requests when an assistant is acting on behalf of a foreman:

```http
GET /api/app/foreman/day?siteId=abc123&dateISO=2026-02-26
Authorization: Bearer <assistant_token>
x-acting-foreman-id: foreman-xyz789
```

## Required Backend Changes

### 1. Update Site Assignment Check Logic

**Current logic (pseudo-code):**

```python
def check_site_access(user, site_id):
    if site_id not in user.assigned_sites:
        raise ForbiddenError("You are not assigned to this site")
```

**New logic:**

```python
def check_site_access(request, user, site_id):
    # If user is an assistant with x-acting-foreman-id header
    acting_foreman_id = request.headers.get("x-acting-foreman-id")

    if acting_foreman_id and user.is_assistant:
        # Verify assistant can act for this foreman
        if acting_foreman_id not in user.available_foremen_ids:
            raise ForbiddenError("You cannot act for this foreman")

        # Check if the FOREMAN (not assistant) is assigned to the site
        foreman = get_user(acting_foreman_id)
        if site_id not in foreman.assigned_sites:
            raise ForbiddenError("Foreman is not assigned to this site")

        return True

    # Default: check user's own assignments
    if site_id not in user.assigned_sites:
        raise ForbiddenError("You are not assigned to this site")

    return True
```

### 2. Affected Endpoints

Update authorisation logic for these endpoints:

| Endpoint                                  | Method | Description               |
| ----------------------------------------- | ------ | ------------------------- |
| `/api/app/foreman/day`                    | GET    | Get site day details      |
| `/api/app/foreman/day/ensure`             | POST   | Create SiteDay if missing |
| `/api/app/foreman/site-day-photos`        | POST   | Upload site day photo     |
| `/api/app/foreman/site-day-photos/{id}`   | DELETE | Delete site day photo     |
| `/api/app/foreman/site-day-photos/recent` | GET    | Get recent photos         |

### 3. Validation Requirements

When `x-acting-foreman-id` is present:

1. **Verify the requester is an assistant** - Must have `availableForemen` set and non-empty
2. **Verify the acting foreman is in their list** - `acting_foreman_id` must exist in user's `availableForemen`
3. **Use foreman's site assignments** - Check site access against the foreman, not the assistant
4. **Audit logging** - Log that assistant X performed action Y on behalf of foreman Z

### 4. Example Flow

```
Assistant "Alice" acts for Foreman "Bob"
Bob is assigned to Site "Construction Site A"
Alice is NOT directly assigned to any sites

1. Alice scans employees at "Construction Site A" (this already works via bulk scan)
2. Alice opens Site Photo tab
3. App sends: GET /api/app/foreman/day?siteId=site-a&dateISO=2026-02-26
   Headers: x-acting-foreman-id: bob-123
4. Backend checks:
   - Alice has bob-123 in availableForemen ✓
   - Bob is assigned to site-a ✓
   - Return site day data
5. Alice takes photo, app sends: POST /api/app/foreman/site-day-photos
   Headers: x-acting-foreman-id: bob-123
   Body: { siteId: "site-a", dateISO: "2026-02-26", image: ... }
6. Backend creates photo with:
   - takenBy: alice (the actual user)
   - onBehalfOf: bob (the foreman)
   - site: site-a
```

### 5. Database Considerations

For site day photos taken by assistants, consider storing:

- `uploadedById` - The assistant's user ID
- `onBehalfOfForemanId` - The foreman they were acting for
- This enables proper audit trail and attribution

---

## Testing

Test cases to verify:

1. ✅ Assistant with `x-acting-foreman-id` can access foreman's assigned sites
2. ✅ Assistant without header gets 403 (no sites assigned)
3. ✅ Assistant with invalid foreman ID gets 403
4. ✅ Assistant trying to access site their foreman isn't assigned to gets 403
5. ✅ Regular foreman (no header) works as before
