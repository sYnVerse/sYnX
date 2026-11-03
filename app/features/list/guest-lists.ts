import type { Todo } from "~/to-do-manager";

export const GUEST_STORAGE_KEY = "synx_guest_lists";

export interface GuestList {
  id: string;
  name: string;
  owner_id: string;
  created_at: number;
  expiration_ttl?: number | null;
  share_mode?: string | null;
  category?: string | null;
  owner_display_name?: string;
  todos: Todo[];
}

/**
 * Parses the stored guest lists. Falls back to a single empty "My Tasks"
 * list when nothing usable is stored. Pure: the fallback's created_at is 0
 * and gets stamped when the guest first changes something.
 */
export function parseGuestLists(raw: string | null, guestId: string): GuestList[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error("Failed to load guest lists from localStorage:", e);
    }
  }
  return [
    {
      id: guestId || "guest_default",
      name: "My Tasks",
      owner_id: guestId || "guest",
      created_at: 0,
      share_mode: "private",
      todos: [],
    },
  ];
}
