import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  Share,
  RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { FolderPlus, Trash2, Tag, CheckCircle2, Circle, Pencil, Share2, Lock, Eye, Users } from "lucide-react-native";
import { apiClient } from "../api/client";
import { TodoList, TodoItem, ShareMode } from "../../../shared";
import { useTheme } from "../context/ThemeContext";
import { ListCardSkeleton } from "../components/SkeletonLoader";

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
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [sharingList, setSharingList] = useState<TodoList | null>(null);

  const [newListName, setNewListName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_OPTIONS[0]);
  const [customCategoryText, setCustomCategoryText] = useState("");

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState(CATEGORY_OPTIONS[0]);
  const [editCustomCategoryText, setEditCustomCategoryText] = useState("");

  const { data: lists, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/lists");
      return res.data.lists as TodoList[];
    },
  });

  // Query tasks for active list preview
  const { data: activeListTodos, refetch: refetchPreview } = useQuery({
    queryKey: ["active_list_todos_preview", activeListId],
    queryFn: async () => {
      if (!activeListId) return [];
      const res = await apiClient.get(`/api/v1/todos?listId=${activeListId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!activeListId,
  });

  // Refetch on screen focus / mount
  useEffect(() => {
    refetch();
    if (activeListId) {
      refetchPreview();
    }
  }, [activeListId]);

  const handleRefresh = () => {
    refetch();
    if (activeListId) {
      refetchPreview();
    }
  };

  // Group subtasks under their parent tasks for the active list preview
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

  const createListMutation = useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string }) => {
      const res = await apiClient.post("/api/v1/lists", { name, category });
      return res.data.list as TodoList;
    },
    onSuccess: (newList) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists"], (old) => (old ? [...old, newList] : [newList]));
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onSelectList(newList.id);
      setNewListName("");
      setCustomCategoryText("");
      setModalVisible(false);
    },
  });

  const updateListMutation = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category: string }) => {
      await apiClient.put(`/api/v1/lists/${id}`, { name, category });
    },
    onSuccess: (_, variables) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists"], (old) => {
        if (!old) return [];
        return old.map((l) =>
          l.id === variables.id ? { ...l, name: variables.name, category: variables.category } : l
        );
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setEditingList(null);
    },
  });

  const shareModeMutation = useMutation({
    mutationFn: async ({ id, shareMode }: { id: string; shareMode: ShareMode }) => {
      const res = await apiClient.put(`/api/v1/lists/${id}/share-mode`, { shareMode });
      return res.data.list as TodoList;
    },
    onSuccess: (updatedList) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists"], (old) => {
        if (!old) return [];
        return old.map((l) => (l.id === updatedList.id ? updatedList : l));
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      if (sharingList && sharingList.id === updatedList.id) {
        setSharingList(updatedList);
      }
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/lists/${id}`);
    },
    onSuccess: (_, deletedId) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists"], (old) => {
        const remaining = old ? old.filter((l) => l.id !== deletedId) : [];
        if (deletedId === activeListId && remaining.length > 0) {
          onSelectList(remaining[0].id);
        }
        return remaining;
      });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["todos", deletedId] });
    },
  });

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const categoryName = selectedCategory.name === "Custom" ? (customCategoryText.trim() || "Custom") : selectedCategory.name;
    const fullName = selectedCategory.name === "Custom" ? newListName.trim() : `${selectedCategory.emoji} ${newListName.trim()}`;
    createListMutation.mutate({ name: fullName, category: categoryName });
  };

  const handleUpdateList = () => {
    if (!editingList || !editName.trim()) return;
    const categoryName = editCategory.name === "Custom" ? (editCustomCategoryText.trim() || "Custom") : editCategory.name;
    updateListMutation.mutate({
      id: editingList.id,
      name: editName.trim(),
      category: categoryName,
    });
  };

  const handleDeleteList = (list: TodoList) => {
    triggerImpactHaptic();
    Alert.alert(
      "Delete List",
      `Are you sure you want to delete "${list.name}" and all its tasks?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteListMutation.mutate(list.id),
        },
      ]
    );
  };

  const openEditModal = (list: TodoList) => {
    triggerImpactHaptic();
    setEditingList(list);
    setEditName(list.name);
    const matchingCat = CATEGORY_OPTIONS.find((c) => c.name === list.category);
    if (matchingCat) {
      setEditCategory(matchingCat);
      setEditCustomCategoryText("");
    } else {
      setEditCategory(CATEGORY_OPTIONS.find((c) => c.name === "Custom") || CATEGORY_OPTIONS[0]);
      setEditCustomCategoryText(list.category || "");
    }
  };

  const handleShareLink = async (list: TodoList) => {
    try {
      const link = `https://synx.christran.io/list/${list.id}`;
      await Share.share({
        message: `Check out my list "${list.name}" on sYnX: ${link}`,
        url: link,
      });
    } catch (e) {
      console.error("Failed to share link", e);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Lists</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
          Manage and switch between your task workspaces
        </Text>
      </View>

      {isLoading ? (
        <View style={{ gap: 12 }}>
          <ListCardSkeleton />
          <ListCardSkeleton />
          <ListCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={lists || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          renderItem={({ item }) => {
            const isActive = item.id === activeListId;
            const categoryTag = item.category || "Checklist";

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
              >
                {/* Header Row of List */}
                <View style={styles.listRowHeader}>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Text style={[styles.listTitle, { color: theme.textPrimary }]}>{item.name}</Text>
                    
                    {/* D1 Categorized Tag Badge */}
                    <View style={[styles.categoryPill, { backgroundColor: theme.accentLight }]}>
                      <Tag size={10} color={theme.accent} />
                      <Text style={[styles.categoryPillText, { color: theme.accent }]}>{categoryTag}</Text>
                    </View>

                    {isActive && (
                      <View style={[styles.activeBadge, { backgroundColor: theme.accent }]}>
                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => {
                        triggerImpactHaptic();
                        setSharingList(item);
                      }}
                    >
                      <Share2 size={15} color={theme.accent} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => openEditModal(item)}
                    >
                      <Pencil size={15} color={theme.textMuted} />
                    </TouchableOpacity>

                    {(lists?.length || 0) > 1 && (
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleDeleteList(item)}
                      >
                        <Trash2 size={16} color={theme.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Expanded Item Preview for Active List */}
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
                            {t.durationMinutes && (
                              <Text style={[styles.durationBadge, { color: theme.textMuted }]}>
                                {t.durationMinutes}m
                              </Text>
                            )}
                          </View>

                          {/* Subtasks nested under main task */}
                          {t.subtasks && t.subtasks.map((st) => (
                            <View key={st.id} style={[styles.todoPreviewItem, { paddingLeft: 28, marginTop: 2 }]}>
                              {st.completed ? (
                                <CheckCircle2 size={13} color={theme.accent} />
                              ) : (
                                <Circle size={13} color={theme.textMuted} />
                              )}
                              <Text
                                style={[
                                  styles.todoPreviewText,
                                  { color: theme.textMuted, fontSize: 12 },
                                  st.completed && styles.completedText,
                                ]}
                                numberOfLines={1}
                              >
                                {st.text}
                              </Text>
                              {st.durationMinutes && (
                                <Text style={[styles.durationBadge, { color: theme.textMuted, fontSize: 10 }]}>
                                  {st.durationMinutes}m
                                </Text>
                              )}
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

      {/* FAB Add List */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent }]}
        onPress={() => {
          triggerImpactHaptic();
          setModalVisible(true);
        }}
      >
        <FolderPlus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create New List Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Create Categorized List</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Select List Category Tag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
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
                  style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                  placeholder="e.g. Project X, Home Chores..."
                  placeholderTextColor={theme.inputPlaceholder}
                  value={customCategoryText}
                  onChangeText={setCustomCategoryText}
                />
              </View>
            )}

            <Text style={[styles.label, { color: theme.textMuted }]}>List Title</Text>
            <TextInput
              style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              placeholder="e.g. Supermarket, French HW, Big Movies..."
              placeholderTextColor={theme.inputPlaceholder}
              value={newListName}
              onChangeText={setNewListName}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.accent }]} onPress={handleCreateList}>
                <Text style={styles.createBtnText}>Create List</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit List Modal */}
      <Modal visible={!!editingList} animationType="slide" transparent onRequestClose={() => setEditingList(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Edit List Details</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Category Tag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
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
                  style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                  placeholder="e.g. Project X, Home Chores..."
                  placeholderTextColor={theme.inputPlaceholder}
                  value={editCustomCategoryText}
                  onChangeText={setEditCustomCategoryText}
                />
              </View>
            )}

            <Text style={[styles.label, { color: theme.textMuted }]}>List Title</Text>
            <TextInput
              style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              value={editName}
              onChangeText={setEditName}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingList(null)}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.accent }]} onPress={handleUpdateList}>
                <Text style={styles.createBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share List Modal */}
      <Modal visible={!!sharingList} animationType="slide" transparent onRequestClose={() => setSharingList(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Share List Access</Text>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {sharingList?.name}
            </Text>

            <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Access Permission</Text>
            <View style={{ gap: 8, marginVertical: 8 }}>
              {[
                { mode: "private" as ShareMode, label: "Private", desc: "Only you can view and edit", Icon: Lock },
                { mode: "public_read" as ShareMode, label: "View-Only", desc: "Anyone with link can view, no edits", Icon: Eye },
                { mode: "public_edit" as ShareMode, label: "Collaborative", desc: "Anyone with link can view and edit", Icon: Users },
              ].map(({ mode, label, desc, Icon }) => {
                const isSelected = sharingList?.shareMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.catBtn,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, width: "100%", justifyContent: "flex-start" },
                      isSelected && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 2 },
                    ]}
                    onPress={() => {
                      if (sharingList) {
                        shareModeMutation.mutate({ id: sharingList.id, shareMode: mode });
                      }
                    }}
                  >
                    <Icon size={16} color={isSelected ? theme.accent : theme.textMuted} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[{ fontSize: 13, fontWeight: "700", color: theme.textPrimary }, isSelected && { color: theme.accent }]}>
                        {label}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>{desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: theme.accent, marginTop: 12 }]}
              onPress={() => {
                if (sharingList) handleShareLink(sharingList);
              }}
            >
              <Text style={styles.createBtnText}>Share Link via App / System</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 8 }]}
              onPress={() => setSharingList(null)}
            >
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  listRow: {
    width: "100%",
    padding: 16,
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
    fontSize: 17,
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
    fontSize: 10,
    fontWeight: "700",
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actionIconBtn: {
    padding: 6,
  },
  previewSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  previewSectionTitle: {
    fontSize: 10,
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
    fontSize: 14,
    fontWeight: "500",
  },
  completedText: {
    textDecorationLine: "line-through",
  },
  durationBadge: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyPreviewText: {
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 95,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
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
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  catEmoji: {
    fontSize: 16,
  },
  catName: {
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    fontWeight: "600",
  },
  createBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
