import React, { useState, useEffect } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { PriorityLevel, RecurrencePattern } from "../../../shared";

interface TaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (task: {
    text: string;
    priority: PriorityLevel;
    reminderAt?: number;
    recurrence: RecurrencePattern;
  }) => void;
  initialText?: string;
  initialPriority?: PriorityLevel;
  initialReminderAt?: number;
  initialRecurrence?: RecurrencePattern;
  isEditing?: boolean;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  visible,
  onClose,
  onSave,
  initialText = "",
  initialPriority = "none",
  initialReminderAt,
  initialRecurrence = "none",
  isEditing = false,
}) => {
  const [text, setText] = useState(initialText);
  const [priority, setPriority] = useState<PriorityLevel>(initialPriority);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>(initialRecurrence);
  const [reminderMins, setReminderMins] = useState<number | null>(null);

  useEffect(() => {
    setText(initialText);
    setPriority(initialPriority);
    setRecurrence(initialRecurrence);
    setReminderMins(null);
  }, [visible, initialText, initialPriority, initialRecurrence]);

  const handleSave = () => {
    if (!text.trim()) return;
    let reminderAt: number | undefined = initialReminderAt;
    if (reminderMins !== null) {
      reminderAt = Date.now() + reminderMins * 60 * 1000;
    }
    onSave({
      text: text.trim(),
      priority,
      reminderAt,
      recurrence,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{isEditing ? "Edit Task" : "New Task"}</Text>
          <ScrollView>
            <Text style={styles.label}>Task Description</Text>
            <TextInput
              style={styles.input}
              placeholder="What needs to be done?"
              placeholderTextColor="#64748b"
              value={text}
              onChangeText={setText}
              autoFocus
            />

            <Text style={styles.label}>Priority Level</Text>
            <View style={styles.row}>
              {(["none", "low", "medium", "high"] as PriorityLevel[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pill, priority === p && styles.pillActive]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.pillText, priority === p && styles.pillTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Recurrence Pattern</Text>
            <View style={styles.row}>
              {(["none", "daily", "weekly", "monthly"] as RecurrencePattern[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.pill, recurrence === r && styles.pillActive]}
                  onPress={() => setRecurrence(r)}
                >
                  <Text style={[styles.pillText, recurrence === r && styles.pillTextActive]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Set Reminder</Text>
            <View style={styles.row}>
              {[5, 15, 30, 60].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={[styles.pill, reminderMins === mins && styles.pillActive]}
                  onPress={() => setReminderMins(mins)}
                >
                  <Text style={[styles.pillText, reminderMins === mins && styles.pillTextActive]}>
                    +{mins}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>Save Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  pillActive: {
    backgroundColor: "#6366f1",
    borderColor: "#818cf8",
  },
  pillText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelText: {
    color: "#94a3b8",
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
