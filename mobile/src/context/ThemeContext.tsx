import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { ThemeMode, ThemeColors, darkTheme, lightTheme } from "../theme/theme";

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY_THEME = "SYNX_THEME_MODE";
const STORAGE_KEY_HAPTICS = "SYNX_HAPTICS_ENABLED";

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "dark",
  theme: darkTheme,
  setThemeMode: () => {},
  hapticsEnabled: true,
  setHapticsEnabled: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("dark");
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(STORAGE_KEY_THEME);
        if (savedTheme === "light" || savedTheme === "dark") {
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

  const theme = themeMode === "light" ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        theme,
        setThemeMode,
        hapticsEnabled,
        setHapticsEnabled,
      }}
    >
      <StatusBar style={themeMode === "light" ? "dark" : "light"} animated />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
