import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CheckSquare, Calendar as CalendarIcon, FolderKanban, Settings as SettingsIcon } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { typography, MIN_TOUCH_TARGET } from "../theme/theme";

export type TabType = "tasks" | "calendar" | "lists" | "settings";

interface FloatingTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const FloatingTabBar: React.FC<FloatingTabBarProps> = ({ activeTab, onTabChange }) => {
  const insets = useSafeAreaInsets();
  const { theme, resolvedMode, hapticsEnabled } = useTheme();

  const handlePress = (tab: TabType) => {
    if (tab !== activeTab) {
      if (hapticsEnabled && Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onTabChange(tab);
    }
  };

  const tabs: { id: TabType; label: string; Icon: any }[] = [
    { id: "tasks", label: "Tasks", Icon: CheckSquare },
    { id: "calendar", label: "Calendar", Icon: CalendarIcon },
    { id: "lists", label: "Lists", Icon: FolderKanban },
    { id: "settings", label: "Settings", Icon: SettingsIcon },
  ];

  return (
    <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <BlurView
        intensity={Platform.OS === "ios" ? 75 : 90}
        tint={resolvedMode === "light" ? "light" : "dark"}
        style={[
          styles.floatingBar,
          {
            backgroundColor: theme.tabBarBg,
            borderColor: theme.tabBarBorder,
            shadowColor: theme.shadowColor,
          },
        ]}
        accessibilityRole="tablist"
      >
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.tabItem,
                isActive && [styles.activeTabItem, { backgroundColor: theme.accentLight }],
              ]}
              onPress={() => handlePress(id)}
            >
              <Icon
                size={20}
                color={isActive ? theme.accent : theme.textMuted}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? theme.accent : theme.textMuted },
                  isActive && styles.activeTabLabel,
                ]}
                maxFontSizeMultiplier={1.2}
                allowFontScaling
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 100,
  },
  floatingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    overflow: "hidden",
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 16,
    gap: 4,
  },
  activeTabItem: {
    borderRadius: 16,
  },
  tabLabel: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  activeTabLabel: {
    fontWeight: "700",
  },
});
