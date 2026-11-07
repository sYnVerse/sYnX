import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationSoftAsk } from "../components/NotificationSoftAsk";
import { CalendarAccessSoftAsk } from "../components/CalendarAccessSoftAsk";
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
import {
  checkCalendarPermissions,
  clearCalendarSoftAskDeclined,
  enableCalendarAccessFromPrompt,
  isCalendarSyncEnabled,
  markCalendarSoftAskDeclined,
  shouldShowCalendarSoftAsk,
  syncAllTasksToNativeCalendar,
  turnOffCalendarSyncFromPrompt,
} from "../services/calendar";
import { collectCachedTasks } from "../services/calendarReconcile";
import { getCachedListName } from "../services/listNames";

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
  const queryClient = useQueryClient();
  const [showSoftAsk, setShowSoftAsk] = useState(false);
  const [showCalendarSoftAsk, setShowCalendarSoftAsk] = useState(false);
  const busyRef = useRef(false);
  const ranLaunchRef = useRef(false);

  // Hide soft asks as soon as the provider is disabled (for example on sign-out),
  // adjusting state during render instead of in an effect.
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    if (!enabled) {
      setShowSoftAsk(false);
      setShowCalendarSoftAsk(false);
    }
  }

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
      }

      let showingPush = false;
      // blocked / denied permanently → never soft-ask
      if (status !== "granted" && status !== "blocked") {
        const should = await shouldShowSoftAsk();
        if (!cancelled && should) {
          showingPush = true;
          setShowSoftAsk(true);
        }
      }

      if (!showingPush) {
        const shouldCalendar = await shouldShowCalendarSoftAsk();
        if (!cancelled && shouldCalendar) {
          setShowCalendarSoftAsk(true);
        }
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Check calendar permission on foreground (e.g. returning from system settings)
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;
      const syncOn = await isCalendarSyncEnabled();
      if (!syncOn) return;

      const perm = await checkCalendarPermissions();
      if (perm.granted) {
        setShowCalendarSoftAsk(false);
        await clearCalendarSoftAskDeclined();
        const cached = collectCachedTasks(queryClient);
        if (cached.length > 0) {
          await syncAllTasksToNativeCalendar(cached, (listId) => getCachedListName(queryClient, listId));
        }
        return;
      }

      if (!showSoftAsk && !showCalendarSoftAsk && !busyRef.current) {
        const should = await shouldShowCalendarSoftAsk();
        if (should) {
          setShowCalendarSoftAsk(true);
        }
      }
    });

    return () => subscription.remove();
  }, [enabled, queryClient, showSoftAsk, showCalendarSoftAsk]);

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
      const shouldCalendar = await shouldShowCalendarSoftAsk();
      if (shouldCalendar) {
        setShowCalendarSoftAsk(true);
      }
    }
  };

  const handleNotNow = async () => {
    setShowSoftAsk(false);
    await markSoftAskDeclined();
    const shouldCalendar = await shouldShowCalendarSoftAsk();
    if (shouldCalendar) {
      setShowCalendarSoftAsk(true);
    }
  };

  const handleCalendarTurnOn = async () => {
    busyRef.current = true;
    setShowCalendarSoftAsk(false);
    try {
      const result = await enableCalendarAccessFromPrompt();
      if (result.granted) {
        const cached = collectCachedTasks(queryClient);
        if (cached.length > 0) {
          await syncAllTasksToNativeCalendar(cached, (listId) => getCachedListName(queryClient, listId));
        }
      }
    } finally {
      busyRef.current = false;
    }
  };

  const handleCalendarNotNow = async () => {
    setShowCalendarSoftAsk(false);
    await markCalendarSoftAskDeclined();
  };

  const handleCalendarTurnOffSync = async () => {
    setShowCalendarSoftAsk(false);
    await turnOffCalendarSyncFromPrompt();
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
      <CalendarAccessSoftAsk
        visible={showCalendarSoftAsk}
        onTurnOn={handleCalendarTurnOn}
        onTurnOffSync={handleCalendarTurnOffSync}
        onNotNow={handleCalendarNotNow}
      />
    </PushPromptContext.Provider>
  );
};

export const usePushPrompt = () => useContext(PushPromptContext);
