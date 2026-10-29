import { type LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/auth.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { userId, isLoggedIn, guestId, isNewGuest } = await getOptionalUser(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

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

  // Redirect to guestId/userId page
  return redirect(`/${userId}`, { headers });
};

export default function Index() {
  return null;
}
