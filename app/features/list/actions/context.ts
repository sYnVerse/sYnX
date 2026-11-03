import type { TodoManager } from "~/to-do-manager";
import type { logListActivity } from "~/list-activity.server";

export interface ListActionContext {
  request: Request;
  db: D1Database;
  env: Env;
  userId: string;
  email: string | null;
  isLoggedIn: boolean;
  activeListId: string;
  formData: FormData;
  intent: string;
  hasOwnership: boolean;
  isCollaborative: boolean;
  activeShareMode: string | null;
  listOwnerId: string | null;
  todoManager: TodoManager;
  scheduleActivityLog: (input: Parameters<typeof logListActivity>[1]) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export type ListActionHandler = (ctx: ListActionContext) => Promise<unknown> | unknown;

// Local redirect helper so action handlers and dispatch maps can be loaded and
// tested under Vitest/Miniflare without importing @remix-run/cloudflare runtime,
// which fails in the worker test environment on createCookieFactory.
export function redirect(url: string, init?: number | ResponseInit): Response {
  let responseInit = init;
  if (typeof responseInit === "number") {
    responseInit = { status: responseInit };
  } else if (typeof responseInit === "undefined") {
    responseInit = { status: 302 };
  }
  const headers = new Headers(responseInit.headers);
  headers.set("Location", url);
  return new Response(null, {
    ...responseInit,
    status: responseInit.status || 302,
    headers,
  });
}

