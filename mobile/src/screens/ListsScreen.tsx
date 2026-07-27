import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { ShareMode } from "../../shared";

export const ListsScreen: React.FC<{
  activeListId: string;
  onSelectList: (id: string) => void;
}> = ({ activeListId, onSelectList }) => {
  const queryClient = useQueryClient();
  const [newListModal, setNewListModal] = useState(false);
  const [newListName, setNewListName] = useState("");

  const { data: lists } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/lists");
      return res.data.lists as any[];
    },
  });

  const createListMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post("/api/v1/lists", { name });
      return res.data.list;
    },
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      if (newList?.id) {
        onSelectList(newList.id);
      }
    },
  });

  const updateShareModeMutation = useMutation({
    mutationFn: async ({ id, shareMode }: { id: string; shareMode: ShareMode }) => {
      await apiClient.put(`/api/v1/lists/${id}/share-mode`, { shareMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });

  const handleCreate = () => {
    if (!newListName.trim()) return;
    createListMutation.mutate(newListName.trim());
    setNewListName("");
    setNewListModal(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.createButton} onPress={() => setNewListModal(true)}>
        <Text style={styles.createButtonText}>+ Create New List</Text>
      </TouchableOpacity>

      <FlatList
        data={lists || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isActive = item.id === activeListId;
          return (
            <TouchableOpacity
              style={[styles.listCard, isActive && styles.listCardActive]}
              onPress={() => onSelectList(item.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.listName, isActive && styles.listNameActive]}>
                  {item.name}
                </Text>
                <Text style={styles.shareBadge}>
                  Access: {item.shareMode} {item.isOwner ? "(Owner)" : "(Shared)"}
                </Text>
              </View>

              {item.isOwner && (
                <View style={styles.shareModeSelector}>
                  {(["private", "public_read", "public_edit"] as ShareMode[]).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.modeBtn,
                        item.shareMode === mode && styles.modeBtnActive,
                      ]}
                      onPress={() =>
                        updateShareModeMutation.mutate({ id: item.id, shareMode: mode })
                      }
                    >
                      <Text style={styles.modeBtnText}>{mode.replace("public_", "")}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={newListModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Task List</Text>
            <TextInput
              style={styles.input}
              placeholder="List name..."
              placeholderTextColor="#64748b"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setNewListModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate}>
                <Text style={styles.saveText}>Create</Text>
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
    backgroundColor: "#0f172a",
    padding: 16,
  },
  createButton: {
    backgroundColor: "#6366f1",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  createButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  listCard: {
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  listCardActive: {
    borderColor: "#6366f1",
    backgroundColor: "#1e1b4b",
  },
  listName: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "bold",
  },
  listNameActive: {
    color: "#818cf8",
  },
  shareBadge: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 4,
  },
  shareModeSelector: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  modeBtn: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modeBtnActive: {
    backgroundColor: "#6366f1",
  },
  modeBtnText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 14,
  },
  input: {
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    alignItems: "center",
  },
  cancelText: {
    color: "#94a3b8",
  },
  saveBtn: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
});
