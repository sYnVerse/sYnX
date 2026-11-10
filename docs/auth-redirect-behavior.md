# Authentication Redirect & Deep-Link Behavior

## Overview
This document specifies the authentication return, deep linking, and redirect behavior across sYnX web and mobile entry points, detailing how web browser sign-ins are isolated from mobile app handoffs (resolving Issues #172 and #196).

---

## Architecture & Entry Points

sYnX supports two distinct authentication entry points, each with independent session lifecycles:

| Entry Point | Client Type | OAuth Return URL | Token Storage | Session Scope |
|---|---|---|---|---|
| **Web Browser** | React Router BFF | `https://synx.christran.io/callback` | HttpOnly cookies (`synx_auth_session`, `synx_refresh_session`) on `.christran.io` | Web browser session |
| **Mobile App (Android/iOS)** | Expo / React Native | `https://synx.christran.io/mobile/callback` | Encrypted `expo-secure-store` | Native mobile app |

---

## Root Cause of Issues #172 & #196

1. **Android App Links Pattern:**
   In `mobile/app.json`, Android App Links was previously configured with `pathPattern: "/........-....-....-....-............"` (matching any 36-character root UUID).

2. **Cross-Origin Redirect Interception in Chrome:**
   - When a user initiated sign-in on sYnX web in mobile Chrome, the browser was redirected to sYnID (`auth.christran.io`).
   - After authentication, sYnID redirected back to `https://synx.christran.io/callback`.
   - In earlier versions, `/callback` or `_index` redirected directly to `https://synx.christran.io/<listId>`. Because this occurred after an external cross-origin OAuth navigation, Chrome treated any navigation ending on a matching root UUID as an external navigation matching the registered Android App Link, kicking the user into the mobile app without session cookies.
   - Attempts in PR #194 and #195 to use intermediate landing pages or client-side scripts still navigated to `/<uuid>`, which Chrome on mobile still treated as part of the OAuth navigation chain.

3. **Platform Differences:**
   - **Android:** Intent filters now align with iOS, scoping links strictly to `/list/*` and `/mobile/callback`.
   - **iOS:** In `apple-app-site-association`, paths have always been strictly limited to `/list/*` and `/mobile/callback`.

---

## Design & Implementation (#196)

### 1. Browser-Bound Web Sign-In
- A sign-in initiated from sYnX web in any browser (desktop or mobile) must **always** finish in the same browser tab.
- When `GET /callback` finishes the token exchange:
  - Clears the short-lived PKCE cookie.
  - Attaches `synx_auth_session` and `synx_refresh_session` cookies.
  - Returns a standard **HTTP 302 redirect to `/`** (or `/?redirectTo=...` if a specific list was requested).
  - Because `/` is not claimed by the mobile app, Chrome leaves the navigation in the browser tab.

### 2. Direct List Rendering on `/` (`_index.tsx`)
- The web root route ([`app/routes/_index.tsx`](../app/routes/_index.tsx)) resolves the user's primary list (or the list specified in `redirectTo`) and renders [`TodoPage`](../app/features/list/TodoPage.tsx) directly, without issuing an HTTP 302 redirect to `/<uuid>`.
- Client-side routing softly updates the URL using React Router's `navigate(`/${activeListId}`, { replace: true })` inside `useEffect`, keeping React Router's internal routing state in sync without triggering a document navigation.
- For signed-out guest users, `/` renders the guest list experience directly with guest session cookies, preserving full offline/local storage capabilities.

### 3. Destination Preservation & Security (`redirectTo`)
- When starting sign-in from `/login`:
  - `login.tsx` checks `?redirectTo=...` or derives the current page path from the same-origin `Referer` header.
  - The path is validated via `parseSafeRedirectTo` (must be relative `/...`, no protocol-relative `//`, no backslashes `\`, no auth loop paths).
  - The validated `redirectTo` is stored inside the PKCE challenge cookie (`OAuthPkceChallenge`).
  - Upon return at `/callback`, the destination is retrieved from the verified PKCE cookie and passed as `/?redirectTo=${encodeURIComponent(destination)}`.
  - On `/`, `_index.tsx` sanitizes `redirectTo` with `parseSafeRedirectTo` and renders that list directly.

### 4. Shared List Links & Multiplatform Parity
- Web route support added for `/list/:id` ([`app/routes/list.$id.tsx`](../app/routes/list.$id.tsx)).
- Shared links in both the web toolbar and mobile app format URLs as `https://synx.christran.io/list/<id>`.
- Legacy `/<id>` URLs continue to be supported on the web for backwards compatibility.
