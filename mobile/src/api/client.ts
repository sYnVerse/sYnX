import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { MOBILE_APP_VERSION } from "../shared/mobile-version";
import {
  MOBILE_ACCESS_TOKEN_KEY,
  MOBILE_REFRESH_TOKEN_KEY,
  createSessionRefreshController,
  shouldSignOutAfterRefreshFailure,
  type SessionTokenStore,
} from "../shared/mobile-session";

export const API_BASE_URL = "https://synx.christran.io";
export const OPENAUTH_ISSUER = "https://auth.christran.io";
export const OPENAUTH_CLIENT_ID = "synx";
export const OPENAUTH_TOKEN_ENDPOINT = `${OPENAUTH_ISSUER}/token`;

/** @deprecated Prefer MOBILE_ACCESS_TOKEN_KEY — kept for existing imports */
export const TOKEN_KEY = MOBILE_ACCESS_TOKEN_KEY;
export const REFRESH_TOKEN_KEY = MOBILE_REFRESH_TOKEN_KEY;
/** FCM/device push token — distinct from the OAuth access token */
export const DEVICE_PUSH_TOKEN_KEY = "synx_device_push_token";

declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * Skip the 401 refresh / sign-out handling below. Used by requests that run
     * during sign-out (push token unregister), so a 401 can never start a
     * sign-out → request → 401 loop.
     */
    skipAuthRefresh?: boolean;
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const secureSessionStore: SessionTokenStore = {
  getAccessToken: () => SecureStore.getItemAsync(MOBILE_ACCESS_TOKEN_KEY),
  getRefreshToken: () => SecureStore.getItemAsync(MOBILE_REFRESH_TOKEN_KEY),
  setAccessToken: (token) => SecureStore.setItemAsync(MOBILE_ACCESS_TOKEN_KEY, token),
  setRefreshToken: (token) => SecureStore.setItemAsync(MOBILE_REFRESH_TOKEN_KEY, token),
  clearSessionTokens: async () => {
    await SecureStore.deleteItemAsync(MOBILE_ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(MOBILE_REFRESH_TOKEN_KEY);
  },
};

export const sessionRefresh = createSessionRefreshController({
  store: secureSessionStore,
  tokenEndpoint: OPENAUTH_TOKEN_ENDPOINT,
  clientId: OPENAUTH_CLIENT_ID,
});

/** Called when refresh cannot recover the session (invalid / missing refresh token). */
let authFailureHandler: (() => Promise<void>) | null = null;
let authFailureInflight: Promise<void> | null = null;

export function setAuthFailureHandler(handler: (() => Promise<void>) | null) {
  authFailureHandler = handler;
}

async function notifyAuthFailure() {
  if (!authFailureHandler) return;
  if (!authFailureInflight) {
    authFailureInflight = authFailureHandler().finally(() => {
      authFailureInflight = null;
    });
  }
  await authFailureInflight;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    config.headers["X-sYnX-Platform"] = Platform.OS;
    config.headers["X-sYnX-Client-Version"] = MOBILE_APP_VERSION;
    const binaryVersion =
      Application.nativeApplicationVersion ??
      (Constants as any)?.nativeAppVersion ??
      Constants.expoConfig?.version;
    const buildVersion =
      Application.nativeBuildVersion ??
      (Constants as any)?.nativeBuildVersion ??
      (Constants.expoConfig?.android?.versionCode
        ? String(Constants.expoConfig.android.versionCode)
        : null) ??
      (Constants.expoConfig?.ios?.buildNumber ?? null);
    if (binaryVersion) {
      config.headers["X-sYnX-Binary-Version"] = `${binaryVersion}${
        buildVersion ? ` (${buildVersion})` : ""
      }`;
    }
    if (buildVersion) {
      config.headers["X-sYnX-Build-Number"] = String(buildVersion);
    }
    if (Updates.runtimeVersion) {
      config.headers["X-sYnX-Runtime-Version"] = Updates.runtimeVersion;
    }
    config.headers["X-sYnX-Update-Id"] = Updates.updateId ?? "embedded";
    if (Updates.isEmergencyLaunch) {
      config.headers["X-sYnX-Emergency-Launch"] = "1";
    }

    const token = await SecureStore.getItemAsync(MOBILE_ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

type NativeUpdateHandler = (info: { downloadUrl?: string }) => void;
let nativeUpdateHandler: NativeUpdateHandler | null = null;

export function onNativeUpdateRequired(handler: NativeUpdateHandler | null) {
  nativeUpdateHandler = handler;
}

function checkNativeUpdateHeader(headers?: any) {
  if (!headers) return;
  const isRequired =
    headers["x-synx-native-update-required"] === "1" ||
    headers["X-sYnX-Native-Update-Required"] === "1";
  if (isRequired && nativeUpdateHandler) {
    const downloadUrl =
      headers["x-synx-native-update-url"] ||
      headers["X-sYnX-Native-Update-Url"] ||
      undefined;
    nativeUpdateHandler({
      downloadUrl: typeof downloadUrl === "string" ? downloadUrl : undefined,
    });
  }
}

apiClient.interceptors.response.use(
  (res) => {
    checkNativeUpdateHeader(res.headers);
    return res;
  },
  async (error: AxiosError) => {
    if (error.response?.headers) {
      checkNativeUpdateHeader(error.response.headers);
    }
    const status = error.response?.status;
    const original = error.config as RetriableConfig | undefined;

    if (status !== 401 || !original || original._retry || original.skipAuthRefresh) {
      return Promise.reject(error);
    }

    original._retry = true;

    const refreshed = await sessionRefresh.refresh();
    if (refreshed.ok) {
      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${refreshed.tokens.accessToken}`;
      return apiClient.request(original);
    }

    if (shouldSignOutAfterRefreshFailure(refreshed.reason)) {
      await notifyAuthFailure();
    }

    return Promise.reject(error);
  }
);
