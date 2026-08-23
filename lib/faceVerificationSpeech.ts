import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";

export type ClockAction = "in" | "out";

interface SpeakFaceVerificationSuccessInput {
  employeeName: string;
  action: ClockAction;
}

// AVSpeechSynthesizer/AudioPlayer both play through the app's shared audio
// session by default, and until that session is explicitly configured, iOS
// keeps it under the default category that goes silent when the ringer
// switch is off — a long-standing Expo issue (expo/expo#8235). Configuring
// the shared session once, up front, is the documented fix:
// https://docs.expo.dev/versions/latest/sdk/audio/#setaudiomodeasync
void setAudioModeAsync({
  playsInSilentMode: true,
  interruptionMode: "duckOthers",
}).catch((e) => {
  console.warn("[faceVerificationSpeech] failed to configure audio mode:", e);
});

// Pre-recorded clips (no employee name in them — the name is spoken via TTS
// right before the success clip plays) keyed by clock action. Only "out"
// has a real caller today; "in" is wired for whenever a clock-in scanner
// exists.
const SUCCESS_CLIP_SOURCE: Record<ClockAction, number> = {
  out: require("@/assets/sounds/Clock out... successful.mp3"),
  in: require("@/assets/sounds/Clocked in success.mp3"),
};

const NO_MATCH_CLIP_SOURCE: number = require("@/assets/sounds/Face not recognized. Please try again..mp3");

// Created once and reused (seekTo(0) + play() per call) rather than a fresh
// AudioPlayer per scan — these fire repeatedly in a continuous high-volume
// loop, so churning native player instances isn't worth it.
let successPlayers: Record<ClockAction, AudioPlayer> | null = null;
function getSuccessPlayers(): Record<ClockAction, AudioPlayer> {
  if (!successPlayers) {
    successPlayers = {
      out: createAudioPlayer(SUCCESS_CLIP_SOURCE.out),
      in: createAudioPlayer(SUCCESS_CLIP_SOURCE.in),
    };
  }
  return successPlayers;
}

let noMatchPlayer: AudioPlayer | null = null;
function getNoMatchPlayer(): AudioPlayer {
  if (!noMatchPlayer) {
    noMatchPlayer = createAudioPlayer(NO_MATCH_CLIP_SOURCE);
  }
  return noMatchPlayer;
}

// Stops every known clip (success and no-match alike) before a new one
// starts — a fast run of scans should never leave two clips overlapping,
// regardless of which outcome each one was.
function stopAllClips() {
  const players = [
    ...(successPlayers ? Object.values(successPlayers) : []),
    ...(noMatchPlayer ? [noMatchPlayer] : []),
  ];
  for (const player of players) {
    if (player.playing) player.pause();
  }
}

function playSuccessClip(action: ClockAction) {
  try {
    stopAllClips();
    const player = getSuccessPlayers()[action];
    player.seekTo(0);
    player.play();
  } catch (e) {
    console.warn("[faceVerificationSpeech] failed to play success clip:", e);
  }
}

/**
 * Announces a successful face-scan clock-in/out for the high-volume,
 * continuous scanner (scan-out-face.tsx) — workers walk up one after
 * another, so this must never slow that loop down or fail loudly.
 *
 * TTS speaks just the matched employee's name, then the pre-recorded clip
 * ("Clock out... successful.mp3" / "Clocked in success.mp3") plays —
 * personalized name plus the produced confirmation audio, in sequence.
 *
 * Fire-and-forget by design: callers do not (and must not) await this.
 * Internally it awaits Speech.stop() before Speech.speak() so a quick
 * back-to-back scan cancels the previous announcement instead of
 * overlapping it, but that sequencing never blocks the caller, and any
 * TTS or clip playback failure is swallowed here rather than surfacing as
 * a verification error — the scan itself already succeeded server-side by
 * the time this is called.
 */
export function speakFaceVerificationSuccess({
  employeeName,
  action,
}: SpeakFaceVerificationSuccessInput): void {
  void (async () => {
    try {
      await Speech.stop();
      Speech.speak(employeeName, {
        // Unsupported/unavailable locales fall back to the platform's
        // default voice rather than throwing, so no separate
        // availability check is needed before speaking.
        language: "en-ZA",
        rate: 1.0,
        onDone: () => playSuccessClip(action),
        onError: (error) => {
          console.warn("[faceVerificationSpeech] TTS error:", error);
          // Still confirm the scan out loud even if the name couldn't be
          // spoken — better than a silent success.
          playSuccessClip(action);
        },
      });
    } catch (e) {
      console.warn(
        "[faceVerificationSpeech] failed to speak success message:",
        e,
      );
      playSuccessClip(action);
    }
  })();
}

/**
 * Announces a failed match ("Face not recognized. Please try again.") for
 * the continuous scanner — fires on the same low_quality/no_match outcome
 * that shows the "noMatch" phase (a face was found but nothing matched
 * confidently). No employee name involved: nothing was confidently
 * identified, so there's nothing to speak but the clip itself.
 *
 * Same fire-and-forget, never-throws-back contract as
 * speakFaceVerificationSuccess — never awaited by the caller, and any
 * playback failure is only logged.
 */
export function speakFaceVerificationNoMatch(): void {
  void (async () => {
    try {
      await Speech.stop();
      stopAllClips();
      const player = getNoMatchPlayer();
      player.seekTo(0);
      player.play();
    } catch (e) {
      console.warn(
        "[faceVerificationSpeech] failed to play no-match clip:",
        e,
      );
    }
  })();
}
