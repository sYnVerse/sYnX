import React, { useState, useEffect } from "react";
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
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import { Palette, Vibrate, Bell, Smartphone, LogOut, Check, Save, Calendar as CalendarIcon, Sparkles } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { apiClient, DEVICE_PUSH_TOKEN_KEY } from "../api/client";
import { registerForPushNotificationsAsync } from "../services/notifications";
import { useTheme } from "../context/ThemeContext";
import { ChangelogModal } from "../components/ChangelogModal";
import { MOBILE_VERSION } from "../constants/changelog";

import {
  isCalendarSyncEnabled,
  setCalendarSyncEnabled,
  checkCalendarPermissions,
  requestCalendarPermissions,
  getOrCreateSynxCalendar,
} from "../services/calendar";

interface SettingsScreenProps {
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterActions?: (actions: { save: () => Promise<boolean>; reset: () => void } | null) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onDirtyChange, onRegisterActions }) => {
  const { logout } = useAuth();
  const { theme, themeMode, setThemeMode, hapticsEnabled, setHapticsEnabled } = useTheme();

  const [initialSettings, setInitialSettings] = useState<{
    emailEnabled: boolean;
    smsEnabled: boolean;
    phoneNumber: string;
    phoneCarrier: string;
    discordWebhookUrl: string;
  } | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCarrier, setPhoneCarrier] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [pushStatus, setPushStatus] = useState<string>("Not Registered");
  const [calendarSync, setCalendarSync] = useState(false);
  const [calendarPermission, setCalendarPermission] = useState<string>("Not Granted");

  const triggerImpact = () => {
    if (hapticsEnabled && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

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
          };
          setInitialSettings(loaded);
          setEmailEnabled(loaded.emailEnabled);
          setSmsEnabled(loaded.smsEnabled);
          setPhoneNumber(loaded.phoneNumber);
          setPhoneCarrier(loaded.phoneCarrier);
          setDiscordWebhookUrl(loaded.discordWebhookUrl);
          onDirtyChange?.(false);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }

      try {
        const token = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
        if (token) {
          setPushStatus("Registered!");
        }
      } catch (e) {
        console.error("Failed to read stored push token", e);
      }

      try {
        const syncEnabled = await isCalendarSyncEnabled();
        setCalendarSync(syncEnabled);
        const hasPermission = await checkCalendarPermissions();
        setCalendarPermission(hasPermission ? "Granted" : "Not Granted");
      } catch (e) {
        console.error("Failed to read calendar settings", e);
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    if (!initialSettings) return;
    const isDirty =
      emailEnabled !== initialSettings.emailEnabled ||
      smsEnabled !== initialSettings.smsEnabled ||
      phoneNumber !== initialSettings.phoneNumber ||
      phoneCarrier !== initialSettings.phoneCarrier ||
      discordWebhookUrl !== initialSettings.discordWebhookUrl;

    onDirtyChange?.(isDirty);
  }, [emailEnabled, smsEnabled, phoneNumber, phoneCarrier, discordWebhookUrl, initialSettings]);

  const handleSave = async (): Promise<boolean> => {
    triggerImpact();
    try {
      await apiClient.put("/api/v1/settings", {
        emailEnabled,
        smsEnabled,
        phoneNumber,
        phoneCarrier,
        discordWebhookUrl,
      });
      const updated = { emailEnabled, smsEnabled, phoneNumber, phoneCarrier, discordWebhookUrl };
      setInitialSettings(updated);
      onDirtyChange?.(false);
      Alert.alert("Success", "Settings saved successfully!");
      return true;
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to save settings");
      return false;
    }
  };

  const resetSettings = () => {
    if (initialSettings) {
      setEmailEnabled(initialSettings.emailEnabled);
      setSmsEnabled(initialSettings.smsEnabled);
      setPhoneNumber(initialSettings.phoneNumber);
      setPhoneCarrier(initialSettings.phoneCarrier);
      setDiscordWebhookUrl(initialSettings.discordWebhookUrl);
      onDirtyChange?.(false);
    }
  };

  useEffect(() => {
    if (onRegisterActions) {
      onRegisterActions({ save: handleSave, reset: resetSettings });
    }
    return () => {
      onRegisterActions?.(null);
    };
  }, [emailEnabled, smsEnabled, phoneNumber, phoneCarrier, discordWebhookUrl, initialSettings]);

  const handleRegisterPush = async () => {
    triggerImpact();
    const token = await registerForPushNotificationsAsync();
    if (token) {
      setPushStatus("Registered!");
    } else {
      setPushStatus("Permission Denied");
    }
  };

  const handleToggleCalendarSync = async (val: boolean) => {
    triggerImpact();
    if (val) {
      let granted = await checkCalendarPermissions();
      if (!granted) {
        granted = await requestCalendarPermissions();
      }
      if (!granted) {
        setCalendarPermission("Denied");
        Alert.alert("Permission Denied", "Calendar access is required to sync task reminders to your device calendar.");
        return;
      }
      setCalendarPermission("Granted");
      await setCalendarSyncEnabled(true);
      setCalendarSync(true);
      await getOrCreateSynxCalendar();
      Alert.alert("Calendar Sync Enabled", "Tasks with reminders will automatically sync to the 'sYnX Tasks' native calendar.");
    } else {
      await setCalendarSyncEnabled(false);
      setCalendarSync(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={{ paddingBottom: 110 }}
    >
      {/* App Theme & Experience Section */}
      <View style={styles.sectionHeader}>
        <Palette size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appearance & Haptics</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.subLabel, { color: theme.textMuted }]}>THEME PREFERENCE</Text>
        <View style={styles.themeRow}>
          <TouchableOpacity
            style={[
              styles.themeOption,
              { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              themeMode === "dark" && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 2 },
            ]}
            onPress={() => {
              triggerImpact();
              setThemeMode("dark");
            }}
          >
            <View style={[styles.colorPreviewCircle, { backgroundColor: "#0F172A" }]} />
            <Text style={[styles.themeOptionText, { color: theme.textPrimary }]}>Modern Glass Dark</Text>
            {themeMode === "dark" && <Check size={14} color={theme.accent} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOption,
              { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
              themeMode === "light" && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 2 },
            ]}
            onPress={() => {
              triggerImpact();
              setThemeMode("light");
            }}
          >
            <View style={[styles.colorPreviewCircle, { backgroundColor: "#FAF7F2", borderColor: "#CBD5E1", borderWidth: 1 }]} />
            <Text style={[styles.themeOptionText, { color: theme.textPrimary }]}>Light Pastel</Text>
            {themeMode === "light" && <Check size={14} color={theme.accent} />}
          </TouchableOpacity>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
            thumbColor={hapticsEnabled ? theme.accent : "#94A3B8"}
          />
        </View>
      </View>

      {/* Device Calendar Integration */}
      <View style={styles.sectionHeader}>
        <CalendarIcon size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Device Calendar Integration</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Sync Tasks to Device Calendar</Text>
          <Switch
            value={calendarSync}
            onValueChange={handleToggleCalendarSync}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={calendarSync ? theme.accent : "#94A3B8"}
          />
        </View>
        <Text style={[styles.subLabel, { color: theme.textMuted, marginTop: 4 }]}>
          TARGET CALENDAR: sYnX Tasks ({calendarPermission})
        </Text>
      </View>

      {/* Notifications Section */}
      <View style={styles.sectionHeader}>
        <Bell size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Notifications</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Email Notifications</Text>
          <Switch
            value={emailEnabled}
            onValueChange={(val) => {
              triggerImpact();
              setEmailEnabled(val);
            }}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={emailEnabled ? theme.accent : "#94A3B8"}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>SMS Notifications</Text>
          <Switch
            value={smsEnabled}
            onValueChange={(val) => {
              triggerImpact();
              setSmsEnabled(val);
            }}
            trackColor={{ false: theme.inputBg, true: theme.accentLight }}
            thumbColor={smsEnabled ? theme.accent : "#94A3B8"}
          />
        </View>

        {smsEnabled && (
          <>
            <Text style={[styles.subLabel, { color: theme.textMuted }]}>Phone Number</Text>
            <TextInput
              style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              placeholder="e.g. +12345678901"
              placeholderTextColor={theme.inputPlaceholder}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />

            <Text style={[styles.subLabel, { color: theme.textMuted }]}>Phone Carrier</Text>
            <TextInput
              style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
              placeholder="verizon, att, tmobile..."
              placeholderTextColor={theme.inputPlaceholder}
              value={phoneCarrier}
              onChangeText={setPhoneCarrier}
            />
          </>
        )}

        <Text style={[styles.subLabel, { color: theme.textMuted }]}>Discord Webhook URL</Text>
        <TextInput
          style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          placeholder="https://discord.com/api/webhooks/..."
          placeholderTextColor={theme.inputPlaceholder}
          value={discordWebhookUrl}
          onChangeText={setDiscordWebhookUrl}
        />

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accent }]} onPress={handleSave}>
          <Save size={16} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>Save Notification Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Device Push Notifications */}
      <View style={styles.sectionHeader}>
        <Smartphone size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Device Push Token</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.subLabel, { color: theme.textMuted }]}>STATUS: {pushStatus}</Text>
        <TouchableOpacity style={[styles.pushBtn, { backgroundColor: theme.accentLight }]} onPress={handleRegisterPush}>
          <Text style={[styles.pushBtnText, { color: theme.accent }]}>Register Push Token</Text>
        </TouchableOpacity>
      </View>

      {/* About & Version Log */}
      <View style={styles.sectionHeader}>
        <Sparkles size={16} color={theme.accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>About & Release Notes</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}
          onPress={() => {
            triggerImpact();
            setShowChangelog(true);
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ backgroundColor: "rgba(34, 197, 94, 0.15)", borderWidth: 1, borderColor: "rgba(34, 197, 94, 0.3)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ color: "#4ADE80", fontSize: 11, fontWeight: "800" }}>{MOBILE_VERSION}</Text>
            </View>
            <Text style={[styles.label, { color: theme.textPrimary, fontWeight: "700" }]}>What's new? / Version Log</Text>
          </View>
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "700" }}>View</Text>
        </TouchableOpacity>
      </View>

      <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />

      {/* Log Out */}

      <TouchableOpacity
        style={[styles.logoutBtn, { backgroundColor: theme.danger }]}
        onPress={() => {
          triggerImpact();
          logout();
        }}
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
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
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
  },
  colorPreviewCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  themeOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 13,
    marginBottom: 8,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 14,
    marginTop: 12,
    gap: 8,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  pushBtn: {
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
  pushBtnText: {
    fontWeight: "700",
    fontSize: 14,
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
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
