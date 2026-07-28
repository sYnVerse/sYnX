import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Switch, TextInput, TouchableOpacity, ScrollView } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "../context/AuthContext";
import { apiClient, DEVICE_PUSH_TOKEN_KEY } from "../api/client";
import { registerForPushNotificationsAsync } from "../services/notifications";

interface SettingsScreenProps {
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterActions?: (actions: { save: () => Promise<boolean>; reset: () => void } | null) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onDirtyChange, onRegisterActions }) => {
  const { logout } = useAuth();
  const [initialSettings, setInitialSettings] = useState<{
    emailEnabled: boolean;
    smsEnabled: boolean;
    phoneNumber: string;
    phoneCarrier: string;
    discordWebhookUrl: string;
  } | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCarrier, setPhoneCarrier] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [pushStatus, setPushStatus] = useState<string>("Not Registered");

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
      alert("Settings saved successfully!");
      return true;
    } catch (e: any) {
      alert(e.response?.data?.error || "Failed to save settings");
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
    const token = await registerForPushNotificationsAsync();
    if (token) {
      setPushStatus("Registered!");
    } else {
      setPushStatus("Permission Denied");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Notification Settings</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Email Notifications</Text>
          <Switch value={emailEnabled} onValueChange={setEmailEnabled} />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>SMS Notifications</Text>
          <Switch value={smsEnabled} onValueChange={setSmsEnabled} />
        </View>

        {smsEnabled && (
          <>
            <Text style={styles.subLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +12345678901"
              placeholderTextColor="#64748b"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />

            <Text style={styles.subLabel}>Phone Carrier</Text>
            <TextInput
              style={styles.input}
              placeholder="verizon, att, tmobile..."
              placeholderTextColor="#64748b"
              value={phoneCarrier}
              onChangeText={setPhoneCarrier}
            />
          </>
        )}

        <Text style={styles.subLabel}>Discord Webhook URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://discord.com/api/webhooks/..."
          placeholderTextColor="#64748b"
          value={discordWebhookUrl}
          onChangeText={setDiscordWebhookUrl}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.header}>Device Push Notifications</Text>
      <View style={styles.card}>
        <Text style={styles.subLabel}>Status: {pushStatus}</Text>
        <TouchableOpacity style={styles.pushBtn} onPress={handleRegisterPush}>
          <Text style={styles.pushBtnText}>Enable Device Push Notifications</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 16,
  },
  header: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "bold",
    marginVertical: 12,
  },
  card: {
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  label: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "500",
  },
  subLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  saveBtn: {
    backgroundColor: "#6366f1",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
  pushBtn: {
    backgroundColor: "#3b82f6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  pushBtnText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
  logoutBtn: {
    backgroundColor: "#f43f5e",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  logoutText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
