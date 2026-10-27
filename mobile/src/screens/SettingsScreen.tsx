import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  AppState,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Palette,
  Vibrate,
  Bell,
  Smartphone,
  LogOut,
  Check,
  Calendar as CalendarIcon,
  Sparkles,
  User,
  ExternalLink,
  Info,
  ChevronRight,
} from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import {
  getPushPermissionStatus,
  hasStoredPushToken,
  openAppSystemSettings,
  registerPushTokenIfPermitted,
  requestAndRegisterPush,
  unregisterPushToken,
  type PushPermissionStatus,
} from "../services/notifications";
import { useTheme } from "../context/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../context/ToastContext";
import { getCachedListName } from "../services/listNames";
import type { TodoItem } from "../shared";
import { CalendarPickerModal } from "../components/CalendarPickerModal";
import { ChangelogModal } from "../components/ChangelogModal";
import { MOBILE_VERSION } from "../constants/changelog";
import { typography, spacing, MIN_TOUCH_TARGET, PHONE_CARRIERS, type ThemeMode } from "../theme/theme";
import { getErrorMessage } from "../utils/feedback";
import {
  isCalendarSyncEnabled,
  setCalendarSyncEnabled,
  checkCalendarPermissions,
  requestCalendarPermissions,
  getOrCreateSynxCalendar,
  describeCalendarPermission,
  getAvailableCalendars,
  getTargetCalendar,
  setSelectedCalendarId,
  openCalendarApp,
  syncAllTasksToNativeCalendar,
  type AvailableCalendar,
} from "../services/calendar";

interface SettingsScreenProps {
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterActions?: (actions: { save: () => Promise<boolean>; reset: () => void } | null) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onDirtyChange, onRegisterActions }) => {
  const { logout, user } = useAuth();
  const { theme, themeMode, setThemeMode, hapticsEnabled, setHapticsEnabled } = useTheme();
  const { showError, showSuccess } = useToast();

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCarrier, setPhoneCarrier] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savingRemote, setSavingRemote] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushPermissionStatus>("undetermined");
  const [pushBusy, setPushBusy] = useState(false);
  const [calendarSync, setCalendarSync] = useState(false);
  const [calendarPermission, setCalendarPermission] = useState<string>("Not Granted");
  const queryClient = useQueryClient();
  const [targetCalendar, setTargetCalendar] = useState<AvailableCalendar | null>(null);
  const [availableCalendars, setAvailableCalendars] = useState<AvailableCalendar[]>([]);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const latestRemote = useRef({
    emailEnabled: false,
    smsEnabled: false,
    phoneNumber: "",
    phoneCarrier: "",
    discordWebhookUrl: "",
    displayName: "",
  });

  const triggerImpact = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const refreshPushState = useCallback(async () => {
    const status = await getPushPermissionStatus();
    setPushStatus(status);
    const stored = await hasStoredPushToken();
    setPushEnabled(status === "granted" && stored);
    if (status === "granted" && !stored) {
      // Permission on but token missing — refresh silently
      const token = await registerPushTokenIfPermitted();
      setPushEnabled(Boolean(token));
    }
  }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await apiClient.get("/api/v1/settings");
        if (res.data.settings) {
          const loaded = {
            emailEnabled: Boolean(res.data.settings.emailEnabled),
            smsEnabled: Boolean(res.data.settings.smsEnabled),
            phoneNumber: res.data.settings.phoneNumber || "",
            phoneCarrier: res.data.settings.phoneCarrier || "",
            discordWebhookUrl: res.data.settings.discordWebhookUrl || "",
            displayName: res.data.settings.displayNameSet
              ? String(res.data.settings.displayName || "")
              : "",
          };
          latestRemote.current = loaded;
          setEmailEnabled(loaded.emailEnabled);
          setSmsEnabled(loaded.smsEnabled);
          setPhoneNumber(loaded.phoneNumber);
          setPhoneCarrier(loaded.phoneCarrier);
          setDiscordWebhookUrl(loaded.discordWebhookUrl);
          setDisplayName(loaded.displayName);
          onDirtyChange?.(false);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }

      try {
        await refreshPushState();
      } catch (e) {
        console.error("Failed to read push state", e);
      }

      try {
        const syncEnabled = await isCalendarSyncEnabled();
        setCalendarSync(syncEnabled);
        const permission = await checkCalendarPermissions();
        setCalendarPermission(describeCalendarPermission(permission));
        if (syncEnabled && permission.granted) {
          const target = await getTargetCalendar();
          setTargetCalendar(target);
        }
      } catch (e) {
        console.error("Failed to read calendar settings", e);
      }

      hydrated.current = true;
    }
    loadSettings();
  }, []);

  const persistRemoteSettings = useCallback(async (): Promise<boolean> => {
    setSavingRemote(true);
    try {
      const payload = {
        emailEnabled,
        smsEnabled,
        phoneNumber,
        phoneCarrier,
        discordWebhookUrl,
        displayName: displayName.trim(),
      };
      await apiClient.put("/api/v1/settings", payload);
      latestRemote.current = payload;
      onDirtyChange?.(false);
      return true;
    } catch (e: any) {
      showError(getErrorMessage(e, "Failed to save settings"));
      return false;
    } finally {
      setSavingRemote(false);
    }
  }, [emailEnabled, smsEnabled, phoneNumber, phoneCarrier, discordWebhookUrl, displayName, onDirtyChange, showError]);

  // Autosave notification settings (debounced)
  useEffect(() => {
    if (!hydrated.current) return;
    const dirty =
      emailEnabled !== latestRemote.current.emailEnabled ||
      smsEnabled !== latestRemote.current.smsEnabled ||
      phoneNumber !== latestRemote.current.phoneNumber ||
      phoneCarrier !== latestRemote.current.phoneCarrier ||
      discordWebhookUrl !== latestRemote.current.discordWebhookUrl ||
      displayName !== latestRemote.current.displayName;
    onDirtyChange?.(dirty);
    if (!dirty) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistRemoteSettings();
    }, 700);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    emailEnabled,
    smsEnabled,
    phoneNumber,
    phoneCarrier,
    discordWebhookUrl,
    displayName,
    persistRemoteSettings,
    onDirtyChange,
  ]);

  const resetSettings = () => {
    const s = latestRemote.current;
    setEmailEnabled(s.emailEnabled);
    setSmsEnabled(s.smsEnabled);
    setPhoneNumber(s.phoneNumber);
    setPhoneCarrier(s.phoneCarrier);
    setDiscordWebhookUrl(s.discordWebhookUrl);
    setDisplayName(s.displayName);
    onDirtyChange?.(false);
  };

  useEffect(() => {
    if (onRegisterActions) {
      onRegisterActions({ save: persistRemoteSettings, reset: resetSettings });
    }
    return () => {
      onRegisterActions?.(null);
    };
  }, [persistRemoteSettings, onRegisterActions]);

  const handlePushToggle = async (val: boolean) => {
    triggerImpact();
    setPushBusy(true);
    try {
      if (val) {
        if (pushStatus === "blocked") {
          Alert.alert(
            "Notifications blocked",
            "Notifications are turned off for sYnX in system settings. Open Settings to enable them.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => openAppSystemSettings() },
            ]
          );
          return;
        }
        const token = await requestAndRegisterPush();
        await refreshPushState();
        if (token) {
          showSuccess("Notifications enabled");
        } else {
          const status = await getPushPermissionStatus();
          if (status === "blocked" || status === "denied") {
            showError("Notifications were not enabled");
          }
        }
      } else {
        await unregisterPushToken();
        setPushEnabled(false);
        // Keep OS permission as-is; we just stop registering the token
        showSuccess("Device notifications turned off in sYnX");
      }
    } finally {
      setPushBusy(false);
      await refreshPushState();
    }
  };

  const syncExistingTasks = useCallback(async () => {
    try {
      const allQueries = queryClient.getQueriesData<TodoItem[]>({ queryKey: ["todos"] });
      const allTasks: TodoItem[] = [];
      for (const [, tasks] of allQueries) {
        if (Array.isArray(tasks)) {
          allTasks.push(...tasks);
        }
      }
      if (allTasks.length > 0) {
        await syncAllTasksToNativeCalendar(allTasks, (listId) =>
          getCachedListName(queryClient, listId)
        );
      }
    } catch (e) {
      console.warn("Failed to sync existing tasks to native calendar", e);
    }
  }, [queryClient]);

  const enableCalendarSync = useCallback(async () => {
    setCalendarPermission("Granted");
    await setCalendarSyncEnabled(true);
    setCalendarSync(true);
    const target = await getTargetCalendar();
    setTargetCalendar(target);

    await syncExistingTasks();

    if (Platform.OS === "android" && (target?.isDedicated || target?.isLocal)) {
      Alert.alert(
        "Calendar Sync Enabled",
        "Tasks with reminders will sync to 'sYnX Tasks'.\n\nGoogle Calendar hides local calendars by default. In Google Calendar: go to Settings → Manage accounts → Non-Google accounts, and toggle on sYnX.",
        [
          { text: "OK" },
          { text: "Open Calendar", onPress: () => openCalendarApp() },
        ]
      );
    } else {
      Alert.alert(
        "Calendar Sync Enabled",
        `Tasks with reminders will automatically sync to your "${target?.title || "device"}" calendar.`
      );
    }
  }, [syncExistingTasks]);

  const handleOpenCalendarPicker = async () => {
    triggerImpact();
    const cals = await getAvailableCalendars();
    setAvailableCalendars(cals);
    setShowCalendarPicker(true);
  };

  const handleSelectCalendar = async (cal: AvailableCalendar) => {
    triggerImpact();
    setShowCalendarPicker(false);
    await setSelectedCalendarId(cal.id);
    setTargetCalendar(cal);
    await syncExistingTasks();

    if (Platform.OS === "android" && (cal.isDedicated || cal.isLocal)) {
      Alert.alert(
        "Target Calendar Updated",
        `Target set to "${cal.title}".\n\nGoogle Calendar hides local calendars by default. In Google Calendar: go to Settings → Manage accounts → Non-Google accounts, and toggle on sYnX.`,
        [
          { text: "OK" },
          { text: "Open Calendar", onPress: () => openCalendarApp() },
        ]
      );
    } else {
      showSuccess(`Target calendar set to "${cal.title}"`);
    }
  };

  const handleCreateDedicatedCalendar = async () => {
    triggerImpact();
    setShowCalendarPicker(false);
    const dedicatedId = await getOrCreateSynxCalendar();
    if (dedicatedId) {
      await setSelectedCalendarId(dedicatedId);
      const target = await getTargetCalendar();
      setTargetCalendar(target);
      await syncExistingTasks();

      if (Platform.OS === "android") {
        Alert.alert(
          "Dedicated Calendar Created",
          "Tasks will sync to 'sYnX Tasks'.\n\nGoogle Calendar hides local calendars by default. In Google Calendar: go to Settings → Manage accounts → Non-Google accounts, and toggle on sYnX.",
          [
            { text: "OK" },
            { text: "Open Calendar", onPress: () => openCalendarApp() },
          ]
        );
      } else {
        showSuccess("Dedicated 'sYnX Tasks' calendar created");
      }
    }
  };

  // Set when the user leaves for system settings to grant calendar access, so sync turns on
  // automatically once they come back with access granted.
  const pendingCalendarEnable = useRef(false);

  // Re-check calendar access when the app returns to the foreground (e.g. after the user
  // changes it in system settings) so the toggle and label stay accurate.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const permission = await checkCalendarPermissions();
        setCalendarPermission(describeCalendarPermission(permission));
        if (permission.granted && pendingCalendarEnable.current) {
          pendingCalendarEnable.current = false;
          await enableCalendarSync();
        } else if (!permission.granted) {
          pendingCalendarEnable.current = false;
        }
      } catch (e) {
        console.error("Failed to re-check calendar permission", e);
      }
    });
    return () => subscription.remove();
  }, [enableCalendarSync]);

  const handleToggleCalendarSync = async (val: boolean) => {
    triggerImpact();
    if (val) {
      let permission = await checkCalendarPermissions();
      if (!permission.granted && permission.canAskAgain) {
        permission = await requestCalendarPermissions();
      }
      if (!permission.granted) {
        setCalendarPermission(describeCalendarPermission(permission));
        if (permission.status === "denied" && !permission.canAskAgain) {
          Alert.alert(
            "Calendar Access Needed",
            "Calendar access is turned off for sYnX. Open Settings and allow Calendar access to sync task reminders to your device calendar.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  pendingCalendarEnable.current = true;
                  Linking.openSettings().catch((e) => {
                    pendingCalendarEnable.current = false;
                    console.error("Failed to open system settings", e);
                  });
                },
              },
            ]
          );
        } else {
          Alert.alert(
            "Permission Denied",
            "Calendar access is required to sync task reminders to your device calendar."
          );
        }
        return;
      }
      await enableCalendarSync();
    } else {
      pendingCalendarEnable.current = false;
      await setCalendarSyncEnabled(false);
      setCalendarSync(false);
    }
  };

  const confirmLogout = () => {
    triggerImpact();
    Alert.alert("Log out?", "You'll need to sign in with sYnID again to access your lists.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  };

  const themeOptions: { mode: ThemeMode; label: string; preview: string; previewBorder?: boolean }[] = [
    { mode: "system", label: "System", preview: "auto" },
    { mode: "dark", label: "Modern Glass Dark", preview: "#0F172A" },
    { mode: "light", label: "Light Pastel", preview: "#FAF7F2", previewBorder: true },
  ];

  const pushStatusLabel =
    pushStatus === "granted"
      ? pushEnabled
        ? "On"
        : "Allowed — tap to register"
      : pushStatus === "blocked"
      ? "Blocked in system settings"
      : pushStatus === "denied"
      ? "Off"
      : "Not set up";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={{ paddingBottom: 110 }}
    >
      {/* Account */}
      <View style={styles.sectionHeader}>
        <User size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Account</Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.subLabel, { color: theme.textMuted }]}>SIGNED IN WITH SYNID</Text>
        <Text style={[styles.accountEmail, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.35}>
          {user?.email || "sYnID user"}
        </Text>
        {user?.userId ? (
          <Text style={[styles.accountId, { color: theme.textMuted }]} numberOfLines={1}>
            ID: {user.userId}
          </Text>
        ) : null}

        <Text style={[styles.subLabel, { color: theme.textMuted, marginTop: 16 }]}>DISPLAY NAME</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.textPrimary,
            },
          ]}
          value={displayName}
          onChangeText={(t) => setDisplayName(t.slice(0, 64))}
          placeholder="sYnX user"
          placeholderTextColor={theme.inputPlaceholder}
          maxLength={64}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Display name"
        />
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Shown on lists you share. Your email is never shared with others.
        </Text>
      </View>

      {/* Appearance */}
      <View style={styles.sectionHeader}>
        <Palette size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appearance & Haptics</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.subLabel, { color: theme.textMuted }]}>THEME PREFERENCE</Text>
        <View style={styles.themeRow}>
          {themeOptions.map((opt) => {
            const selected = themeMode === opt.mode;
            return (
              <TouchableOpacity
                key={opt.mode}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Theme ${opt.label}`}
                style={[
                  styles.themeOption,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                  selected && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 2 },
                ]}
                onPress={() => {
                  triggerImpact();
                  setThemeMode(opt.mode);
                }}
              >
                {opt.preview === "auto" ? (
                  <View style={styles.systemPreview}>
                    <View style={[styles.systemHalf, { backgroundColor: "#0F172A" }]} />
                    <View style={[styles.systemHalf, { backgroundColor: "#FAF7F2" }]} />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.colorPreviewCircle,
                      {
                        backgroundColor: opt.preview,
                        borderColor: opt.previewBorder ? "#CBD5E1" : "transparent",
                        borderWidth: opt.previewBorder ? 1 : 0,
                      },
                    ]}
                  />
                )}
                <Text style={[styles.themeOptionText, { color: theme.textPrimary }]}>{opt.label}</Text>
                {selected && <Check size={14} color={theme.accent} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Vibrate size={18} color={theme.textSecondary} />
            <Text style={[styles.label, { color: theme.textPrimary }]}>Tactile Haptic Feedback</Text>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={(val) => {
              triggerImpact();
              setHapticsEnabled(val);
            }}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={hapticsEnabled ? theme.accent : theme.textMuted}
            accessibilityLabel="Tactile haptic feedback"
          />
        </View>
      </View>

      {/* Device Calendar */}
      <View style={styles.sectionHeader}>
        <CalendarIcon size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Device Calendar Integration</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary, flex: 1 }]}>
            Sync Tasks to Device Calendar
          </Text>
          <Switch
            value={calendarSync}
            onValueChange={handleToggleCalendarSync}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={calendarSync ? theme.accent : theme.textMuted}
            accessibilityLabel="Sync tasks to device calendar"
          />
        </View>
        {calendarSync ? (
          <>
            <TouchableOpacity
              style={[
                styles.calendarTargetRow,
                { borderTopColor: theme.cardBorder, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              ]}
              onPress={handleOpenCalendarPicker}
              accessibilityRole="button"
              accessibilityLabel="Change target calendar"
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.subLabel, { color: theme.textMuted }]}>TARGET CALENDAR</Text>
                <Text style={[styles.calendarTargetName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {targetCalendar?.title || "sYnX Tasks"}
                  {targetCalendar?.sourceName ? ` (${targetCalendar.sourceName})` : ""}
                </Text>
              </View>
              <View
                style={[
                  styles.changeBadge,
                  { backgroundColor: theme.accentLight, borderColor: theme.accent },
                ]}
              >
                <Text style={[styles.changeBadgeText, { color: theme.accent }]}>Change</Text>
                <ChevronRight size={14} color={theme.accent} />
              </View>
            </TouchableOpacity>

            {/* Guidance banner for Android when syncing to a dedicated local calendar */}
            {Platform.OS === "android" && (targetCalendar?.isDedicated || targetCalendar?.isLocal) ? (
              <View
                style={[
                  styles.calendarGuidanceCard,
                  {
                    backgroundColor: "rgba(245, 158, 11, 0.08)",
                    borderColor: "rgba(245, 158, 11, 0.3)",
                  },
                ]}
              >
                <View style={styles.guidanceHeader}>
                  <Info size={16} color="#D97706" />
                  <Text style={[styles.guidanceTitle, { color: "#D97706" }]}>
                    Google Calendar Setup Required
                  </Text>
                </View>
                <Text style={[styles.guidanceText, { color: theme.textPrimary }]}>
                  Google Calendar hides local calendars by default. To display sYnX tasks:
                </Text>
                <View style={styles.guidanceSteps}>
                  <Text style={[styles.guidanceStep, { color: theme.textMuted }]}>
                    1. Open the Google Calendar app
                  </Text>
                  <Text style={[styles.guidanceStep, { color: theme.textMuted }]}>
                    2. Tap <Text style={{ fontWeight: "700", color: theme.textPrimary }}>☰ Menu → Settings → Manage accounts</Text>
                  </Text>
                  <Text style={[styles.guidanceStep, { color: theme.textMuted }]}>
                    3. Under <Text style={{ fontWeight: "700", color: theme.textPrimary }}>Non-Google accounts</Text>, toggle on{" "}
                    <Text style={{ fontWeight: "700", color: theme.textPrimary }}>sYnX</Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.openCalendarBtn, { backgroundColor: theme.accent }]}
                  onPress={() => openCalendarApp()}
                  accessibilityRole="button"
                  accessibilityLabel="Open Calendar App"
                >
                  <ExternalLink size={14} color="#FFFFFF" />
                  <Text style={styles.openCalendarBtnText}>Open Calendar App</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[styles.hint, { color: theme.textMuted, marginTop: 8 }]}>
                {targetCalendar?.title
                  ? `Tasks with reminders automatically sync to "${targetCalendar.title}".`
                  : "Tasks with reminders will automatically sync to your selected calendar."}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.subLabel, { color: theme.textMuted, marginTop: 4 }]}>
            Permission status: {calendarPermission}
          </Text>
        )}
      </View>

      {/* Push notifications */}
      <View style={styles.sectionHeader}>
        <Smartphone size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Device Notifications</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Push notifications</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>Status: {pushStatusLabel}</Text>
          </View>
          {pushBusy ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              trackColor={{ false: theme.inputBg, true: theme.accentLight }}
              thumbColor={pushEnabled ? theme.accent : theme.textMuted}
              accessibilityLabel="Push notifications"
            />
          )}
        </View>

        {(pushStatus === "blocked" || pushStatus === "denied") && (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 8 }]}>
              {pushStatus === "blocked"
                ? "Notifications are blocked for sYnX. Enable them in system settings to receive reminders."
                : "Notifications are off. You can enable them here or in system settings."}
            </Text>
            <TouchableOpacity
              style={[styles.linkBtn, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}
              onPress={() => openAppSystemSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open system settings"
            >
              <ExternalLink size={14} color={theme.accent} />
              <Text style={[styles.linkBtnText, { color: theme.accent }]}>Open system settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Reminder channels */}
      <View style={styles.sectionHeader}>
        <Bell size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Reminder Channels</Text>
        {savingRemote ? (
          <ActivityIndicator size="small" color={theme.accent} style={{ marginLeft: 8 }} />
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Email notifications</Text>
          <Switch
            value={emailEnabled}
            onValueChange={(val) => {
              triggerImpact();
              setEmailEnabled(val);
            }}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={emailEnabled ? theme.accent : theme.textMuted}
            accessibilityLabel="Email notifications"
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>SMS notifications</Text>
          <Switch
            value={smsEnabled}
            onValueChange={(val) => {
              triggerImpact();
              setSmsEnabled(val);
            }}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={smsEnabled ? theme.accent : theme.textMuted}
            accessibilityLabel="SMS notifications"
          />
        </View>

        {smsEnabled && (
          <>
            <Text style={[styles.subLabel, { color: theme.textMuted }]}>Phone Number</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              ]}
              placeholder="e.g. +12345678901"
              placeholderTextColor={theme.inputPlaceholder}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel="Phone number"
            />

            <Text style={[styles.subLabel, { color: theme.textMuted }]}>Phone Carrier</Text>
            <View style={styles.carrierRow}>
              {PHONE_CARRIERS.map((c) => {
                const selected = phoneCarrier === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={c.label}
                    style={[
                      styles.carrierChip,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                      selected && {
                        backgroundColor: theme.accentLight,
                        borderColor: theme.accent,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => {
                      triggerImpact();
                      setPhoneCarrier(c.value);
                    }}
                  >
                    <Text
                      style={[
                        styles.carrierChipText,
                        { color: theme.textPrimary },
                        selected && { color: theme.accent, fontWeight: "700" },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.subLabel, { color: theme.textMuted }]}>Discord Webhook URL</Text>
        <TextInput
          style={[
            styles.input,
            { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
          ]}
          placeholder="https://discord.com/api/webhooks/..."
          placeholderTextColor={theme.inputPlaceholder}
          value={discordWebhookUrl}
          onChangeText={setDiscordWebhookUrl}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Discord webhook URL"
        />
        <Text style={[styles.hint, { color: theme.textMuted }]}>Changes save automatically.</Text>
      </View>

      {/* About */}
      <View style={styles.sectionHeader}>
        <Sparkles size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>About & Release Notes</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 4,
            minHeight: MIN_TOUCH_TARGET,
          }}
          onPress={() => {
            triggerImpact();
            setShowChangelog(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="View what's new"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                backgroundColor: theme.badgeSuccessBg,
                borderWidth: 1,
                borderColor: theme.badgeSuccessBorder,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: theme.badgeSuccessFg, fontSize: typography.xs, fontWeight: "800" }}>
                {MOBILE_VERSION}
              </Text>
            </View>
            <Text style={[styles.label, { color: theme.textPrimary, fontWeight: "700" }]}>
              What's new? / Version Log
            </Text>
          </View>
          <Text style={{ color: theme.accent, fontSize: typography.sm, fontWeight: "700" }}>View</Text>
        </TouchableOpacity>
      </View>

      <CalendarPickerModal
        visible={showCalendarPicker}
        onClose={() => setShowCalendarPicker(false)}
        calendars={availableCalendars}
        selectedCalendarId={targetCalendar?.id}
        onSelectCalendar={handleSelectCalendar}
        onCreateDedicatedCalendar={handleCreateDedicatedCalendar}
      />

      <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />

      <TouchableOpacity
        style={[styles.logoutBtn, { backgroundColor: theme.danger }]}
        onPress={confirmLogout}
        accessibilityRole="button"
        accessibilityLabel="Log out of sYnID"
      >
        <LogOut size={18} color="#FFFFFF" />
        <Text style={styles.logoutText}>Log Out of sYnID</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: "700",
  },
  card: {
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  subLabel: {
    fontSize: typography.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  accountEmail: {
    fontSize: typography.lg,
    fontWeight: "700",
  },
  accountId: {
    fontSize: typography.xs,
    marginTop: 4,
  },
  themeRow: {
    gap: 8,
    marginBottom: 16,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    minHeight: MIN_TOUCH_TARGET,
  },
  colorPreviewCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  systemPreview: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
  },
  systemHalf: {
    flex: 1,
    height: "100%",
  },
  themeOptionText: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    minHeight: MIN_TOUCH_TARGET,
  },
  label: {
    fontSize: typography.sm,
    fontWeight: "500",
  },
  hint: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  input: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: typography.sm,
    marginBottom: 8,
    minHeight: MIN_TOUCH_TARGET,
  },
  carrierRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  carrierChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    justifyContent: "center",
  },
  carrierChipText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
  },
  linkBtnText: {
    fontWeight: "700",
    fontSize: typography.sm,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 20,
    gap: 8,
    minHeight: MIN_TOUCH_TARGET + 4,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: typography.md,
    fontWeight: "700",
  },
  calendarTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
  calendarTargetName: {
    fontSize: typography.sm,
    fontWeight: "600",
    marginTop: 2,
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  changeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "700",
  },
  calendarGuidanceCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  guidanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  guidanceTitle: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
  guidanceText: {
    fontSize: typography.xs,
    lineHeight: 16,
    marginBottom: 6,
  },
  guidanceSteps: {
    gap: 4,
    marginBottom: 10,
    paddingLeft: 4,
  },
  guidanceStep: {
    fontSize: typography.xs,
    lineHeight: 16,
  },
  openCalendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    minHeight: MIN_TOUCH_TARGET,
  },
  openCalendarBtnText: {
    fontSize: typography.sm,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});