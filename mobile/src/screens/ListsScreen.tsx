import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  FolderPlus,
  Trash2,
  Pencil,
  Share2,
  Pin,
  X,
  History,
  List,
  ListTree,
} from "lucide-react-native";
import {
  getPinnedWidgetConfig,
  setPinnedWidgetConfig,
  type PinnedWidgetConfig,
} from "../services/widgetPreferences";
import {
  getListsViewMode,
  setListsViewMode,
  type ListsViewMode,
} from "../services/listViewPreferences";
import { syncPinnedList } from "../services/widgetSync";
import { useTaskSortPreferences } from "../hooks/useTaskSortPreferences";
import { apiClient } from "../api/client";
import {
  TodoList,
  TodoItem,
  describeListActivityAction,
  resolveTaskSortMode,
  PRESET_CATEGORIES,
  type CategoryOption,
  type ListActivityEntry,
} from "../shared";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { ListCardSkeleton } from "../components/SkeletonLoader";
import { ListRow } from "../components/ListRow";
import { EditListModal } from "../components/EditListModal";
import { ShareListModal } from "../components/ShareListModal";
import {
  typography,
  spacing,
  MIN_TOUCH_TARGET,
  getTabScreenBottomPadding,
  getSheetBottomPadding,
} from "../theme/theme";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";
import {
  formatListRowMeta,
  buildListPreviewTasks,
} from "../utils/format";
import {
  buildCategorizedListName,
} from "../shared/mobile-ux";

interface ListsScreenProps {
  activeListId: string;
  onSelectList: (id: string, options?: { stayOnListsTab?: boolean }) => void;
  /** Set when the Pinned List widget's switch button opened the app to choose its list. */
  pickPinnedListRequestId?: number | null;
  /** Called once the request is picked up, so a later visit to the tab doesn't reopen it. */
  onPickPinnedListHandled?: () => void;
}

export const ListsScreen: React.FC<ListsScreenProps> = ({
  activeListId,
  onSelectList,
  pickPinnedListRequestId,
  onPickPinnedListHandled,
}) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError, showSuccess } = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ListsViewMode>("simple");
  const [actionSheetList, setActionSheetList] = useState<TodoList | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [sharingList, setSharingList] = useState<TodoList | null>(null);
  const [activityList, setActivityList] = useState<TodoList | null>(null);
  const [activityEntries, setActivityEntries] = useState<ListActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [pinnedConfig, setPinnedConfig] = useState<PinnedWidgetConfig | null>(null);

  useEffect(() => {
    getPinnedWidgetConfig().then(setPinnedConfig);
    getListsViewMode().then(setViewMode);
  }, []);

  // Choosing the Pinned List widget's list (from the widget's switch button): tapping a
  // list then shows it on the widget instead of opening it. Started during render
  // (React's "adjust state when a prop changes" pattern), then the parent is told in an
  // effect that the request was used up.
  const [pickingPinnedList, setPickingPinnedList] = useState(false);
  const [handledPickRequestId, setHandledPickRequestId] = useState<number | null>(null);
  if (pickPinnedListRequestId && pickPinnedListRequestId !== handledPickRequestId) {
    setHandledPickRequestId(pickPinnedListRequestId);
    setPickingPinnedList(true);
  }
  useEffect(() => {
    if (handledPickRequestId === null) return;
    // Re-read the widget's setting so the PINNED badge and its view are current.
    getPinnedWidgetConfig().then(setPinnedConfig);
    onPickPinnedListHandled?.();
  }, [handledPickRequestId, onPickPinnedListHandled]);

  const [newListName, setNewListName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [customCategoryText, setCustomCategoryText] = useState("");

  const taskSortPrefs = useTaskSortPreferences();

  const { data: lists, isLoading, isRefetching, refetch, isError, error } = useQuery({
    queryKey: ["lists", "all"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/lists?scope=all");
      return res.data.lists as TodoList[];
    },
  });

  const ownedLists = useMemo(
    () => (lists || []).filter((l) => l.isOwner !== false),
    [lists]
  );
  const sharedLists = useMemo(
    () => (lists || []).filter((l) => l.isOwner === false),
    [lists]
  );

  const listSections = useMemo(
    () => [
      { title: "My lists", data: ownedLists, shared: false },
      { title: "Shared with me", data: sharedLists, shared: true },
    ],
    [ownedLists, sharedLists]
  );

  const { data: activeListTodos, refetch: refetchPreview } = useQuery({
    queryKey: ["active_list_todos_preview", activeListId],
    queryFn: async () => {
      if (!activeListId) return [];
      const res = await apiClient.get(`/api/v1/todos?listId=${activeListId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!activeListId,
  });

  const activeListSortMode = resolveTaskSortMode(
    taskSortPrefs.appDefault,
    taskSortPrefs.overrides[activeListId]
  );

  const activeListPreview = useMemo(() => {
    if (!activeListTodos) return null;
    return buildListPreviewTasks(activeListTodos, activeListSortMode);
  }, [activeListTodos, activeListSortMode]);

  useEffect(() => {
    refetch();
    if (activeListId) {
      refetchPreview();
    }
  }, [activeListId, refetch, refetchPreview]);

  const handleRefresh = () => {
    refetch();
    if (activeListId) {
      refetchPreview();
    }
  };

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  /** Shows a list on the Pinned List widget and updates the widget right away. */
  const pinListToWidget = async (item: TodoList, mode: PinnedWidgetConfig["mode"]) => {
    const newConfig: PinnedWidgetConfig = { mode, listId: item.id };
    await setPinnedWidgetConfig(newConfig);
    setPinnedConfig(newConfig);
    await syncPinnedList(item.id, item, undefined, queryClient);
  };

  const pickPinnedList = async (item: TodoList) => {
    triggerImpactHaptic();
    setPickingPinnedList(false);
    // Keep the widget's current view (list or Up Next) and change only its list.
    await pinListToWidget(item, pinnedConfig?.mode ?? "list");
    showSuccess(`Widget now shows "${item.name}"`);
  };

  const onMutationError = (e: unknown, fallback: string) => {
    triggerErrorHaptic(hapticsEnabled);
    showError(getErrorMessage(e, fallback));
  };

  const createListMutation = useMutation({
    mutationFn: async ({ name, category }: { name: string; category?: string | null }) => {
      const res = await apiClient.post("/api/v1/lists", { name, category });
      return res.data.list as TodoList;
    },
    onSuccess: (newList) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => (old ? [...old, newList] : [newList]));
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onSelectList(newList.id);
      setNewListName("");
      setCustomCategoryText("");
      setModalVisible(false);
    },
    onError: (e) => onMutationError(e, "Couldn't create list"),
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/api/v1/lists/${id}`);
      return {
        id,
        pendingApproval: Boolean(res.data?.pendingApproval),
        message: res.data?.message as string | undefined,
      };
    },
    onSuccess: (result) => {
      triggerImpactHaptic();
      if (result.pendingApproval) {
        showSuccess(
          result.message || "Delete request sent. The list owner must approve it."
        );
        queryClient.invalidateQueries({ queryKey: ["delete-requests", result.id] });
        return;
      }
      const deletedId = result.id;
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => {
        const remaining = old ? old.filter((l) => l.id !== deletedId) : [];
        if (deletedId === activeListId && remaining.length > 0) {
          onSelectList(remaining[0].id);
        }
        return remaining;
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["todos", deletedId] });
      if (pinnedConfig?.listId === deletedId) {
        setPinnedWidgetConfig(null).catch(() => {});
        setPinnedConfig(null);
        syncPinnedList(null).catch(() => {});
      }
    },
    onError: (e) => onMutationError(e, "Couldn't delete list"),
  });

  const removeSharedMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/lists/${id}/shared`);
    },
    onSuccess: (_, removedId) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => {
        const remaining = old ? old.filter((l) => l.id !== removedId) : [];
        if (removedId === activeListId) {
          const nextOwned = remaining.find((l) => l.isOwner !== false);
          if (nextOwned) onSelectList(nextOwned.id);
        }
        return remaining;
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      if (pinnedConfig?.listId === removedId) {
        setPinnedWidgetConfig(null).catch(() => {});
        setPinnedConfig(null);
        syncPinnedList(null).catch(() => {});
      }
      showSuccess("Removed from Shared with me");
    },
    onError: (e) => onMutationError(e, "Couldn't remove shared list"),
  });

  const handleCreateList = () => {
    if (!newListName.trim() || createListMutation.isPending) return;
    const categoryName = selectedCategory
      ? selectedCategory.name === "Custom"
        ? customCategoryText.trim() || "Custom"
        : selectedCategory.name
      : null;
    const fullName = selectedCategory
      ? buildCategorizedListName(selectedCategory.emoji, selectedCategory.name, newListName)
      : newListName.trim();
    createListMutation.mutate({ name: fullName, category: categoryName ?? undefined });
  };

  const openEditModal = (list: TodoList) => {
    triggerImpactHaptic();
    setEditingList(list);
  };

  const handleDeleteList = (list: TodoList) => {
    triggerImpactHaptic();
    const isListOwner = list.isOwner !== false;
    const title = isListOwner ? "Delete List" : "Request list deletion?";
    const message = isListOwner
      ? `Are you sure you want to delete "${list.name}" and all its tasks?`
      : `Ask the owner to delete "${list.name}"? They'll need to approve before the list is removed.`;
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isListOwner ? "Delete" : "Send request",
        style: "destructive",
        onPress: () => deleteListMutation.mutate(list.id),
      },
    ]);
  };

  const openActivity = (list: TodoList) => {
    triggerImpactHaptic();
    setActivityList(list);
    setActivityEntries([]);
    setActivityHasMore(false);
    setActivityError(false);
    void loadActivity(list.id, null, true);
  };

  const loadActivity = async (listId: string, before: number | null, replace: boolean) => {
    setActivityLoading(true);
    setActivityError(false);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (before != null) params.set("before", String(before));
      const res = await apiClient.get(`/api/v1/lists/${listId}/activity?${params.toString()}`);
      let rawEntries = res.data.entries;
      if (!rawEntries) rawEntries = [];
      const entries = rawEntries as ListActivityEntry[];
      setActivityEntries((prev) => {
        if (replace) return entries;
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...entries.filter((e) => !seen.has(e.id))];
      });
      setActivityHasMore(entries.length >= 50);
    } catch {
      setActivityError(true);
    }
    setActivityLoading(false);
  };

  const closeActivity = () => {
    setActivityList(null);
    setActivityEntries([]);
    setActivityHasMore(false);
    setActivityError(false);
  };

  const sheetOverlay = (children: React.ReactNode, onClose: () => void) => (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: theme.surface,
              borderColor: theme.cardBorder,
              paddingBottom: getSheetBottomPadding(insets.bottom, spacing.lg),
            },
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTextGroup}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
            Lists
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            Your lists and lists shared with you
          </Text>
        </View>

        <View style={styles.headerControls}>
          <TouchableOpacity
            style={[
              styles.viewModeToggle,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
              },
            ]}
            onPress={() => {
              triggerImpactHaptic();
              const nextMode: ListsViewMode = viewMode === "simple" ? "details" : "simple";
              setViewMode(nextMode);
              void setListsViewMode(nextMode);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              viewMode === "details"
                ? "Switch to simple list view"
                : "Switch to details view with task preview"
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {viewMode === "details" ? (
              <ListTree size={16} color={theme.accent} />
            ) : (
              <List size={16} color={theme.textSecondary} />
            )}
            <Text
              style={[
                styles.viewModeText,
                { color: viewMode === "details" ? theme.accent : theme.textSecondary },
              ]}
            >
              {viewMode === "details" ? "Details" : "Simple"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createListHeaderBtn, { backgroundColor: theme.accent }]}
            onPress={() => {
              triggerImpactHaptic();
              setModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create list"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FolderPlus size={16} color="#FFFFFF" />
            <Text style={styles.createListHeaderText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {pickingPinnedList ? (
        <View
          style={[styles.pickBanner, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
          accessibilityRole="summary"
        >
          <Pin size={16} color={theme.accent} fill={theme.accent} />
          <Text style={[styles.pickBannerText, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Tap a list to show it on your Pinned List widget
          </Text>
          <TouchableOpacity
            onPress={() => setPickingPinnedList(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel choosing a widget list"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.pickBannerCancel, { color: theme.accent }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ gap: 8 }}>
          <ListCardSkeleton />
          <ListCardSkeleton />
          <ListCardSkeleton />
          <ListCardSkeleton />
          <ListCardSkeleton />
        </View>
      ) : isError && !lists ? (
        <View style={styles.errorBox}>
          <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Couldn&apos;t load lists</Text>
          <Text style={[styles.errorBody, { color: theme.textMuted }]}>
            {getErrorMessage(error, "Check your connection and try again.")}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.accent }]}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={listSections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: getTabScreenBottomPadding(insets.bottom) }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeaderText, { color: theme.textMuted }]}>
                {section.title}
              </Text>
              {section.shared && section.data.length === 0 ? (
                <Text style={[styles.sectionEmptyHint, { color: theme.textMuted }]}>
                  Open a shared link to add lists here
                </Text>
              ) : null}
            </View>
          )}
          renderItem={({ item, section }) => {
            const isActive = item.id === activeListId;
            const isPinned = pinnedConfig?.listId === item.id;
            const isShared = section.shared;
            const ownerName = item.owner?.displayName;
            const effectiveItem =
              isActive && activeListPreview
                ? { ...item, openTaskCount: activeListPreview.openTasks.length }
                : item;

            return (
              <ListRow
                item={effectiveItem}
                isActive={isActive}
                isPinned={isPinned}
                isShared={isShared}
                ownerName={ownerName}
                viewMode={viewMode}
                pickingPinnedList={pickingPinnedList}
                previewData={isActive ? activeListPreview : null}
                onPress={(item) => {
                  if (pickingPinnedList) {
                    void pickPinnedList(item);
                    return;
                  }
                  triggerImpactHaptic();
                  if (viewMode === "details" && item.id !== activeListId) {
                    onSelectList(item.id, { stayOnListsTab: true });
                    return;
                  }
                  onSelectList(item.id);
                }}
                onOpenActions={(target) => {
                  triggerImpactHaptic();
                  setActionSheetList(target);
                }}
              />
            );
          }}
        />
      )}

      {/* List Action Sheet */}
      {!!actionSheetList &&
        sheetOverlay(
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary, marginBottom: 2 }]} numberOfLines={1}>
              {actionSheetList.name}
            </Text>
            <Text style={[styles.sheetMetaSubtitle, { color: theme.textMuted, marginBottom: 16 }]} numberOfLines={1}>
              {formatListRowMeta({
                openTaskCount:
                  actionSheetList.id === activeListId && activeListPreview
                    ? activeListPreview.openTasks.length
                    : actionSheetList.openTaskCount,
                category: actionSheetList.category,
                shareMode: actionSheetList.shareMode,
                isOwner: actionSheetList.isOwner,
                ownerDisplayName: actionSheetList.owner?.displayName,
              })}
            </Text>

            <View style={styles.sheetActionsList}>
              {/* Pin / unpin to widget */}
              <TouchableOpacity
                style={[styles.sheetActionItem, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                onPress={async () => {
                  const target = actionSheetList;
                  setActionSheetList(null);
                  triggerImpactHaptic();
                  const isPinned = pinnedConfig?.listId === target.id;
                  if (isPinned) {
                    await setPinnedWidgetConfig(null);
                    setPinnedConfig(null);
                    await syncPinnedList(null);
                    showSuccess("Unpinned from widget");
                  } else {
                    await pinListToWidget(target, "list");
                    showSuccess(`Pinned "${target.name}" to widget`);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  pinnedConfig?.listId === actionSheetList.id
                    ? `Unpin ${actionSheetList.name} from widget`
                    : `Pin ${actionSheetList.name} to widget`
                }
              >
                <Pin
                  size={18}
                  color={pinnedConfig?.listId === actionSheetList.id ? theme.accent : theme.textPrimary}
                  fill={pinnedConfig?.listId === actionSheetList.id ? theme.accent : "none"}
                />
                <Text
                  style={[
                    styles.sheetActionItemText,
                    { color: pinnedConfig?.listId === actionSheetList.id ? theme.accent : theme.textPrimary },
                  ]}
                >
                  {pinnedConfig?.listId === actionSheetList.id ? "Unpin from widget" : "Pin to widget"}
                </Text>
              </TouchableOpacity>

              {/* Owned list actions */}
              {actionSheetList.isOwner !== false ? (
                <>
                  <TouchableOpacity
                    style={[styles.sheetActionItem, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                    onPress={() => {
                      const target = actionSheetList;
                      setActionSheetList(null);
                      triggerImpactHaptic();
                      setSharingList(target);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${actionSheetList.name}`}
                  >
                    <Share2 size={18} color={theme.accent} />
                    <Text style={[styles.sheetActionItemText, { color: theme.textPrimary }]}>Share list access</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.sheetActionItem, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                    onPress={() => {
                      const target = actionSheetList;
                      setActionSheetList(null);
                      openEditModal(target);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${actionSheetList.name}`}
                  >
                    <Pencil size={18} color={theme.textPrimary} />
                    <Text style={[styles.sheetActionItemText, { color: theme.textPrimary }]}>Edit list details</Text>
                  </TouchableOpacity>

                  {(actionSheetList.shareMode || "private") !== "private" && (
                    <TouchableOpacity
                      style={[styles.sheetActionItem, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                      onPress={() => {
                        const target = actionSheetList;
                        setActionSheetList(null);
                        openActivity(target);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Activity for ${actionSheetList.name}`}
                    >
                      <History size={18} color={theme.accent} />
                      <Text style={[styles.sheetActionItemText, { color: theme.textPrimary }]}>View shared activity</Text>
                    </TouchableOpacity>
                  )}

                  {ownedLists.length > 1 && (
                    <TouchableOpacity
                      style={[
                        styles.sheetActionItem,
                        { backgroundColor: theme.inputBg, borderColor: theme.danger + "44" },
                      ]}
                      onPress={() => {
                        const target = actionSheetList;
                        setActionSheetList(null);
                        handleDeleteList(target);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${actionSheetList.name}`}
                    >
                      <Trash2 size={18} color={theme.danger} />
                      <Text style={[styles.sheetActionItemText, { color: theme.danger }]}>Delete list</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                /* Shared with me actions */
                <>
                  {actionSheetList.shareMode === "public_edit" && (
                    <TouchableOpacity
                      style={[
                        styles.sheetActionItem,
                        { backgroundColor: theme.inputBg, borderColor: theme.danger + "44" },
                      ]}
                      onPress={() => {
                        const target = actionSheetList;
                        setActionSheetList(null);
                        handleDeleteList(target);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Request delete for ${actionSheetList.name}`}
                    >
                      <Trash2 size={18} color={theme.danger} />
                      <Text style={[styles.sheetActionItemText, { color: theme.danger }]}>Request list deletion</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.sheetActionItem,
                      { backgroundColor: theme.inputBg, borderColor: theme.danger + "44" },
                    ]}
                    onPress={() => {
                      const target = actionSheetList;
                      setActionSheetList(null);
                      triggerImpactHaptic();
                      Alert.alert(
                        "Remove from Shared with me",
                        `Stop showing "${target.name}" in Shared with me? You can open the link again later.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => removeSharedMutation.mutate(target.id),
                          },
                        ]
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${actionSheetList.name} from Shared with me`}
                  >
                    <X size={18} color={theme.danger} />
                    <Text style={[styles.sheetActionItemText, { color: theme.danger }]}>
                      Remove from Shared with me
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 12, alignSelf: "center" }]}
              onPress={() => setActionSheetList(null)}
            >
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </>,
          () => setActionSheetList(null)
        )}

      {/* Create sheet */}
      {modalVisible &&
        sheetOverlay(
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Create Categorized List</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Select List Category Tag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              <TouchableOpacity
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedCategory === null }}
                style={[
                  styles.catBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  selectedCategory === null && {
                    backgroundColor: theme.accentLight,
                    borderColor: theme.accent,
                    borderWidth: 2,
                  },
                ]}
                onPress={() => setSelectedCategory(null)}
              >
                <Text style={styles.catEmoji}>🚫</Text>
                <Text
                  style={[
                    styles.catName,
                    { color: theme.textPrimary },
                    selectedCategory === null && { color: theme.accent, fontWeight: "700" },
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
              {PRESET_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedCategory?.name === cat.name }}
                  style={[
                    styles.catBtn,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    selectedCategory?.name === cat.name && {
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() =>
                    setSelectedCategory((prev) => (prev?.name === cat.name ? null : cat))
                  }
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.catName,
                      { color: theme.textPrimary },
                      selectedCategory?.name === cat.name && { color: theme.accent, fontWeight: "700" },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {selectedCategory?.name === "Custom" && (
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Custom Category Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  ]}
                  placeholder="e.g. Project X, Home Chores..."
                  placeholderTextColor={theme.inputPlaceholder}
                  value={customCategoryText}
                  onChangeText={setCustomCategoryText}
                />
              </View>
            )}

            <Text style={[styles.label, { color: theme.textMuted }]}>List Title</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              ]}
              placeholder="e.g. Supermarket, French HW, Big Movies..."
              placeholderTextColor={theme.inputPlaceholder}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: !newListName.trim() || createListMutation.isPending ? 0.5 : 1,
                  },
                ]}
                onPress={handleCreateList}
                disabled={!newListName.trim() || createListMutation.isPending}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !newListName.trim() || createListMutation.isPending,
                  busy: createListMutation.isPending,
                }}
              >
                {createListMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.createBtnText}>Create List</Text>
                )}
              </TouchableOpacity>
            </View>
          </>,
          () => setModalVisible(false)
        )}

      {/* Edit sheet */}
      <EditListModal
        visible={!!editingList}
        list={editingList}
        onClose={() => setEditingList(null)}
      />

      {/* Share sheet */}
      <ShareListModal
        visible={!!sharingList}
        list={sharingList}
        onClose={() => setSharingList(null)}
      />

      {/* Owner activity sheet */}
      {!!activityList &&
        sheetOverlay(
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Activity</Text>
            <Text style={[styles.label, { color: theme.textMuted }]}>{activityList.name}</Text>
            <Text style={[styles.hintText, { color: theme.textMuted, marginBottom: 8 }]}>
              Who changed this shared list, and from which IP. Only you can see this.
            </Text>
            {activityLoading && activityEntries.length === 0 ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} />
            ) : activityError && activityEntries.length === 0 ? (
              <TouchableOpacity
                onPress={() => activityList && void loadActivity(activityList.id, null, true)}
                accessibilityRole="button"
              >
                <Text style={[styles.hintText, { color: theme.accent, textAlign: "center" }]}>
                  {"Couldn't load activity. Tap to retry."}
                </Text>
              </TouchableOpacity>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }}>
                {activityEntries.length === 0 ? (
                  <Text style={[styles.hintText, { color: theme.textMuted, textAlign: "center", paddingVertical: 24 }]}>
                    No activity yet on this shared list.
                  </Text>
                ) : (
                  activityEntries.map((entry) => (
                    <View
                      key={entry.id}
                      style={[
                        styles.catBtn,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: theme.inputBorder,
                          width: "100%",
                          flexDirection: "column",
                          alignItems: "stretch",
                          marginBottom: 8,
                          gap: 4,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text style={{ fontSize: typography.sm, fontWeight: "700", color: theme.textPrimary, flex: 1 }}>
                          {describeListActivityAction(entry.action)}
                        </Text>
                        <Text style={{ fontSize: typography.xs, color: theme.textMuted }}>
                          {new Date(entry.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <Text style={{ fontSize: typography.xs, color: theme.textSecondary, fontWeight: "600" }}>
                        {entry.actorLabel}
                        {entry.actorType !== "owner" ? ` · ${entry.actorType}` : ""}
                      </Text>
                      {entry.summary ? (
                        <Text style={{ fontSize: typography.xs, color: theme.textMuted }}>{entry.summary}</Text>
                      ) : null}
                      {entry.clientIp ? (
                        <Text style={{ fontSize: typography.xs, color: theme.textMuted }}>
                          IP {entry.clientIp}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
                {activityHasMore && activityEntries.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.copyBtn, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}
                    disabled={activityLoading}
                    onPress={() => {
                      const oldest = activityEntries[activityEntries.length - 1]?.createdAt;
                      if (oldest == null || !activityList) return;
                      void loadActivity(activityList.id, oldest, false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Load more activity"
                  >
                    <Text style={[styles.copyBtnText, { color: theme.accent }]}>
                      {activityLoading ? "Loading…" : "Load more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 8, alignSelf: "center" }]}
              onPress={closeActivity}
            >
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </>,
          closeActivity
        )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.xxl - 2,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: typography.sm,
    marginTop: 2,
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  viewModeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET - 6,
  },
  viewModeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  createListHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET - 6,
  },
  createListHeaderText: {
    color: "#FFFFFF",
    fontSize: typography.xs,
    fontWeight: "700",
  },
  pickBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  pickBannerText: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  pickBannerCancel: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
  sectionHeaderRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  sectionHeaderText: {
    fontSize: typography.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sectionEmptyHint: {
    fontSize: typography.xs,
    marginTop: 4,
  },
  errorBox: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
    marginBottom: 6,
  },
  errorBody: {
    fontSize: typography.sm,
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  sheetMetaSubtitle: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  sheetActionsList: {
    gap: 8,
    marginVertical: 4,
  },
  sheetActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
  sheetActionItemText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  sheetDismiss: {
    flex: 1,
  },
  sheetContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    maxHeight: "88%",
    elevation: 10,
  },
  modalTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
    marginBottom: 14,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  catRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  catBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
    minHeight: MIN_TOUCH_TARGET - 4,
  },
  catEmoji: {
    fontSize: 16,
  },
  catName: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  input: {
    padding: 12,
    borderRadius: 12,
    fontSize: typography.sm,
    borderWidth: 1,
    marginBottom: 16,
    minHeight: MIN_TOUCH_TARGET,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontWeight: "600",
  },
  createBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
  },
  copyBtnText: {
    fontWeight: "700",
  },
  warnBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  warnText: {
    fontSize: typography.sm,
    fontWeight: "600",
    lineHeight: 18,
  },
  hintText: {
    fontSize: typography.xs,
    lineHeight: 16,
    marginTop: 6,
  },
});
