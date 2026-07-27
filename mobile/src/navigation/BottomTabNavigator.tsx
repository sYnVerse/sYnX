import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { TasksScreen } from "../screens/TasksScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { useAuth } from "../context/AuthContext";

export const BottomTabNavigator: React.FC = () => {
  const { token, login, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"tasks" | "calendar" | "lists" | "settings">("tasks");
  const [activeListId, setActiveListId] = useState<string>("default");

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
