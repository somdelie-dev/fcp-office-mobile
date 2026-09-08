import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type SearchablePickerOption = {
  id: string;
  name: string;
  code?: string | null;
};

type PickerColors = {
  textPrimary: string;
  textSecondary: string;
  border: string;
};

/**
 * Searchable dropdown for picking one item from a list (sites, foremen,
 * dates, clients, assignees, ...). A horizontal chip row or a plain select
 * doesn't scale once there are many options, so every "pick one of these"
 * spot in the admin screens opens this instead.
 */
export function SearchablePickerModal({
  visible,
  title,
  searchPlaceholder,
  allLabel,
  showAllOption = true,
  options,
  selectedId,
  onSelect,
  onClose,
  colors,
  isDark,
}: {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  allLabel?: string;
  /** Set false for a picker that must always have a selection, no "All" option. */
  showAllOption?: boolean;
  options: SearchablePickerOption[];
  selectedId: string | null;
  onSelect: (option: SearchablePickerOption | null) => void;
  onClose: () => void;
  colors: PickerColors;
  isDark: boolean;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.code ?? "").toLowerCase().includes(q),
    );
  }, [options, search]);

  const sheetBg = isDark ? "rgba(15,23,42,0.97)" : "rgba(255,255,255,0.97)";

  if (!visible) return null;

  // A plain absolutely-positioned overlay, not React Native's <Modal>:
  // RN doesn't reliably present a second native Modal opened from inside an
  // already-visible one (the picker just silently fails to appear), which
  // this needs to support since some callers open it from within another
  // modal (e.g. the create-site form). This works the same whether it's
  // nested inside another modal or used directly on a screen.
  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.backdrop]}
      onPress={onClose}
    >
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={[
          styles.pickerSheet,
          { backgroundColor: sheetBg, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <View style={[styles.searchBox, { borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            autoCapitalize="none"
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ maxHeight: 360, marginTop: 8 }}
          ListHeaderComponent={
            showAllOption ? (
              <Pressable
                style={[
                  styles.option,
                  { borderColor: !selectedId ? "#22c55e" : colors.border },
                ]}
                onPress={() => {
                  onSelect(null);
                  onClose();
                }}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                  {allLabel}
                </Text>
                {!selectedId && (
                  <Ionicons name="checkmark" size={18} color="#22c55e" />
                )}
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) => {
            const isSelected = item.id === selectedId;
            return (
              <Pressable
                style={[
                  styles.option,
                  { borderColor: isSelected ? "#22c55e" : colors.border },
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text
                  style={[styles.optionText, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.code ? `${item.code} - ${item.name}` : item.name}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color="#22c55e" />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text
              style={{
                color: colors.textSecondary,
                textAlign: "center",
                padding: 16,
              }}
            >
              No matches
            </Text>
          }
        />
        <Pressable
          style={[styles.cancelBtn, { alignSelf: "center" }]}
          onPress={onClose}
        >
          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
            Close
          </Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 99999,
    elevation: 99999,
  },
  pickerSheet: {
    width: "92%",
    maxWidth: 420,
    maxHeight: "75%",
    borderRadius: 5,
    borderWidth: 1,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: "900" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 6,
  },
  optionText: { fontWeight: "700", fontSize: 14, flex: 1 },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 5,
  },
  cancelBtnText: { fontWeight: "800", fontSize: 14 },
});
