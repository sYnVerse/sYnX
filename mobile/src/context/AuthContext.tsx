import React, { createContext, useContext, useState, useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useAuthRequest } from "expo-auth-session";
import { apiClient, TOKEN_KEY, DEVICE_PUSH_TOKEN_KEY } from "../api/client";

WebBrowser.maybeCompleteAuthSession();

const OPENAUTH_ISSUER = "https://auth.christran.io";
const CLIENT_ID = "synx";
const REDIRECT_URI = "https://synx.christran.io/mobile/callback";

interface AuthContextType {
  token: string | null;
  user: { userId: string; email: string } | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ userId: string; email: string } | null>(null);
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

  useEffect(() => {
    async function loadToken() {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (storedToken) {
          setToken(storedToken);
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
      }
    } catch (e) {
      console.error("Code exchange failed", e);
    } finally {
      setIsLoading(false);
    }
  }

  const login = async () => {
    await promptAsync();
  };

  const logout = async () => {
    try {
      // Unregister the FCM/device push token (not the OAuth access token)
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
      setToken(null);
      setUser(null);
    } catch (e) {
      console.error("Logout error", e);
    }
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
