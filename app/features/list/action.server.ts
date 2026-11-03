import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/auth.server";
import { TodoManager } from "~/to-do-manager";
import { logListActivity } from "~/list-activity.server";
import type { ListActionContext } from "./actions/context";
import { getActiveListAccess, checkListAccessGate } from "./actions/access.server";
import { ACCOUNT_INTENTS, LIST_INTENTS } from "./actions/index.server";

export async function action({ request, context, params }: ActionFunctionArgs) {
  const { userId, email, isLoggedIn } = await getOptionalUser(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const activeListId = params.id as string;
  const waitUntil = context.cloudflare.ctx?.waitUntil?.bind(context.cloudflare.ctx);

  const formData = await request.formData();
  const intent = formData.get("intent");
  if (typeof intent !== "string" || !intent) {
    return Response.json({ error: "Invalid intent" }, { status: 400 });
  }

  const scheduleActivityLog = (
    input: Parameters<typeof logListActivity>[1]
  ) => {
    const promise = logListActivity(db, { ...input, request });
    if (waitUntil) waitUntil(promise);
    else void promise;
  };

  const accountHandler = ACCOUNT_INTENTS[intent];
  if (accountHandler) {
    const ctx: ListActionContext = {
      request,
      db,
      env: context.cloudflare.env,
      userId,
      email,
      isLoggedIn,
      activeListId,
      formData,
      intent,
      hasOwnership: false,
      isCollaborative: false,
      activeShareMode: null,
      listOwnerId: null,
      todoManager: new TodoManager(db, activeListId),
      scheduleActivityLog,
      waitUntil,
    };
    return accountHandler(ctx);
  }

  const listHandler = LIST_INTENTS[intent];
  if (!listHandler) {
    return Response.json({ error: "Invalid intent" }, { status: 400 });
  }

  const access = await getActiveListAccess(db, activeListId, userId, isLoggedIn);
  const gateResponse = checkListAccessGate(intent, isLoggedIn, access);
  if (gateResponse) {
    return gateResponse;
  }

  const todoManager = new TodoManager(db, activeListId);
  const ctx: ListActionContext = {
    request,
    db,
    env: context.cloudflare.env,
    userId,
    email,
    isLoggedIn,
    activeListId,
    formData,
    intent,
    hasOwnership: access.hasOwnership,
    isCollaborative: access.isCollaborative,
    activeShareMode: access.activeShareMode,
    listOwnerId: access.listOwnerId,
    todoManager,
    scheduleActivityLog,
    waitUntil,
  };

  return listHandler(ctx);
}
