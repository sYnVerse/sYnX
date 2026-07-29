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
import { Plus, Check, FolderPlus, Trash2, Tag } from "lucide-react-native";
import { apiClient } from "../api/client";
import { TodoList, TodoItem } from "../../../shared";
import { useTheme } from "../context/ThemeContext";
import { cardThemePresets, CardThemePreset } from "../theme/theme";
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
  const [selectedThemeId, setSelectedThemeId] = useState("mint");

  const { data: lists, isLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/lists");
      return res.data.lists as TodoList[];
    },
  });

  // Query tasks for preview in list widgets
  const { data: allTodos } = useQuery({
    queryKey: ["all_todos_preview"],
    queryFn: async () => {
      // Fetch todos across active list
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
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Lists & Widgets</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
          Select or customize your task collections
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonGrid}>
          <ListCardSkeleton />
          <ListCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={lists || []}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={{ paddingBottom: 110 }}
          renderItem={({ item, index }) => {
            const isActive = item.id === activeListId;
            // Assign card theme preset deterministically based on index or name
            const preset: CardThemePreset =
              cardThemePresets[index % cardThemePresets.length];

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.listCard,
                  {
                    backgroundColor: preset.bg,
                    borderColor: isActive ? preset.accent : preset.border,
                    borderWidth: isActive ? 2 : 1,
                  },
                ]}
                onPress={() => {
                  triggerImpactHaptic();
                  onSelectList(item.id);
                }}
              >
                {/* Active Indicator Badge */}
                {isActive && (
                  <View style={[styles.activeBadge, { backgroundColor: preset.badgeBg }]}>
                    <Text style={[styles.activeBadgeText, { color: preset.badgeText }]}>ACTIVE</Text>
                  </View>
                )}

                <Text style={[styles.cardTitle, { color: preset.text }]} numberOfLines={2}>
                  {item.name}
                </Text>

                {/* Sub-item preview */}
                <View style={styles.previewContainer}>
                  {isActive && allTodos && allTodos.length > 0 ? (
                    allTodos.slice(0, 3).map((t) => (
                      <View key={t.id} style={styles.previewRow}>
                        <View
                          style={[
                            styles.previewDot,
                            { backgroundColor: t.completed ? preset.badgeBg : preset.border },
                          ]}
                        />
                        <Text
                          style={[
                            styles.previewText,
                            { color: preset.secondaryText },
                            t.completed && { textDecorationLine: "line-through", opacity: 0.6 },
                          ]}
                          numberOfLines={1}
                        >
                          {t.text}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.previewText, { color: preset.secondaryText }]}>
                      Tap to open list items
                    </Text>
                  )}
                </View>

                {/* Card Footer */}
                <View style={styles.cardFooter}>
                  <View style={[styles.tagPill, { backgroundColor: preset.border }]}>
                    <Tag size={10} color={preset.text} />
                    <Text style={[styles.tagPillText, { color: preset.text }]}>Checklist</Text>
                  </View>

                  {(lists?.length || 0) > 1 && (
                    <TouchableOpacity
                      style={styles.deleteIconBtn}
                      onPress={() => deleteListMutation.mutate(item.id)}
                    >
                      <Trash2 size={14} color={preset.text} />
                    </TouchableOpacity>
                  )}
                </View>
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
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Create New List Card</Text>

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
              placeholder="e.g. Shopping List, Study Notes..."
              placeholderTextColor={theme.inputPlaceholder}
              value={newListName}
              onChangeText={setNewListName}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.accent }]} onPress={handleCreateList}>
                <Text style={styles.createBtnText}>Create Widget Card</Text>
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
  skeletonGrid: {
    flexDirection: "row",
    gap: 12,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: 14,
  },
  listCard: {
    width: "48%",
    padding: 16,
    borderRadius: 22,
    minHeight: 140,
    justifyContent: "space-between",
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  activeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 8,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  previewContainer: {
    gap: 4,
    marginBottom: 10,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  previewText: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  deleteIconBtn: {
    padding: 4,
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
