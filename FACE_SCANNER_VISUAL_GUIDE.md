# Face Scanner Visual Guide

## 📱 Screen Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  EMPLOYEE DETAILS SCREEN                                    │
│                                                              │
│  John Smith                                                 │
│  Code: EMP-001                                              │
│  Status: Active                                             │
│                                                              │
│  ┌──────────────────┬──────────────┬──────────────────┐    │
│  │ Register         │ Scan Out     │ Scan Out (Face)  │    │
│  │ Fingerprint      │ (Fingerprint)│ (NEW - GREEN)   │◄── │ Tap here
│  └──────────────────┴──────────────┴──────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    Navigates to...
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  FACE SCAN OUT SCREEN                                       │
│                                                              │
│  Dark (#111827)          ← Scan Out                         │
│  Background              ← Header                           │
│                                                              │
│              ╭──────────────────╮                           │
│            ╭─╯  Camera Preview  ╰─╮                        │
│           │                        │                       │
│           │     ┌──────────────┐   │                       │
│           │   ╭─╯              ╰─╮ │                       │
│           │  │                    │ │                       │
│           │  │   ○────────────○   │ │  ← Face Guide         │
│           │  │ ○                ○ │ │     (Pulsing)         │
│           │  │ ○      👤        ○ │ │                       │
│           │  │ ○                ○ │ │                       │
│           │  │   ○────────────○   │ │                       │
│           │  │                    │ │                       │
│           │   ╰─╮              ╭─╯ │                       │
│           │     └──────────────┘   │                       │
│           │                        │                       │
│            ╰─╮  Camera Preview  ╭─╯                        │
│              ╰──────────────────╯                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Slate (#1F2937)                                     │   │
│  │ Position face inside circle                        │   │
│  │ Searching for employee...                          │   │
│  │ ████████░░░░░░  Progress Bar                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                      ↑                                       │
│              Footer Info Box                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🎬 State Transitions & Animations

### State 1: IDLE (0-3 seconds)

```
┌─────────────────────────────────────────┐
│ ← Scan Out                              │
│                                         │
│        ╭──────────────────╮            │
│      ╭─╯  Camera Preview  ╰─╮          │
│     │                        │         │
│     │        ○ ○ ○ ○ ○      │         │
│     │      ○   (pulsing)  ○ │         │
│     │     ○                ○ │  Gray   │
│     │     ○                ○ │  Ring   │
│     │      ○             ○   │ Pulse   │
│     │        ○ ○ ○ ○ ○      │         │
│     │                        │         │
│      ╰─╮  Camera Preview  ╭─╯          │
│        ╰──────────────────╯            │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ Position face inside circle       │  │
│ │ Searching for employee...         │  │
│ └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Animation**: Pulsing gray ring (1500ms cycle)
**Duration**: 3 seconds

### State 2: DETECTING (1 second)

```
┌─────────────────────────────────────────┐
│ ← Scan Out                              │
│                                         │
│        ╭──────────────────╮            │
│      ╭─╯  Camera Preview  ╰─╮          │
│     │                        │         │
│     │     ┌────────────────┐ │ Blue    │
│     │   ╭─╯                ╰─╮ Ring   │
│     │  │     ┅┅┅ LINE ┅┅┅   │ Anim   │
│     │  │        Moving        │ Scanning│
│     │  │       (60% down)     │         │
│     │  │                      │         │
│     │   ╰─╮                ╭─╯ Corners │
│     │     └────────────────┘          │
│     │                        │         │
│      ╰─╮  Camera Preview  ╭─╯          │
│        ╰──────────────────╯            │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ Face detected ✓                   │  │
│ │ Analyzing...                      │  │
│ │ ████████░░░░░░                   │  │
│ └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Animation**: Blue ring + scanning line moves down (2000ms)
**Duration**: 1 second

### State 3: DETECTED (0.5 seconds)

```
┌─────────────────────────────────────────┐
│ ← Scan Out                              │
│                                         │
│        ╭──────────────────╮            │
│      ╭─╯  Camera Preview  ╰─╮          │
│     │                        │         │
│     │    ╭────────────────╮  │ Green   │
│     │  ╭─╯ Glow Halo      ╰─╮ Ring   │
│     │ │      ✔ Pulsing      │ Glows   │
│     │ │     ┃     👤     ┃  │         │
│     │ │      ✔ (face ok) ✔  │         │
│     │  ╰─╮                ╭─╯         │
│     │    ╰────────────────╯           │
│     │                        │         │
│      ╰─╮  Camera Preview  ╭─╯          │
│        ╰──────────────────╯            │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ Face detected ✓                   │  │
│ │ Analyzing...                      │  │
│ │ ████████░░░░░░                   │  │
│ └───────────────────────────────────┘  │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │ ✓ Employee Found  (SLIDES UP)  │  │
│   │                                 │  │
│   │ 👤 John Smith                   │  │
│   │    Bricklayer                   │  │
│   │                                 │  │
│   │ 98.7% Match ██████████░         │  │
│   │                                 │  │
│   │ [Cancel]        [Scan Out]      │  │
│   └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Animations**:

- Green glow circle pulses (1000ms)
- Employee card slides up (400ms)
  **Duration**: 0.5 seconds before card shows

### State 4: RECOGNIZING (1.5 seconds)

```
┌─────────────────────────────────────────┐
│ ← Scan Out                              │
│                                         │
│        ╭──────────────────╮            │
│      ╭─╯  Camera Preview  ╰─╮          │
│     │                        │ Faded   │
│     │      (Faded out)       │ Out     │
│     │                        │         │
│      ╰─╮  Camera Preview  ╭─╯          │
│        ╰──────────────────╯            │
│                                         │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │ Recognizing...                  │  │
│   │                                 │  │
│   │ 👤 John Smith                   │  │
│   │    Bricklayer                   │  │
│   │                                 │  │
│   │ Processing...   ██████░░░░░░░░ │  │
│   │                 (85% progress)  │  │
│   │                                 │  │
│   │ [Cancel]        [Scanning...]   │  │
│   └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Animation**: Progress bar fills to 85%
**Duration**: 1.5 seconds

### State 5: SUCCESS (2.5 seconds)

```
┌─────────────────────────────────────────┐
│ ← Scan Out                              │
│                                         │
│   Dark Overlay (semi-transparent)       │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │   ✔                             │  │
│   │  ○─O     Checkmark Grows       │  │
│   │  │ │     (600ms animation)      │  │
│   │  O─○                            │  │
│   │                                 │  │
│   │ Scanned Out                     │  │
│   │ John Smith                      │  │
│   │ 16:42:08                        │  │
│   │                                 │  │
│   │ Ready for next employee...      │  │
│   └─────────────────────────────────┘  │
│   (Auto-dismiss after 2.5 seconds)     │
│                                         │
└─────────────────────────────────────────┘
```

**Animations**:

- Green checkmark scales in (600ms)
- Text fades in (400ms, 200ms delay)
- Auto-dismiss countdown (2.5s)

**Duration**: 2.5 seconds (auto-return to idle)

---

## 🎨 Component Colors at Each State

### IDLE State

```
Ring Color: #6B7280 (Gray)
Bracket Color: #6B7280 (Gray)
Status Text: "Position face inside circle"
Footer BG: #1F2937 (Slate)
Footer Text: #9CA3AF (Light Gray)
Progress Bar: Hidden
```

### DETECTING State

```
Ring Color: #3B82F6 (Blue)
Bracket Color: #3B82F6 (Blue)
Scanning Line: #3B82F6 (Blue)
Status Text: "Face detected ✓"
Footer BG: #1F2937 (Slate)
Footer Text: #9CA3AF (Light Gray)
Progress Bar: #3B82F6 (Blue) - 60%
```

### DETECTED State

```
Ring Color: #22C55E (Green)
Bracket Color: #22C55E (Green)
Glow Circle: #22C55E (Green) - Pulsing
Status Text: "Face detected ✓"
Card BG: #1F2937 (Slate)
Card Border: #374151 (Gray)
Checkmark: #22C55E (Green)
Buttons: [Gray] [Green]
```

### RECOGNIZING State

```
Ring Color: #22C55E (Green)
Card BG: #1F2937 (Slate)
Progress Bar: #3B82F6 (Blue) - 85%
Status Text: "Recognizing..."
Scanning Button: Disabled
```

### SUCCESS State

```
Overlay: rgba(0, 0, 0, 0.5)
Checkmark: #22C55E (Green)
Text: #FFFFFF (White)
Subtitle: #9CA3AF (Light Gray)
Box: Transparent (fade-in)
```

---

## 📐 Dimensions & Spacing

### Face Guide

- **Default Size**: 200px diameter
- **Corner Brackets**: 30x30px
- **Ring Stroke Width**: 2px
- **Scanning Line Height**: 2px
- **Scanning Line Width**: Guide width

### Employee Card

- **Height**: ~280px
- **Padding**: 20px
- **Border Radius**: 12px
- **Avatar Size**: 50x50px
- **Match Bar Height**: 6px

### Success Animation

- **Checkmark SVG**: 80x80px
- **Circle Radius**: 40px
- **Stroke Width**: 2-4px
- **Text Size**: 24px (title), 20px (name), 16px (time)

### Spacing

- **Horizontal Padding**: 16px (safe area)
- **Vertical Padding**: 16-24px
- **Gap Between Elements**: 8-12px
- **Border Radius**: 8-12px (consistency)

---

## ⏱️ Animation Timings

| Animation     | Start         | Duration | Easing      | Loop |
| ------------- | ------------- | -------- | ----------- | ---- |
| Guide Pulse   | idle          | 1500ms   | ease-in-out | ✓    |
| Scanning Line | detecting     | 2000ms   | linear      | ✓    |
| Glow Circle   | detected      | 1000ms   | ease-in-out | ✓    |
| Card Slide    | detected      | 400ms    | ease-out    | ✗    |
| Checkmark     | success       | 600ms    | ease-out    | ✗    |
| Text Fade     | success+200ms | 400ms    | ease-in     | ✗    |
| Auto-dismiss  | success       | 2500ms   | -           | ✗    |

---

## 🖐️ Touch Targets & Buttons

### Employee Card Buttons

```
Cancel Button
┌──────────┐
│ Cancel   │  Height: 44px (min)
└──────────┘  Padding: 12px vertical
Width: 50% with gap

Scan Out Button
┌──────────┐
│ Scan Out │  Height: 44px (min)
└──────────┘  Padding: 12px vertical
Width: 50% with gap

Spacing: 12px gap between
```

**Minimum Touch Target**: 48x48px (iOS/Android standard)

---

## 🔄 User Flow Diagram

```
START
  │
  ├─→ Open Employee Details
  │     └─→ [Scan Out (Face)] ← New green button
  │
  ├─→ Camera Screen Opens
  │     └─→ IDLE state (gray ring pulses)
  │           └─→ 3 second wait
  │
  ├─→ DETECTING state (blue scanning line)
  │     └─→ 1 second analysis
  │
  ├─→ DETECTED state (green glow)
  │     └─→ Employee Card Slides Up
  │           ├─→ [Cancel] → Back to IDLE
  │           └─→ [Scan Out] → RECOGNIZING
  │
  ├─→ RECOGNIZING state (progress bar 85%)
  │     └─→ 1.5 second wait
  │
  ├─→ SUCCESS state (green checkmark)
  │     ├─→ Show "Scanned Out"
  │     ├─→ Show employee name & time
  │     └─→ Auto-dismiss after 2.5s
  │
  ├─→ IDLE state (ready for next)
  │
  └─→ END (loop for next employee)
```

---

## 📏 Safe Area Considerations

```
Screen Safe Area (Notches, Rounded Corners)
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────────┐  │ Status Bar
│  │                                   │  │
│  │  Safe Area Container              │  │ Safe Top
│  │                                   │  │
│  │  [Header] [Camera View]           │  │
│  │                                   │  │
│  │  [Footer]                         │  │
│  │                                   │  │
│  │  Safe Area                        │  │ Safe Bottom
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

Handled automatically by `react-native-safe-area-context`

---

## 💡 Visual Hierarchy

**Priority 1 - Highest Contrast**

- Green checkmark (#22C55E on Dark BG)
- Face guide ring (changes color for state)
- Action buttons

**Priority 2 - Medium Contrast**

- Status messages
- Employee name
- Progress bars

**Priority 3 - Low Contrast**

- Footer text
- Helper messages
- Timestamps

---

## ✨ Design Patterns

### Loading Animations

- Scanning line for active analysis
- Progress bar for server processing
- Pulsing elements for attention

### Feedback

- Color changes (Gray → Blue → Green)
- Animation states (scale, translate, fade)
- Success checkmark for confirmation

### Navigation

- Header with title
- Back button implied (dark overlay)
- Bottom card for decisions

### Mobile-First

- Full-width elements
- Touch-friendly buttons
- Safe area aware
- Responsive spacing
