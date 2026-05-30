import { type LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/auth.server";
import { TodoManager } from "~/to-do-manager";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { userId, isLoggedIn, guestId, isNewGuest } = await getOptionalUser(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const headers = new Headers();
  if (isNewGuest && guestId) {
    headers.append("Set-Cookie", `guest_session=${guestId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }

  if (isLoggedIn) {
    // Check if there is guest data to migrate
    const cookieHeader = request.headers.get("Cookie") || "";
    const guestMatch = cookieHeader.match(/guest_session=([^;]+)/);
    const existingGuestId = guestMatch ? decodeURIComponent(guestMatch[1]) : null;

    if (existingGuestId) {
      // Migrate guest lists to logged in user if user has no lists
      const { results: userLists } = await db.prepare("SELECT id FROM lists WHERE owner_id = ?").bind(userId).all();
      
      if (!userLists || userLists.length === 0) {
        const { results: guestLists } = await db.prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC").bind(existingGuestId).all<any>();
        
        if (guestLists && guestLists.length > 0) {
          // Perform migration: Update owner_id and clear expiration_ttl for all guest lists
          await db.prepare("UPDATE lists SET owner_id = ?, expiration_ttl = NULL WHERE owner_id = ?").bind(userId, existingGuestId).run();

          // Redirect to the first migrated list, clearing the guest session cookie
          headers.append("Set-Cookie", "guest_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
          return redirect(`/${guestLists[0].id}`, { headers });
        }
      }
    }

    // Direct redirect if logged in and lists exist
    const firstList = await db.prepare("SELECT id FROM lists WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1").bind(userId).first<any>();
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
