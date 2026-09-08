import React, { useCallback, useImperativeHandle, useRef } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type CubeSpinStageHandle = {
  /**
   * Plays one Y-axis tumble from the front face to the back face, then
   * resets to identity so rotation never accumulates. Direction (+90/-90)
   * is re-randomized on every call. Calls onComplete once the faces are
   * back at rest — the right moment to actually navigate.
   */
  spin: (onComplete?: () => void) => void;
};

type Props = {
  /** Content shown at rest, facing the viewer. */
  front: React.ReactNode;
  /** Content that tumbles in flat when spin() plays. */
  back: React.ReactNode;
  perspective?: number;
  duration?: number;
  style?: ViewStyle;
};

const DEFAULT_PERSPECTIVE = 900;
const DEFAULT_DURATION = 650;
const EASING = Easing.bezier(0.4, 0, 0.2, 1);

function pickDir(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/**
 * Two full-screen faces, front resting flat and back rotated 90° away
 * (hidden by backfaceVisibility). spin() animates a shared rotation delta
 * that both faces read additively — front = delta, back = dir*90 + delta —
 * so they tumble as one rigid unit even though each is transformed
 * independently.
 *
 * React Native has no translateZ / transform-style: preserve-3d (checked
 * against RN's own transform types and native processor, not just a
 * typings gap), so this can't be a literal nested-3D-drum like a CSS cube
 * transition. Composing the rotation this way produces the same angles a
 * shared "stage" parent would, just without the box-like Z depth.
 */
export const CubeSpinStage = React.forwardRef<CubeSpinStageHandle, Props>(
  function CubeSpinStage(
    { front, back, perspective = DEFAULT_PERSPECTIVE, duration = DEFAULT_DURATION, style },
    ref,
  ) {
    const rotation = useSharedValue(0);
    const dir = useSharedValue<1 | -1>(1);
    const onCompleteRef = useRef<(() => void) | null>(null);

    const finish = useCallback(() => {
      const cb = onCompleteRef.current;
      onCompleteRef.current = null;
      cb?.();
    }, []);

    const spin = useCallback<CubeSpinStageHandle["spin"]>(
      (onComplete) => {
        onCompleteRef.current = onComplete ?? null;

        // Reset with no animation before animating the rotation delta.
        dir.value = pickDir();
        rotation.value = 0;

        rotation.value = withTiming(
          dir.value * -90,
          { duration, easing: EASING },
          (finished) => {
            if (finished) {
              // Back to identity so rotation never accumulates across plays.
              rotation.value = 0;
              runOnJS(finish)();
            }
          },
        );
      },
      [dir, rotation, duration, finish],
    );

    useImperativeHandle(ref, () => ({ spin }), [spin]);

    const frontStyle = useAnimatedStyle(() => ({
      transform: [{ perspective }, { rotateY: `${rotation.value}deg` }],
    }));

    const backStyle = useAnimatedStyle(() => ({
      transform: [
        { perspective },
        { rotateY: `${dir.value * 90 + rotation.value}deg` },
      ],
    }));

    return (
      <View style={[styles.wrap, style]}>
        <Animated.View style={[styles.face, frontStyle]}>{front}</Animated.View>
        <Animated.View style={[styles.face, backStyle]}>{back}</Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: "hidden",
  },
  face: {
    ...StyleSheet.absoluteFill,
    backfaceVisibility: "hidden",
  },
});
