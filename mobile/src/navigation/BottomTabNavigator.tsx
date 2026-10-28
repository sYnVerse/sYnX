import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as Linking from "expo-linking";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TasksScreen } from "../screens/TasksScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { FloatingTabBar, TabType } from "../components/FloatingTabBar";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { apiClient } from "../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { ScreenContainer } from "../components/ScreenContainer";
import { PushPromptProvider } from "../context/PushPromptContext";
import { typography } from "../theme/theme";
import { parseDeepLinkUrl } from "../shared";
import { getLastActiveListId, setLastActiveListId } from "../services/widgetPreferences";
import { syncActiveList } from "../services/widgetSync";

async function fetchOrCreateActiveListId(): Promise<string> {
  const res = await apiClient.get("/api/v1/lists");
  const lists = (res.data.lists || []) as { id: string }[];
  if (lists.length > 0) {
    return lists[0].id;
  }

  const created = await apiClient.post("/api/v1/lists", { name: "🎓 My Tasks" });
  const newId = created.data?.list?.id as string | undefined;
  if (!newId) {
    throw new Error("Could not create a default list.");
  }
  return newId;
}

const MainAppContent: React.FC = () => {
  const { token, login, isLoading } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("tasks");
  const [activeListId, setActiveListId] = useState<string | null>(null);
  /**
   * One-shot "open the new task form" request from a widget or quick-add link.
   * Cleared as soon as TasksScreen handles it, so later list opens (which remount
   * TasksScreen) don't reopen the form.
   */
  const [newTaskRequest, setNewTaskRequest] = useState<{ id: number; listId: string | null } | null>(null);
  const clearNewTaskRequest = useCallback(() => setNewTaskRequest(null), []);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsActions, setSettingsActions] = useState<{ save: () => Promise<boolean>; reset: () => void } | null>(null);

  /**
   * Survives logout/login so deep-linked shared lists are not overwritten by owned-list resolve.
   * Kept in state for rendering (the signed-out screen) and mirrored in a ref so async list
   * resolution can see a deep link that arrives while it is in flight.
   */
  const [pendingDeepLinkListId, setPendingDeepLinkListIdState] = useState<string | null>(null);
  const pendingDeepLinkListIdRef = useRef<string | null>(null);
  const setPendingDeepLinkListId = useCallback((listId: string | null) => {
    pendingDeepLinkListIdRef.current = listId;
    setPendingDeepLinkListIdState(listId);
  }, []);

  const applyDeepLinkedList = useCallback((listId: string) => {
    setPendingDeepLinkListId(listId);
    setActiveListId(listId);
    setActiveTab("tasks");
    setListError(null);
    setListLoading(false);
  }, [setPendingDeepLinkListId]);

  const handleDeepLink = useCallback(
    (url: string | null) => {
      if (!url) return;
      const parsed = parseDeepLinkUrl(url);
      if (parsed.listId) {
        applyDeepLinkedList(parsed.listId);
      }
      if (parsed.action === "newTask") {
        setActiveTab("tasks");
        setNewTaskRequest({ id: Date.now(), listId: parsed.listId ?? null });
      }
    },
    [applyDeepLinkedList]
  );

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      handleDeepLink(url);
    });

    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  useEffect(() => {
    if (activeListId) {
      setLastActiveListId(activeListId);
      syncActiveList(activeListId, undefined, undefined, queryClient).catch(() => {});
    }
  }, [activeListId, queryClient]);

  const switchTabWithRefresh = (targetTab: TabType) => {
    setActiveTab(targetTab);
    if (targetTab === "lists") {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    } else if ((targetTab === "tasks" || targetTab === "calendar") && activeListId) {
      queryClient.invalidateQueries({ queryKey: ["todos", activeListId] });
      queryClient.invalidateQueries({ queryKey: ["list_meta", activeListId] });
    }
  };

  const handleTabSwitch = (targetTab: TabType) => {
    if (activeTab === targetTab) return;
    if (activeTab === "settings" && settingsDirty && settingsActions) {
      Alert.alert(
        "Unsaved Settings",
        "You have unsaved notification setting changes. Would you like to save or discard your changes?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              settingsActions.reset();
              switchTabWithRefresh(targetTab);
            },
          },
          {
            text: "Save",
            onPress: async () => {
              const saved = await settingsActions.save();
              if (saved) {
                switchTabWithRefresh(targetTab);
              }
            },
          },
        ]
      );
    } else {
      switchTabWithRefresh(targetTab);
    }
  };

  const resolveActiveList = useCallback(async () => {
    // Prefer a pending deep-linked list over inventing/picking an owned list.
    if (pendingDeepLinkListIdRef.current) {
      setActiveListId(pendingDeepLinkListIdRef.current);
      setListLoading(false);
      setListError(null);
      return;
    }

    setListLoading(true);
    setListError(null);
    try {
      const lastId = await getLastActiveListId();
      if (lastId) {
        try {
          const res = await apiClient.get(`/api/v1/lists/${lastId}`);
          if (res.data?.list) {
            queryClient.setQueryData(["list_meta", lastId], res.data.list);
          }
          if (pendingDeepLinkListIdRef.current) {
            setActiveListId(pendingDeepLinkListIdRef.current);
          } else {
            setActiveListId(lastId);
          }
          return;
        } catch (e: any) {
          if (e?.response?.status === 403 || e?.response?.status === 404) {
            await setLastActiveListId(null);
          } else {
            // Keep lastId if offline/network error
            if (pendingDeepLinkListIdRef.current) {
              setActiveListId(pendingDeepLinkListIdRef.current);
            } else {
              setActiveListId(lastId);
            }
            return;
          }
        }
      }

      const id = await fetchOrCreateActiveListId();
      // Deep link may have arrived while we were resolving.
      if (pendingDeepLinkListIdRef.current) {
        setActiveListId(pendingDeepLinkListIdRef.current);
      } else {
        setActiveListId(id);
      }
    } catch (e: any) {
      console.error("Failed to resolve active list", e);
      setActiveListId(null);
      setListError(e.response?.data?.error || e.message || "Failed to load your lists.");
    } finally {
      setListLoading(false);
    }
  }, [queryClient]);

  // On sign-out, clear the active list during render (React's "adjust state when a
  // prop changes" pattern). Keep the pending deep link so post-login we reopen the
  // shared list.
  const [prevToken, setPrevToken] = useState(token);
  if (token !== prevToken) {
    setPrevToken(token);
    if (!token) {
      setActiveListId(null);
      setListError(null);
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (token) resolveActiveList();
  }, [token, resolveActiveList]);

  const selectOwnedOrOtherList = (id: string) => {
    // Explicit user selection clears deep-link priority.
    setPendingDeepLinkListId(null);
    setActiveListId(id);
    handleTabSwitch("tasks");
  };

  const goToMyLists = useCallback(async () => {
    setPendingDeepLinkListId(null);
    setActiveTab("lists");
    try {
      const id = await fetchOrCreateActiveListId();
      setActiveListId(id);
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    } catch (e) {
      console.error("Failed to return to owned lists", e);
    }
  }, [queryClient, setPendingDeepLinkListId]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={[styles.loadingText, { color: theme.textMuted, marginTop: 12 }]}>Loading sYnX...</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>sYnX</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {pendingDeepLinkListId
            ? "Sign in to open this shared list."
            : "Sync your tasks. Execute your day."}
        </Text>
        <TouchableOpacity style={[styles.loginBtn, { backgroundColor: theme.accent }]} onPress={login}>
          <Text style={styles.loginBtnText}>Sign In with sYnID</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (listLoading || !activeListId) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        {listError ? (
          <>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>{listError}</Text>
            <TouchableOpacity style={[styles.loginBtn, { backgroundColor: theme.accent }]} onPress={resolveActiveList}>
              <Text style={styles.loginBtnText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.loadingText, { color: theme.textMuted, marginTop: 12 }]}>Loading your lists...</Text>
          </>
        )}
      </View>
    );
  }

  // Soft-ask / silent token refresh only once the authenticated main shell is up
  // (not over login or list-loading), and PushPromptProvider itself waits for What's New.
  return (
    <PushPromptProvider enabled>
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        <ScreenContainer style={styles.content} maxWidth={840}>
          {activeTab === "tasks" && (
            <TasksScreen
              listId={activeListId}
              newTaskRequestId={
                newTaskRequest && (!newTaskRequest.listId || newTaskRequest.listId === activeListId)
                  ? newTaskRequest.id
                  : undefined
              }
              onNewTaskRequestHandled={clearNewTaskRequest}
              onGoToMyLists={goToMyLists}
              onSwitchLists={() => handleTabSwitch("lists")}
            />
          )}
          {activeTab === "calendar" && <CalendarScreen listId={activeListId} />}
          {activeTab === "lists" && (
            <ListsScreen
              activeListId={activeListId}
              onSelectList={selectOwnedOrOtherList}
            />
          )}
          {activeTab === "settings" && (
            <SettingsScreen
              onDirtyChange={setSettingsDirty}
              onRegisterActions={setSettingsActions}
            />
          )}
        </ScreenContainer>

        <FloatingTabBar activeTab={activeTab} onTabChange={handleTabSwitch} />
      </View>
    </PushPromptProvider>
  );
};

export const BottomTabNavigator: React.FC = () => {
  return <MainAppContent />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: typography.display,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.md,
    textAlign: "center",
    marginBottom: 24,
  },
  loginBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
