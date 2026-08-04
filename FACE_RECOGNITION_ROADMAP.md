# Face Recognition Implementation Roadmap

## Overview

This document outlines the phases for implementing a complete face recognition attendance system for the FCP Timesheet app.

---

## Phase 1: UI/Frontend ✅ COMPLETE

**Status**: Done
**Timeline**: Completed
**Deliverables**:

- ✅ Professional scanner UI
- ✅ Animated face guide
- ✅ Employee card display
- ✅ Success animations
- ✅ Navigation integration
- ✅ Dark theme optimized for outdoor use
- ✅ Mock state machine for demo
- ✅ Documentation

**Key Files**:

- `components/FaceScanner/FaceGuide.tsx`
- `components/FaceScanner/ScannerOverlay.tsx`
- `components/FaceScanner/EmployeeCard.tsx`
- `components/FaceScanner/SuccessAnimation.tsx`
- `app/(foreman-stack)/workers/[id]/scan-out-face/index.tsx`

**How to Test**:

1. Navigate to employee details
2. Tap "Scan Out (Face)" button
3. Watch automated demo with state transitions
4. Observe animations at each stage

---

## Phase 2: Face Detection ✅ IMPLEMENTED (needs a native rebuild + device test)

**Status**: Code written, not yet built/tested on a device
**Objective**: Detect if a human face is in the camera frame

**What changed**: `scan-out-face` no longer auto-captures on a fixed
900ms timer. It now uses `react-native-vision-camera` +
`react-native-vision-camera-face-detector` (Google ML Kit) to run real
face detection on every camera frame. The guide only advances to
liveness + capture once a single face is centered, at a workable
distance, and held steady for several consecutive frames — same idea as
Face ID's "hold still" moment. Off-center/too-far/too-close/multiple-face
states show real status copy instead of nothing.

**Key files**:

- `app/(foreman-stack)/workers/[id]/scan-out-face/index.tsx` — real
  detection state machine, `usePhotoOutput().capturePhotoToFile()` for
  the actual verification photo (unchanged: still sent to
  `face-service` for comparison).

**Before this ships**: this pulls in new native modules
(`react-native-vision-camera`, `react-native-vision-camera-face-detector`,
`react-native-nitro-modules`, `react-native-nitro-image`) — run `pnpm
install` then rebuild the dev client (`eas build --profile development`
or `npx expo run:android` / `run:ios`). It will not work in the existing
build until that rebuild happens, and ML Kit face detection needs a
physical device (iOS Simulator doesn't support it).

### Option A: react-native-vision-camera + MLKit (Recommended)

**Pros**:

- ✅ Fastest and most reliable
- ✅ Works on both iOS and Android
- ✅ Real-time performance
- ✅ Advanced features included
- ✅ Active community support

**Cons**:

- Requires native module linking
- Slightly larger bundle size

**Installation**:

```bash
npm install react-native-vision-camera
npx expo prebuild --clean
# Or use EAS Build
eas build --platform ios
eas build --platform android
```

**Implementation**:

```tsx
import { useCameraDevice } from "react-native-vision-camera";
import { useMLKitFrame } from "react-native-vision-camera/ml-kit";

// Inside component
const device = useCameraDevice("front");
const { detectFaces } = useMLKitFrame((result) => {
  if (result.faces.length === 1) {
    // Exactly one face detected
    updateGuideState("detected");
  } else if (result.faces.length > 1) {
    // Multiple faces
    updateGuideState("idle");
  } else {
    // No faces
    updateGuideState("idle");
  }
});
```

### Option B: MediaPipe Face Detection

**Pros**:

- ✅ Lightweight
- ✅ No native compilation needed
- ✅ 99% accuracy
- ✅ Open source

**Cons**:

- Slightly slower than MLKit
- Requires more setup

**Installation**:

```bash
npm install @react-native-ml-kit/face-detection
```

### Option C: TensorFlow Lite + Local Model

**Pros**:

- ✅ Most control
- ✅ Can run completely offline
- ✅ Customizable accuracy

**Cons**:

- More complex setup
- Slower inference time

---

## Phase 3: Image Capture & Backend Recognition 🔄

**Timeline**: 2-3 weeks
**Objective**: Capture image and identify employee

### Workflow

1. Camera detects face
2. Wait for 0.5s stability
3. Auto-capture image
4. Send to backend
5. Backend performs recognition
6. Return employee details

### Frontend Implementation

**File**: `app/(foreman-stack)/workers/[id]/scan-out-face/index.tsx`

Replace mock timers with real detection:

```tsx
const handleFaceDetected = async (faceImage: CameraFrame) => {
  // Face is in correct position
  setState("detecting");

  // Wait for stability (0.5s)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Capture image
  const capturedImage = await camera.current.takePhoto();

  // Send to backend
  setState("recognizing");
  const result = await recognizeEmployee(capturedImage);

  if (result.success) {
    setFoundEmployee({
      id: result.employeeId,
      fullName: result.fullName,
      title: result.title,
      matchPercentage: result.matchPercentage,
    });
    setState("detected");
  } else {
    setState("idle"); // Try again
  }
};
```

### Backend API Implementation

**Endpoint**: `POST /api/face-recognition`

```typescript
// app/api/face-recognition/route.ts
import { recognizeEmployeeFace } from "@/lib/faceRecognition";

export async function POST(req: Request) {
  const formData = await req.formData();
  const imageFile = formData.get("image") as File;

  if (!imageFile) {
    return Response.json({ error: "No image" }, { status: 400 });
  }

  // Extract face embedding
  const embedding = await recognizeEmployeeFace(imageFile);

  if (!embedding) {
    return Response.json({ error: "No face detected" }, { status: 400 });
  }

  // Find matching employee in database
  const { data: employees } = await prisma.employee.findMany({
    where: { faceEmbedding: { not: null } },
  });

  // Compare embeddings using cosine similarity
  let bestMatch = null;
  let bestScore = 0.7; // Threshold

  for (const emp of employees) {
    const score = cosineSimilarity(embedding, emp.faceEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = emp;
    }
  }

  if (!bestMatch) {
    return Response.json({ error: "No match found" }, { status: 404 });
  }

  return Response.json({
    success: true,
    employeeId: bestMatch.id,
    fullName: bestMatch.fullName,
    title: bestMatch.designation,
    matchPercentage: Math.round(bestScore * 100),
  });
}
```

### Face Recognition Libraries (Backend)

**Option 1: InsightFace (Recommended)**

```bash
pip install insightface onnx onnxruntime
```

```python
import insightface
from insightface.app import FaceAnalysis

app = FaceAnalysis(name='buffalo_l')
app.prepare(ctx_id=0)

def extract_face_embedding(image_path):
    img = cv2.imread(image_path)
    faces = app.get(img)
    if len(faces) > 0:
        return faces[0].embedding
    return None

def compare_faces(embedding1, embedding2):
    """Returns similarity score 0-1"""
    from sklearn.metrics.pairwise import cosine_similarity
    return cosine_similarity([embedding1], [embedding2])[0][0]
```

**Option 2: FaceNet**

```bash
pip install facenet-pytorch
```

**Option 3: ArcFace**

```bash
pip install arcface
```

### Database Schema Updates

**Employee Table**:

```sql
-- Add face embedding column
ALTER TABLE employees ADD COLUMN face_embedding vector(512);

-- Add index for faster lookups
CREATE INDEX idx_face_embedding ON employees USING ivfflat (face_embedding vector_cosine_ops);

-- Add enrollment status
ALTER TABLE employees ADD COLUMN face_enrolled_at timestamp;
```

**Attendance History**:

```sql
-- Capture face verification details
ALTER TABLE attendance ADD COLUMN face_match_percentage float;
ALTER TABLE attendance ADD COLUMN face_image_path text;
```

---

## Phase 4: Employee Enrollment UI 🔄

**Timeline**: 1 week
**Objective**: Let employees enroll their faces

### Enrollment Flow

1. Navigate to "Enroll Face"
2. Take 5-10 photos from different angles
3. Upload to backend
4. Extract and store embedding
5. Confirmation message

### Screen Component

**File**: `app/(foreman-stack)/workers/[id]/enroll-face/index.tsx`

```tsx
export default function EnrollFaceScreen() {
  const [photos, setPhotos] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  const handleCapture = async () => {
    // Capture and add to collection
    const photo = await camera.current.takePhoto();
    setPhotos([...photos, photo.uri]);

    // Show progress (5+ photos needed)
    const progress = Math.round((photos.length / 5) * 100);
  };

  const handleSubmit = async () => {
    setEnrolling(true);

    // Send all photos to backend
    const formData = new FormData();
    photos.forEach((photo, i) => {
      formData.append(`photo_${i}`, {
        uri: photo,
        type: "image/jpeg",
        name: `enroll_${i}.jpg`,
      });
    });
    formData.append("employeeId", id);

    const response = await fetch("/api/face-enrollment", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      // Show success
      // Return to details
    }
  };
}
```

### Backend Enrollment Endpoint

```typescript
// app/api/face-enrollment/route.ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const employeeId = formData.get("employeeId");

  // Extract embeddings from all photos
  const embeddings = [];
  let i = 0;
  while (formData.has(`photo_${i}`)) {
    const photo = formData.get(`photo_${i}`) as File;
    const embedding = await extractFaceEmbedding(photo);
    if (embedding) embeddings.push(embedding);
    i++;
  }

  if (embeddings.length < 3) {
    return Response.json(
      { error: "Need at least 3 clear photos" },
      { status: 400 },
    );
  }

  // Average embeddings for better accuracy
  const averageEmbedding = averageVectors(embeddings);

  // Store in database
  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      faceEmbedding: averageEmbedding,
      faceEnrolledAt: new Date(),
    },
  });

  return Response.json({ success: true });
}
```

---

## Phase 5: Offline Recognition 🔄

**Timeline**: 1-2 weeks
**Objective**: Recognize employees without internet

### Workflow

1. Download employee face embeddings
2. Store locally on device
3. Perform recognition on-device
4. Fallback to server if no match

### Implementation

**Download embeddings**:

```tsx
const downloadEmbeddings = async () => {
  const response = await fetch("/api/face-embeddings");
  const embeddings = await response.json();

  await AsyncStorage.setItem("faceEmbeddings", JSON.stringify(embeddings));
};
```

**Local recognition**:

```tsx
const recognizeOffline = (faceEmbedding) => {
  const stored = JSON.parse(AsyncStorage.getItem("faceEmbeddings") || "{}");

  let bestMatch = null;
  let bestScore = 0.7;

  for (const [empId, embedding] of Object.entries(stored)) {
    const score = cosineSimilarity(faceEmbedding, embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = empId;
    }
  }

  return bestMatch;
};
```

---

## Phase 6: Advanced Features 🔄

**Timeline**: 2-4 weeks

### 6.1 Liveness Detection

- Detect if face is real (not printed photo)
- Ask user to blink or nod
- Prevents spoofing attempts

### 6.2 Multi-Face Display

- Show all detected employees
- Foreman selects correct person
- Fallback if no perfect match

### 6.3 Location Tracking

- Add GPS coordinates to scan
- Store site/location info
- Prevent fraudulent scans

### 6.4 Audit Trail

- Photo archive
- Recognition confidence
- Timestamp and location
- Foreman notes

### 6.5 Analytics Dashboard

- Recognition accuracy rates
- False positive/negative tracking
- Performance metrics
- Employee insights

---

## Implementation Timeline

| Phase | Feature           | Effort   | Timeline  |
| ----- | ----------------- | -------- | --------- |
| 1     | UI & Demo         | ✅ Done  | Done      |
| 2     | Face Detection    | Medium   | 1-2 weeks |
| 3     | Recognition API   | High     | 2-3 weeks |
| 4     | Enrollment Flow   | Medium   | 1 week    |
| 5     | Offline Support   | Medium   | 1-2 weeks |
| 6     | Advanced Features | Variable | 2-4 weeks |

**Total**: 7-12 weeks for full implementation

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  FCP Timesheet App                      │
│                  (Expo/React Native)                    │
└────────┬────────────────────────────────────┬───────────┘
         │                                    │
    ┌────▼──────────────┐         ┌──────────▼──────────┐
    │  Face Detection   │         │  Image Capture     │
    │  (react-native-   │         │  (expo-camera)     │
    │   vision-camera)  │         └────────┬───────────┘
    └────────┬──────────┘                  │
             │                    ┌────────▼────────────┐
             │                    │  Server Processing  │
             │                    │  (Next.js API)      │
             │                    └────────┬────────────┘
             │                             │
             │                    ┌────────▼──────────────┐
             │                    │ Face Recognition API  │
             │                    │ (InsightFace/Python)  │
             │                    └────────┬──────────────┘
             │                             │
             │                    ┌────────▼──────────────┐
             │                    │  Database            │
             │                    │  (Neon PostgreSQL)   │
             │                    │  - Embeddings        │
             │                    │  - Employees         │
             │                    │  - Attendance        │
             │                    └─────────────────────┘
             │
        ┌────▼────────────────────────┐
        │  Local Device Storage        │
        │  (Offline Recognition)       │
        │  - Cached Embeddings         │
        │  - Fallback Matching         │
        └─────────────────────────────┘
```

---

## Next Steps

1. **Review UI Implementation** ✅
   - All components working
   - Mock demo functional
   - Ready for integration

2. **Choose Face Detection Library**
   - Recommended: `react-native-vision-camera` + MLKit
   - Create POC with face detection

3. **Setup Face Recognition Backend**
   - Choose library: InsightFace recommended
   - Create Python microservice
   - Test with sample images

4. **Database Schema Updates**
   - Add face_embedding column
   - Add enrollment tracking
   - Add match confidence logging

5. **Integration Testing**
   - End-to-end enrollment flow
   - Recognition accuracy testing
   - Offline fallback testing

---

## Success Metrics

- ✅ Recognition accuracy > 99%
- ✅ Inference time < 2 seconds
- ✅ False positive rate < 1%
- ✅ Foreman can scan 30+ employees/minute
- ✅ Works on both iOS and Android
- ✅ Graceful offline fallback

---

## Resources

- [InsightFace](https://github.com/deepinsight/insightface)
- [react-native-vision-camera](https://react-native-vision-camera.com)
- [MLKit Face Detection](https://developers.google.com/ml-kit/vision/face-detection)
- [MediaPipe](https://mediapipe.dev)
- [FaceNet TensorFlow](https://github.com/davidsandberg/facenet)

---

**Ready to start Phase 2? Let's build the face detection integration!**
