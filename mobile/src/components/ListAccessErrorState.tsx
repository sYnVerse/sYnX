import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Lock, FileQuestion, WifiOff } from "lucide-react-native";
import type { ListAccessDenialCode } from "../shared";
import { useTheme } from "../context/ThemeContext";

export type ListAccessErrorKind = ListAccessDenialCode | "NETWORK" | "UNKNOWN";

interface ListAccessErrorStateProps {
  kind: ListAccessErrorKind;
  onRetry?: () => void;
  onGoToMyLists?: () => void;
  onSignIn?: () => void;
  requiresAuth?: boolean;
}

function copyFor(kind: ListAccessErrorKind, requiresAuth?: boolean) {
  switch (kind) {
    case "PRIVATE_LIST":
      return {
        title: "This list is private",
        body: requiresAuth
          ? "Sign in with the owner's account, or ask them to share it as View-Only or Collaborative."
          : "You don't have access. Ask the owner to change the share setting, or open one of your own lists.",
        Icon: Lock,
      };
    case "NOT_FOUND":
      return {
        title: "List not found",
        body: "This list may have been deleted, or the link is no longer valid.",
        Icon: FileQuestion,
      };
    case "NETWORK":
      return {
        title: "Couldn't load this list",
        body: "Check your connection and try again.",
        Icon: WifiOff,
      };
    default:
      return {
        title: "Unable to open list",
        body: "Something went wrong while loading this shared list.",
        Icon: FileQuestion,
      };
  }
}

export const ListAccessErrorState: React.FC<ListAccessErrorStateProps> = ({
  kind,
  onRetry,
  onGoToMyLists,
  onSignIn,
  requiresAuth,
}) => {
  const { theme } = useTheme();
  const { title, body, Icon } = copyFor(kind, requiresAuth);

  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={[styles.iconWrap, { backgroundColor: theme.accentLight }]}>
        <Icon size={28} color={theme.accent} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>{body}</Text>

      <View style={styles.actions}>
        {requiresAuth && onSignIn ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={onSignIn}
          >
            <Text style={styles.primaryBtnText}>Sign In with sYnID</Text>
          </TouchableOpacity>
        ) : null}

        {onRetry ? (
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { borderColor: theme.inputBorder, backgroundColor: theme.inputBg },
            ]}
            onPress={onRetry}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>Try again</Text>
          </TouchableOpacity>
        ) : null}

        {onGoToMyLists ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={onGoToMyLists}
          >
            <Text style={styles.primaryBtnText}>Go to my lists</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 300,
    marginBottom: 24,
  },
  actions: {
    width: "100%",
    maxWidth: 280,
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
