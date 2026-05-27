import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminAssignForeman,
  apiAdminAssignSupervisor,
  apiAdminDeleteSite,
  apiAdminEndForemanAssignment,
  apiAdminEndSupervisorAssignment,
  apiAdminListUsers,
  apiAdminSiteDetail,
  apiAdminSiteForemen,
  apiAdminSiteCosts,
  apiAdminSiteProductOrders,
  apiAdminSites,
  apiAdminSiteSupervisors,
  apiAdminUpdateSite,
  apiAdminCreateSiteProductOrder,
  apiAdminAddOrderItem,
  apiAdminProcurementProducts,
  apiAdminSuppliers,
  type AdminSiteDetailDto,
  type AdminSiteListItemDto,
  type AdminUserListItemDto,
  type SiteCostsDto,
  type SiteForemanAssignmentDto,
  type SiteSupervisorAssignmentDto,
  type SiteProductOrderDto,
  type ProcurementProductDto,
  type SupplierDto,
} from "@/lib/apiClient";
import { formatCurrency } from "@/lib/formatCurrency";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function AdminSiteDetailScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const siteId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<AdminSiteListItemDto | null>(null);

  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [adminDetail, setAdminDetail] = useState<AdminSiteDetailDto | null>(
    null,
  );

  // Site action states
  const [actionBusy, setActionBusy] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editAddress, setEditAddress] = useState("");

  // Assignment management state
  const [supervisorAssignments, setSupervisorAssignments] = useState<
    SiteSupervisorAssignmentDto[]
  >([]);
  const [foremanAssignments, setForemanAssignments] = useState<
    SiteForemanAssignmentDto[]
  >([]);
  const [assignBusy, setAssignBusy] = useState(false);

  // Picker modals
  const [pickerType, setPickerType] = useState<"SUPERVISOR" | "FOREMAN" | null>(
    null,
  );
  const [pickerUsers, setPickerUsers] = useState<AdminUserListItemDto[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Site costs
  const [costs, setCosts] = useState<SiteCostsDto | null>(null);
  const [costsLoading, setCostsLoading] = useState(false);

  // Product orders (inline section)
  const [productOrders, setProductOrders] = useState<SiteProductOrderDto[]>([]);
  const [productOrdersLoading, setProductOrdersLoading] = useState(false);
  const [productOrdersError, setProductOrdersError] = useState<string | null>(null);

  // New order modal
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderRef, setNewOrderRef] = useState("");
  const [newOrderSupplier, setNewOrderSupplier] = useState<SupplierDto | null>(null);
  const [newOrderItems, setNewOrderItems] = useState<Array<{ product: ProcurementProductDto; qty: string }>>([]);
  const [newOrderBusy, setNewOrderBusy] = useState(false);
  // Product picker inside new order
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<ProcurementProductDto[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  // Supplier picker inside new order
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierList, setSupplierList] = useState<SupplierDto[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!siteId) return;
      setLoading(true);
      setError(null);

      try {
        // There is no dedicated admin site detail endpoint yet,
        // so we re-use the list API and pick the matching site.
        const res = await apiAdminSites();
        const found = res.sites.find((s) => s.id === siteId) ?? null;
        if (!cancelled) {
          setSite(found);
          if (!found) {
            setError("Site not found in latest list.");
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load site details.");
          setSite(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Load admin site detail (assigned foremen etc)
  useEffect(() => {
    if (!siteId) return;

    let cancelled = false;

    async function loadExtra() {
      setAssignmentsLoading(true);
      setAssignmentsError(null);

      try {
        const rawDetail = await apiAdminSiteDetail(siteId);

        if (!cancelled) {
          const detail = rawDetail as AdminSiteDetailDto;
          setAdminDetail(detail);
        }
      } catch (e: any) {
        if (!cancelled) {
          setAssignmentsError(e?.message ?? "Failed to load assignments.");
          setAdminDetail(null);
        }
      } finally {
        if (!cancelled) {
          setAssignmentsLoading(false);
        }
      }
    }

    loadExtra();

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  function handleDeleteSite() {
    if (!site || actionBusy) return;
    Alert.alert(
      "Delete Site?",
      `This will permanently delete "${site.name}" and all its related data. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              const res = await apiAdminDeleteSite(siteId);
              if (res.ok) {
                Alert.alert("Done", "Site deleted.", [
                  { text: "OK", onPress: () => router.back() },
                ]);
              }
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete site.");
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  }

  function handleOpenEditModal() {
    if (!site) return;
    setEditName(site.name ?? "");
    setEditCode(site.code ?? "");
    setEditLocation(site.location ?? "");
    setEditAddress((adminDetail?.site as any)?.address ?? "");
    setEditModalVisible(true);
  }

  async function handleSaveEdit() {
    if (!site || actionBusy) return;
    setActionBusy(true);
    try {
      const data: Record<string, string | null> = {};
      const trimName = editName.trim();
      const trimCode = editCode.trim() || null;
      const trimLocation = editLocation.trim() || null;
      const trimAddress = editAddress.trim() || null;

      if (trimName !== site.name) data.name = trimName;
      if (trimCode !== (site.code ?? null)) data.code = trimCode;
      if (trimLocation !== (site.location ?? null))
        data.location = trimLocation;
      if (trimAddress !== ((adminDetail?.site as any)?.address ?? null))
        data.address = trimAddress;

      if (Object.keys(data).length === 0) {
        setEditModalVisible(false);
        return;
      }

      if (!trimName) {
        Alert.alert("Error", "Site name cannot be empty.");
        setActionBusy(false);
        return;
      }

      const res = await apiAdminUpdateSite(siteId, data);
      if (res.ok && res.site) {
        setSite((prev) =>
          prev
            ? {
                ...prev,
                name: res.site.name,
                code: res.site.code ?? null,
                location: res.site.location ?? null,
              }
            : prev,
        );
        setEditModalVisible(false);
        Alert.alert("Done", "Site updated.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to update site.");
    } finally {
      setActionBusy(false);
    }
  }

  const textMain = isDark ? "#e5e7eb" : "#111827";
  const textSub = isDark ? "#94a3b8" : "#6b7280";
  const iconColor = isDark ? "#94a3b8" : "#6b7280";

  // Load assignment details from dedicated endpoints
  async function refreshAssignments() {
    if (!siteId) return;
    try {
      const [supRes, fmRes] = await Promise.all([
        apiAdminSiteSupervisors(siteId),
        apiAdminSiteForemen(siteId),
      ]);
      setSupervisorAssignments(supRes.supervisors ?? []);
      setForemanAssignments(fmRes.foremen ?? []);
    } catch {
      // keep existing state on failure
    }
  }

  // Refresh assignments when admin detail loads
  useEffect(() => {
    if (siteId) refreshAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Load site costs
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setCostsLoading(true);
    apiAdminSiteCosts(siteId)
      .then((res) => { if (!cancelled) setCosts(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCostsLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  // Load product orders automatically at mount
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setProductOrdersLoading(true);
    setProductOrdersError(null);
    apiAdminSiteProductOrders(siteId)
      .then((res) => { if (!cancelled) setProductOrders(res.data ?? []); })
      .catch((e: any) => { if (!cancelled) setProductOrdersError(e?.message ?? "Failed to load orders."); })
      .finally(() => { if (!cancelled) setProductOrdersLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  async function refreshProductOrders() {
    if (!siteId) return;
    try {
      const res = await apiAdminSiteProductOrders(siteId);
      setProductOrders(res.data ?? []);
    } catch {}
  }

  function openNewOrderModal() {
    setNewOrderRef("");
    setNewOrderSupplier(null);
    setNewOrderItems([]);
    setNewOrderOpen(true);
  }

  async function openSupplierPicker() {
    setSupplierPickerOpen(true);
    if (supplierList.length === 0) {
      try {
        const res = await apiAdminSuppliers();
        setSupplierList(res.data ?? []);
      } catch {}
    }
  }

  async function openProductPicker() {
    setProductSearch("");
    setProductPickerOpen(true);
    setProductSearchLoading(true);
    try {
      const res = await apiAdminProcurementProducts({ q: "" });
      setProductSearchResults(res.data ?? []);
    } catch {
      setProductSearchResults([]);
    } finally {
      setProductSearchLoading(false);
    }
  }

  async function handleProductSearch(q: string) {
    setProductSearch(q);
    setProductSearchLoading(true);
    try {
      const res = await apiAdminProcurementProducts({ q });
      setProductSearchResults(res.data ?? []);
    } catch {
      setProductSearchResults([]);
    } finally {
      setProductSearchLoading(false);
    }
  }

  function addProductToOrder(product: ProcurementProductDto) {
    setNewOrderItems((prev) => [...prev, { product, qty: "1" }]);
    setProductPickerOpen(false);
    setProductSearch("");
  }

  function removeOrderItem(idx: number) {
    setNewOrderItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateOrderItemQty(idx: number, qty: string) {
    setNewOrderItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, qty } : item)),
    );
  }

  async function handleCreateOrder() {
    if (newOrderItems.length === 0) {
      Alert.alert("Error", "Add at least one item to the order.");
      return;
    }
    setNewOrderBusy(true);
    try {
      const orderRes = await apiAdminCreateSiteProductOrder(siteId, {
        reference: newOrderRef.trim() || undefined,
        supplierId: newOrderSupplier?.id,
      });
      const orderId = orderRes.data.id;
      for (const { product, qty } of newOrderItems) {
        const quantity = parseInt(qty, 10);
        if (quantity > 0) {
          await apiAdminAddOrderItem(siteId, orderId, {
            productId: product.id,
            quantity,
          });
        }
      }
      setNewOrderOpen(false);
      await refreshProductOrders();
      Alert.alert("Done", "Order created successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create order.");
    } finally {
      setNewOrderBusy(false);
    }
  }

  async function openAssignPicker(type: "SUPERVISOR" | "FOREMAN") {
    if (type === "FOREMAN" && supervisorAssignments.length === 0) {
      Alert.alert(
        "Supervisor Required",
        "You need to assign a supervisor to this site before you can assign foremen.",
      );
      return;
    }
    setPickerType(type);
    setPickerLoading(true);
    setPickerUsers([]);
    try {
      const res = await apiAdminListUsers(type);
      // Filter out already-assigned users
      if (type === "SUPERVISOR") {
        const ids = new Set(supervisorAssignments.map((s) => s.userId));
        setPickerUsers(res.users.filter((u) => !ids.has(u.id)));
      } else {
        const ids = new Set(foremanAssignments.map((f) => f.foremanId));
        setPickerUsers(res.users.filter((u) => !ids.has(u.id)));
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load users.");
      setPickerType(null);
    } finally {
      setPickerLoading(false);
    }
  }

  async function handlePickUser(user: AdminUserListItemDto) {
    if (!siteId || assignBusy) return;
    setAssignBusy(true);
    try {
      if (pickerType === "SUPERVISOR") {
        await apiAdminAssignSupervisor(siteId, user.id);
        Alert.alert("Done", `Supervisor "${user.name}" assigned.`);
      } else {
        await apiAdminAssignForeman(siteId, user.id);
        Alert.alert("Done", `Foreman "${user.name}" assigned.`);
      }
      setPickerType(null);
      await refreshAssignments();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to assign user.");
    } finally {
      setAssignBusy(false);
    }
  }

  function handleEndSupervisor(s: SiteSupervisorAssignmentDto) {
    Alert.alert(
      "End Supervisor Assignment?",
      `Remove "${s.name}" as supervisor from this site?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End",
          style: "destructive",
          onPress: async () => {
            setAssignBusy(true);
            try {
              await apiAdminEndSupervisorAssignment(siteId, s.userId);
              await refreshAssignments();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to end assignment.");
            } finally {
              setAssignBusy(false);
            }
          },
        },
      ],
    );
  }

  function handleEndForeman(f: SiteForemanAssignmentDto) {
    Alert.alert(
      "End Foreman Assignment?",
      `Remove "${f.name}" as foreman from this site?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End",
          style: "destructive",
          onPress: async () => {
            setAssignBusy(true);
            try {
              await apiAdminEndForemanAssignment(siteId, f.foremanId);
              await refreshAssignments();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to end assignment.");
            } finally {
              setAssignBusy(false);
            }
          },
        },
      ],
    );
  }

  if (loading && !site && !error) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="📍"
          title="Loading site…"
          message="Please wait while we fetch this site"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
      >
        <GlassCard>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={[
                styles.backPill,
                {
                  backgroundColor: isDark
                    ? "rgba(15,23,42,0.9)"
                    : "rgba(255,255,255,0.75)",
                  borderColor: isDark ? "#1f2937" : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <View style={styles.backContent}>
                <Ionicons name="arrow-back" size={16} color={textMain} />
                <Text
                  style={[
                    styles.backTxt,
                    { color: isDark ? "#e5e7eb" : "#111827" },
                  ]}
                >
                  Back to sites
                </Text>
              </View>
            </Pressable>

            {adminDetail?.totalProjectWages != null && (
              <View style={styles.wagesBadge}>
                <Ionicons name="wallet" size={16} color="#10b981" />
                <View style={styles.wagesTextCol}>
                  <Text style={[styles.wagesLabel, { color: textSub }]}>
                    Wages
                  </Text>
                  <Text style={[styles.wagesValue, { color: textMain }]}>
                    {formatCurrency(adminDetail.totalProjectWages)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.titleRow}>
            <Ionicons name="business" size={24} color={iconColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: textMain }]}>
                {site?.name ?? "Site"}
              </Text>
              <View style={styles.subtitleRow}>
                <Ionicons name="location" size={14} color={iconColor} />
                <Text style={[styles.subtitle, { color: textSub }]}>
                  {site?.code ? `${site.code} • ` : ""}
                  {site?.location ?? "No location set"}
                </Text>
              </View>
            </View>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons
                name="alert-circle"
                size={16}
                color={isDark ? "#fca5a5" : "#f97373"}
              />
              <Text
                style={[
                  styles.errorText,
                  { color: isDark ? "#fca5a5" : "#f97373" },
                ]}
              >
                {error}
              </Text>
            </View>
          ) : null}
        </GlassCard>

        {site && (
          <GlassCard
            style={[
              styles.detailCard,
              {
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.95)"
                  : "rgba(255,255,255,0.9)",
              },
            ]}
          >
            <LabelRow
              icon="radio-button-on"
              label="Status"
              value={site.isActive ? "Active" : "Inactive"}
              iconColor={site.isActive ? "#10b981" : "#ef4444"}
            />
            <LabelRow icon="barcode" label="Code" value={site.code || "—"} />
            <LabelRow
              icon="location"
              label="Location"
              value={site.location || "—"}
            />
            <LabelRow
              icon="calendar"
              label="Created"
              value={new Date(site.createdAt).toLocaleString()}
              isLast
            />
          </GlassCard>
        )}

        {/* Actions card */}
        {site && (
          <GlassCard
            style={[
              styles.actionsCard,
              {
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.95)"
                  : "rgba(255,255,255,0.9)",
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="settings" size={20} color={iconColor} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: textMain }]}>
                  Actions
                </Text>
                <Text style={[styles.sectionSub, { color: textSub }]}>
                  Manage this site
                </Text>
              </View>
            </View>

            <View style={styles.actionButtonsRow}>
              <Pressable
                disabled={actionBusy}
                onPress={handleOpenEditModal}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: pressed
                      ? isDark
                        ? "rgba(56,189,248,0.15)"
                        : "rgba(14,165,233,0.1)"
                      : isDark
                        ? "rgba(56,189,248,0.08)"
                        : "rgba(14,165,233,0.05)",
                    borderColor: isDark ? "#1e3a5f" : "#bae6fd",
                  },
                  actionBusy && { opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={20}
                  color={isDark ? "#38bdf8" : "#0284c7"}
                />
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: isDark ? "#38bdf8" : "#0284c7" },
                  ]}
                >
                  Edit Site
                </Text>
              </Pressable>

              <Pressable
                disabled={actionBusy}
                onPress={handleDeleteSite}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: pressed
                      ? isDark
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(239,68,68,0.1)"
                      : isDark
                        ? "rgba(239,68,68,0.08)"
                        : "rgba(239,68,68,0.05)",
                    borderColor: isDark ? "#7f1d1d" : "#fecaca",
                  },
                  actionBusy && { opacity: 0.5 },
                ]}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={[styles.actionButtonText, { color: "#ef4444" }]}>
                  Delete Site
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* Assignments (supervisors and foremen on this site) */}
        <GlassCard
          style={[
            styles.assignCard,
            {
              backgroundColor: isDark
                ? "rgba(15,23,42,0.95)"
                : "rgba(255,255,255,0.9)",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={20} color={iconColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: textMain }]}>
                Assignments
              </Text>
              <Text style={[styles.sectionSub, { color: textSub }]}>
                Supervisors and foremen linked to this site.
              </Text>
            </View>
          </View>

          {/* Supervisors section */}
          <View style={{ marginTop: 8 }}>
            <View style={styles.roleHeaderRow}>
              <View style={styles.roleHeader}>
                <Ionicons name="shield-checkmark" size={16} color="#8b5cf6" />
                <Text style={[styles.assignMeta, { color: textSub }]}>
                  Supervisors
                </Text>
              </View>
              <Pressable
                disabled={assignBusy}
                onPress={() => openAssignPicker("SUPERVISOR")}
                style={[styles.addAssignBtn, assignBusy && { opacity: 0.5 }]}
              >
                <Ionicons name="add" size={14} color="#fff" />
                <Text style={styles.addAssignBtnText}>Add</Text>
              </Pressable>
            </View>
            {supervisorAssignments.length > 0 ? (
              supervisorAssignments.map((s) => (
                <View key={s.userId} style={styles.assignRow}>
                  <Ionicons name="person-circle" size={32} color={iconColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignName, { color: textMain }]}>
                      {s.name}
                    </Text>
                    <View style={styles.assignMetaRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={textSub}
                      />
                      <Text style={[styles.assignMeta, { color: textSub }]}>
                        Since {new Date(s.startsOn).toLocaleDateString()}
                      </Text>
                    </View>
                    {s.email ? (
                      <View style={styles.assignMetaRow}>
                        <Ionicons
                          name="mail-outline"
                          size={12}
                          color={textSub}
                        />
                        <Text style={[styles.assignMeta, { color: textSub }]}>
                          {s.email}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    disabled={assignBusy}
                    onPress={() => handleEndSupervisor(s)}
                    style={[
                      styles.endAssignBtn,
                      assignBusy && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons name="close-circle" size={14} color="#ef4444" />
                    <Text style={styles.endAssignBtnText}>End</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text
                style={[
                  styles.sectionBodyText,
                  { color: textSub, marginTop: 4 },
                ]}
              >
                No supervisors assigned.
              </Text>
            )}
          </View>

          {/* Foremen section */}
          <View style={{ marginTop: 12 }}>
            <View style={styles.roleHeaderRow}>
              <View style={styles.roleHeader}>
                <Ionicons name="construct" size={16} color="#f59e0b" />
                <Text style={[styles.assignMeta, { color: textSub }]}>
                  Foremen
                </Text>
              </View>
              <Pressable
                disabled={assignBusy}
                onPress={() => openAssignPicker("FOREMAN")}
                style={[styles.addAssignBtn, assignBusy && { opacity: 0.5 }]}
              >
                <Ionicons name="add" size={14} color="#fff" />
                <Text style={styles.addAssignBtnText}>Add</Text>
              </Pressable>
            </View>
            {foremanAssignments.length > 0 ? (
              foremanAssignments.map((f) => (
                <View key={f.foremanId} style={styles.assignRow}>
                  <Ionicons name="person-circle" size={32} color={iconColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignName, { color: textMain }]}>
                      {f.name}
                    </Text>
                    <View style={styles.assignMetaRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={textSub}
                      />
                      <Text style={[styles.assignMeta, { color: textSub }]}>
                        Since {new Date(f.startDate).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    disabled={assignBusy}
                    onPress={() => handleEndForeman(f)}
                    style={[
                      styles.endAssignBtn,
                      assignBusy && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons name="close-circle" size={14} color="#ef4444" />
                    <Text style={styles.endAssignBtnText}>End</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text
                style={[
                  styles.sectionBodyText,
                  { color: textSub, marginTop: 4 },
                ]}
              >
                {supervisorAssignments.length === 0
                  ? "Assign a supervisor first before adding foremen."
                  : "No foremen assigned."}
              </Text>
            )}
          </View>
        </GlassCard>

        {/* Site Costs Card */}
        <GlassCard
          style={[
            styles.assignCard,
            { backgroundColor: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.9)" },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet" size={20} color="#10b981" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: textMain }]}>Site Costs</Text>
              <Text style={[styles.sectionSub, { color: textSub }]}>Current fortnight</Text>
            </View>
          </View>
          {costsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={[styles.sectionBodyText, { color: textSub }]}>Loading costs…</Text>
            </View>
          ) : costs ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <View style={styles.costRow}>
                <View style={styles.costDot} />
                <Text style={[styles.costLabel, { color: textSub }]}>Wages</Text>
                <Text style={[styles.costValue, { color: textMain }]}>
                  {formatCurrency(costs.wagesCost)}
                </Text>
              </View>
              <View style={styles.costRow}>
                <View style={[styles.costDot, { backgroundColor: "#f59e0b" }]} />
                <Text style={[styles.costLabel, { color: textSub }]}>Materials</Text>
                <Text style={[styles.costValue, { color: textMain }]}>
                  {formatCurrency(costs.materialCost)}
                </Text>
              </View>
              <View style={[styles.costRow, { borderTopWidth: 1, borderTopColor: "rgba(148,163,184,0.2)", paddingTop: 8, marginTop: 2 }]}>
                <View style={[styles.costDot, { backgroundColor: "#3b82f6" }]} />
                <Text style={[styles.costLabel, { color: textSub, fontWeight: "900" }]}>Total Cost</Text>
                <Text style={[styles.costValue, { color: textMain, fontWeight: "900", fontSize: 15 }]}>
                  {formatCurrency(costs.projectCost)}
                </Text>
              </View>
              {costs.profitOrLoss !== 0 && (
                <View style={styles.costRow}>
                  <View style={[styles.costDot, { backgroundColor: costs.profitOrLoss >= 0 ? "#10b981" : "#ef4444" }]} />
                  <Text style={[styles.costLabel, { color: textSub }]}>
                    {costs.profitOrLoss >= 0 ? "Profit" : "Loss"}
                  </Text>
                  <Text style={[styles.costValue, { color: costs.profitOrLoss >= 0 ? "#10b981" : "#ef4444" }]}>
                    {formatCurrency(Math.abs(costs.profitOrLoss))}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={[styles.sectionBodyText, { color: textSub, marginTop: 4 }]}>
              No cost data available.
            </Text>
          )}
        </GlassCard>

        {/* Materials & Orders inline section */}
        <GlassCard
          style={[
            styles.assignCard,
            { backgroundColor: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.9)" },
          ]}
        >
          <View style={[styles.sectionHeader, { justifyContent: "space-between" }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flex: 1 }}>
              <Ionicons name="cube" size={20} color={isDark ? "#c084fc" : "#9333ea"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: textMain }]}>Materials & Orders</Text>
                <Text style={[styles.sectionSub, { color: textSub }]}>Product orders for this site</Text>
              </View>
            </View>
            <Pressable onPress={openNewOrderModal} style={styles.addAssignBtn}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.addAssignBtnText}>New Order</Text>
            </Pressable>
          </View>

          {productOrdersLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#9333ea" />
              <Text style={[styles.sectionBodyText, { color: textSub }]}>Loading orders…</Text>
            </View>
          ) : productOrdersError ? (
            <View style={[styles.loadingRow, { marginTop: 8 }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
              <Text style={[styles.sectionBodyText, { color: "#ef4444" }]}>{productOrdersError}</Text>
            </View>
          ) : productOrders.length === 0 ? (
            <Text style={[styles.sectionBodyText, { color: textSub, marginTop: 8 }]}>
              No product orders yet. Tap "New Order" to add one.
            </Text>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {productOrders.map((order) => (
                <View
                  key={order.id}
                  style={[
                    styles.productOrderCard,
                    {
                      backgroundColor: isDark ? "rgba(30,41,59,0.8)" : "rgba(248,250,252,0.9)",
                      borderColor: isDark ? "rgba(148,163,184,0.15)" : "rgba(0,0,0,0.08)",
                    },
                  ]}
                >
                  <View style={styles.productOrderHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.productOrderRef, { color: textMain }]}>
                        {order.reference ?? `Order #${order.id.slice(-6).toUpperCase()}`}
                      </Text>
                      <Text style={[styles.productOrderMeta, { color: textSub }]}>
                        {order.supplierName ?? "No supplier"} • {new Date(order.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    {order.totalCost != null && (
                      <View style={[styles.orderTotalBadge, { backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)" }]}>
                        <Text style={[styles.productOrderTotal, { color: "#10b981" }]}>
                          {formatCurrency(order.totalCost)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Table header */}
                  {order.items.length > 0 && (
                    <>
                      <View style={[styles.orderTableHeader, { borderBottomColor: isDark ? "rgba(148,163,184,0.2)" : "rgba(0,0,0,0.08)" }]}>
                        <Text style={[styles.orderTableHeaderCell, { flex: 1, color: textSub }]}>Product</Text>
                        <Text style={[styles.orderTableHeaderCell, { width: 52, textAlign: "right", color: textSub }]}>Qty</Text>
                        <Text style={[styles.orderTableHeaderCell, { width: 80, textAlign: "right", color: textSub }]}>Unit Price</Text>
                      </View>
                      {order.items.map((item) => (
                        <View
                          key={item.id}
                          style={[styles.orderTableRow, { borderBottomColor: isDark ? "rgba(148,163,184,0.08)" : "rgba(0,0,0,0.05)" }]}
                        >
                          <Text style={[styles.orderTableCell, { flex: 1, color: textMain }]} numberOfLines={1}>
                            {item.productName}
                          </Text>
                          <Text style={[styles.orderTableCell, { width: 52, textAlign: "right", color: textSub }]}>
                            {item.quantity}{item.uomAtOrder ? ` ${item.uomAtOrder}` : ""}
                          </Text>
                          <Text style={[styles.orderTableCell, { width: 80, textAlign: "right", color: textSub }]}>
                            {item.unitPriceAtOrder ? formatCurrency(item.unitPriceAtOrder) : "—"}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      </ScrollView>

      {/* User picker modal for assigning supervisors/foremen */}
      <Modal
        visible={!!pickerType}
        transparent
        animationType="slide"
        onRequestClose={() => !assignBusy && setPickerType(null)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => !assignBusy && setPickerType(null)}
          />
          <View
            style={[
              styles.drawerContainer,
              {
                height: SCREEN_HEIGHT * 0.6,
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.98)"
                  : "rgba(255,255,255,0.98)",
              },
            ]}
          >
            <View style={styles.drawerHandle}>
              <View
                style={[
                  styles.drawerHandleBar,
                  { backgroundColor: isDark ? "#475569" : "#cbd5e1" },
                ]}
              />
            </View>

            <View style={styles.drawerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.drawerTitle, { color: textMain }]}>
                  {pickerType === "SUPERVISOR"
                    ? "Assign Supervisor"
                    : "Assign Foreman"}
                </Text>
                <Text style={[styles.drawerSubtitle, { color: textSub }]}>
                  Select a user to assign to this site
                </Text>
              </View>
              <Pressable
                onPress={() => setPickerType(null)}
                style={styles.drawerCloseBtn}
              >
                <Ionicons name="close" size={24} color={textMain} />
              </Pressable>
            </View>

            {pickerLoading ? (
              <View style={styles.drawerLoading}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={[styles.drawerLoadingText, { color: textSub }]}>
                  Loading users…
                </Text>
              </View>
            ) : pickerUsers.length === 0 ? (
              <View style={styles.drawerEmpty}>
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={textSub}
                  style={{ opacity: 0.5 }}
                />
                <Text style={[styles.drawerEmptyText, { color: textSub }]}>
                  {pickerType === "SUPERVISOR"
                    ? "No available supervisors to assign."
                    : "No available foremen to assign."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={pickerUsers}
                keyExtractor={(u) => u.id}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, gap: 6 }}
                renderItem={({ item: u }) => (
                  <Pressable
                    disabled={assignBusy}
                    onPress={() => handlePickUser(u)}
                    style={({ pressed }) => [
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isDark ? "#1f2937" : "#e5e7eb",
                        backgroundColor: pressed
                          ? isDark
                            ? "rgba(56,189,248,0.1)"
                            : "rgba(14,165,233,0.06)"
                          : "transparent",
                      },
                      assignBusy && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons
                      name="person-circle"
                      size={36}
                      color={
                        pickerType === "SUPERVISOR" ? "#8b5cf6" : "#f59e0b"
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "900",
                          color: textMain,
                        }}
                      >
                        {u.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: textSub,
                        }}
                      >
                        {u.email}
                      </Text>
                    </View>
                    <Ionicons
                      name="add-circle"
                      size={24}
                      color={isDark ? "#38bdf8" : "#0284c7"}
                    />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Edit site modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !actionBusy && setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalOverlay}>
              <View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: isDark
                      ? "rgba(15,23,42,0.98)"
                      : "rgba(255,255,255,0.98)",
                  },
                ]}
              >
                <Text style={[styles.modalTitle, { color: textMain }]}>
                  Edit Site
                </Text>
                <Text style={[styles.modalSubtitle, { color: textSub }]}>
                  Update the site name, job number, location and address.
                </Text>

                <Text style={[styles.editLabel, { color: textSub }]}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Site name"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  style={[
                    styles.editInput,
                    {
                      color: textMain,
                      borderColor: isDark ? "#1f2937" : "#d1d5db",
                      backgroundColor: isDark
                        ? "rgba(15,23,42,0.9)"
                        : "rgba(248,250,252,1)",
                    },
                  ]}
                />

                <Text style={[styles.editLabel, { color: textSub }]}>
                  Job Number
                </Text>
                <TextInput
                  value={editCode}
                  onChangeText={setEditCode}
                  placeholder="Job number (optional)"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  style={[
                    styles.editInput,
                    {
                      color: textMain,
                      borderColor: isDark ? "#1f2937" : "#d1d5db",
                      backgroundColor: isDark
                        ? "rgba(15,23,42,0.9)"
                        : "rgba(248,250,252,1)",
                    },
                  ]}
                />

                <Text style={[styles.editLabel, { color: textSub }]}>
                  Location
                </Text>
                <TextInput
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="Location (optional)"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  style={[
                    styles.editInput,
                    {
                      color: textMain,
                      borderColor: isDark ? "#1f2937" : "#d1d5db",
                      backgroundColor: isDark
                        ? "rgba(15,23,42,0.9)"
                        : "rgba(248,250,252,1)",
                    },
                  ]}
                />

                <Text style={[styles.editLabel, { color: textSub }]}>
                  Address
                </Text>
                <TextInput
                  value={editAddress}
                  onChangeText={setEditAddress}
                  placeholder="Address (optional)"
                  placeholderTextColor={isDark ? "#64748b" : "#9ca3af"}
                  style={[
                    styles.editInput,
                    {
                      color: textMain,
                      borderColor: isDark ? "#1f2937" : "#d1d5db",
                      backgroundColor: isDark
                        ? "rgba(15,23,42,0.9)"
                        : "rgba(248,250,252,1)",
                    },
                  ]}
                />

                <View style={styles.modalButtonsRow}>
                  <Pressable
                    disabled={actionBusy}
                    onPress={() => {
                      if (actionBusy) return;
                      setEditModalVisible(false);
                    }}
                    style={[styles.modalButton, styles.modalCancelButton]}
                  >
                    <Text style={[styles.modalButtonText, { color: textSub }]}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={actionBusy}
                    onPress={handleSaveEdit}
                    style={[
                      styles.modalButton,
                      styles.modalPrimaryButton,
                      actionBusy && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalButtonText,
                        { color: "#fff", fontWeight: "900" },
                      ]}
                    >
                      {actionBusy ? "Saving…" : "Save Changes"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Order modal */}
      <Modal
        visible={newOrderOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !newOrderBusy && setNewOrderOpen(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.drawerOverlay}>
            <Pressable
              style={styles.drawerBackdrop}
              onPress={() => !newOrderBusy && setNewOrderOpen(false)}
            />
            <View style={[styles.drawerContainer, { height: SCREEN_HEIGHT * 0.85, backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
              <View style={styles.drawerHandle}>
                <View style={[styles.drawerHandleBar, { backgroundColor: isDark ? "#475569" : "#cbd5e1" }]} />
              </View>
              <View style={styles.drawerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.drawerTitle, { color: textMain }]}>New Order</Text>
                  <Text style={[styles.drawerSubtitle, { color: textSub }]}>{site?.name}</Text>
                </View>
                <Pressable onPress={() => !newOrderBusy && setNewOrderOpen(false)} style={styles.drawerCloseBtn}>
                  <Ionicons name="close" size={24} color={textMain} />
                </Pressable>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                {/* Reference */}
                <View>
                  <Text style={[styles.fieldLabel, { color: textSub }]}>Reference (optional)</Text>
                  <TextInput
                    value={newOrderRef}
                    onChangeText={setNewOrderRef}
                    placeholder="e.g. PO-2024-001"
                    placeholderTextColor={textSub}
                    style={[styles.fieldInputLg, { color: textMain, borderColor: isDark ? "#1f2937" : "#e5e7eb", backgroundColor: isDark ? "rgba(30,41,59,0.8)" : "#f8fafc" }]}
                  />
                </View>

                {/* Supplier */}
                <View>
                  <Text style={[styles.fieldLabel, { color: textSub }]}>Supplier (optional)</Text>
                  <Pressable
                    onPress={openSupplierPicker}
                    style={[styles.pickerRow, { borderColor: isDark ? "#1f2937" : "#e5e7eb", backgroundColor: isDark ? "rgba(30,41,59,0.8)" : "#f8fafc" }]}
                  >
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: newOrderSupplier ? textMain : textSub }}>
                      {newOrderSupplier ? newOrderSupplier.name : "Select supplier…"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={textSub} />
                  </Pressable>
                </View>

                {/* Items */}
                <View>
                  <View style={[styles.roleHeaderRow, { marginBottom: 8 }]}>
                    <Text style={[styles.fieldLabel, { color: textSub, marginBottom: 0 }]}>Items</Text>
                    <Pressable onPress={openProductPicker} style={styles.addAssignBtn}>
                      <Ionicons name="add" size={14} color="#fff" />
                      <Text style={styles.addAssignBtnText}>Add Product</Text>
                    </Pressable>
                  </View>

                  {newOrderItems.length === 0 ? (
                    <Text style={[styles.sectionBodyText, { color: textSub }]}>No items yet. Tap "Add Product" above.</Text>
                  ) : (
                    newOrderItems.map(({ product, qty }, idx) => (
                      <View key={`${product.id}-${idx}`} style={[styles.orderItemRow, { borderColor: isDark ? "#1f2937" : "#e5e7eb", backgroundColor: isDark ? "rgba(30,41,59,0.5)" : "#f8fafc" }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[{ fontSize: 13, fontWeight: "800", color: textMain }]}>{product.name}</Text>
                          {product.uom && <Text style={[{ fontSize: 11, color: textSub }]}>{product.uom}</Text>}
                        </View>
                        <TextInput
                          value={qty}
                          onChangeText={(v) => updateOrderItemQty(idx, v)}
                          keyboardType="numeric"
                          style={[styles.qtyInput, { color: textMain, borderColor: isDark ? "#1f2937" : "#e5e7eb", backgroundColor: isDark ? "rgba(15,23,42,0.8)" : "#fff" }]}
                          placeholder="Qty"
                          placeholderTextColor={textSub}
                        />
                        <Pressable onPress={() => removeOrderItem(idx)} style={{ padding: 4 }}>
                          <Ionicons name="close-circle" size={20} color="#ef4444" />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>

                {/* Submit */}
                <Pressable
                  onPress={handleCreateOrder}
                  disabled={newOrderBusy}
                  style={[styles.submitBtn, newOrderBusy && { opacity: 0.6 }]}
                >
                  {newOrderBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Create Order</Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Product picker modal */}
      <Modal
        visible={productPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProductPickerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setProductPickerOpen(false)} />
          <View style={[styles.drawerContainer, { height: SCREEN_HEIGHT * 0.7, backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
            <View style={styles.drawerHandle}>
              <View style={[styles.drawerHandleBar, { backgroundColor: isDark ? "#475569" : "#cbd5e1" }]} />
            </View>
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: textMain }]}>Select Product</Text>
              <Pressable onPress={() => setProductPickerOpen(false)} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color={textMain} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <View style={[styles.searchBox2, { backgroundColor: isDark ? "rgba(30,41,59,0.8)" : "#f8fafc", borderColor: isDark ? "#1f2937" : "#e5e7eb" }]}>
                <Ionicons name="search" size={15} color={textSub} />
                <TextInput
                  value={productSearch}
                  onChangeText={handleProductSearch}
                  placeholder="Search products…"
                  placeholderTextColor={textSub}
                  autoFocus
                  style={{ flex: 1, fontSize: 13, fontWeight: "600", color: textMain }}
                />
              </View>
            </View>
            {productSearchLoading ? (
              <View style={styles.drawerLoading}>
                <ActivityIndicator size="large" color="#9333ea" />
              </View>
            ) : (
              <FlatList
                data={productSearchResults}
                keyExtractor={(p) => p.id}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, gap: 6 }}
                ListEmptyComponent={<Text style={[styles.sectionBodyText, { color: textSub, textAlign: "center", paddingTop: 40 }]}>No products found.</Text>}
                renderItem={({ item: p }) => (
                  <Pressable
                    onPress={() => addProductToOrder(p)}
                    style={({ pressed }) => [
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        padding: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isDark ? "#1f2937" : "#e5e7eb",
                        backgroundColor: pressed
                          ? isDark ? "rgba(147,51,234,0.12)" : "rgba(147,51,234,0.06)"
                          : "transparent",
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: textMain }}>{p.name}</Text>
                      {p.uom && <Text style={{ fontSize: 11, color: textSub }}>{p.uom}</Text>}
                    </View>
                    <Ionicons name="add-circle" size={22} color="#9333ea" />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Supplier picker modal */}
      <Modal
        visible={supplierPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSupplierPickerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setSupplierPickerOpen(false)} />
          <View style={[styles.drawerContainer, { height: SCREEN_HEIGHT * 0.55, backgroundColor: isDark ? "rgba(15,23,42,0.98)" : "#fff" }]}>
            <View style={styles.drawerHandle}>
              <View style={[styles.drawerHandleBar, { backgroundColor: isDark ? "#475569" : "#cbd5e1" }]} />
            </View>
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: textMain }]}>Select Supplier</Text>
              <Pressable onPress={() => setSupplierPickerOpen(false)} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color={textMain} />
              </Pressable>
            </View>
            <FlatList
              data={supplierList}
              keyExtractor={(s) => s.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 6 }}
              ListHeaderComponent={
                <Pressable
                  onPress={() => { setNewOrderSupplier(null); setSupplierPickerOpen(false); }}
                  style={[{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: isDark ? "#1f2937" : "#e5e7eb", marginBottom: 4 }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: textSub }}>No supplier</Text>
                </Pressable>
              }
              ListEmptyComponent={<ActivityIndicator size="large" color="#9333ea" style={{ marginTop: 32 }} />}
              renderItem={({ item: s }) => (
                <Pressable
                  onPress={() => { setNewOrderSupplier(s); setSupplierPickerOpen(false); }}
                  style={({ pressed }) => [
                    {
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: newOrderSupplier?.id === s.id ? "#9333ea" : isDark ? "#1f2937" : "#e5e7eb",
                      backgroundColor: pressed
                        ? isDark ? "rgba(147,51,234,0.1)" : "rgba(147,51,234,0.05)"
                        : "transparent",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14, fontWeight: "800", color: textMain }}>{s.name}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

function LabelRow({
  icon,
  label,
  value,
  iconColor,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  iconColor?: string;
  isLast?: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const defaultIconColor = isDark ? "#94a3b8" : "#6b7280";

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.labelWithIcon}>
        <Ionicons name={icon} size={16} color={iconColor || defaultIconColor} />
        <Text
          style={[styles.rowLabel, { color: isDark ? "#94a3b8" : "#6b7280" }]}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[styles.rowValue, { color: isDark ? "#e5e7eb" : "#111827" }]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  backPill: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  wagesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  wagesTextCol: {
    alignItems: "flex-end",
  },
  wagesLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  wagesValue: {
    fontSize: 14,
    fontWeight: "900",
  },
  backContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backTxt: {
    fontWeight: "900",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 4,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  errorText: {
    color: "#f97373",
    fontWeight: "700",
    flex: 1,
  },
  detailCard: {
    gap: 8,
  },
  actionsCard: {
    marginTop: 12,
    gap: 10,
    padding: 12,
  },
  actionButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  editLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
    marginTop: 8,
  },
  editInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "700",
  },
  assignCard: {
    marginTop: 12,
    gap: 10,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.5)",
  },
  labelWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionBodyText: {
    fontSize: 13,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  emptyRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  assignList: {
    marginTop: 8,
    gap: 8,
  },
  roleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  roleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  addAssignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#262D68",
  },
  addAssignBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },
  endAssignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  endAssignBtnText: {
    color: "#ef4444",
    fontWeight: "800",
    fontSize: 11,
  },
  assignRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.3)",
  },
  assignName: {
    fontSize: 14,
    fontWeight: "900",
  },
  assignMeta: {
    fontSize: 12,
    fontWeight: "700",
  },
  assignMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalCancelButton: {
    backgroundColor: "transparent",
  },
  modalPrimaryButton: {
    backgroundColor: "#262D68",
  },
  modalButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  // Drawer styles (used by picker modal)
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawerContainer: {
    height: SCREEN_HEIGHT * 0.85,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  drawerHandle: {
    alignItems: "center",
    paddingVertical: 12,
  },
  drawerHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.2)",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  drawerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  drawerCloseBtn: {
    padding: 8,
  },
  drawerContent: {
    flex: 1,
  },
  drawerContentInner: {
    padding: 16,
    paddingBottom: 32,
  },
  drawerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  drawerLoadingText: {
    fontSize: 14,
    fontWeight: "600",
  },
  drawerError: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  drawerErrorText: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  drawerEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  drawerEmptyText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // Costs
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  costDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  costLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  costValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  // Product orders
  productOrderCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 0,
  },
  productOrderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  productOrderRef: {
    fontSize: 14,
    fontWeight: "900",
  },
  productOrderMeta: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  orderTotalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  productOrderTotal: {
    fontSize: 13,
    fontWeight: "900",
  },
  productOrderItem: {
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  productOrderItemName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  productOrderItemQty: {
    fontSize: 12,
    fontWeight: "600",
  },
  orderTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 1,
    marginBottom: 2,
  },
  orderTableHeaderCell: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  orderTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  orderTableCell: {
    fontSize: 12,
    fontWeight: "700",
  },
  // New order modal helpers
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  fieldInputLg: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  pickerRow: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  qtyInput: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  submitBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#262D68",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  searchBox2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
});
