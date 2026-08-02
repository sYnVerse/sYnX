import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as Linking from "expo-linking";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TasksScreen } from "../screens/TasksScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { FloatingTabBar, TabType } from "../components/FloatingTabBar";
import { useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { apiClient } from "../api/client";
import { useQueryClient } from "@tanstack/react-query";

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
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsActions, setSettingsActions] = useState<{ save: () => Promise<boolean>; reset: () => void } | null>(null);

  const handleDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    const match = url.match(/\/list\/([a-zA-Z0-9-]+)/);
    if (match && match[1]) {
      const extractedListId = match[1];
      setActiveListId(extractedListId);
      setActiveTab("tasks");
    }
  }, []);

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

  const switchTabWithRefresh = (targetTab: TabType) => {
    setActiveTab(targetTab);
    if (targetTab === "lists") {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    } else if ((targetTab === "tasks" || targetTab === "calendar") && activeListId) {
      queryClient.invalidateQueries({ queryKey: ["todos", activeListId] });
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
    setListLoading(true);
    setListError(null);
    try {
      const id = await fetchOrCreateActiveListId();
      setActiveListId(id);
    } catch (e: any) {
      console.error("Failed to resolve active list", e);
      setActiveListId(null);
      setListError(e.response?.data?.error || e.message || "Failed to load your lists.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setActiveListId(null);
      setListError(null);
      setListLoading(false);
      return;
    }
    resolveActiveList();
  }, [token, resolveActiveList]);

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
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Sync your tasks. Execute your day.</Text>
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

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={styles.content}>
        {activeTab === "tasks" && <TasksScreen listId={activeListId} />}
        {activeTab === "calendar" && <CalendarScreen listId={activeListId} />}
        {activeTab === "lists" && (
          <ListsScreen
            activeListId={activeListId}
            onSelectList={(id) => {
              setActiveListId(id);
              handleTabSwitch("tasks");
            }}
          />
        )}
        {activeTab === "settings" && (
          <SettingsScreen
            onDirtyChange={setSettingsDirty}
            onRegisterActions={setSettingsActions}
          />
        )}
      </View>

      <FloatingTabBar activeTab={activeTab} onTabChange={handleTabSwitch} />
    </View>
  );
};

export const BottomTabNavigator: React.FC = () => {
  return (
    <ThemeProvider>
      <MainAppContent />
    </ThemeProvider>
  );
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
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
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
