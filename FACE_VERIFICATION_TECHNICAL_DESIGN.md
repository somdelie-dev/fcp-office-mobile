# Face Verification — Technical Design

Status: Phases 1-3 implemented (2026-08-03), pending real-device validation
Supersedes: `FACE_RECOGNITION_ROADMAP.md` (kept for history; this document reflects the
decisions actually validated against the current codebase and deployment)
Related: `FACE_SCANNER_DOCUMENTATION.md` (UI-only, still accurate for Phase 1 components)

## 0. Implementation status (2026-08-03)

Phase 0 (`face-service` spike) validated on-device with a real phone capture
(enroll qualityScore=0.995). Phases 1-3 below have since been implemented in
code but **not yet exercised end-to-end against a real employee enrollment +
scan-out on device** — that's the next thing to actually try.

Done:
- Schema: `FaceEnrollment`, `FaceVerificationAttempt`, `AttendanceScan.scanOutFaceMatchScore`
  — additive migration `20260803141346_add_face_verification`, applied via
  `prisma migrate deploy` (not `migrate dev`, see note below), no data touched.
- `lib/faceVerifier.ts` (fcp-timesheet-app) — `FaceVerifier` interface + HTTP client.
- Enrollment: `POST/GET /api/app/foreman/employees/[id]/face-enrollments`,
  admin `POST /api/app/admin/face-enrollments/[id]/{approve,reject}`, pending
  face enrollments surfaced in the existing Daily Exception Dashboard query
  (`/api/app/admin/daily-exceptions`) alongside fingerprint's.
- Real verification wired into the **existing** `POST /api/app/attendance/scan-out-face`
  endpoint (not a new endpoint — that route's own Phase-1 comment already
  called this out as the intended seam). Falls back to Phase-1 cosmetic
  behavior whenever there's no image, no approved enrollments, or
  face-service errors — verification never blocks attendance.
- Phase 3 first-cut liveness: single-frame head-turn heuristic
  (`face-service/src/services/liveness.ts`), direction-agnostic, downgrades
  a scan to `PENDING_REVIEW` on failure rather than blocking it.
- office-app: real `enroll-face` capture screen (5 poses), real camera
  capture wired into `scan-out-face` (replacing the old cosmetic-only mock),
  "Enroll Face" button added next to "Scan Out (Face)".

Known gaps / not done:
- **No admin UI** for approving enrollments — only the API routes exist,
  same maturity level fingerprint approval is currently at (it also has no
  approve/reject UI, only a read-only dashboard listing).
- Confidence thresholds (§8) are still the untuned placeholder bands.
- Offline scanning still explicitly out of scope (§7) — unchanged.
- `face-service` still runs the WASM TF backend, not `tfjs-node` — fine for
  Phase 0/2 validation, worth revisiting for production latency later.
- A pre-existing, unrelated bug was found in this repo's migration history:
  `prisma migrate dev` cannot run at all right now because an old migration
  (`20260420_add_photo_rejected_notification_type`) fails to replay against
  a fresh shadow database (`NotificationType` type ordering issue). Worked
  around here via `prisma migrate diff` (live DB → schema, no shadow db) +
  manually-placed migration folder + `prisma migrate deploy`, but the
  underlying shadow-db issue is still there for the *next* schema change
  and should get fixed properly rather than worked around again.

## 1. Problem framing

FCP already has a working attendance system with a mock face scanner bolted onto the
front end. This document defines what's needed to replace the mock with a real
verification engine, without redesigning attendance itself.

**This is a 1:1 verification system, not a 1:N identification system.** The foreman
always selects the employee first — the face-scan route is nested under the
employee's own record
(`office-app/app/(foreman-stack)/workers/[id]/scan-out-face/index.tsx`). The question
the system answers is only ever *"is this the employee already selected?"*, never
*"who is this, out of everyone?"*. That eliminates the need for a vector database,
ANN search, or pgvector at any realistic FCP scale (comparison is against one
employee's handful of enrolled embeddings, not the whole workforce).

## 2. Decisions locked in

| Decision | Choice | Why |
|---|---|---|
| Matching mode | 1:1 (against selected employee only) | Enforced by existing routing; dramatically simpler and faster than 1:N |
| Recognition runtime | Node.js + ONNX Runtime (ArcFace-family model) | `fcp-timesheet-app/Dockerfile` confirms VPS/Docker deployment, not serverless — no reason to introduce Python |
| Service boundary | Separate `face-service` container, called by Next.js | Keeps a loaded-in-RAM model process isolated from the web app's request lifecycle |
| Embedding storage | `Float[]` column, linear cosine-similarity scan | At hundreds of employees × ~5 embeddings each, an index is unnecessary complexity |
| Enrollment cardinality | Multiple embeddings per employee (target 5: front/left/right + 2 free) | Site conditions vary (hard hats, PPE, lighting) — a single reference image is fragile |
| Verification/consumer boundary | `FaceVerifier` interface | Attendance code calls `verify()`/`enroll()` without knowing the model/provider underneath |
| Offline scanning (v1) | **Not supported** — see §7 | Real offline biometric sync (on-device model, conflict handling) is a separate project; out of scope for v1 |

## 3. What already exists (reuse, don't rebuild)

- **Attendance is already wired for this**: `AttendanceScan.scanOutMethod` already has a
  `FACE` value (`ScanOutMethod` enum, schema.prisma:1372-1376), and
  `AttendanceScan.verificationStatus` (`AttendanceVerificationStatus`: `VERIFIED |
  PENDING_REVIEW | REJECTED`, schema.prisma:1366-1370) already exists as a nullable
  field on the scan row. Face verification needs to *populate* these, not add new ones.
- **The enrollment/approval lifecycle pattern** comes from `FingerprintEnrollment`
  (schema.prisma:709-744): `PENDING_APPROVAL → APPROVED/REJECTED`, foreman-enrolled
  (`enrolledByForemanId`), admin-approved (`approvedByUserId`, `approvedAt`), with
  `rejectedReason`. This is the shape to mirror for `FaceEnrollment` — **but note the
  cardinality is different**: `FingerprintEnrollment.employeeId` is `@unique` (one
  record per employee, because it's really just "OS sensor enrollment happened"),
  whereas `FaceEnrollment` needs to be one-to-many (multiple reference images per
  employee), so it's a new relation shape, not a literal schema copy.
- **`Employee.faceImageUrl`** (schema.prisma:143) already exists as "optional face
  photo used for admin verification later" — this predates the current effort and
  should be left alone / treated as legacy display data, not repurposed as the
  embedding source.
- **The scanner UI** (`office-app/components/FaceScanner/*`,
  `scan-out-face/index.tsx`) is a complete Phase 1 mock — state machine, animations,
  employee card, success screen. Phase 2+ replaces the mock timers with real calls;
  the UI shell itself does not need to be rebuilt.
- **The client already has a full offline queue engine** —
  `office-app/lib/offline/{storage,queue,sync}.ts` (SQLite-backed `LocalScan.syncStatus:
  pending|synced|failed`, `QueueItemStatus`, NetInfo-driven sync with backoff). This is
  directly relevant to §7 and means "sync state" already has an established
  client-side representation — it should not be re-invented as a server-side enum.

## 4. Schema changes

```prisma
model FaceEnrollment {
  id String @id @default(cuid())

  employeeId String
  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  pose       FaceEnrollmentPose
  imageUrl   String
  embedding  Float[]
  qualityScore Float?

  // Capture-condition metadata — not used for matching. Purely explanatory,
  // so an admin reviewing a poorly-performing enrollment can see *why*
  // ("all five photos indoors, no hard hat") instead of guessing.
  helmetDetected        Boolean?
  safetyGlassesDetected Boolean?
  lightingCondition     String?

  status FaceEnrollmentStatus @default(PENDING_APPROVAL)

  enrolledByForemanId String
  enrolledByForeman   Foreman  @relation(fields: [enrolledByForemanId], references: [id])
  enrolledAt          DateTime @default(now())
  device              String?
  latitude            Float?
  longitude           Float?

  approvedByUserId String?
  approvedByUser   User?     @relation("FaceEnrollmentApprovedBy", fields: [approvedByUserId], references: [id], onDelete: SetNull)
  approvedAt       DateTime?
  rejectedReason   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  attempts FaceVerificationAttempt[]

  @@index([employeeId])
  @@index([status])
}

enum FaceEnrollmentStatus {
  PENDING_APPROVAL
  APPROVED
  REJECTED
}

enum FaceEnrollmentPose {
  FRONT
  LEFT
  RIGHT
  SMILE
  NEUTRAL
}

// Audit log — one row per verification attempt (not just the winning one).
// Attendance is payroll data; AttendanceScan stores only the final outcome,
// this table keeps the evidence trail for disputes, threshold tuning, and
// debugging without cluttering the scan row itself.
model FaceVerificationAttempt {
  id String @id @default(cuid())

  attendanceScanId String?
  attendanceScan   AttendanceScan? @relation(fields: [attendanceScanId], references: [id], onDelete: SetNull)

  employeeId String
  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  matchedEnrollmentId String?
  matchedEnrollment   FaceEnrollment? @relation(fields: [matchedEnrollmentId], references: [id], onDelete: SetNull)

  confidence        Float
  livenessPassed    Boolean?
  processingTimeMs  Int?

  createdAt DateTime @default(now())

  @@index([attendanceScanId])
  @@index([employeeId])
  @@index([createdAt])
}
```

`Employee` gains: `faceEnrollments FaceEnrollment[]` and
`faceVerificationAttempts FaceVerificationAttempt[]`.

`AttendanceScan` gains two things (everything else it needs already exists):

```prisma
scanOutFaceMatchScore Float?                      // confidence of the winning attempt, 0-1
faceVerificationAttempts FaceVerificationAttempt[] // full attempt history for this scan
```

No changes to `AttendanceVerificationStatus` or `ScanOutMethod` — both already cover
this case.

**Naming precedent followed**: `FaceEnrollmentStatus` mirrors
`FingerprintEnrollmentStatus` (schema.prisma:1360-1364) and `PhotoVerificationStatus`
(schema.prisma:1334-1339) exactly (`PENDING_APPROVAL/APPROVED/REJECTED` — no invented
new vocabulary).

**Migration approach — additive only, no reset.** Every change here is a new table or
a nullable/defaulted column, mirroring how the fingerprint work was shipped
("additive only", schema.prisma:702-707) — existing `AttendanceScan`/`Employee` rows
are unaffected. This should ship as a normal forward migration
(`prisma migrate dev --name add_face_verification` or the deploy-time equivalent),
never `prisma migrate reset` — there is no reason this feature should touch existing
data in Neon at all.

## 5. Service architecture

```
Expo App (office-app)
   │  capture photo (expo-camera) + on-device liveness prompt
   ▼
Next.js API (fcp-timesheet-app)  — /api/attendance/verify-face
   │  loads employee's APPROVED FaceEnrollment rows
   │  forwards captured image + those embeddings
   ▼
face-service (new Docker container: Node + onnxruntime-node)
   │  detect + align face → generate embedding
   │  cosine-compare against each supplied embedding
   │  return { matched: boolean, confidence: number, bestEnrollmentId }
   ▼
Next.js writes AttendanceScan.verificationStatus / scanOutFaceMatchScore
```

`face-service` is internal-only (no public ingress) — reachable from `fcp-timesheet-app`
on the Docker network only. It holds the ONNX model loaded in memory for the life of
the container; a request does inference only, no model load, keeping latency low
enough for a foreman scanning workers back-to-back.

**`face-service` HTTP contract** — defined as a real internal API from day one, even
though `fcp-timesheet-app` is its only caller initially. Going through HTTP (rather
than Next.js calling into the ONNX runtime in-process) is what makes it possible to
later swap the model, add monitoring, or scale to multiple instances without touching
caller code:

```
POST /enroll
  body: { images: Buffer[] }
  → { results: { embedding: number[]; qualityScore: number }[] }

POST /verify
  body: { image: Buffer; candidateEmbeddings: number[][] }
  → { confidence: number; bestIndex: number; processingTimeMs: number }

GET /health
  → { status: "ok"; modelLoaded: boolean }
```

**Provider abstraction** (Next.js side, not the service itself):

```ts
interface FaceVerifier {
  enroll(images: EnrollmentImage[]): Promise<{ embedding: number[]; qualityScore: number }[]>;
  verify(image: Buffer, candidateEmbeddings: number[][]): Promise<{ confidence: number; bestIndex: number }>;
}
```

Attendance/enrollment code depends on this interface, not on `face-service` HTTP
details directly — swapping the model or moving inference on-device later doesn't
touch calling code.

## 6. Sequences

**Enrollment**

```
Foreman opens Employee → Enroll Face
  → capture 5 photos (front/left/right/smile/neutral)
  → upload to Next.js → FaceVerifier.enroll()
  → face-service returns embedding + qualityScore per image
  → create 5 FaceEnrollment rows, status=PENDING_APPROVAL
  → admin reviews (reuses the same review surface pattern as fingerprint approval)
  → APPROVED rows become eligible for verification; REJECTED are excluded
```

**Verification (scan-out)**

```
Employee already selected (workers/[id])
  → camera opens → on-device liveness prompt (random: blink / turn left / turn right)
  → liveness passes → capture frame
  → POST /api/attendance/verify-face { employeeId, image }
  → Next.js loads that employee's APPROVED FaceEnrollment embeddings
  → face-service compares captured frame against each, returns highest confidence
  → decision banding (see §8) → AttendanceScan updated
  → foreman sees only: Scanning… / ✓ Verified (confidence) / Manual Review needed
```

## 7. Offline handling — open scope decision, not assumed-solved

Sync state and verification-result state are different concerns and should **stay**
different — but the correct home for sync state is the **existing client-side queue**
(`LocalScan.syncStatus`, `QueueItemStatus` in `office-app/lib/offline/*`), not a new
server-side `AttendanceSyncStatus` enum. A server `AttendanceScan` row is only ever
created once a scan has reached the backend, so "pending upload" has no server-side
representation to add — it's inherently pre-arrival, client-only state.

**However**: that offline queue is not currently wired into either the GPS scan flow
(`enqueueScan`/`enqueueBulkScan` exist but aren't called from `scan.tsx`) or the face
scan-out screen (no offline handling at all today). "Capture offline, verify when
back online" is therefore not a small addition on top of existing plumbing — it means
either:

- (a) finishing the offline-queue wiring that the *regular* scan flow doesn't have
  either, as a prerequisite, or
- (b) scoping face verification as **online-only for v1**: if the device has no
  connectivity, the scan-out screen falls back to the existing photo/manual scan-out
  method (already supported via `ScanOutMethod.PHOTO`), and face verification is
  simply not offered until connectivity returns.

Recommendation: **(b) for v1**. It's consistent with "verification, not
identification" — keep scope tight, ship it, and revisit offline capture only if it
turns out to matter in practice.

## 8. Confidence thresholds

Placeholder bands, to be tuned against real site photos (PPE, outdoor lighting, hard
hats) before launch — do not ship textbook defaults untested:

| Confidence | Outcome |
|---|---|
| ≥ 0.90 | `VERIFIED` |
| 0.75 – 0.90 | `PENDING_REVIEW` |
| < 0.75 | `REJECTED` (foreman may fall back to manual/photo scan-out) |

`scanOutFaceMatchScore` stores the raw score regardless of band, so thresholds can be
retuned later without losing historical data to reconstruct against.

## 9. Liveness (Phase 3, not a v1 blocker)

Random (not user-chosen) challenge before capture: blink, or turn left/right. Purpose
is specifically to defeat "hold up a phone/printed photo" — the cheapest real attack
against this system. Full active-liveness sequencing (timing windows, retry UX under
poor site lighting) is real effort; a cheaper first cut (require a short video clip
instead of a still + basic glare/moiré heuristic) can ship first if the full version
slips.

## 10. Security & data handling

- Face images and embeddings are sensitive personal data — same handling bar as the
  fingerprint system: enrollment requires approval before it's usable for matching
  (`PENDING_APPROVAL` rows are inert), and rejection/removal of an employee cascades
  (`onDelete: Cascade`, matching the `FingerprintEnrollment` pattern).
- `face-service` must not be reachable from outside the Docker network — it has no
  auth of its own by design; Next.js is the only caller and is the trust boundary.
- Confirm the current VPS orchestration mechanism (Coolify/Dokploy/compose/manual)
  before adding the container, so it's actually started, networked, and restarted
  the same way the rest of the stack is — not a manually-run container nobody's
  watchtower/CI touches.

## 11. Failure & fallback scenarios

- `face-service` unreachable/errors → verification is skipped, scan proceeds via
  existing photo/manual scan-out (`ScanOutMethod.PHOTO`); never block attendance on
  a biometric failure, consistent with how fingerprint enrollment is documented to
  "never block attendance" (schema.prisma:705-707).
- Employee has zero `APPROVED` enrollments → face option isn't offered; foreman uses
  existing scan-out methods.
- Repeated low-confidence attempts → falls to `PENDING_REVIEW`/manual scan, reviewed
  through the existing `AttendanceScanReview` mechanism (schema.prisma:749-765) —
  no new review surface needed.

## 12. Migration from the current mock

`scan-out-face/index.tsx`'s mock timers are replaced with: real camera capture →
liveness prompt → `POST /api/attendance/verify-face` → real state transitions. Given
this affects live attendance/payroll data, roll out behind a per-site opt-in flag,
matching the existing convention already used for supervisor self-authentication
("site opt-in only", schema.prisma:647) rather than enabling globally on deploy.

## 13. Phasing

| Phase | Scope |
|---|---|
| 0 | **Proof of concept — no schema changes, no enrollment UI.** Run the candidate ONNX model against 20–30 real employee photos (not stock test faces). Measure: verification latency, confidence distribution, behavior with hard hats/PPE/safety glasses, behavior in outdoor/site lighting. Gate: only proceed to Phase 1 once the model clears usable accuracy/latency on *this* population — building the full enrollment workflow first, then discovering the model needs different preprocessing, is the expensive order to do it in. |
| 1 | `FaceEnrollment` + `FaceVerificationAttempt` schema + migration (additive only, see §4), enrollment capture UI, approval workflow reusing fingerprint's review pattern |
| 2 | `face-service` container with the `/enroll` `/verify` `/health` contract (§5), ONNX model integration, `FaceVerifier` interface, `/api/attendance/verify-face`, wire real scanner UI |
| 3 | Liveness (random blink/turn challenge), anti-spoof checks |
| 4 | Admin review tooling, confidence history, re-enrollment suggestions from high-confidence attendance photos |

Rollout after Phase 2/3 land: enable per-site (§12), not globally — pilot site, ~2
weeks of feedback, adjust §8's thresholds against real results, then expand.

## 14. Open questions before Phase 1 starts

1. Who supplies the 20–30 real employee photos (PPE/lighting variety) for the Phase 0 POC, and what's the pass/fail bar for moving past it?
2. Confirm current VPS orchestration mechanism, so `face-service` is added the same way, not bolted on separately.
3. Confirm §7's online-only v1 scoping is acceptable, or offline queue wiring gets pulled forward as a prerequisite.
4. Per-site opt-in mechanism for face verification — does this reuse an existing site-settings flag, or need a new one?

(§8's threshold tuning is folded into Phase 0/pilot rather than listed separately —
it's the direct output of the POC and the pilot rollout, not a standalone decision.)
