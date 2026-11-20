import type { Route } from "./+types/_index";
import { useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { parseSafeRedirectTo } from "~/auth.server";
import { getRequestWebAuth } from "~/auth-context.server";
import { getCloudflareContext } from "~/context.server";
import { loader as listLoader } from "~/features/list/loader.server";
import { action as listAction } from "~/features/list/action.server";
import { canAccessList, getActiveListAccess } from "~/features/list/actions/access.server";
import TodoPage from "~/features/list/TodoPage";
import { RouteErrorBoundary } from "~/components/RouteErrorBoundary";

function extractListIdFromRedirectTo(redirectTo: string | undefined): string | undefined {
  if (!redirectTo) return undefined;
  if (redirectTo.startsWith("/list/")) {
    const candidate = redirectTo.slice("/list/".length).split(/[?#]/)[0];
    return candidate || undefined;
  }
  if (redirectTo.startsWith("/")) {
    const candidate = redirectTo.slice(1).split(/[?#]/)[0];
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function extractListIdFromLocation(location: string | null | undefined): string | undefined {
  if (!location) return undefined;
  let path = location;
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname;
    }
  } catch {
    // Ignore invalid location URLs
  }
  if (path.startsWith("/list/")) {
    return path.slice("/list/".length).split(/[?#]/)[0] || undefined;
  }
  if (path.startsWith("/")) {
    const candidate = path.slice(1).split(/[?#]/)[0];
    return candidate || undefined;
  }
  return undefined;
}

async function findPrimaryListId(db: D1Database | undefined, userId: string): Promise<string | undefined> {
  if (!db) return undefined;
  try {
    const firstList = await db
      .prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
      .bind(userId)
      .first<{ id: string }>();
    return firstList?.id;
  } catch (e) {
    console.error("Failed to resolve primary list in _index:", e);
    return undefined;
  }
}

async function getPrimaryListId(db: D1Database | undefined, userId: string): Promise<string | undefined> {
  const existing = await findPrimaryListId(db, userId);
  if (existing) return existing;
  if (!db) return undefined;
  try {
    const defaultListId = crypto.randomUUID();
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)")
      .bind(defaultListId, "My Tasks", userId, Date.now(), null)
      .run();
    return defaultListId;
  } catch (e) {
    console.error("Failed to resolve primary list in _index:", e);
    return undefined;
  }
}

async function resolveActiveListIdForIndex(request: Request, context: unknown): Promise<string> {
  const { env } = getCloudflareContext(context);
  const { userId, isLoggedIn } = await getRequestWebAuth(request, context);

  // 1. Check redirectTo query param, honoring it only if the user can access it
  const url = new URL(request.url);
  const safeRedirectTo = parseSafeRedirectTo(url.searchParams.get("redirectTo"));
  const requestedListId = extractListIdFromRedirectTo(safeRedirectTo);
  if (requestedListId && env.DB) {
    const access = await getActiveListAccess(env.DB, requestedListId, userId, isLoggedIn);
    if (canAccessList(access)) {
      return requestedListId;
    }
  }

  // 2. Check existing primary list in DB if logged in (never create default lists on POST)
  if (isLoggedIn && env.DB) {
    const primary = await findPrimaryListId(env.DB, userId);
    if (primary) return primary;
  }

  // 3. Fallback to userId
  return userId;
}

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
  const { userId, isLoggedIn } = await getRequestWebAuth(request, context);
  const db = env.DB;

  const url = new URL(request.url);
  const safeRedirectTo = parseSafeRedirectTo(url.searchParams.get("redirectTo"));
  const requestedListId = extractListIdFromRedirectTo(safeRedirectTo);

  let primaryListId: string | undefined;
  if (isLoggedIn && db) {
    primaryListId = await getPrimaryListId(db, userId);
  }

  let currentId = requestedListId || primaryListId || userId;
  let attempts = 0;
  let result: unknown;

  while (attempts < 3) {
    attempts++;
    result = await listLoader({ request, params: { id: currentId }, context });

    if (result instanceof Response && result.status >= 300 && result.status < 400) {
      const location = result.headers.get("Location");
      const nextId = extractListIdFromLocation(location);
      if (nextId && nextId !== currentId) {
        currentId = nextId;
        continue;
      }
      if (primaryListId && primaryListId !== currentId) {
        currentId = primaryListId;
        continue;
      }
      break;
    } else {
      return result;
    }
  }

  // Never return a 3xx from _index. If still redirecting, return safe 200 list data.
  if (result instanceof Response && result.status >= 300 && result.status < 400) {
    return {
      userId,
      email: null,
      isLoggedIn,
      settings: {
        emailEnabled: false,
        smsEnabled: false,
        phoneNumber: "",
        phoneCarrier: "",
        discordWebhookUrl: "",
        displayName: "You",
        displayNameSet: false,
        timeZone: null,
        avatarUrl: null,
        suggestedDisplayName: null,
      },
      lists: [],
      activeListId: currentId || userId,
      todos: [],
      pendingDeleteRequests: [],
      ownedPendingDeleteRequests: Promise.resolve([]),
      listActivity: Promise.resolve([]),
      providerProfile: Promise.resolve({ avatarUrl: null, suggestedDisplayName: null }),
      stats: { totalLists: 0, totalTasks: 0, completedTasks: 0 },
    };
  }

  return result;
};

export const action = async (args: Route.ActionArgs) => {
  const resolvedId = await resolveActiveListIdForIndex(args.request, args.context);
  return listAction({
    ...args,
    params: {
      ...args.params,
      id: resolvedId,
    },
  });
};

export default function Index() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<typeof listLoader>();
  const activeListId = loaderData?.activeListId;

  useEffect(() => {
    if (activeListId) {
      // Softly sync client-side route without triggering a document navigation
      navigate(`/${activeListId}`, { replace: true });
    }
  }, [navigate, activeListId]);

  return <TodoPage isIndexRedirecting={Boolean(activeListId)} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorBoundary error={error} routeId="_index" preset="index" />;
}
