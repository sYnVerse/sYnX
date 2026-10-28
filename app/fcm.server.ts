export interface FCMMessagePayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends FCM push notification to a target device token using Firebase HTTP v1 API.
 * If FIREBASE_SERVICE_ACCOUNT_JSON is provided, signs RS256 JWT to acquire OAuth2 access token.
 */
export async function sendFCMPushNotification(
  token: string,
  payload: FCMMessagePayload,
  env: any
): Promise<boolean> {
  const serviceAccountRaw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountRaw) {
    console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is not configured in Worker environment. Skipping push.");
    return false;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountRaw);
    const projectId = serviceAccount.project_id;
    const clientEmail = serviceAccount.client_email;
    const privateKeyPem = serviceAccount.private_key;

    if (!projectId || !clientEmail || !privateKeyPem) {
      console.error("[FCM] Invalid service account JSON structure.");
      return false;
    }

    const accessToken = await getGoogleOAuthToken(clientEmail, privateKeyPem);
    if (!accessToken) {
      console.error("[FCM] Failed to acquire Google OAuth2 token for FCM.");
      return false;
    }

    const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    const response = await fetch(fcmEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data || {},
          android: {
            priority: "high",
            notification: {
              sound: "default",
              channel_id: "task_reminders",
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[FCM] Push failed with status ${response.status}: ${errText}`);
      if (isInvalidTokenResponse(errText) && env.DB) {
        await removeDeviceToken(env.DB as D1Database, token);
      }
      return false;
    }

    console.log(`[FCM] Successfully dispatched push notification to token: ${token.substring(0, 10)}...`);
    return true;
  } catch (error) {
    console.error("[FCM] Error in sendFCMPushNotification:", error);
    return false;
  }
}

/**
 * True when FCM says the token itself is dead or malformed, so it can never
 * receive a push again: 404 with UNREGISTERED (app uninstalled or token rotated),
 * or INVALID_ARGUMENT that points at the token. Other INVALID_ARGUMENT errors
 * (a bad payload) are not the token's fault and keep it.
 */
export function isInvalidTokenResponse(body: string): boolean {
  type FcmErrorDetail = { errorCode?: string; fieldViolations?: { field?: string }[] };
  type FcmError = { status?: string; message?: string; details?: FcmErrorDetail[] };
  let error: FcmError | null = null;
  try {
    error = (JSON.parse(body) as { error?: FcmError })?.error ?? null;
  } catch {
    // Non-JSON error body
  }
  const details = Array.isArray(error?.details) ? error.details : [];
  const errorCodes = details.map((d) => d?.errorCode);

  // Require FCM's UNREGISTERED code: a bare 404 can also mean a wrong project
  // ID, and that must not wipe every token.
  if (errorCodes.includes("UNREGISTERED")) return true;
  if (error?.status === "INVALID_ARGUMENT" || errorCodes.includes("INVALID_ARGUMENT")) {
    const pointsAtToken = details.some((d) =>
      (d?.fieldViolations ?? []).some((f) => f?.field === "message.token")
    );
    return pointsAtToken || /registration token/i.test(String(error?.message ?? ""));
  }
  return false;
}

/** Drops a device token FCM has rejected for good, so the cron stops sending to it. */
export async function removeDeviceToken(db: D1Database, token: string): Promise<void> {
  try {
    const result = await db.prepare("DELETE FROM device_tokens WHERE token = ?").bind(token).run();
    console.warn(
      `[FCM] Removed invalid device token ${token.substring(0, 10)}... (${result.meta?.changes ?? 0} row(s))`
    );
  } catch (e) {
    console.error("[FCM] Failed to remove invalid device token:", e);
  }
}

/**
 * Creates RS256 signed JWT assertion to request Google OAuth2 access token
 */
async function getGoogleOAuthToken(clientEmail: string, privateKeyPem: string): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const base64UrlHeader = base64UrlEncode(JSON.stringify(header));
    const base64UrlClaimSet = base64UrlEncode(JSON.stringify(claimSet));
    const unsignedToken = `${base64UrlHeader}.${base64UrlClaimSet}`;

    const signature = await signRS256(unsignedToken, privateKeyPem);
    if (!signature) return null;

    const jwt = `${unsignedToken}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error("[FCM] Google OAuth2 token request failed:", await tokenRes.text());
      return null;
    }

    const tokenData: any = await tokenRes.json();
    return tokenData.access_token || null;
  } catch (e) {
    console.error("[FCM] getGoogleOAuthToken error:", e);
    return null;
  }
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function signRS256(data: string, pemKey: string): Promise<string | null> {
  try {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = pemKey
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\s+/g, "");

    const binaryDer = atob(pemContents);
    const binaryDerBytes = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      binaryDerBytes[i] = binaryDer.charCodeAt(i);
    }

    const importedKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDerBytes.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const encoder = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      importedKey,
      encoder.encode(data)
    );

    const signatureBytes = new Uint8Array(signatureBuffer);
    let binarySig = "";
    for (let i = 0; i < signatureBytes.byteLength; i++) {
      binarySig += String.fromCharCode(signatureBytes[i]);
    }
    return btoa(binarySig)
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  } catch (e) {
    console.error("[FCM] signRS256 WebCrypto error:", e);
    return null;
  }
}
