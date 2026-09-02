import { SceneStyleInterpolators, TransitionSpecs } from "@react-navigation/bottom-tabs";
import { Easing } from "react-native";

type SceneInterpolationProps = Parameters<typeof SceneStyleInterpolators.forFade>[0];
type SceneInterpolatedStyle = ReturnType<typeof SceneStyleInterpolators.forFade>;

/**
 * 3D "fill" tab transition: the incoming screen scales up and un-rotates
 * from a slight Y-axis perspective tilt, like a card settling face-on into
 * place. The outgoing screen tilts and shrinks away in the mirror
 * direction, so switching tabs reads as depth rather than a flat swap.
 */
export function forFill3D({
  current,
}: SceneInterpolationProps): SceneInterpolatedStyle {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        { perspective: 900 },
        {
          scale: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [0.85, 1, 0.85],
          }),
        },
        {
          rotateY: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: ["-40deg", "0deg", "40deg"],
          }),
        },
      ],
    },
  };
}

export const fill3DTransitionSpec: typeof TransitionSpecs.FadeSpec = {
  animation: "timing",
  config: {
    duration: 320,
    easing: Easing.out(Easing.cubic),
  },
};
