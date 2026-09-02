import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/useNotifications";
import { useTheme } from "../lib/themeContext";
import { ThemeToggle } from "./ThemeToggle";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function LogoHeader() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const avatarRef = useRef<View>(null);

  const isDark = theme === "dark";
  const iconColor = isDark ? "white" : "#111";

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

          {/* Notification bell */}
          <Pressable
            onPress={() => router.push("/(foreman-stack)/notifications")}
            style={styles.bellWrap}
          >
            <Ionicons
              name="notifications-outline"
              size={26}
              color={iconColor}
            />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? "9+" : String(unreadCount)}
                </Text>
              </View>
            )}
          </Pressable>

          <View ref={avatarRef} collapsable={false}>
            <Pressable onPress={handleAvatarPress}>
              <Ionicons
                name="person-circle-outline"
                size={30}
                color={iconColor}
              />
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

  bellWrap: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },

  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },

  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
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
