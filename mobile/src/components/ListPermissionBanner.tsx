import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Lock, Eye, Users } from "lucide-react-native";
import {
  getListPermissionPresentation,
  type ShareMode,
} from "../shared";
import { useTheme } from "../context/ThemeContext";

interface ListPermissionBannerProps {
  shareMode: ShareMode;
  isOwner: boolean;
  canEdit: boolean;
  ownerDisplayName?: string | null;
}

const TONE_COLORS = {
  // Prefer theme textMuted via fg override in light/dark for AA contrast
  private: { fg: "#64748B", bg: "rgba(100, 116, 139, 0.14)" },
  view_only: { fg: "#6366F1", bg: "rgba(99, 102, 241, 0.14)" },
  collaborative: { fg: "#059669", bg: "rgba(16, 185, 129, 0.14)" },
} as const;

export const ListPermissionBanner: React.FC<ListPermissionBannerProps> = ({
  shareMode,
  isOwner,
  canEdit,
  ownerDisplayName,
}) => {
  const { theme } = useTheme();
  const presentation = getListPermissionPresentation({
    shareMode,
    isOwner,
    canEdit,
    ownerDisplayName,
  });
  const tone = TONE_COLORS[presentation.tone];
  const fg =
    presentation.tone === "view_only"
      ? theme.accent
      : presentation.tone === "private"
      ? theme.textMuted
      : tone.fg;
  const bg = presentation.tone === "view_only" ? theme.accentLight : tone.bg;

  const Icon =
    presentation.icon === "lock" ? Lock : presentation.icon === "eye" ? Eye : Users;

  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="text">
      <View style={[styles.badge, { backgroundColor: fg + "22" }]}>
        <Icon size={13} color={fg} />
        <Text style={[styles.badgeLabel, { color: fg }]}>{presentation.label}</Text>
      </View>
      <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
        {presentation.description}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 10,
    marginBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  description: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
});
