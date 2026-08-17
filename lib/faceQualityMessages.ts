// Shared retake-instruction copy for face-service's QualityWarning codes —
// used by both enrollment (capture-reference.tsx) and live verification
// (verify.tsx) so the two don't duplicate the same 8-case mapping.

export function describeQualityWarning(warning: string): string {
  switch (warning) {
    case "too_dark":
      return "Too dark — move somewhere brighter";
    case "too_bright":
      return "Too bright — avoid strong light behind you";
    case "too_blurry":
      return "Blurry — hold the phone steady";
    case "face_too_small":
      return "Move closer";
    case "not_centered":
      return "Center your face in the frame";
    case "face_turned":
      return "Face the camera directly";
    case "head_tilted":
      return "Keep your head level";
    case "resolution_too_low":
      return "Photo resolution too low";
    default:
      return "Quality too low";
  }
}
