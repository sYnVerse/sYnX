import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock, Eye, Users, Copy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiClient } from "../api/client";
import {
  TodoList,
  ShareMode,
  getSharedNameNotice,
  isMakingListPublic,
} from "../shared";
import { shouldWarnBeforeSharingPrivateList } from "../shared/mobile-ux";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { typography, spacing, MIN_TOUCH_TARGET, getSheetBottomPadding } from "../theme/theme";
import { getErrorMessage, triggerErrorHaptic } from "../utils/feedback";

export interface ShareListModalProps {
  visible: boolean;
  list: TodoList | null;
  onClose: () => void;
  onSuccess?: (updatedList: TodoList) => void;
}

export const ShareListModal: React.FC<ShareListModalProps> = ({
  visible,
  list,
  onClose,
  onSuccess,
}) => {
  const { theme, hapticsEnabled } = useTheme();
  const { showError, showSuccess } = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const triggerImpactHaptic = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const listLink = (target: TodoList) => `https://synx.christran.io/${target.id}`;

  const copyText = async (text: string) => {
    try {
      await Share.share({ message: text, url: text });
      showSuccess("Link ready — choose Copy in the share sheet");
    } catch {
      Alert.alert("List link", text);
    }
  };

  const shareModeMutation = useMutation({
    mutationFn: async ({ id, shareMode }: { id: string; shareMode: ShareMode }) => {
      const res = await apiClient.put(`/api/v1/lists/${id}/share-mode`, { shareMode });
      return res.data?.list as TodoList;
    },
    onSuccess: (updatedList) => {
      triggerImpactHaptic();
      queryClient.setQueryData<TodoList[]>(["lists", "all"], (old) => {
        if (!old) return [];
        return old.map((l) => (l.id === updatedList.id ? updatedList : l));
      });
      queryClient.setQueryData<TodoList>(["list_meta", updatedList.id], updatedList);
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["list_meta", updatedList.id] });
      onSuccess?.(updatedList);
    },
    onError: (e) => {
      triggerErrorHaptic(hapticsEnabled);
      showError(getErrorMessage(e, "Couldn't update sharing"));
    },
  });

  const handleShareLink = async (target: TodoList) => {
    if (shouldWarnBeforeSharingPrivateList(target.shareMode || "private")) {
      Alert.alert(
        "List is private",
        `Others can't open this link while the list is Private. Change sharing to View-Only or Collaborative first? ${getSharedNameNotice("private")}`,
        [
          { text: "Keep Private", style: "cancel" },
          {
            text: "Make View-Only",
            onPress: () => {
              shareModeMutation.mutate(
                { id: target.id, shareMode: "public_read" },
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
                { id: target.id, shareMode: "public_edit" },
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
        message: `Check out my list "${target.name}" on sYnX: ${listLink(target)}`,
        url: listLink(target),
      });
    } catch (e) {
      console.error("Failed to share link", e);
    }
  };

  const handleCopyLink = async (target: TodoList) => {
    const link = listLink(target);
    if (shouldWarnBeforeSharingPrivateList(target.shareMode || "private")) {
      Alert.alert(
        "List is private",
        `Copied links won't work for others while this list is Private. Change sharing so others can open it? ${getSharedNameNotice("private")}`,
        [
          { text: "Copy anyway", onPress: () => copyText(link) },
          {
            text: "Make View-Only",
            onPress: () => {
              shareModeMutation.mutate(
                { id: target.id, shareMode: "public_read" },
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

  if (!visible || !list) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
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
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Share List Access</Text>
          <Text style={[styles.label, { color: theme.textMuted }]}>{list.name}</Text>

          {list.shareMode === "private" ? (
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
              const isSelected = (list.shareMode || "private") === mode;
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
                    const makingPublic = isMakingListPublic(list.shareMode || "private", mode);
                    shareModeMutation.mutate(
                      { id: list.id, shareMode: mode },
                      makingPublic ? { onSuccess: () => showSuccess(getSharedNameNotice(mode)) } : undefined
                    );
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

          {list.shareMode && list.shareMode !== "private" ? (
            <Text style={[styles.hintText, { color: theme.textMuted, marginTop: 0 }]}>
              {getSharedNameNotice(list.shareMode)}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: theme.accent, marginTop: 8 }]}
            onPress={() => handleShareLink(list)}
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
            onPress={() => handleCopyLink(list)}
            accessibilityRole="button"
            accessibilityLabel="Copy link"
          >
            <Copy size={16} color={theme.accent} />
            <Text style={[styles.copyBtnText, { color: theme.accent }]}>Copy Link</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.cancelBtn, { marginTop: 8, alignSelf: "center" }]} onPress={onClose}>
            <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontWeight: "600",
  },
});
