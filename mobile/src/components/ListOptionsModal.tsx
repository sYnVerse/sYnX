import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Pin, Share2, Pencil, History, Trash2 } from "lucide-react-native";
import { TodoList, formatListRowMeta } from "../shared";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { typography, spacing, MIN_TOUCH_TARGET, getSheetBottomPadding } from "../theme/theme";

export interface ListOptionsModalProps {
  visible: boolean;
  list: TodoList | null;
  taskCount?: number;
  isPinned?: boolean;
  onClose: () => void;
  onTogglePin?: () => void;
  onShareAccess?: () => void;
  onEditDetails?: () => void;
  onViewActivity?: () => void;
  onDeleteList?: () => void;
}

export const ListOptionsModal: React.FC<ListOptionsModalProps> = ({
  visible,
  list,
  taskCount,
  isPinned = false,
  onClose,
  onTogglePin,
  onShareAccess,
  onEditDetails,
  onViewActivity,
  onDeleteList,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible || !list) return null;

  const isOwner = list.isOwner !== false;
  const isPrivate = (list.shareMode || "private") === "private";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss list options"
        />

        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.cardBorder,
              paddingBottom: getSheetBottomPadding(insets.bottom, spacing.lg),
            },
          ]}
        >
          <Text
            style={[styles.modalTitle, { color: theme.textPrimary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {list.name}
          </Text>

          <Text
            style={[styles.subtitle, { color: theme.textMuted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {formatListRowMeta({
              openTaskCount: taskCount,
              category: list.category,
              shareMode: list.shareMode,
              isOwner: list.isOwner,
              ownerDisplayName: list.owner?.displayName,
            })}
          </Text>

          <View style={styles.actionsList}>
            {onTogglePin ? (
              <TouchableOpacity
                style={[
                  styles.actionItem,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                ]}
                onPress={() => {
                  onClose();
                  onTogglePin();
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  isPinned ? `Unpin ${list.name} from widget` : `Pin ${list.name} to widget`
                }
              >
                <Pin
                  size={18}
                  color={isPinned ? theme.accent : theme.textPrimary}
                  fill={isPinned ? theme.accent : "none"}
                />
                <Text
                  style={[
                    styles.actionText,
                    { color: isPinned ? theme.accent : theme.textPrimary },
                  ]}
                >
                  {isPinned ? "Unpin from widget" : "Pin to widget"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {isOwner ? (
              <>
                {onShareAccess ? (
                  <TouchableOpacity
                    style={[
                      styles.actionItem,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    ]}
                    onPress={() => {
                      onClose();
                      onShareAccess();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${list.name}`}
                  >
                    <Share2 size={18} color={theme.accent} />
                    <Text style={[styles.actionText, { color: theme.textPrimary }]}>
                      Share list access
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {onEditDetails ? (
                  <TouchableOpacity
                    style={[
                      styles.actionItem,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    ]}
                    onPress={() => {
                      onClose();
                      onEditDetails();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${list.name}`}
                  >
                    <Pencil size={18} color={theme.textPrimary} />
                    <Text style={[styles.actionText, { color: theme.textPrimary }]}>
                      Edit list details
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {!isPrivate && onViewActivity ? (
                  <TouchableOpacity
                    style={[
                      styles.actionItem,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    ]}
                    onPress={() => {
                      onClose();
                      onViewActivity();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Activity for ${list.name}`}
                  >
                    <History size={18} color={theme.accent} />
                    <Text style={[styles.actionText, { color: theme.textPrimary }]}>
                      View shared activity
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {onDeleteList ? (
                  <TouchableOpacity
                    style={[
                      styles.actionItem,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    ]}
                    onPress={() => {
                      onClose();
                      onDeleteList();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${list.name}`}
                  >
                    <Trash2 size={18} color={theme.danger} />
                    <Text style={[styles.actionText, { color: theme.danger }]}>
                      Delete list
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <>
                {onDeleteList ? (
                  <TouchableOpacity
                    style={[
                      styles.actionItem,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    ]}
                    onPress={() => {
                      onClose();
                      onDeleteList();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Leave ${list.name}`}
                  >
                    <Trash2 size={18} color={theme.danger} />
                    <Text style={[styles.actionText, { color: theme.danger }]}>
                      Leave list
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close list options"
          >
            <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: "700",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: typography.sm,
    marginBottom: spacing.md,
  },
  actionsList: {
    gap: 10,
    marginBottom: spacing.md,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
  },
  actionText: {
    fontSize: typography.md,
    fontWeight: "600",
  },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: typography.md,
    fontWeight: "600",
  },
});
