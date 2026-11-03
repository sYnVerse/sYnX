import { useEffect } from "react";
import type { Todo } from "~/to-do-manager";
import type { GuestList } from "../guest-lists";

interface UseBrowserRemindersOptions {
  lists: GuestList[];
  userId: string;
}

export function useBrowserReminders({ lists, userId }: UseBrowserRemindersOptions) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const checkReminders = () => {
      const now = Date.now();

      const notifiedStr = sessionStorage.getItem("synx_notified_ids") || "[]";
      const notifiedSet = new Set<string>(JSON.parse(notifiedStr));

      lists.forEach((list) => {
        const listTitle = (list.name && String(list.name).trim()) || "Reminder";
        ((list.todos || []) as Todo[]).forEach((todo) => {
          if (
            !todo.completed &&
            todo.reminderAt &&
            !todo.reminderSent &&
            todo.reminderAt <= now &&
            (!todo.reminderUserId || todo.reminderUserId === userId) &&
            !notifiedSet.has(todo.id)
          ) {
            notifiedSet.add(todo.id);
            sessionStorage.setItem("synx_notified_ids", JSON.stringify(Array.from(notifiedSet)));

            if (Notification.permission === "granted") {
              try {
                const notification = new Notification(listTitle, {
                  body: todo.text,
                  icon: "/favicon.ico",
                  tag: todo.id,
                });
                notification.onclick = () => {
                  window.focus();
                };
              } catch (err) {
                console.error("Failed to trigger Notification API:", err);
              }
            }
          }
        });
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [lists, userId]);
}
