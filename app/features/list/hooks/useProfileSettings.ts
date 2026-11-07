import { useEffect, useMemo, useState } from "react";
import type { FetcherWithComponents } from "react-router";
import { getLocalTimeZone, isValidTimeZone, listTimeZones } from "../../../../shared";

interface SettingsData {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  phoneNumber?: string;
  phoneCarrier?: string;
  discordWebhookUrl?: string;
  displayName?: string;
  displayNameSet?: boolean;
  timeZone?: string | null;
  avatarUrl?: string | null;
  suggestedDisplayName?: string | null;
}

interface UseProfileSettingsOptions {
  settings?: SettingsData;
  providerProfile?: Promise<{ avatarUrl: string | null; suggestedDisplayName: string | null } | null>;
  hydrated: boolean;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  settingsFetcher: FetcherWithComponents<unknown>;
  suggestionFetcher: FetcherWithComponents<unknown>;
  timeZoneFetcher: FetcherWithComponents<unknown>;
  showToast: (message: string) => void;
}

// Strips "+1" prefix if present to display only 10 digits in input
export const getDisplayPhone = (phone?: string) => {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return cleaned.substring(1);
  }
  return cleaned;
};

export function useProfileSettings({
  settings,
  providerProfile,
  hydrated,
  isProfileOpen,
  setIsProfileOpen,
  settingsFetcher,
  suggestionFetcher,
  timeZoneFetcher,
  showToast,
}: UseProfileSettingsOptions) {
  const initialEmailEnabled = settings?.emailEnabled ?? false;
  const initialSmsEnabled = settings?.smsEnabled ?? false;
  const initialPhoneInput = getDisplayPhone(settings?.phoneNumber);
  const initialPhoneCarrier = settings?.phoneCarrier ?? "";
  const initialDiscordEnabled = !!settings?.discordWebhookUrl;
  const initialDiscordInput = settings?.discordWebhookUrl ?? "";
  const initialDisplayNameInput = settings?.displayNameSet ? (settings?.displayName ?? "") : "";
  const initialHomeTimeZone = settings?.timeZone ?? "";

  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [smsEnabled, setSmsEnabled] = useState(initialSmsEnabled);
  const [phoneInput, setPhoneInput] = useState(initialPhoneInput);
  const [phoneCarrier, setPhoneCarrier] = useState(initialPhoneCarrier);
  const [discordEnabled, setDiscordEnabled] = useState(initialDiscordEnabled);
  const [discordInput, setDiscordInput] = useState(initialDiscordInput);
  const [displayNameInput, setDisplayNameInput] = useState(initialDisplayNameInput);
  const [homeTimeZoneInput, setHomeTimeZoneInput] = useState(initialHomeTimeZone);

  const [deferredSuggestion, setDeferredSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (!providerProfile) return;
    let cancelled = false;
    providerProfile
      .then((p) => {
        if (!cancelled && p?.suggestedDisplayName) {
          setDeferredSuggestion(p.suggestedDisplayName);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerProfile]);

  const [nameSuggestionHandled, setNameSuggestionHandled] = useState(false);
  const activeSuggestion = deferredSuggestion ?? settings?.suggestedDisplayName ?? null;
  const pendingNameSuggestion =
    !nameSuggestionHandled && !settings?.displayNameSet ? activeSuggestion : null;

  const acceptNameSuggestion = (name: string) => {
    suggestionFetcher.submit({ intent: "acceptSuggestedDisplayName" }, { method: "post" });
    setDisplayNameInput(name);
    setNameSuggestionHandled(true);
    showToast("✓ Display name saved");
  };

  const dismissNameSuggestion = () => {
    suggestionFetcher.submit({ intent: "dismissSuggestedDisplayName" }, { method: "post" });
    setNameSuggestionHandled(true);
  };

  const timeZoneOptions = useMemo(() => (hydrated ? listTimeZones() : []), [hydrated]);
  const browserTimeZone = useMemo(() => (hydrated ? getLocalTimeZone() : undefined), [hydrated]);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const isSettingsDirty =
    emailEnabled !== initialEmailEnabled ||
    smsEnabled !== initialSmsEnabled ||
    phoneInput !== initialPhoneInput ||
    phoneCarrier !== initialPhoneCarrier ||
    discordEnabled !== initialDiscordEnabled ||
    discordInput !== initialDiscordInput ||
    displayNameInput !== initialDisplayNameInput ||
    homeTimeZoneInput.trim() !== initialHomeTimeZone;

  const resetSettings = () => {
    setEmailEnabled(initialEmailEnabled);
    setSmsEnabled(initialSmsEnabled);
    setPhoneInput(initialPhoneInput);
    setPhoneCarrier(initialPhoneCarrier);
    setDiscordEnabled(initialDiscordEnabled);
    setDiscordInput(initialDiscordInput);
    setDisplayNameInput(initialDisplayNameInput);
    setHomeTimeZoneInput(initialHomeTimeZone);
  };

  /** Validates and saves the home time zone if it changed. False if invalid. */
  const saveHomeTimeZone = () => {
    const zone = homeTimeZoneInput.trim();
    if (zone === initialHomeTimeZone) return true;
    if (!isValidTimeZone(zone)) {
      showToast("⚠️ Pick a home time zone from the list");
      return false;
    }
    timeZoneFetcher.submit({ intent: "setTimeZone", timeZone: zone }, { method: "post" });
    return true;
  };

  const handleSaveSettings = () => {
    const cleanPhone = phoneInput.replace(/\D/g, "");
    if (smsEnabled && cleanPhone.length !== 10) {
      showToast("⚠️ Phone number must be exactly 10 digits!");
      return false;
    }
    if (!saveHomeTimeZone()) return false;
    settingsFetcher.submit({
      intent: "updateSettings",
      emailEnabled: emailEnabled ? "true" : "false",
      smsEnabled: smsEnabled ? "true" : "false",
      phoneNumber: smsEnabled ? `+1${cleanPhone}` : "",
      phoneCarrier: smsEnabled ? phoneCarrier : "",
      discordWebhookUrl: discordEnabled ? discordInput : "",
      displayName: displayNameInput.trim(),
    }, { method: "post" });
    showToast("✓ Saved Preferences!");
    return true;
  };

  const requestCloseProfile = () => {
    if (isSettingsDirty) {
      setShowUnsavedPrompt(true);
    } else {
      setIsProfileOpen(false);
    }
  };

  useEffect(() => {
    if (!isProfileOpen || !isSettingsDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isProfileOpen, isSettingsDirty]);

  // Reset the form when the saved settings change. Compared by value: the
  // loader returns a new settings object on every revalidation, which used to
  // wipe unsaved edits in the open Profile panel.
  const savedSettingsKey = JSON.stringify([
    initialEmailEnabled,
    initialSmsEnabled,
    initialPhoneInput,
    initialPhoneCarrier,
    initialDiscordEnabled,
    initialDiscordInput,
    initialDisplayNameInput,
    initialHomeTimeZone,
  ]);
  const [syncedSettingsKey, setSyncedSettingsKey] = useState(savedSettingsKey);
  if (syncedSettingsKey !== savedSettingsKey) {
    setSyncedSettingsKey(savedSettingsKey);
    resetSettings();
  }

  return {
    emailEnabled,
    setEmailEnabled,
    smsEnabled,
    setSmsEnabled,
    phoneInput,
    setPhoneInput,
    phoneCarrier,
    setPhoneCarrier,
    discordEnabled,
    setDiscordEnabled,
    discordInput,
    setDiscordInput,
    displayNameInput,
    setDisplayNameInput,
    homeTimeZoneInput,
    setHomeTimeZoneInput,
    pendingNameSuggestion,
    acceptNameSuggestion,
    dismissNameSuggestion,
    timeZoneOptions,
    browserTimeZone,
    showUnsavedPrompt,
    setShowUnsavedPrompt,
    isSettingsDirty,
    resetSettings,
    handleSaveSettings,
    requestCloseProfile,
  };
}
