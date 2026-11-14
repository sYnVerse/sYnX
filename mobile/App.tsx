import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, asyncStoragePersister } from "./src/services/storage";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider } from "./src/context/ThemeContext";
import { ToastProvider } from "./src/context/ToastContext";
import { BottomTabNavigator } from "./src/navigation/BottomTabNavigator";
import { startWidgetSyncService } from "./src/services/widgetSync";
import { startCalendarReconcileService } from "./src/services/calendarReconcile";
import { startNotificationResponseService } from "./src/services/notifications";
import { registerWidgetBackgroundSync } from "./src/services/widgetBackgroundTask";
import { startPeriodicUpdateService, useUpdatesBridge } from "./src/services/updates";

function UpdatesBridge() {
  useUpdatesBridge();
  return null;
}

export default function App() {
  useEffect(() => {
    const unsubWidgets = startWidgetSyncService(queryClient);
    const unsubCalendar = startCalendarReconcileService(queryClient);
    const unsubNotifications = startNotificationResponseService(queryClient);
    const unsubUpdates = startPeriodicUpdateService();
    registerWidgetBackgroundSync().catch(() => {});
    return () => {
      unsubWidgets();
      unsubCalendar();
      unsubNotifications();
      unsubUpdates();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <UpdatesBridge />
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <BottomTabNavigator />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
