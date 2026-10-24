export interface ParsedDeepLink {
  listId: string | null;
  action: "newTask" | null;
}

const RESERVED_PATHS = new Set(["login", "logout", "mobile", "callback", "api"]);

/**
 * Parses deep links from custom scheme (`synx://...`) and web URLs (`https://synx.christran.io/...`).
 * Supports:
 * - `synx://list/<listId>`
 * - `synx://list/<listId>?action=newTask`
 * - `synx://quick-add?listId=<listId>`
 * - `synx://quick-add`
 * - `synx://<uuid>`
 * - `https://synx.christran.io/<listId>?action=newTask`
 * - `https://synx.christran.io/list/<listId>`
 */
export function parseDeepLinkUrl(rawUrl: string | null | undefined): ParsedDeepLink {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { listId: null, action: null };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.includes("/mobile/callback") || trimmed.includes("/callback")) {
    return { listId: null, action: null };
  }

  let listId: string | null = null;
  let action: "newTask" | null = null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
    const segments = pathname ? pathname.split("/").filter(Boolean) : [];

    const actionParam = parsed.searchParams.get("action");
    if (actionParam === "newTask" || host === "quick-add") {
      action = "newTask";
    }

    const idParam = parsed.searchParams.get("id") || parsed.searchParams.get("listId");
    if (idParam) {
      listId = idParam;
    } else if (host === "list" && segments.length > 0) {
      listId = segments[0];
    } else if (host === "quick-add") {
      listId = segments.length > 0 ? segments[0] : null;
    } else if (!RESERVED_PATHS.has(host) && host !== "localhost" && !host.includes(".")) {
      // e.g. synx://<uuid> or synx://<slug>
      listId = parsed.host;
    } else if (segments.length > 0) {
      if (segments[0] === "list" && segments[1]) {
        listId = segments[1];
      } else if (!RESERVED_PATHS.has(segments[0])) {
        listId = segments[0];
      }
    }
  } catch {
    // Fallback regex matching
    const uuidMatch = trimmed.match(
      /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/
    );
    if (uuidMatch?.[1]) {
      listId = uuidMatch[1];
    } else {
      const matchPath = trimmed.match(/\/list\/([a-zA-Z0-9_-]+)/);
      if (matchPath?.[1]) {
        listId = matchPath[1];
      }
    }
    if (trimmed.includes("action=newTask") || trimmed.includes("quick-add")) {
      action = "newTask";
    }
  }

  return { listId, action };
}
