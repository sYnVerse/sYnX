import { createContext } from "react";

/** Shown where a guest on someone else's shared list would set a reminder. */
export const GUEST_REMINDER_HINT = "Sign in to set reminders";

export interface GuestActionPayload {
  id?: string;
  listId?: string;
  name?: string;
  newName?: string;
  category?: string;
  text?: string;
  priority?: "low" | "medium" | "high" | "none";
  reminderAt?: number;
  parentId?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  durationMinutes?: number | null;
  completed?: boolean;
}

/**
 * Lets task components route a guest's changes to localStorage (their own
 * lists) instead of the server, and know when reminders are off limits.
 */
export const GuestContext = createContext<{
  isLoggedIn: boolean;
  /** False for a guest on someone else's shared list: reminders need an account there. */
  canSetReminders: boolean;
  currentUserId?: string;
  listOwnerId?: string;
  onGuestAction: (intent: string, payload?: GuestActionPayload) => void;
}>({
  isLoggedIn: false,
  canSetReminders: true,
  onGuestAction: () => {},
});
