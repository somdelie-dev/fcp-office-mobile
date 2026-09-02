import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useFaceTheme } from "@/components/team/faceTheme";

type IconPair = {
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
};

const ICONS: Record<string, IconPair> = {
  home: {
    active: "home",
    inactive: "home-outline",
  },
  history: {
    active: "time",
    inactive: "time-outline",
  },
  "site-photo": {
    active: "camera",
    inactive: "camera-outline",
  },
  profile: {
    active: "person",
    inactive: "person-outline",
  },
  approvals: {
    active: "checkmark-done",
    inactive: "checkmark-done-outline",
  },
  sites: {
    active: "business",
    inactive: "business-outline",
  },
  foremen: {
    active: "people",
    inactive: "people-outline",
  },
  scan: {
    active: "qr-code",
    inactive: "qr-code-outline",
  },
  "scan-outs": {
    active: "checkmark-done-circle",
    inactive: "checkmark-done-circle-outline",
  },
  workers: {
    active: "people",
    inactive: "people-outline",
  },
  timesheets: {
    active: "document-text",
    inactive: "document-text-outline",
  },
  tutorial: {
    active: "play-circle",
    inactive: "play-circle-outline",
  },
};

/**
 * Overall floating navigation panel.
 */
const BAR_HEIGHT = 102;

const ICON_SIZE = 26;

const ACTIVE_SIZE = 58;
const ACTIVE_RING = 8;

const HOME_INDICATOR_WIDTH = 92;
const HOME_INDICATOR_HEIGHT = 5;

// const BOTTOM_MARGIN = 10;

function TabButton({
  routeName,
  label,
  isFocused,
  onPress,
  onLongPress,
  tabWidth,
}: {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  tabWidth: number;
}) {
  const { colors } = useFaceTheme();

  const iconOpacity = useSharedValue(isFocused ? 0 : 1);

  useEffect(() => {
    iconOpacity.value = withTiming(isFocused ? 0 : 1, {
      duration: 120,
    });
  }, [isFocused, iconOpacity]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  const icons = ICONS[routeName] ?? {
    active: "ellipse" as const,
    inactive: "ellipse-outline" as const,
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={8}
      style={[
        styles.tabButton,
        {
          width: tabWidth,
        },
      ]}
    >
      <View style={styles.iconArea}>
        <Animated.View style={[styles.inactiveIcon, iconStyle]}>
          <Ionicons
            name={icons.inactive}
            size={ICON_SIZE}
            color={colors.textTertiary}
          />
        </Animated.View>
      </View>

      <Text
        style={[
          styles.label,
          {
            color: isFocused ? colors.success : colors.textTertiary,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Green active circular button.
 *
 * It floats slightly above the normal icon row and slides
 * horizontally between tabs.
 */
function ActiveButton({
  activeIndex,
  tabWidth,
  activeIcon,
}: {
  activeIndex: SharedValue<number>;
  tabWidth: number;
  activeIcon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useFaceTheme();

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX:
            activeIndex.value * tabWidth + (tabWidth - ACTIVE_SIZE) / 2,
        },
      ],
    };
  });

  if (!tabWidth) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.activeWrapper, animatedStyle]}
    >
      {/* Dark outer ring / shadow */}
      <View
        style={[
          styles.activeRing,
          {
            backgroundColor: colors.background,
          },
        ]}
      >
        {/* Green active circle */}
        <View
          style={[
            styles.activeCircle,
            {
              backgroundColor: colors.success,
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          <Ionicons
            name={activeIcon}
            size={ICON_SIZE}
            color={colors.textOnPrimary}
          />
        </View>
      </View>
    </Animated.View>
  );
}

export default function AnimatedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors } = useFaceTheme();
  const insets = useSafeAreaInsets();

  const [barWidth, setBarWidth] = useState(0);

  const onRowLayout = (event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  const visibleRoutes = state.routes.filter(
    (route) =>
      (descriptors[route.key].options as { href?: unknown }).href !== null,
  );

  const focusedRoute = state.routes[state.index];

  const activeVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === focusedRoute.key),
  );

  const activeIndex = useSharedValue(activeVisibleIndex);

  useEffect(() => {
    activeIndex.value = withSpring(activeVisibleIndex, {
      damping: 18,
      stiffness: 180,
      mass: 0.7,
    });
  }, [activeVisibleIndex, activeIndex]);

  const tabWidth = visibleRoutes.length ? barWidth / visibleRoutes.length : 0;

  const activeIcons = ICONS[focusedRoute.name] ?? {
    active: "ellipse" as const,
    inactive: "ellipse-outline" as const,
  };

  return (
    <View pointerEvents="box-none" style={[styles.container]}>
      <View
        style={[
          styles.bar,
          {
            // Grow the bar by the system bottom inset so Android's
            // gesture/3-button nav never crowds it. iOS's home indicator
            // inset is already accounted for in BAR_HEIGHT's own bottom
            // padding, so adding it again here pushed the row up too far
            // on iPhone - Android only.
            height:
              BAR_HEIGHT + (Platform.OS === "android" ? insets.bottom : 0),
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.glassBorder,
          },
        ]}
      >
        {/* Navigation row */}
        <View onLayout={onRowLayout} style={styles.row}>
          {visibleRoutes.map((route) => {
            const { options } = descriptors[route.key];

            const label =
              typeof options.title === "string" ? options.title : route.name;

            const isFocused = route.key === focusedRoute.key;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <TabButton
                key={route.key}
                routeName={route.name}
                label={label}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                tabWidth={tabWidth}
              />
            );
          })}

          {/* Sliding green active button */}
          <ActiveButton
            activeIndex={activeIndex}
            tabWidth={tabWidth}
            activeIcon={activeIcons.active}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    right: 0,
    bottom: 0,
  },

  bar: {
    // height is set dynamically (BAR_HEIGHT + bottom inset) inline above.
    borderWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,

    // overflow: "hidden",

    shadowColor: "black",
    shadowOffset: {
      width: 0,
      height: -6,
    },
    shadowOpacity: 0,
    shadowRadius: 32,

    elevation: 18,
  },

  row: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,

    height: 80,

    flexDirection: "row",
    alignItems: "flex-end",

    paddingBottom: 12,
  },

  tabButton: {
    height: 56,

    alignItems: "center",
    justifyContent: "flex-end",

    // paddingBottom: 8,
  },

  iconArea: {
    width: 30,
    height: 30,

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 4,
  },

  inactiveIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,

    alignItems: "center",
    justifyContent: "center",
  },

  label: {
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
  },

  /**
   * This is positioned over the normal icon area.
   * The dark ring makes the green circle look like the
   * reference design rather than a flat coloured icon.
   */
  activeWrapper: {
    position: "absolute",

    top: -20,

    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,

    alignItems: "center",
    justifyContent: "center",
  },

  activeRing: {
    width: ACTIVE_SIZE + ACTIVE_RING,
    height: ACTIVE_SIZE + ACTIVE_RING,

    borderRadius: (ACTIVE_SIZE + ACTIVE_RING) / 2,

    alignItems: "center",
    justifyContent: "center",

    shadowColor: "black",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.68,
    shadowRadius: 2,

    elevation: 8,
  },

  activeCircle: {
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,

    borderRadius: ACTIVE_SIZE / 2,

    alignItems: "center",
    justifyContent: "center",

    overflow: "hidden",
  },

  homeIndicator: {
    position: "absolute",

    bottom: 8,

    alignSelf: "center",

    width: HOME_INDICATOR_WIDTH,
    height: HOME_INDICATOR_HEIGHT,

    borderRadius: HOME_INDICATOR_HEIGHT / 2,

    opacity: 0.8,
  },
});
