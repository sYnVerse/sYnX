import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useAuthRequest } from "expo-auth-session";
import {
  apiClient,
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  DEVICE_PUSH_TOKEN_KEY,
  OPENAUTH_ISSUER,
  OPENAUTH_CLIENT_ID,
  OPENAUTH_TOKEN_ENDPOINT,
  sessionRefresh,
  secureSessionStore,
  setAuthFailureHandler,
} from "../api/client";
import { shouldSignOutAfterRefreshFailure } from "../shared/mobile-session";

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = OPENAUTH_CLIENT_ID;
const REDIRECT_URI = "https://synx.christran.io/mobile/callback";

export interface AuthUser {
  userId: string;
  email: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

/** Best-effort decode of JWT payload (OpenAuth access tokens are often JWTs). */
function tryDecodeJwtUser(token: string): AuthUser | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const b64 = padded + "=".repeat(padLen);
    if (typeof atob !== "function") return null;
    const json = atob(b64);
    const payload = JSON.parse(json) as Record<string, unknown>;
    const props = (payload.properties as Record<string, unknown>) || payload;
    const userId = String(props.id || props.sub || props.userId || "");
    const email = String(props.email || "");
    if (!userId && !email) return null;
    return { userId: userId || email, email: email || userId };
  } catch {
    return null;
  }
}

async function persistTokenPair(accessToken: string, refreshToken?: string | null) {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (typeof refreshToken === "string" && refreshToken.length > 0) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const silentRefreshInflight = useRef<Promise<void> | null>(null);

  const discovery = {
    authorizationEndpoint: `${OPENAUTH_ISSUER}/authorize`,
    tokenEndpoint: OPENAUTH_TOKEN_ENDPOINT,
  };

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: "code",
      usePKCE: true,
    },
    discovery
  );

  const applyAccessToken = useCallback((accessToken: string) => {
    setToken(accessToken);
    const decoded = tryDecodeJwtUser(accessToken);
    if (decoded) setUser(decoded);
  }, []);

  const clearLocalSessionState = useCallback(async () => {
    await secureSessionStore.clearSessionTokens();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/settings");
      const settings = res.data?.settings;
      if (settings?.userId || settings?.email) {
        setUser({
          userId: settings.userId || "",
          email: settings.email || "",
        });
        return;
      }
    } catch {
      // fall through to JWT decode
    }
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (stored) {
      const decoded = tryDecodeJwtUser(stored);
      if (decoded) setUser(decoded);
    }
  }, []);

  /**
   * Silent refresh via refresh_token grant. Shared single-flight with the Axios interceptor.
   * Returns whether an access token is available afterward.
   */
  const silentRefresh = useCallback(async (): Promise<boolean> => {
    if (silentRefreshInflight.current) {
      await silentRefreshInflight.current;
      const access = await SecureStore.getItemAsync(TOKEN_KEY);
      return !!access;
    }

    silentRefreshInflight.current = (async () => {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        return;
      }

      const result = await sessionRefresh.refresh();
      if (result.ok) {
        applyAccessToken(result.tokens.accessToken);
        return;
      }

      if (shouldSignOutAfterRefreshFailure(result.reason)) {
        await clearLocalSessionState();
      }
    })().finally(() => {
      silentRefreshInflight.current = null;
    });

    await silentRefreshInflight.current;
    const access = await SecureStore.getItemAsync(TOKEN_KEY);
    return !!access;
  }, [applyAccessToken, clearLocalSessionState]);

  useEffect(() => {
    async function loadSession() {
      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (refreshToken) {
          const ok = await silentRefresh();
          if (ok) return;
        }

        // Legacy installs: access token only — keep working until it expires.
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (storedToken) {
          applyAccessToken(storedToken);
        }
      } catch (e) {
        console.error("Failed to load session from SecureStore", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, [applyAccessToken, silentRefresh]);

  useEffect(() => {
    if (token) {
      refreshUser().catch(() => {});
    }
  }, [token, refreshUser]);

  useEffect(() => {
    if (response?.type === "success") {
      const { code } = response.params;
      if (code && request?.codeVerifier) {
        exchangeCodeForToken(code, request.codeVerifier);
      }
    }
  }, [response]);

  // Refresh when returning to the foreground (weeks/months of stay-signed-in).
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        silentRefresh().catch(() => {});
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [silentRefresh]);

  const logout = useCallback(async () => {
    try {
      const devicePushToken = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
      if (devicePushToken) {
        try {
          await apiClient.delete("/api/v1/devices", { data: { token: devicePushToken } });
        } catch {
          // ignore network error on logout
        }
        await SecureStore.deleteItemAsync(DEVICE_PUSH_TOKEN_KEY);
      }
      await secureSessionStore.clearSessionTokens();

      const logoutUrl = `${OPENAUTH_ISSUER}/logout?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
      try {
        await WebBrowser.openAuthSessionAsync(logoutUrl, REDIRECT_URI);
      } catch (browserErr) {
        console.warn("Central OpenAuth logout browser session warning:", browserErr);
      }

      setToken(null);
      setUser(null);
    } catch (e) {
      console.error("Logout error", e);
    }
  }, []);

  // Axios 401 → refresh failed permanently → clear local session (no extra browser).
  useEffect(() => {
    setAuthFailureHandler(async () => {
      await clearLocalSessionState();
    });
    return () => setAuthFailureHandler(null);
  }, [clearLocalSessionState]);

  async function exchangeCodeForToken(code: string, codeVerifier: string) {
    try {
      setIsLoading(true);
      const res = await fetch(OPENAUTH_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }).toString(),
      });

      const data = await res.json();
      if (data.access_token) {
        await persistTokenPair(data.access_token, data.refresh_token ?? null);
        applyAccessToken(data.access_token);
      }
    } catch (e) {
      console.error("Code exchange failed", e);
    } finally {
      setIsLoading(false);
    }
  }

  const login = async () => {
    // Persist the sYnID browser session so a rare full re-auth can be a quick sign-in.
    await promptAsync({ preferEphemeralSession: false });
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
