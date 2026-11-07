import type { Route } from "./+types/_index";
import { redirect } from "react-router";
import { getOptionalUser } from "~/auth.server";
import { getCloudflareContext } from "~/context.server";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const { env } = getCloudflareContext(context);
  const { userId, isLoggedIn, guestId, isNewGuest } = await getOptionalUser(request, env);
  const db = env.DB;

  const headers = new Headers();
  if (isNewGuest && guestId) {
    headers.append("Set-Cookie", `guest_session=${guestId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }

  if (isLoggedIn) {
    const firstList = await db.prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1").bind(userId).first<{ id: string }>();
    if (firstList) {
      return redirect(`/${firstList.id}`, { headers });
    }
  }

  return redirect(`/${userId}`, { headers });
};

export default function Index() {
  return null;
}
