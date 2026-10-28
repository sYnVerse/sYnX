import { createContext } from "react";

/** Shown where a guest on someone else's shared list would set a reminder. */
export const GUEST_REMINDER_HINT = "Sign in to set reminders";

/**
 * Lets task components route a guest's changes to localStorage (their own
 * lists) instead of the server, and know when reminders are off limits.
 */
export const GuestContext = createContext<{
  isLoggedIn: boolean;
  /** False for a guest on someone else's shared list: reminders need an account there. */
  canSetReminders: boolean;
  onGuestAction: (intent: string, payload: any) => void;
}>({
  isLoggedIn: false,
  canSetReminders: true,
  onGuestAction: () => {},
});
