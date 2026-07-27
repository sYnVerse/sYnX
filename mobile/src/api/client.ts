import axios from "axios";
import * as SecureStore from "expo-secure-store";

export const API_BASE_URL = "https://synx.christran.io";
export const TOKEN_KEY = "synx_access_token";
/** FCM/device push token — distinct from the OAuth access token */
export const DEVICE_PUSH_TOKEN_KEY = "synx_device_push_token";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);
