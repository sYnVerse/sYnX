import type { Route } from "./+types/_index";
import { useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { getOptionalUser, parseSafeRedirectTo } from "~/auth.server";
import { getCloudflareContext } from "~/context.server";
import { loader as listLoader } from "~/features/list/loader.server";
import { action as listAction } from "~/features/list/action.server";
import TodoPage from "~/features/list/TodoPage";

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

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
  const { userId, isLoggedIn } = await getOptionalUser(request, env);
  const db = env.DB;

  const url = new URL(request.url);
  const safeRedirectTo = parseSafeRedirectTo(url.searchParams.get("redirectTo"));
  const requestedListId = extractListIdFromRedirectTo(safeRedirectTo);

  let primaryListId: string | undefined;
  if (isLoggedIn && db) {
    try {
      const firstList = await db
        .prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
        .bind(userId)
        .first<{ id: string }>();
      if (firstList?.id) {
        primaryListId = firstList.id;
      } else {
        const defaultListId = crypto.randomUUID();
        await db
          .prepare("INSERT INTO lists (id, name, owner_id, created_at, expiration_ttl) VALUES (?, ?, ?, ?, ?)")
          .bind(defaultListId, "My Tasks", userId, Date.now(), null)
          .run();
        primaryListId = defaultListId;
      }
    } catch (e) {
      console.error("Failed to resolve primary list in _index loader:", e);
    }
  }

  const preferredId = requestedListId || primaryListId || userId;

  // Attempt to load the preferred list
  const result = await listLoader({ request, params: { id: preferredId }, context });

  // If loading the preferred list returned a redirect (e.g. invalid redirectTo list ID),
  // fallback to the user's primary list so _index ALWAYS returns 200 OK data and never
  // issues an HTTP 302 redirect to /<uuid> (which would trigger Android App Links).
  if (result instanceof Response && result.status >= 300 && result.status < 400) {
    const fallbackId = primaryListId || userId;
    if (fallbackId !== preferredId) {
      return listLoader({ request, params: { id: fallbackId }, context });
    }
  }

  return result;
};

export const action = async (args: Route.ActionArgs) => {
  return listAction(args);
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

  return <TodoPage />;
}
