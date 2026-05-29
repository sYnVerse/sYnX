import { type LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/auth.server";
import { TodoManager } from "~/to-do-manager";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { userId, isLoggedIn, guestId, isNewGuest } = await getOptionalUser(request, context.cloudflare.env);
  const kv = context.cloudflare.env.TO_DO_LIST;

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
      const userLists = await kv.get(`user:${userId}:lists`, "json");
      const guestLists: any = await kv.get(`user:${existingGuestId}:lists`, "json");

      if (guestLists && guestLists.length > 0) {
        if (!userLists || (Array.isArray(userLists) && userLists.length === 0)) {
          // Perform migration
          await kv.put(`user:${userId}:lists`, JSON.stringify(guestLists));
          
          // Migrate each list's todos (remove expiration TTL)
          for (const list of guestLists) {
            const guestTodoManager = new TodoManager(kv, `list:${list.id}:todos`);
            const guestTodos = await guestTodoManager.list();
            
            // Save to new user todo key (indefinitely)
            await kv.put(`list:${list.id}:todos`, JSON.stringify(guestTodos));
            
            // Migrate metadata
            await kv.put(`list:${list.id}:meta`, JSON.stringify({
              id: list.id,
              name: list.name,
              ownerId: userId,
              createdAt: list.createdAt || Date.now()
            }));
          }
        }
        
        // Clean up guest metadata
        await kv.delete(`user:${existingGuestId}:lists`);

        // Redirect to the first migrated list, clearing the guest session cookie
        headers.append("Set-Cookie", "guest_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
        return redirect(`/${guestLists[0].id}`, { headers });
      }
    }

    // Direct redirect if logged in and lists exist
    const userLists = await kv.get(`user:${userId}:lists`, "json");
    if (Array.isArray(userLists) && userLists.length > 0) {
      return redirect(`/${userLists[0].id}`, { headers });
    }
  }

  // Redirect to guestId/userId page
  return redirect(`/${userId}`, { headers });
};

export default function Index() {
  return null;
}
