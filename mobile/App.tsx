import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, asyncStoragePersister } from "./src/services/storage";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider } from "./src/context/ThemeContext";
import { ToastProvider } from "./src/context/ToastContext";
import { BottomTabNavigator } from "./src/navigation/BottomTabNavigator";
import { startWidgetSyncService } from "./src/services/widgetSync";

export default function App() {
  useEffect(() => {
    const unsub = startWidgetSyncService(queryClient);
    return unsub;
  }, []);

  return (
    <SafeAreaProvider>
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
