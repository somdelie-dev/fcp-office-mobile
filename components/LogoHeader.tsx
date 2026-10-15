import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/useNotifications";
import { useTheme } from "../lib/themeContext";
import { ThemeToggle } from "./ThemeToggle";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function LogoHeader() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const avatarRef = useRef<View>(null);

  const handleAvatarPress = () => {
    if (avatarRef.current) {
      avatarRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({
          top: y + height + 8,
          right: 16,
        });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <ThemeToggle size="small" />

          <HeaderKey
            icon="calculator"
            label="Calculator"
            palette={KEY_PALETTES.calculator}
            onPress={() => router.push("/(foreman-stack)/calculator")}
          />

          <Pressable
            onPress={() => router.push("/(foreman-stack)/notifications")}
            hitSlop={8}
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            style={({ pressed }) => [
              styles.bell,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(15,23,42,0.06)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(15,23,42,0.08)",
                transform: [{ scale: pressed ? 0.92 : 1 }],
              },
            ]}
          >
            <Ionicons
              name={unreadCount > 0 ? "notifications" : "notifications-outline"}
              size={20}
              color={isDark ? "#f8fafc" : "#0f172a"}
            />
            {unreadCount > 0 && (
              <View style={styles.badge} pointerEvents="none">
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? "99+" : String(unreadCount)}
                </Text>
              </View>
            )}
          </Pressable>

          <View ref={avatarRef} collapsable={false}>
            <Pressable
              onPress={handleAvatarPress}
              hitSlop={8}
              accessibilityLabel="Account menu"
              style={({ pressed }) => [
                styles.avatarRing,
                {
                  borderColor: isDark ? "rgba(255,255,255,0.85)" : "#fff",
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                },
              ]}
            >
              <LinearGradient
                colors={avatarGradient(user?.name || user?.email || "")}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>
                  {initialsOf(user?.name || user?.email || "")}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              { top: menuPosition.top, right: menuPosition.right },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <MenuItem
                icon="person-outline"
                label="Profile"
                onPress={() => {
                  setOpen(false);
                  router.push("/(foreman-stack)/profile");
                }}
              />

              <MenuItem
                icon="settings-outline"
                label="Settings"
                onPress={() => {
                  setOpen(false);
                  router.push("/(foreman-stack)/settings");
                }}
              />
              <MenuItem
                icon="help-circle-outline"
                label="Help"
                onPress={() => {
                  setOpen(false);
                  router.push("/(foreman-stack)/help");
                }}
              />
              <MenuItem
                icon="log-out-outline"
                label="Logout"
                danger
                style={styles.menuItemLast}
                onPress={async () => {
                  setOpen(false);
                  await signOut();
                  router.replace("/login");
                }}
              />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type KeyPalette = { face: [string, string]; edge: string };

const KEY_PALETTES = {
  calculator: { face: ["#4ade80", "#16a34a"], edge: "#14532d" },
} satisfies Record<string, KeyPalette>;

const AVATAR_GRADIENTS: [string, string][] = [
  ["#60a5fa", "#2563eb"],
  ["#a78bfa", "#7c3aed"],
  ["#f472b6", "#db2777"],
  ["#fb923c", "#ea580c"],
  ["#2dd4bf", "#0d9488"],
  ["#facc15", "#ca8a04"],
];

/** Each person keeps the same avatar colour, picked from their name. */
function avatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function initialsOf(name: string) {
  const base = name.includes("@") ? name.split("@")[0] : name;
  const parts = base
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A small raised key, matching the calculator's 3D buttons. */
function HeaderKey({
  icon,
  label,
  palette,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  palette: KeyPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={styles.keyOuter}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.keyEdge,
            {
              backgroundColor: palette.edge,
              marginTop: pressed ? 2 : 0,
              paddingBottom: pressed ? 1 : 3,
              elevation: pressed ? 1 : 4,
              shadowOpacity: pressed ? 0.1 : 0.3,
            },
          ]}
        >
          <LinearGradient colors={palette.face} style={styles.keyFace}>
            <View style={styles.keyShine} />
            <Ionicons name={icon} size={17} color="#fff" />
          </LinearGradient>
        </View>
      )}
    </Pressable>
  );
}

type MenuItemProps = {
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
  style?: any;
};

function MenuItem({ icon, label, onPress, danger, style }: MenuItemProps) {
  return (
    <Pressable onPress={onPress} style={[styles.menuItem, style]}>
      <Ionicons name={icon} size={18} color={danger ? "#b00020" : "#111"} />
      <View style={{ width: 8 }} />
      <Ionicons />
      <Text
        style={{
          fontWeight: "900",
          fontSize: 14,
          color: danger ? "#b00020" : "#111",
        }}
      >
        {label}
      </Text>
      <View />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 100,
    width: "100%",
    marginHorizontal: 0,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },

  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    height: 44,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },

  logo: {
    height: 38,
    width: 150,
  },

  keyOuter: { width: 32, height: 33 },
  keyEdge: {
    flex: 1,
    borderRadius: 9,
    shadowColor: "#000",
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  keyFace: {
    flex: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  keyShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "48%",
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    padding: 1,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatar: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  badge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    borderWidth: 2,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    shadowColor: "#ef4444",
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  menu: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },

  menuItemLast: {
    borderBottomWidth: 0,
  },
});
