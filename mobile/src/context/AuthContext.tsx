import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useAuthRequest } from "expo-auth-session";
import { apiClient, TOKEN_KEY, DEVICE_PUSH_TOKEN_KEY } from "../api/client";

WebBrowser.maybeCompleteAuthSession();

const OPENAUTH_ISSUER = "https://auth.christran.io";
const CLIENT_ID = "synx";
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const discovery = {
    authorizationEndpoint: `${OPENAUTH_ISSUER}/authorize`,
    tokenEndpoint: `${OPENAUTH_ISSUER}/token`,
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

  useEffect(() => {
    async function loadToken() {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (storedToken) {
          setToken(storedToken);
          const decoded = tryDecodeJwtUser(storedToken);
          if (decoded) setUser(decoded);
        }
      } catch (e) {
        console.error("Failed to load token from SecureStore", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, []);

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

  useEffect(() => {
    const interceptor = apiClient.interceptors.response.use(
      (res) => res,
      async (error) => {
        if (error.response?.status === 401) {
          await logout();
        }
        return Promise.reject(error);
      }
    );
    return () => {
      apiClient.interceptors.response.eject(interceptor);
    };
  }, []);

  async function exchangeCodeForToken(code: string, codeVerifier: string) {
    try {
      setIsLoading(true);
      const res = await fetch(`${OPENAUTH_ISSUER}/token`, {
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
        await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
        setToken(data.access_token);
        const decoded = tryDecodeJwtUser(data.access_token);
        if (decoded) setUser(decoded);
      }
    } catch (e) {
      console.error("Code exchange failed", e);
    } finally {
      setIsLoading(false);
    }
  }

  const login = async () => {
    await promptAsync({ preferEphemeralSession: true });
  };

  const logout = async () => {
    try {
      const devicePushToken = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
      if (devicePushToken) {
        try {
          await apiClient.delete("/api/v1/devices", { data: { token: devicePushToken } });
        } catch (e) {
          // ignore network error on logout
        }
        await SecureStore.deleteItemAsync(DEVICE_PUSH_TOKEN_KEY);
      }
      await SecureStore.deleteItemAsync(TOKEN_KEY);

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
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
