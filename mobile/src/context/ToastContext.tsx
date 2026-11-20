import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";
import { typography, spacing } from "../theme/theme";

type ToastTone = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  testID?: string;
}

export interface ToastOptions {
  actions?: ToastAction[];
  durationMs?: number;
}

interface ToastState {
  message: string;
  tone: ToastTone;
  actions?: ToastAction[];
}

interface ToastContextType {
  showToast: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
  showError: (message: string, options?: ToastOptions) => void;
  showSuccess: (message: string, options?: ToastOptions) => void;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showError: () => {},
  showSuccess: () => {},
  dismissToast: () => {},
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  // Created once and kept for the provider's lifetime (lazy state, not a ref read during render).
  const [opacity] = useState(() => new Animated.Value(0));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "info", options?: ToastOptions) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ message, tone, actions: options?.actions });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      const timeoutMs =
        options?.durationMs ?? (options?.actions?.length ? 6500 : 3200);
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
          setToast(null);
        });
      }, timeoutMs);
    },
    [opacity]
  );

  const value = useMemo(
    () => ({
      showToast,
      showError: (message: string, options?: ToastOptions) =>
        showToast(message, "error", options),
      showSuccess: (message: string, options?: ToastOptions) =>
        showToast(message, "success", options),
      dismissToast,
    }),
    [showToast, dismissToast]
  );

  const bg =
    toast?.tone === "error"
      ? theme.danger
      : toast?.tone === "success"
      ? theme.success
      : theme.surface;
  const fg = toast?.tone === "info" ? theme.textPrimary : "#FFFFFF";
  const hasActions = Boolean(toast?.actions && toast.actions.length > 0);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents={hasActions ? "box-none" : "none"}
          style={[
            styles.toast,
            {
              opacity,
              backgroundColor: bg,
              borderColor: toast.tone === "info" ? theme.cardBorder : "transparent",
              bottom: Math.max(insets.bottom, 12) + 72,
            },
          ]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Text style={[styles.toastText, { color: fg }]}>{toast.message}</Text>
          {hasActions ? (
            <View style={styles.actionsRow}>
              {toast.actions!.map((action) => {
                const isGhost = action.variant === "ghost";
                return (
                  <TouchableOpacity
                    key={action.label}
                    testID={action.testID}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    onPress={() => {
                      dismissToast();
                      action.onPress();
                    }}
                    style={[
                      styles.actionBtn,
                      isGhost
                        ? {
                            backgroundColor: "transparent",
                            borderColor: toast.tone === "info" ? theme.inputBorder : "rgba(255,255,255,0.35)",
                          }
                        : {
                            backgroundColor: toast.tone === "info" ? theme.accent : "rgba(255,255,255,0.22)",
                            borderColor: "transparent",
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: isGhost ? fg : "#FFFFFF" },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 520,
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 999,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  toastText: {
    fontSize: typography.sm,
    fontWeight: "600",
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnText: {
    fontSize: typography.xs,
    fontWeight: "700",
  },
});
