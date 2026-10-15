import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { SearchablePickerModal } from "@/components/SearchablePickerModal";
import {
  apiAdminCatalogue,
  apiAdminCreateCatalogueProduct,
  apiAdminUpdateCatalogueProduct,
} from "@/lib/apiClient";
import {
  CATALOGUE_ACCENT,
  PRODUCT_UOMS,
  cachedCatalogue,
  cachedProduct,
  catalogueThemes,
  rememberCatalogue,
  uomLabel,
} from "@/lib/paintsCatalogue";
import { useTheme } from "@/lib/themeContext";

export default function CatalogueProductFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];
  const isDark = theme === "dark";
  const editing = id ? cachedProduct(id) : null;

  const [suppliers, setSuppliers] = useState(
    cachedCatalogue()?.suppliers ?? [],
  );
  const [categories, setCategories] = useState(
    cachedCatalogue()?.categories ?? [],
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [uom, setUom] = useState<string | null>(editing?.uom ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(
    editing?.category?.id ?? null,
  );
  const [supplierIds, setSupplierIds] = useState<Set<string>>(
    new Set(editing?.supplierIds ?? []),
  );
  const [picker, setPicker] = useState<"uom" | "category" | null>(null);
  const [saving, setSaving] = useState(false);

  // Opened without the list screen first (no cache): load the pick lists.
  useEffect(() => {
    if (cachedCatalogue()) return;
    apiAdminCatalogue()
      .then((res) => {
        rememberCatalogue(res);
        setSuppliers(res.suppliers);
        setCategories(res.categories);
      })
      .catch(() => {});
  }, []);

  const uomOptions = useMemo(
    () => PRODUCT_UOMS.map((u) => ({ id: u, name: uomLabel(u) })),
    [],
  );
  const categoryName = categories.find((c) => c.id === categoryId)?.name;

  const toggleSupplier = (sid: string) =>
    setSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name is required", "Give the product a name.");
      return;
    }
    const input = {
      name: name.trim(),
      sku: sku.trim() || null,
      uom,
      categoryId,
      supplierIds: [...supplierIds],
    };
    setSaving(true);
    try {
      const created = editing
        ? null
        : ((await apiAdminCreateCatalogueProduct(input)) as {
            data?: { id: string };
          });
      if (editing) await apiAdminUpdateCatalogueProduct(editing.id, input);
      rememberCatalogue(await apiAdminCatalogue());
      const newId = created?.data?.id;
      if (newId) {
        router.replace({
          pathname: "/(admin-stack)/paints/[id]",
          params: { id: newId },
        } as any);
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert(
        editing ? "Couldn't save changes" : "Couldn't add product",
        e?.message ?? "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = [
    styles.field,
    { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
  ];

  return (
    <AuthStyleBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {editing ? "Edit product" : "New product"}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Product name"
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            style={[fieldStyle, styles.input, { color: colors.textPrimary }]}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Code
          </Text>
          <TextInput
            value={sku}
            onChangeText={setSku}
            placeholder="Manufacturer code"
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            autoCapitalize="characters"
            style={[fieldStyle, styles.input, { color: colors.textPrimary }]}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Unit
              </Text>
              <Pressable style={fieldStyle} onPress={() => setPicker("uom")}>
                <Text
                  style={[
                    styles.fieldText,
                    { color: uom ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  {uom ? uomLabel(uom) : "Select a unit"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
            <View style={{ flex: 1.4 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Category
              </Text>
              <Pressable
                style={fieldStyle}
                onPress={() => setPicker("category")}
              >
                <Text
                  style={[
                    styles.fieldText,
                    {
                      color: categoryName
                        ? colors.textPrimary
                        : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {categoryName ?? "No category"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Suppliers ({supplierIds.size} selected)
          </Text>
          <View
            style={[
              styles.supplierBox,
              { borderColor: colors.rowBorder, backgroundColor: colors.cardBg },
            ]}
          >
            {suppliers.length === 0 ? (
              <Text style={[styles.none, { color: colors.textSecondary }]}>
                No suppliers set up yet.
              </Text>
            ) : (
              suppliers.map((s, i) => {
                const on = supplierIds.has(s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => toggleSupplier(s.id)}
                    style={[
                      styles.supplierRow,
                      i > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.rowBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={20}
                      color={on ? CATALOGUE_ACCENT : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.supplierName,
                        { color: colors.textPrimary },
                      ]}
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <Text style={[styles.note, { color: colors.textSecondary }]}>
            Brands, colours, pack sizes, prices and coverage are managed on the
            web admin.
          </Text>
        </ScrollView>

        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.barBg,
              borderTopColor: colors.rowBorder,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Pressable
            style={[
              styles.saveBtn,
              (saving || !name.trim()) && { opacity: 0.5 },
            ]}
            onPress={save}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>
                {editing ? "Save changes" : "Add product"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SearchablePickerModal
        visible={picker === "uom"}
        title="Unit"
        searchPlaceholder="Search units…"
        allLabel="No unit"
        options={uomOptions}
        selectedId={uom}
        onSelect={(o) => setUom(o?.id ?? null)}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />
      <SearchablePickerModal
        visible={picker === "category"}
        title="Category"
        searchPlaceholder="Search categories…"
        allLabel="No category"
        options={categories}
        selectedId={categoryId}
        onSelect={(o) => setCategoryId(o?.id ?? null)}
        onClose={() => setPicker(null)}
        colors={colors}
        isDark={isDark}
      />
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: "900", marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "800", marginTop: 14, marginBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 5,
    borderWidth: 1,
  },
  input: { fontSize: 15, fontWeight: "600" },
  fieldText: { flex: 1, fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
  supplierBox: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 12 },
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  supplierName: { flex: 1, fontSize: 14, fontWeight: "700" },
  none: { paddingVertical: 14, fontSize: 13 },
  note: { fontSize: 12, fontWeight: "600", marginTop: 14, textAlign: "center" },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  saveBtn: {
    height: 50,
    borderRadius: 5,
    backgroundColor: CATALOGUE_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
