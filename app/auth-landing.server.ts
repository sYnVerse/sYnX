import { escapeHtml } from "./html-escape.server";

export function renderLandingHtml(destination: string): string {
  const safeDestination = destination || "/";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(safeDestination)}">
  <title>sYnX</title>
  <style>
    body {
      margin: 0;
      background-color: #020617;
      color: #e2e8f0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .spinner {
      width: 2.25rem;
      height: 2.25rem;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      border-top-color: #6366f1;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    p { margin: 0; font-size: 0.875rem; color: #94a3b8; }
    a { color: #818cf8; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Finalizing sign-in...</p>
  <noscript>
    <p style="margin-top: 1rem;">Click <a href="${escapeHtml(safeDestination)}">here</a> to continue.</p>
  </noscript>
  <script>
    window.location.replace(${JSON.stringify(safeDestination)});
  </script>
</body>
</html>`;
}

export function renderLandingResponse(
  destination: string,
  headers: Headers = new Headers(),
): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(renderLandingHtml(destination), {
    status: 200,
    headers,
  });
}
