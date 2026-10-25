import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { X, Calendar as CalendarIcon, Check, Plus } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { AvailableCalendar } from "../services/calendar";
import { SYNX_CALENDAR_TITLE } from "../services/calendar";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";

interface CalendarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  calendars: AvailableCalendar[];
  selectedCalendarId?: string | null;
  onSelectCalendar: (calendar: AvailableCalendar) => void;
  onCreateDedicatedCalendar: () => void;
}

export const CalendarPickerModal: React.FC<CalendarPickerModalProps> = ({
  visible,
  onClose,
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  onCreateDedicatedCalendar,
}) => {
  const { theme } = useTheme();

  const hasDedicatedInList = calendars.some(
    (c) => c.title === SYNX_CALENDAR_TITLE || c.isDedicated
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeContainer}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
              <View style={styles.headerLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                    },
                  ]}
                >
                  <CalendarIcon size={18} color={theme.accent} />
                </View>
                <View>
                  <Text style={[styles.title, { color: theme.textPrimary }]}>
                    Select Target Calendar
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                    Choose where task reminders will be synced
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Calendars List */}
            <ScrollView style={styles.scrollList} contentContainerStyle={{ paddingVertical: 8 }}>
              {calendars.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No writable calendars found on this device.
                  </Text>
                </View>
              ) : (
                calendars.map((cal) => {
                  const isSelected = selectedCalendarId === cal.id;
                  const isDedicated = cal.title === SYNX_CALENDAR_TITLE || cal.isDedicated;

                  return (
                    <TouchableOpacity
                      key={cal.id}
                      style={[
                        styles.calendarItem,
                        {
                          backgroundColor: isSelected ? theme.accentLight : theme.inputBg,
                          borderColor: isSelected ? theme.accent : theme.inputBorder,
                        },
                      ]}
                      onPress={() => onSelectCalendar(cal)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${cal.title}`}
                    >
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: cal.color || (isDedicated ? "#6366F1" : theme.accent) },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <Text
                            style={[
                              styles.calendarTitle,
                              { color: theme.textPrimary },
                              isSelected && { fontWeight: "700" },
                            ]}
                            numberOfLines={1}
                          >
                            {cal.title}
                          </Text>
                          {cal.isPrimary && (
                            <View
                              style={[
                                styles.primaryBadge,
                                {
                                  backgroundColor: theme.badgeSuccessBg,
                                  borderColor: theme.badgeSuccessBorder,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.primaryBadgeText, { color: theme.badgeSuccessFg }]}
                              >
                                Primary
                              </Text>
                            </View>
                          )}
                          {isDedicated && (
                            <View
                              style={[
                                styles.primaryBadge,
                                {
                                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                                  borderColor: "rgba(99, 102, 241, 0.3)",
                                },
                              ]}
                            >
                              <Text style={[styles.primaryBadgeText, { color: "#6366F1" }]}>
                                Dedicated
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.sourceText, { color: theme.textMuted }]} numberOfLines={1}>
                          {isDedicated
                            ? "Dedicated local calendar owned by sYnX"
                            : cal.sourceName || "Device Calendar"}
                        </Text>
                      </View>
                      {isSelected && <Check size={18} color={theme.accent} />}
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Option to create a dedicated sYnX calendar if not yet created */}
              {!hasDedicatedInList && (
                <TouchableOpacity
                  style={[
                    styles.calendarItem,
                    styles.createDedicatedItem,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                    },
                  ]}
                  onPress={onCreateDedicatedCalendar}
                  accessibilityRole="button"
                  accessibilityLabel="Create dedicated sYnX Tasks calendar"
                >
                  <View
                    style={[
                      styles.iconCircleSmall,
                      { backgroundColor: "rgba(99, 102, 241, 0.15)", borderColor: "#6366F1" },
                    ]}
                  >
                    <Plus size={14} color="#6366F1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.calendarTitle, { color: theme.textPrimary }]}>
                      sYnX Tasks (Dedicated)
                    </Text>
                    <Text style={[styles.sourceText, { color: theme.textMuted }]}>
                      Create an isolated local calendar on this device
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: theme.cardBorder }]}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                ]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.cancelBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  safeContainer: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    maxHeight: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typography.md,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollList: {
    paddingHorizontal: spacing.md,
    maxHeight: 340,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: typography.sm,
    textAlign: "center",
  },
  calendarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: MIN_TOUCH_TARGET,
  },
  createDedicatedItem: {
    borderStyle: "dashed",
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calendarTitle: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  primaryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  sourceText: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
});
