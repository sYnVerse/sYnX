import React, { useState } from "react";
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
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Plus, FolderPlus, Trash2, ChevronRight, CheckCircle2, Circle } from "lucide-react-native";
import { apiClient } from "../api/client";
import { TodoList, TodoItem } from "../../../shared";
import { useTheme } from "../context/ThemeContext";
import { ListCardSkeleton } from "../components/SkeletonLoader";

interface ListsScreenProps {
  activeListId: string;
  onSelectList: (id: string) => void;
}

const CATEGORY_EMOJIS = ["🎓", "🛒", "🎬", "💼", "📚", "✈️", "🏠", "💪", "💡", "🎵"];

export const ListsScreen: React.FC<ListsScreenProps> = ({ activeListId, onSelectList }) => {
  const { theme, hapticsEnabled } = useTheme();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState(CATEGORY_EMOJIS[0]);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/lists");
      return res.data.lists as TodoList[];
    },
  });

  // Query tasks for active list preview
  const { data: activeListTodos } = useQuery({
    queryKey: ["active_list_todos_preview", activeListId],
    queryFn: async () => {
      if (!activeListId) return [];
      const res = await apiClient.get(`/api/v1/todos?listId=${activeListId}`);
      return res.data.todos as TodoItem[];
    },
    enabled: !!activeListId,
  });

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const createListMutation = useMutation({
    mutationFn: async (nameWithEmoji: string) => {
      const res = await apiClient.post("/api/v1/lists", { name: nameWithEmoji });
      return res.data.list as TodoList;
    },
    onSuccess: (newList) => {
      triggerImpactHaptic();
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onSelectList(newList.id);
      setNewListName("");
      setModalVisible(false);
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/lists/${id}`);
    },
    onSuccess: () => {
      triggerImpactHaptic();
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const fullName = `${selectedEmoji} ${newListName.trim()}`;
    createListMutation.mutate(fullName);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Task Lists</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
          Organize your tasks into dedicated lists
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
          renderItem={({ item }) => {
            const isActive = item.id === activeListId;

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
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={[styles.listTitle, { color: theme.textPrimary }]}>{item.name}</Text>
                    {isActive && (
                      <View style={[styles.activeBadge, { backgroundColor: theme.accentLight }]}>
                        <Text style={[styles.activeBadgeText, { color: theme.accent }]}>ACTIVE</Text>
                      </View>
                    )}
                  </View>

                  {(lists?.length || 0) > 1 && (
                    <TouchableOpacity
                      style={styles.deleteIconBtn}
                      onPress={() => deleteListMutation.mutate(item.id)}
                    >
                      <Trash2 size={16} color={theme.danger} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Expanded Item Preview for Active List */}
                {isActive && (
                  <View style={[styles.previewSection, { borderTopColor: theme.cardBorder }]}>
                    <Text style={[styles.previewSectionTitle, { color: theme.textMuted }]}>
                      TASKS IN THIS LIST ({activeListTodos?.length || 0})
                    </Text>

                    {activeListTodos && activeListTodos.length > 0 ? (
                      activeListTodos.map((t) => (
                        <View key={t.id} style={styles.todoPreviewItem}>
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

      {/* New List Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Create New List</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Choose Category Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
              {CATEGORY_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiBtn,
                    { backgroundColor: theme.inputBg },
                    selectedEmoji === emoji && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedEmoji(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: theme.textMuted }]}>List Title</Text>
            <TextInput
              style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              placeholder="e.g. Shopping List, Work Notes..."
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
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  deleteIconBtn: {
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
  emojiRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  emojiText: {
    fontSize: 20,
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
