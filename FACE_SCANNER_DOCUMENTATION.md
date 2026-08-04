# Face Recognition Scanner UI - FCP Timesheet App

## Overview

This document describes the professional face recognition-based attendance scanner UI for the FCP Timesheet app. The system provides a clean, modern interface for foremen to scan employees out using face detection and recognition.

## Architecture

### Components

The face scanner system is built with modular React Native components:

#### 1. **FaceGuide** (`FaceGuide.tsx`)

Animated face detection guide with visual feedback.

**Features:**

- Pulsing outer ring that animates based on detection state
- Corner brackets for professional alignment
- Animated scanning line during detection
- Glow circle when face is detected
- Color transitions: Gray → Blue → Green

**States:**

- `idle`: Waiting for face - pulsing gray ring
- `detecting`: Face detected - animated blue scanning line
- `detected`: Face confirmed - glowing green circle

**Customization:**

```tsx
<FaceGuide
  state="idle"
  size={200} // diameter in pixels
/>
```

#### 2. **ScannerOverlay** (`ScannerOverlay.tsx`)

Full-screen overlay with camera instructions and progress indicators.

**Features:**

- Header with "Scan Out" title
- Centered face guide
- Footer with status messages and progress bar
- Dynamic messaging based on scanner state
- Loading animation progress bar

**States:**

- `idle`: "Position face inside circle" + "Searching for employee..."
- `detecting`: "Face detected ✓" + "Analyzing..."
- `recognizing`: "Recognizing..." + "Comparing with database..."

#### 3. **EmployeeCard** (`EmployeeCard.tsx`)

Animated bottom sheet showing recognized employee details.

**Features:**

- Slides up from bottom with spring animation
- Green checkmark icon
- Employee avatar placeholder
- Employee name and title
- Match percentage with visual bar
- Cancel and Confirm buttons
- Semi-transparent background

**Data Structure:**

```typescript
interface Employee {
  id: string;
  fullName: string;
  title: string;
  matchPercentage: number;
}
```

#### 4. **SuccessAnimation** (`SuccessAnimation.tsx`)

Full-screen success animation that auto-dismisses.

**Features:**

- Animated green checkmark in circle
- Fade-in success text
- Employee name and scan time display
- "Ready for next employee..." message
- Auto-complete after 2.5 seconds
- Semi-transparent overlay

#### 5. **ScannerOverlay** (`ScannerOverlay.tsx`)

Container component managing the overall UI layout.

**Features:**

- Expo Camera integration
- Composable scanner states
- Card and success animation management
- Mock state transitions for demo

## Color Scheme (Dark Theme)

| Component      | Color     | Hex Value |
| -------------- | --------- | --------- |
| Background     | Dark Gray | #111827   |
| Cards          | Slate     | #1F2937   |
| Borders        | Gray      | #374151   |
| Success        | Green     | #22C55E   |
| Detecting      | Blue      | #3B82F6   |
| Text Primary   | White     | #FFFFFF   |
| Text Secondary | Gray      | #9CA3AF   |
| Text Muted     | Dim Gray  | #6B7280   |

## State Machine

```
idle
  ↓ (3s delay)
detecting
  ↓ (1s delay)
detected
  ↓ (0.5s delay, show employee card)
[waiting for confirmation]
  ↓ (user confirms)
recognizing
  ↓ (1.5s delay, simulate server)
success
  ↓ (2.5s auto-dismiss)
idle (ready for next employee)
```

## Animations

### FaceGuide Pulse

- Duration: 1500ms
- Pattern: Smooth scale and opacity pulse
- Uses: `react-native-reanimated` `withRepeat` + `withTiming`

### Scanning Line

- Duration: 2000ms
- Motion: Vertical line moves top to bottom
- Opacity: Fades in/out
- Trigger: `detecting` state

### Glow Circle

- Duration: 1000ms
- Effect: Opacity pulse
- Trigger: `detected` state

### Employee Card Slide

- Duration: 400ms
- Motion: Slides up from bottom (Y: 300 → 0)
- Trigger: Employee found

### Success Checkmark

- Duration: 600ms
- Effect: Scale animation (0 → 1)
- Trigger: Scan out confirmed

### Text Fade-In

- Delay: 200ms (after checkmark)
- Duration: 400ms
- Trigger: Success state

## File Structure

```
office-app/
├── app/
│   └── (foreman-stack)/
│       └── workers/
│           └── [id]/
│               ├── index.tsx           # Employee details with Face scan button
│               └── scan-out-face/
│                   └── index.tsx       # Main face scanner screen
├── components/
│   └── FaceScanner/
│       ├── index.ts                   # Barrel export
│       ├── FaceGuide.tsx              # Face detection guide
│       ├── ScannerOverlay.tsx         # Full-screen UI
│       ├── EmployeeCard.tsx           # Employee info card
│       └── SuccessAnimation.tsx       # Success animation
```

## Navigation

### From Employee Details

```tsx
router.push({
  pathname: "/(foreman-stack)/workers/[id]/scan-out-face/index",
  params: { id: String(id) },
});
```

### Screen Buttons

1. **Register Fingerprint** - Opens fingerprint enrollment
2. **Scan Out (Fingerprint)** - Fingerprint-based scan out
3. **Scan Out (Face)** - NEW: Face recognition scan out

## Integration Steps

### Phase 1: Current (UI Demo)

✅ Complete - Mock state transitions for demonstration

### Phase 2: Face Detection (Next)

- Integrate `expo-camera` (already installed)
- Add face detection library:
  - Option A: `react-native-vision-camera` + MLKit
  - Option B: MediaPipe Face Detection
  - Option C: TensorFlow Lite model

### Phase 3: Backend Recognition

- Send captured face image to Next.js API
- Store face embeddings in PostgreSQL (Neon)
- Compare embeddings using cosine similarity
- Return employee ID and match percentage

### Phase 4: Offline Support

- Download face embeddings to device
- Perform local recognition
- Fallback to server if needed

## Usage Example

```tsx
import { FaceScanOutScreen } from "@/app/(foreman-stack)/workers/[id]/scan-out-face";

// Employee details screen will render a button that navigates to:
// - Scan out using face recognition
// - User positions face in circular guide
// - Employee card appears with confirmation
// - Success animation plays
// - Automatically returns to camera
```

## Customization Options

### Adjust Guide Size

```tsx
<ScannerOverlay guideSize={220} /> // Default: 200
```

### Adjust Timings

Edit the `useEffect` hooks in `FaceScanOutScreen`:

```tsx
setTimeout(() => setState("detecting"), 3000); // 3s initial delay
setTimeout(() => setState("detected"), 1000); // 1s detecting duration
setFoundEmployee(MOCK_EMPLOYEE); // 0.5s before card
```

### Change Colors

Edit the theme in component `StyleSheet.create`:

```tsx
backgroundColor: '#111827',     // Dark background
backgroundColor: '#22C55E',     // Green success
backgroundColor: '#3B82F6',     // Blue detecting
```

## Performance Notes

- **Animations**: Uses `react-native-reanimated` for 60 FPS smoothness
- **Camera**: Expo Camera optimized for real-time preview
- **SVG Rendering**: Minimal SVG elements for fast rendering
- **Memory**: Components properly cleanup animations on unmount

## Accessibility

- Clear visual states (colors + text)
- Large touch targets on buttons (48px+ minimum)
- High contrast text on backgrounds
- Semantic labeling for screen readers

## Testing

### Manual Testing

1. Navigate to employee detail
2. Tap "Scan Out (Face)"
3. Watch state transitions (3s idle → detecting → card)
4. Tap "Confirm" in employee card
5. Watch success animation
6. Auto-return to camera after 2.5s

### Mock Data

Edit `MOCK_EMPLOYEE` in `scan-out-face/index.tsx`:

```tsx
const MOCK_EMPLOYEE: MockEmployee = {
  id: "1",
  fullName: "John Smith",
  title: "Bricklayer",
  matchPercentage: 98.7,
};
```

## Future Enhancements

1. **Liveness Detection**: Ask user to blink or nod
2. **Multi-Face Recognition**: Show all detected employees
3. **Photo Audit Trail**: Store capture history
4. **GPS Integration**: Record location of scan
5. **Offline Recognition**: Download embeddings to device
6. **Real-time Metrics**: Show recognition speed, accuracy
7. **Enrollment Screen**: Guided selfie capture for new employees
8. **Spoof Detection**: Detect fake/printed faces

## Technical Dependencies

- `expo-camera`: Camera preview and image capture
- `react-native-reanimated`: Smooth animations
- `react-native-svg`: Vector graphics rendering
- `expo-router`: Navigation
- `react-native`: UI framework

## Dependencies Already Installed

✅ `expo-camera@~17.0.10`
✅ `react-native-reanimated@~4.1.1`
✅ `react-native-svg@15.12.1`
✅ `expo-router@~6.0.22`

## API Integration (Future)

Once face detection is implemented, the app will:

1. **Capture Image** → CameraView
2. **Send to Server** → POST /api/face-recognition
3. **Server Process**:
   - Extract face embedding
   - Compare to stored embeddings
   - Return employee ID
4. **Update UI** → Show employee card with match%
5. **Confirm & Scan** → POST /api/attendance/scan-out

## Known Limitations

- Currently uses mock data and simulated timings
- No actual face detection yet (Phase 2)
- No backend integration yet (Phase 3)
- Requires camera permissions

## Support & Troubleshooting

### Camera Not Showing

- Check `android.permission.CAMERA` in app.json
- Check iOS Info.plist camera usage description
- Verify camera permissions granted

### Animations Stuttering

- Ensure device performance is adequate
- Check if other heavy processes running
- Profile with React DevTools

### Layout Issues

- FaceGuide size can be adjusted with `size` prop
- Overlay respects safe area automatically
- Test on multiple device sizes
