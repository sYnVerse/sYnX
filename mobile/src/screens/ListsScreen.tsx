import React, { useState, useEffect } from "react";
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
  Share,
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
  Tag,
  CheckCircle2,
  Circle,
  Pencil,
  Share2,
  Lock,
  Eye,
  Users,
  Copy,
  Pin,
} from "lucide-react-native";
import {
  getPinnedWidgetConfig,
  setPinnedWidgetConfig,
  type PinnedWidgetConfig,
} from "../services/widgetPreferences";
import { syncPinnedList } from "../services/widgetSync";
import { apiClient } from "../api/client";
import {
  TodoList,
  TodoItem,
  ShareMode,
  getShareModeLabel,
  getSharedNameNotice,
  isMakingListPublic,
} from "../shared";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { ListCardSkeleton } from "../components/SkeletonLoader";
import { typography, spacing, MIN_TOUCH_TARGET, getFabBottomOffset, getListBottomPadding } from "../theme/theme";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";
import { stripLeadingCategoryEmoji } from "../utils/format";
import {
  buildCategorizedListName,
  shouldWarnBeforeSharingPrivateList,
} from "../shared/mobile-ux";

function ShareModeIcon({ mode, color, size = 10 }: { mode: ShareMode; color: string; size?: number }) {
  if (mode === "public_read") return <Eye size={size} color={color} />;
  if (mode === "public_edit") return <Users size={size} color={color} />;
  return <Lock size={size} color={color} />;
}

interface ListsScreenProps {
  activeListId: string;
  onSelectList: (id: string) => void;
}

const CATEGORY_OPTIONS = [
  { name: "Checklist", emoji: "📋" },
  { name: "Study", emoji: "🎓" },
  { name: "Shopping", emoji: "🛒" },
  { name: "Movies", emoji: "🎬" },
  { name: "Work", emoji: "💼" },
  { name: "Personal", emoji: "🏠" },
  { name: "Travel", emoji: "✈️" },
  { name: "Fitness", emoji: "💪" },
  { name: "Custom", emoji: "✏️" },
];

export const ListsScreen: React.FC<ListsScreenProps> = ({ activeListId, onSelectList }) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError, showSuccess } = useToast();
  const insets = useSafeAreaInsets();
  const fabBottom = getFabBottomOffset(insets.bottom);
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [sharingList, setSharingList] = useState<TodoList | null>(null);
  const [pinnedConfig, setPinnedConfig] = useState<PinnedWidgetConfig | null>(null);

  useEffect(() => {
    getPinnedWidgetConfig().then(setPinnedConfig);
  }, []);

  const [newListName, setNewListName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_OPTIONS[0]);
  const [customCategoryText, setCustomCategoryText] = useState("");

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState(CATEGORY_OPTIONS[0]);
  const [editCustomCategoryText, setEditCustomCategoryText] = useState("");

  const { data: lists, isLoading, isRefetching, refetch, isError, error } = useQuery({
    queryKey: ["lists", "all"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/lists?scope=all");
      return res.data.lists as TodoList[];
    },
  });

  const ownedLists = React.useMemo(
    () => (lists || []).filter((l) => l.isOwner !== false),
    [lists]
  );
  const sharedLists = React.useMemo(
    () => (lists || []).filter((l) => l.isOwner === false),
    [lists]
  );

  const listSections = React.useMemo(
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

  const mainTasks = React.useMemo(() => {
    if (!activeListTodos) return [];
    const parentMap: Record<string, TodoItem & { subtasks: TodoItem[] }> = {};
    const topLevel: (TodoItem & { subtasks: TodoItem[] })[] = [];

    activeListTodos.forEach((t) => {
      if (!t.parentId) {
        const item = { ...t, subtasks: [] };
        parentMap[t.id] = item;
        topLevel.push(item);
      }
    });

    activeListTodos.forEach((st) => {
      if (st.parentId && parentMap[st.parentId]) {
        parentMap[st.parentId].subtasks.push(st);
      }
    });

    return topLevel;
  }, [activeListTodos]);

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const onMutationError = (e: unknown, fallback: string) => {
    triggerErrorHaptic(hapticsEnabled);
    showError(getErrorMessage(e, fallback));
  };

  const createListMutation = useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string }) => {
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

  const updateListMutation = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category: string }) => {
      await apiClient.put(`/api/v1/lists/${id}`, { name, category });
    },
    onSuccess: (_, variables) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => {
        if (!old) return [];
        return old.map((l) =>
          l.id === variables.id ? { ...l, name: variables.name, category: variables.category } : l
        );
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["list_meta", variables.id] });
      setEditingList(null);
    },
    onError: (e) => onMutationError(e, "Couldn't update list"),
  });

  const shareModeMutation = useMutation({
    mutationFn: async ({ id, shareMode }: { id: string; shareMode: ShareMode }) => {
      const res = await apiClient.put(`/api/v1/lists/${id}/share-mode`, { shareMode });
      return res.data.list as TodoList;
    },
    onSuccess: (updatedList) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => {
        if (!old) return [];
        return old.map((l) => (l.id === updatedList.id ? updatedList : l));
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["list_meta", updatedList.id] });
      if (sharingList && sharingList.id === updatedList.id) {
        setSharingList(updatedList);
      }
    },
    onError: (e) => onMutationError(e, "Couldn't update sharing"),
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/lists/${id}`);
    },
    onSuccess: (_, deletedId) => {
      triggerImpactHaptic();
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
    const categoryName =
      selectedCategory.name === "Custom" ? customCategoryText.trim() || "Custom" : selectedCategory.name;
    const fullName = buildCategorizedListName(
      selectedCategory.emoji,
      selectedCategory.name,
      newListName
    );
    createListMutation.mutate({ name: fullName, category: categoryName });
  };

  const handleUpdateList = () => {
    if (!editingList || !editName.trim() || updateListMutation.isPending) return;
    const categoryName =
      editCategory.name === "Custom" ? editCustomCategoryText.trim() || "Custom" : editCategory.name;
    const fullName = buildCategorizedListName(editCategory.emoji, editCategory.name, editName);
    updateListMutation.mutate({
      id: editingList.id,
      name: fullName,
      category: categoryName,
    });
  };

  const handleDeleteList = (list: TodoList) => {
    triggerImpactHaptic();
    Alert.alert("Delete List", `Are you sure you want to delete "${list.name}" and all its tasks?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteListMutation.mutate(list.id),
      },
    ]);
  };

  const openEditModal = (list: TodoList) => {
    triggerImpactHaptic();
    setEditingList(list);
    const matchingCat = CATEGORY_OPTIONS.find((c) => c.name === list.category);
    const cat = matchingCat || CATEGORY_OPTIONS.find((c) => c.name === "Custom") || CATEGORY_OPTIONS[0];
    setEditCategory(cat);
    setEditCustomCategoryText(matchingCat ? "" : list.category || "");
    setEditName(stripLeadingCategoryEmoji(list.name, matchingCat?.emoji || ""));
  };

  const listLink = (list: TodoList) => `https://synx.christran.io/${list.id}`;

  const handleShareLink = async (list: TodoList) => {
    if (shouldWarnBeforeSharingPrivateList(list.shareMode || "private")) {
      Alert.alert(
        "List is private",
        `Others can't open this link while the list is Private. Change sharing to View-Only or Collaborative first? ${getSharedNameNotice("private")}`,
        [
          { text: "Keep Private", style: "cancel" },
          {
            text: "Make View-Only",
            onPress: () => {
              shareModeMutation.mutate(
                { id: list.id, shareMode: "public_read" },
                {
                  onSuccess: (updated) => {
                    Share.share({
                      message: `Check out my list "${updated.name}" on sYnX: ${listLink(updated)}`,
                      url: listLink(updated),
                    }).catch(() => {});
                  },
                }
              );
            },
          },
          {
            text: "Make Collaborative",
            onPress: () => {
              shareModeMutation.mutate(
                { id: list.id, shareMode: "public_edit" },
                {
                  onSuccess: (updated) => {
                    Share.share({
                      message: `Check out my list "${updated.name}" on sYnX: ${listLink(updated)}`,
                      url: listLink(updated),
                    }).catch(() => {});
                  },
                }
              );
            },
          },
        ]
      );
      return;
    }
    try {
      await Share.share({
        message: `Check out my list "${list.name}" on sYnX: ${listLink(list)}`,
        url: listLink(list),
      });
    } catch (e) {
      console.error("Failed to share link", e);
    }
  };

  const handleCopyLink = async (list: TodoList) => {
    const link = listLink(list);
    if (shouldWarnBeforeSharingPrivateList(list.shareMode || "private")) {
      Alert.alert(
        "List is private",
        `Copied links won't work for others while this list is Private. Change sharing so others can open it? ${getSharedNameNotice("private")}`,
        [
          { text: "Copy anyway", onPress: () => copyText(link) },
          {
            text: "Make View-Only",
            onPress: () => {
              shareModeMutation.mutate(
                { id: list.id, shareMode: "public_read" },
                { onSuccess: () => copyText(link) }
              );
            },
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
    await copyText(link);
  };

  const copyText = async (text: string) => {
    try {
      // Prefer Share sheet with the link (works without extra clipboard dependency)
      await Share.share({ message: text, url: text });
      showSuccess("Link ready — choose Copy in the share sheet");
    } catch {
      // Fallback: show selectable alert
      Alert.alert("List link", text);
    }
  };

  const sheetOverlay = (children: React.ReactNode, onClose: () => void) => (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheetContent, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
          Lists
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          Your lists and lists shared with you
        </Text>
      </View>

      {isLoading ? (
        <View style={{ gap: 12 }}>
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
          contentContainerStyle={{ paddingBottom: getListBottomPadding(insets.bottom) }}
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
            const categoryTag = item.category || "Checklist";
            const shareMode = item.shareMode || "private";
            const isShared = section.shared;
            const ownerName = item.owner?.displayName;
            const isPinned = pinnedConfig?.listId === item.id;

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.listRow,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: isActive ? theme.accent : theme.cardBorder,
                    borderWidth: isActive ? 2 : 1,
                  },
                ]}
                onPress={() => {
                  triggerImpactHaptic();
                  onSelectList(item.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`List ${item.name}`}
              >
                <View style={styles.listRowHeader}>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Text style={[styles.listTitle, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
                      {item.name}
                    </Text>

                    {isShared && ownerName ? (
                      <View style={[styles.categoryPill, { backgroundColor: theme.accentLight }]}>
                        <Text style={[styles.categoryPillText, { color: theme.accent }]}>
                          {ownerName}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.categoryPill, { backgroundColor: theme.accentLight }]}>
                        <Tag size={10} color={theme.accent} />
                        <Text style={[styles.categoryPillText, { color: theme.accent }]}>{categoryTag}</Text>
                      </View>
                    )}

                    <View style={[styles.categoryPill, { backgroundColor: theme.inputBg }]}>
                      <ShareModeIcon mode={shareMode} color={theme.textSecondary} />
                      <Text style={[styles.categoryPillText, { color: theme.textSecondary }]}>
                        {getShareModeLabel(shareMode)}
                      </Text>
                    </View>

                    {isActive && (
                      <View style={[styles.activeBadge, { backgroundColor: theme.accent }]}>
                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                      </View>
                    )}

                    {isPinned && (
                      <View style={[styles.categoryPill, { backgroundColor: theme.accentLight }]}>
                        <Pin size={10} color={theme.accent} fill={theme.accent} />
                        <Text style={[styles.categoryPillText, { color: theme.accent }]}>PINNED</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={async () => {
                        triggerImpactHaptic();
                        if (isPinned) {
                          await setPinnedWidgetConfig(null);
                          setPinnedConfig(null);
                          await syncPinnedList(null);
                          showSuccess("Unpinned from widget");
                        } else {
                          const newConfig: PinnedWidgetConfig = { mode: "list", listId: item.id };
                          await setPinnedWidgetConfig(newConfig);
                          setPinnedConfig(newConfig);
                          await syncPinnedList(item.id, item, undefined, queryClient);
                          showSuccess(`Pinned "${item.name}" to widget`);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isPinned ? `Unpin ${item.name} from widget` : `Pin ${item.name} to widget`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Pin
                        size={16}
                        color={isPinned ? theme.accent : theme.textMuted}
                        fill={isPinned ? theme.accent : "none"}
                      />
                    </TouchableOpacity>
                    {isShared ? (
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => {
                          triggerImpactHaptic();
                          Alert.alert(
                            "Remove from Shared with me",
                            `Stop showing "${item.name}" in Shared with me? You can open the link again later.`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Remove",
                                style: "destructive",
                                onPress: () => removeSharedMutation.mutate(item.id),
                              },
                            ]
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name} from Shared with me`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={16} color={theme.danger} />
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => {
                            triggerImpactHaptic();
                            setSharingList(item);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Share ${item.name}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Share2 size={16} color={theme.accent} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => openEditModal(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.name}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Pencil size={16} color={theme.textMuted} />
                        </TouchableOpacity>

                        {ownedLists.length > 1 && (
                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => handleDeleteList(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${item.name}`}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={16} color={theme.danger} />
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </View>

                {isActive && (
                  <View style={[styles.previewSection, { borderTopColor: theme.cardBorder }]}>
                    <Text style={[styles.previewSectionTitle, { color: theme.textMuted }]}>
                      TASKS IN THIS LIST ({mainTasks.length})
                    </Text>

                    {mainTasks.length > 0 ? (
                      mainTasks.map((t) => (
                        <View key={t.id} style={{ marginBottom: 4 }}>
                          <View style={styles.todoPreviewItem}>
                            {t.completed ? (
                              <CheckCircle2 size={16} color={theme.accent} />
                            ) : (
                              <Circle size={16} color={theme.textMuted} />
                            )}
                            <Text
                              style={[
                                styles.todoPreviewText,
                                { color: theme.textPrimary },
                                t.completed && [styles.completedText, { color: theme.textMuted }],
                              ]}
                              numberOfLines={1}
                            >
                              {t.text}
                            </Text>
                            {t.durationMinutes ? (
                              <Text style={[styles.durationBadge, { color: theme.textMuted }]}>
                                {t.durationMinutes}m
                              </Text>
                            ) : null}
                          </View>

                          {t.subtasks &&
                            t.subtasks.map((st) => (
                              <View
                                key={st.id}
                                style={[styles.todoPreviewItem, { paddingLeft: 28, marginTop: 2 }]}
                              >
                                {st.completed ? (
                                  <CheckCircle2 size={13} color={theme.accent} />
                                ) : (
                                  <Circle size={13} color={theme.textMuted} />
                                )}
                                <Text
                                  style={[
                                    styles.todoPreviewText,
                                    { color: theme.textMuted, fontSize: typography.xs },
                                    st.completed && styles.completedText,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {st.text}
                                </Text>
                              </View>
                            ))}
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.emptyPreviewText, { color: theme.textMuted }]}>
                        No tasks in this list yet. Tap to add tasks!
                      </Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent, bottom: fabBottom }]}
        onPress={() => {
          triggerImpactHaptic();
          setModalVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Create list"
      >
        <FolderPlus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create sheet */}
      {modalVisible &&
        sheetOverlay(
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Create Categorized List</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Select List Category Tag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedCategory.name === cat.name }}
                  style={[
                    styles.catBtn,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    selectedCategory.name === cat.name && {
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.catName,
                      { color: theme.textPrimary },
                      selectedCategory.name === cat.name && { color: theme.accent, fontWeight: "700" },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {selectedCategory.name === "Custom" && (
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
      {!!editingList &&
        sheetOverlay(
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Edit List Details</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Category Tag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: editCategory.name === cat.name }}
                  style={[
                    styles.catBtn,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    editCategory.name === cat.name && {
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setEditCategory(cat)}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.catName,
                      { color: theme.textPrimary },
                      editCategory.name === cat.name && { color: theme.accent, fontWeight: "700" },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {editCategory.name === "Custom" && (
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Custom Category Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  ]}
                  placeholder="e.g. Project X, Home Chores..."
                  placeholderTextColor={theme.inputPlaceholder}
                  value={editCustomCategoryText}
                  onChangeText={setEditCustomCategoryText}
                />
              </View>
            )}

            <Text style={[styles.label, { color: theme.textMuted }]}>List Title</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              ]}
              value={editName}
              onChangeText={setEditName}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingList(null)}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: !editName.trim() || updateListMutation.isPending ? 0.5 : 1,
                  },
                ]}
                onPress={handleUpdateList}
                disabled={!editName.trim() || updateListMutation.isPending}
              >
                {updateListMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.createBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </>,
          () => setEditingList(null)
        )}

      {/* Share sheet */}
      {!!sharingList &&
        sheetOverlay(
          <>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Share List Access</Text>
            <Text style={[styles.label, { color: theme.textMuted }]}>{sharingList?.name}</Text>

            {sharingList?.shareMode === "private" ? (
              <View
                style={[styles.warnBox, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
              >
                <Text style={[styles.warnText, { color: theme.accent }]}>
                  This list is Private — others can&apos;t open a shared link until you change access below.
                </Text>
                <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                  {getSharedNameNotice("private")}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Access Permission</Text>
            <View style={{ gap: 8, marginVertical: 8 }}>
              {[
                { mode: "private" as ShareMode, label: "Private", desc: "Only you can view and edit", Icon: Lock },
                {
                  mode: "public_read" as ShareMode,
                  label: "View-Only",
                  desc: "Anyone with link can view, no edits",
                  Icon: Eye,
                },
                {
                  mode: "public_edit" as ShareMode,
                  label: "Collaborative",
                  desc: "Anyone with link can view and edit",
                  Icon: Users,
                },
              ].map(({ mode, label, desc, Icon }) => {
                const isSelected = sharingList?.shareMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.catBtn,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: theme.inputBorder,
                        width: "100%",
                        justifyContent: "flex-start",
                        minHeight: MIN_TOUCH_TARGET,
                      },
                      isSelected && {
                        backgroundColor: theme.accentLight,
                        borderColor: theme.accent,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => {
                      if (sharingList) {
                        const makingPublic = isMakingListPublic(sharingList.shareMode || "private", mode);
                        shareModeMutation.mutate(
                          { id: sharingList.id, shareMode: mode },
                          makingPublic ? { onSuccess: () => showSuccess(getSharedNameNotice(mode)) } : undefined
                        );
                      }
                    }}
                    disabled={shareModeMutation.isPending}
                  >
                    <Icon size={16} color={isSelected ? theme.accent : theme.textMuted} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text
                        style={[
                          { fontSize: typography.sm, fontWeight: "700", color: theme.textPrimary },
                          isSelected && { color: theme.accent },
                        ]}
                      >
                        {label}
                      </Text>
                      <Text style={{ fontSize: typography.xs, color: theme.textMuted }}>{desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {sharingList && sharingList.shareMode && sharingList.shareMode !== "private" ? (
              <Text style={[styles.hintText, { color: theme.textMuted, marginTop: 0 }]}>
                {getSharedNameNotice(sharingList.shareMode)}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: theme.accent, marginTop: 8 }]}
              onPress={() => {
                if (sharingList) handleShareLink(sharingList);
              }}
              accessibilityRole="button"
              accessibilityLabel="Share link"
            >
              <Text style={styles.createBtnText}>Share Link via App / System</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.copyBtn,
                { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, marginTop: 8 },
              ]}
              onPress={() => {
                if (sharingList) handleCopyLink(sharingList);
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy link"
            >
              <Copy size={16} color={theme.accent} />
              <Text style={[styles.copyBtnText, { color: theme.accent }]}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.cancelBtn, { marginTop: 8, alignSelf: "center" }]} onPress={() => setSharingList(null)}>
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </>,
          () => setSharingList(null)
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
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.xxl - 2,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: typography.sm,
    marginTop: 2,
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
  listRow: {
    width: "100%",
    padding: spacing.md,
    borderRadius: 20,
    marginBottom: 12,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  listRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listTitle: {
    fontSize: typography.lg,
    fontWeight: "700",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  categoryPillText: {
    fontSize: typography.xs,
    fontWeight: "700",
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    color: "#FFFFFF",
    fontSize: typography.xs,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actionIconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  previewSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  previewSectionTitle: {
    fontSize: typography.xs,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  todoPreviewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  todoPreviewText: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "500",
  },
  completedText: {
    textDecorationLine: "line-through",
  },
  durationBadge: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  emptyPreviewText: {
    fontSize: typography.sm,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: getFabBottomOffset(0),
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
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
