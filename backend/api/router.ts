import type { RouterContextProvider } from "react-router";
import { resolveApiAuthInContext } from "../services/auth-context.server";
import type { ApiRouteArgs } from "./types";

import * as completionsDuration from "./v1/completions.$id.duration";
import * as completionsExport from "./v1/completions.export";
import * as deleteRequests from "./v1/delete-requests";
import * as deleteRequestById from "./v1/delete-requests.$id";
import * as devTestLogin from "./v1/dev.test-login";
import * as devices from "./v1/devices";
import * as lists from "./v1/lists";
import * as listById from "./v1/lists.$id";
import * as listArchive from "./v1/lists.$id.archive";
import * as listActivity from "./v1/lists.$id.activity";
import * as listShareMode from "./v1/lists.$id.share-mode";
import * as listShared from "./v1/lists.$id.shared";
import * as mobileVersion from "./v1/mobile.version";
import * as settings from "./v1/settings";
import * as settingsDisplayNameSuggestion from "./v1/settings.display-name-suggestion";
import * as settingsTimeZone from "./v1/settings.time-zone";
import * as sessions from "./v1/sessions";
import * as sessionsRevoke from "./v1/sessions.revoke";
import * as todos from "./v1/todos";
import * as todosClearCompleted from "./v1/todos.clear-completed";
import * as todosReorder from "./v1/todos.reorder";
import * as todoById from "./v1/todos.$id";
import * as todoCompleted from "./v1/todos.$id.completed";
import * as todoCompletions from "./v1/todos.$id.completions";
import * as todoMarkReminderSent from "./v1/todos.$id.mark-reminder-sent";
import * as todoStart from "./v1/todos.$id.start";
import * as todoToggle from "./v1/todos.$id.toggle";
import * as todoUndoRepeat from "./v1/todos.$id.undo-repeat";

type StaticHandler = (args: ApiRouteArgs) => Promise<Response> | Response;
type IdHandler = (args: ApiRouteArgs<{ id: string }>) => Promise<Response> | Response;

interface StaticModule {
  loader?: StaticHandler;
  action?: StaticHandler;
}

interface IdModule {
  loader?: IdHandler;
  action?: IdHandler;
}

interface RegisteredApiRoute {
  pattern: string;
  segments: string[];
  invoke: (
    method: string,
    args: ApiRouteArgs<{ id: string }> | ApiRouteArgs
  ) => Promise<Response> | Response;
}

function dispatchMethod(
  method: string,
  loader: (() => Promise<Response> | Response) | undefined,
  action: (() => Promise<Response> | Response) | undefined
): Promise<Response> | Response {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD") {
    return loader
      ? loader()
      : Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE") {
    return action
      ? action()
      : Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

function staticRoute(pattern: string, mod: StaticModule): RegisteredApiRoute {
  const segments = pattern.slice(1).split("/");
  return {
    pattern,
    segments,
    invoke: (method, args) =>
      dispatchMethod(
        method,
        mod.loader ? () => mod.loader!(args) : undefined,
        mod.action ? () => mod.action!(args) : undefined
      ),
  };
}

function idRoute(pattern: string, mod: IdModule): RegisteredApiRoute {
  const segments = pattern.slice(1).split("/");
  return {
    pattern,
    segments,
    invoke: (method, args) => {
      const idArgs = args as ApiRouteArgs<{ id: string }>;
      return dispatchMethod(
        method,
        mod.loader ? () => mod.loader!(idArgs) : undefined,
        mod.action ? () => mod.action!(idArgs) : undefined
      );
    },
  };
}

// Static segments MUST appear before parameterized `:id` segments at each depth
// (e.g. `/api/v1/todos/clear-completed` before `/api/v1/todos/:id`,
// `/api/v1/completions/export` before `/api/v1/completions/:id/duration`).
const API_ROUTES: RegisteredApiRoute[] = [
  staticRoute("/api/v1/lists", lists),
  idRoute("/api/v1/lists/:id/activity", listActivity),
  idRoute("/api/v1/lists/:id/archive", listArchive),
  idRoute("/api/v1/lists/:id/share-mode", listShareMode),
  idRoute("/api/v1/lists/:id/shared", listShared),
  idRoute("/api/v1/lists/:id", listById),

  staticRoute("/api/v1/todos/clear-completed", todosClearCompleted),
  staticRoute("/api/v1/todos/reorder", todosReorder),
  staticRoute("/api/v1/todos", todos),
  idRoute("/api/v1/todos/:id/completed", todoCompleted),
  idRoute("/api/v1/todos/:id/completions", todoCompletions),
  idRoute("/api/v1/todos/:id/mark-reminder-sent", todoMarkReminderSent),
  idRoute("/api/v1/todos/:id/start", todoStart),
  idRoute("/api/v1/todos/:id/toggle", todoToggle),
  idRoute("/api/v1/todos/:id/undo-repeat", todoUndoRepeat),
  idRoute("/api/v1/todos/:id", todoById),

  staticRoute("/api/v1/completions/export", completionsExport),
  idRoute("/api/v1/completions/:id/duration", completionsDuration),

  staticRoute("/api/v1/delete-requests", deleteRequests),
  idRoute("/api/v1/delete-requests/:id", deleteRequestById),

  staticRoute("/api/v1/settings/display-name-suggestion", settingsDisplayNameSuggestion),
  staticRoute("/api/v1/settings/time-zone", settingsTimeZone),
  staticRoute("/api/v1/settings", settings),

  staticRoute("/api/v1/sessions/revoke", sessionsRevoke),
  staticRoute("/api/v1/sessions", sessions),

  staticRoute("/api/v1/devices", devices),
  staticRoute("/api/v1/mobile/version", mobileVersion),
  staticRoute("/api/v1/dev/test-login", devTestLogin),
];

function matchRouteSegments(
  patternSegments: string[],
  pathSegments: string[]
): { ok: true; params: Record<string, string> } | { ok: false; badEncoding?: boolean } {
  if (patternSegments.length !== pathSegments.length) {
    return { ok: false };
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const pat = patternSegments[i];
    const seg = pathSegments[i];
    if (pat.startsWith(":")) {
      if (!seg) return { ok: false };
      try {
        const decoded = decodeURIComponent(seg);
        if (!decoded) return { ok: false };
        params[pat.slice(1)] = decoded;
      } catch {
        return { ok: false, badEncoding: true };
      }
    } else if (pat !== seg) {
      return { ok: false };
    }
  }
  return { ok: true, params };
}

/**
 * Dispatches `/api/v1/*` requests directly inside the Worker before React Router
 * SSR handling. Returns `null` for non-API requests so React Router handles them.
 */
export async function handleApiRequest(
  request: Request,
  context: RouterContextProvider
): Promise<Response | null> {
  const url = new URL(request.url);
  let pathname = url.pathname;
  if (pathname !== "/api/v1" && !pathname.startsWith("/api/v1/")) {
    return null;
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const pathSegments = pathname.slice(1).split("/");

  for (const route of API_ROUTES) {
    const matched = matchRouteSegments(route.segments, pathSegments);
    if (!matched.ok) {
      if (matched.badEncoding) {
        return Response.json({ error: "Invalid parameter encoding" }, { status: 400 });
      }
      continue;
    }

    await resolveApiAuthInContext(request, context, pathname);
    return route.invoke(request.method, {
      request,
      params: matched.params,
      context,
      url,
      pattern: route.pattern,
    });
  }

  return new Response("Not Found", { status: 404 });
}
