import { describe, it, expect } from "vitest";
import settingsScreenSource from "../mobile/src/screens/SettingsScreen.tsx?raw";
import bottomTabNavSource from "../mobile/src/navigation/BottomTabNavigator.tsx?raw";
import bannerSource from "../mobile/src/components/NativeUpdateBanner.tsx?raw";

describe("native update prompt UI integration (Issue #202)", () => {
  describe("BottomTabNavigator banner placement", () => {
    it("imports and mounts NativeUpdateBanner at the top of the shell", () => {
      expect(bottomTabNavSource).toContain('import { NativeUpdateBanner } from "../components/NativeUpdateBanner"');
      expect(bottomTabNavSource).toContain("<NativeUpdateBanner />");
    });
  });

  describe("NativeUpdateBanner component contract", () => {
    it("renders alert role with title, message, Update and Dismiss buttons", () => {
      expect(bannerSource).toContain('accessibilityRole="alert"');
      expect(bannerSource).toContain("Native Update Required");
      expect(bannerSource).toContain("Linking.openURL");
      expect(bannerSource).toContain("dismissNativeUpdatePrompt");
      expect(bannerSource).toContain("handleDismiss");
      expect(bannerSource).toContain("handleOpenDownload");
    });

    it("supports blocking and non-blocking display modes", () => {
      expect(bannerSource).toContain("native.isBlocking");
      expect(bannerSource).toContain("styles.blockingContainer");
      expect(bannerSource).toContain("Install Native Update");
    });
  });

  describe("SettingsScreen update section contract", () => {
    it("warns about native update required instead of saying 'sYnX is up to date'", () => {
      expect(settingsScreenSource).toContain("result.isNativeUpdateRequired");
      expect(settingsScreenSource).toContain("result.nativeUpdateMessage");
      expect(settingsScreenSource).toContain("Native app update required");
    });

    it("renders warning banner when updateState.nativeUpdate.isUpdateRequired is true", () => {
      expect(settingsScreenSource).toContain("updateState.nativeUpdate.isUpdateRequired &&");
      expect(settingsScreenSource).toContain("Over-The-Air updates are no longer supported on this build");
    });

    it("renders an 'Install Native Update' action button pointing to downloadUrl", () => {
      expect(settingsScreenSource).toContain("Install Native Update");
      expect(settingsScreenSource).toContain("updateState.nativeUpdate.downloadUrl");
    });

    it("displays (Outdated) and (OTA unsupported) diagnostics for obsolete native binaries", () => {
      expect(settingsScreenSource).toContain('(Outdated)');
      expect(settingsScreenSource).toContain('(OTA unsupported)');
    });
  });
});
