import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationSoftAsk } from "../components/NotificationSoftAsk";
import { MOBILE_VERSION } from "../constants/changelog";
import {
  clearSoftAskDeclined,
  getPushPermissionStatus,
  markContextualReminderNudgeShown,
  markSoftAskDeclined,
  registerPushTokenIfPermitted,
  requestAndRegisterPush,
  shouldShowSoftAsk,
} from "../services/notifications";

interface PushPromptContextType {
  /** Call when user sets a reminder — may show soft ask if previously declined. */
  maybeAskOnReminder: () => Promise<void>;
  refreshPushRegistration: () => Promise<void>;
}

const PushPromptContext = createContext<PushPromptContextType>({
  maybeAskOnReminder: async () => {},
  refreshPushRegistration: async () => {},
});

const CHANGELOG_KEY = "last_seen_changelog_version";

async function waitUntilChangelogSettled(maxMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const lastSeen = await AsyncStorage.getItem(CHANGELOG_KEY);
      if (lastSeen === MOBILE_VERSION) return;
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

interface PushPromptProviderProps {
  /** Only run soft-ask / silent register when main authenticated UI is ready */
  enabled: boolean;
  children: React.ReactNode;
}

export const PushPromptProvider: React.FC<PushPromptProviderProps> = ({
  enabled,
  children,
}) => {
  const [showSoftAsk, setShowSoftAsk] = useState(false);
  const busyRef = useRef(false);
  const ranLaunchRef = useRef(false);

  const refreshPushRegistration = useCallback(async () => {
    const status = await getPushPermissionStatus();
    if (status === "granted") {
      await registerPushTokenIfPermitted();
    }
  }, []);

  const openSoftAskIfNeeded = useCallback(async (opts?: { contextualReminder?: boolean }) => {
    if (busyRef.current || showSoftAsk) return;
    const ok = await shouldShowSoftAsk({ contextualReminder: opts?.contextualReminder });
    if (!ok) return;
    if (opts?.contextualReminder) {
      await markContextualReminderNudgeShown();
    }
    setShowSoftAsk(true);
  }, [showSoftAsk]);

  useEffect(() => {
    if (!enabled) {
      ranLaunchRef.current = false;
      setShowSoftAsk(false);
      return;
    }
    if (ranLaunchRef.current) return;
    ranLaunchRef.current = true;

    let cancelled = false;
    (async () => {
      // Never overlay login; wait until What's New is dismissed (or already seen).
      await waitUntilChangelogSettled();
      if (cancelled) return;

      const status = await getPushPermissionStatus();
      if (status === "granted") {
        await registerPushTokenIfPermitted();
        return;
      }
      // blocked / denied permanently → never soft-ask
      if (status === "blocked") return;

      const should = await shouldShowSoftAsk();
      if (!cancelled && should) {
        setShowSoftAsk(true);
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const handleEnable = async () => {
    busyRef.current = true;
    setShowSoftAsk(false);
    try {
      const token = await requestAndRegisterPush();
      if (token) {
        await clearSoftAskDeclined();
      }
      // On deny: do not nag; leave declined unset so policy can re-ask later by time only if OS still undetermined
    } finally {
      busyRef.current = false;
    }
  };

  const handleNotNow = async () => {
    setShowSoftAsk(false);
    await markSoftAskDeclined();
  };

  const maybeAskOnReminder = useCallback(async () => {
    await openSoftAskIfNeeded({ contextualReminder: true });
  }, [openSoftAskIfNeeded]);

  return (
    <PushPromptContext.Provider value={{ maybeAskOnReminder, refreshPushRegistration }}>
      {children}
      <NotificationSoftAsk
        visible={showSoftAsk}
        onEnable={handleEnable}
        onNotNow={handleNotNow}
      />
    </PushPromptContext.Provider>
  );
};

export const usePushPrompt = () => useContext(PushPromptContext);
