import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
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
    const token = await SecureStore.getItemAsync(MOBILE_ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetriableConfig | undefined;

    if (status !== 401 || !original || original._retry) {
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
