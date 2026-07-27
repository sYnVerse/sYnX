import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from "react-native";
import { TasksScreen } from "../screens/TasksScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

async function fetchOrCreateActiveListId(): Promise<string> {
  const res = await apiClient.get("/api/v1/lists");
  const lists = (res.data.lists || []) as { id: string }[];
  if (lists.length > 0) {
    return lists[0].id;
  }

  const created = await apiClient.post("/api/v1/lists", { name: "My Tasks" });
  const newId = created.data?.list?.id as string | undefined;
  if (!newId) {
    throw new Error("Could not create a default list.");
  }
  return newId;
}

export const BottomTabNavigator: React.FC = () => {
  const { token, login, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"tasks" | "calendar" | "lists" | "settings">("tasks");
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

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
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading sYnX...</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>sYnX To-Do</Text>
        <Text style={styles.subtitle}>Sign in to access your task lists across web and Android</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={login}>
          <Text style={styles.loginBtnText}>Sign In with OpenAuth</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (listLoading || !activeListId) {
    return (
      <View style={styles.centered}>
        {listError ? (
          <>
            <Text style={styles.subtitle}>{listError}</Text>
            <TouchableOpacity style={styles.loginBtn} onPress={resolveActiveList}>
              <Text style={styles.loginBtnText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator color="#6366f1" size="large" />
            <Text style={[styles.loadingText, { marginTop: 12 }]}>Loading your lists...</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {activeTab === "tasks" && <TasksScreen listId={activeListId} />}
        {activeTab === "calendar" && <CalendarScreen listId={activeListId} />}
        {activeTab === "lists" && (
          <ListsScreen
            activeListId={activeListId}
            onSelectList={(id) => {
              setActiveListId(id);
              setActiveTab("tasks");
            }}
          />
        )}
        {activeTab === "settings" && <SettingsScreen />}
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "tasks" && styles.tabItemActive]}
          onPress={() => setActiveTab("tasks")}
        >
          <Text style={styles.tabIcon}>📋</Text>
          <Text style={[styles.tabLabel, activeTab === "tasks" && styles.tabLabelActive]}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "calendar" && styles.tabItemActive]}
          onPress={() => setActiveTab("calendar")}
        >
          <Text style={styles.tabIcon}>📅</Text>
          <Text style={[styles.tabLabel, activeTab === "calendar" && styles.tabLabelActive]}>Calendar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "lists" && styles.tabItemActive]}
          onPress={() => setActiveTab("lists")}
        >
          <Text style={styles.tabIcon}>📁</Text>
          <Text style={[styles.tabLabel, activeTab === "lists" && styles.tabLabelActive]}>Lists</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "settings" && styles.tabItemActive]}
          onPress={() => setActiveTab("settings")}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === "settings" && styles.tabLabelActive]}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 24,
  },
  loginBtn: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 16,
  },
  bottomBar: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  tabItemActive: {},
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  tabLabelActive: {
    color: "#6366f1",
    fontWeight: "bold",
  },
});
