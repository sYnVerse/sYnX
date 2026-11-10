# Authentication Redirect & Deep-Link Behavior

## Overview
This document specifies the authentication return, deep linking, and redirect behavior across sYnX web and mobile entry points, detailing how web browser sign-ins are isolated from mobile app handoffs (resolving Issue #172).

---

## Architecture & Entry Points

sYnX supports two distinct authentication entry points, each with independent session lifecycles:

| Entry Point | Client Type | OAuth Return URL | Token Storage | Session Scope |
|---|---|---|---|---|
| **Web Browser** | React Router BFF | `https://synx.christran.io/callback` | HttpOnly cookies (`synx_auth_session`, `synx_refresh_session`) on `.christran.io` | Web browser session |
| **Mobile App (Android/iOS)** | Expo / React Native | `https://synx.christran.io/mobile/callback` | Encrypted `expo-secure-store` | Native mobile app |

---

## Root Cause of Issue #172

1. **Android App Links Pattern:**
   In `mobile/app.json`, Android App Links is configured with `autoVerify: true` and includes:
   - `pathPrefix: "/mobile/callback"`
   - `pathPrefix: "/list"`
   - `pathPattern: "/........-....-....-....-............"` (matches any 36-character UUID)

2. **Cross-Origin Redirect Interception in Chrome:**
   - When a user initiated sign-in on sYnX web in mobile Chrome, the browser was redirected to sYnID (`auth.christran.io`).
   - After authentication, sYnID redirected back to `https://synx.christran.io/callback`.
   - The `/callback` route previously returned an HTTP 302 redirect to `"/"`, which then returned an HTTP 302 redirect to `https://synx.christran.io/<listId>`.
   - Because this multi-hop redirect chain was initiated by an external cross-origin OAuth navigation, Chrome treated the HTTP 302 redirect to `/<uuid>` as an external navigation matching the registered Android App Link.
   - Android intercepted the HTTP 302 redirect and launched the sYnX mobile app instead of remaining in the browser tab.
   - In the mobile app, the user was unauthenticated because the session cookies were set in Chrome, not inside the mobile app's `SecureStore`.

3. **Platform Differences:**
   - **Android:** Android App Links intercepted HTTP 302 redirects targeting URLs matching `pathPattern`.
   - **iOS:** In `apple-app-site-association`, paths are strictly limited to `/list/*` and `/mobile/callback`. iOS Universal Links does not match root UUIDs and does not intercept same-domain redirects in Safari.

---

## Design & Implementation

### 1. Browser-Bound Web Sign-In
- A sign-in initiated from sYnX web in any browser (desktop or mobile) must **always** finish in the same browser tab.
- When `GET /callback` receives a browser navigation request (`Accept: text/html`):
  - The route is implemented as a **Resource Route** (no default React component export), which in React Router v7 instructs the runtime to deliver the loader's `Response` directly to the client HTTP stream without wrapping it in an SSR React component shell.
  - Server completes the token exchange and attaches `synx_auth_session` and `synx_refresh_session` cookies.
  - Clears the short-lived PKCE cookie.
  - Directly resolves the user's primary list (or creates an initial list if new), avoiding redirect loops.
  - Returns an **HTTP 200 OK HTML landing response** rather than an HTTP 302 redirect.
  - The HTML document commits the session in Chrome and runs an immediate client-side `window.location.replace(destination)`.
  - Same-origin JavaScript navigation within Chrome does **not** trigger Android App Links, ensuring the user stays in their active web session.
  - If JavaScript is delayed or disabled, a fallback link and `<noscript><meta http-equiv="refresh" ...></noscript>` ensure users are never stranded.

### 2. Destination Preservation (`redirectTo`)
- When starting sign-in from `/login`:
  - `login.tsx` checks `?redirectTo=...` or derives the current page path from the same-origin `Referer` header.
  - The path is validated via `parseSafeRedirectTo` (must be relative `/...`, no protocol-relative `//`, no backslashes `\`, no auth loop paths).
  - The validated `redirectTo` is stored inside the PKCE challenge cookie (`OAuthPkceChallenge`).
  - Upon return at `/callback`, the destination is retrieved from the verified PKCE cookie and used as the landing target.
  - Temporary guest paths (`/guest_...`) are excluded from `redirectTo` since guest lists migrate into real user lists upon signing in.

### 3. Shared List Links & External App Handoffs
- External links to shared lists (`https://synx.christran.io/<listId>` or `https://synx.christran.io/list/<listId>`) tapped in external apps (Slack, Gmail, SMS):
  - Open in the installed sYnX mobile app on Android/iOS via verified App Links / Universal Links.
- If the mobile app is not installed, the link opens in the web browser normally.

### 4. Non-Browser / API Callers
- If `/callback` receives a non-HTML request (e.g. automated test, API caller, `Accept: */*` or `application/json`):
  - The server continues to return an HTTP 302 redirect (`redirect(destination, { headers })`) for backward compatibility with programmatic clients.
