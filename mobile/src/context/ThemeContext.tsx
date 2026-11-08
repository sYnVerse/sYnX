import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { AppState, Appearance, ColorSchemeName, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { ThemeMode, ThemeColors, darkTheme, lightTheme } from "../theme/theme";
import { resolveThemeMode } from "../shared";

interface ThemeContextType {
  /** Stored preference: dark | light | system */
  themeMode: ThemeMode;
  /** Resolved light/dark used for colors */
  resolvedMode: "dark" | "light";
  theme: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY_THEME = "SYNX_THEME_MODE";
const STORAGE_KEY_HAPTICS = "SYNX_HAPTICS_ENABLED";

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "system",
  resolvedMode: "dark",
  theme: darkTheme,
  setThemeMode: () => {},
  hapticsEnabled: true,
  setHapticsEnabled: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const hookScheme = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    () => hookScheme ?? Appearance.getColorScheme()
  );
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);

  // Sync state whenever the React Native hook produces a new non-null scheme
  useEffect(() => {
    if (hookScheme) {
      setSystemScheme(hookScheme);
    }
  }, [hookScheme]);

  // Re-check system appearance on foreground resume (#176) and appearance broadcasts
  useEffect(() => {
    const appearanceSub = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        setSystemScheme(colorScheme);
      }
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        const current = Appearance.getColorScheme();
        if (current) {
          setSystemScheme(current);
        }
        // Delayed check to catch any asynchronous Android configuration updates after onResume
        timeoutId = setTimeout(() => {
          const delayed = Appearance.getColorScheme();
          if (delayed) {
            setSystemScheme(delayed);
          }
        }, 150);
      }
    });

    return () => {
      appearanceSub.remove();
      appStateSub.remove();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(STORAGE_KEY_THEME);
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setThemeModeState(savedTheme);
        }
        const savedHaptics = await AsyncStorage.getItem(STORAGE_KEY_HAPTICS);
        if (savedHaptics !== null) {
          setHapticsEnabledState(savedHaptics === "true");
        }
      } catch (e) {
        console.error("Failed to load theme context", e);
      }
    })();
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_THEME, mode);
    } catch (e) {
      console.error("Failed to save theme mode", e);
    }
  };

  const setHapticsEnabled = async (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_HAPTICS, String(enabled));
    } catch (e) {
      console.error("Failed to save haptics preference", e);
    }
  };

  const resolvedMode = useMemo(
    () => resolveThemeMode(themeMode, systemScheme ?? Appearance.getColorScheme()),
    [themeMode, systemScheme]
  );

  const theme = resolvedMode === "light" ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedMode,
        theme,
        setThemeMode,
        hapticsEnabled,
        setHapticsEnabled,
      }}
    >
      <StatusBar style={resolvedMode === "light" ? "dark" : "light"} animated />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
