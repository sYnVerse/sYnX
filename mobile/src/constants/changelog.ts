import type { ReleaseNote } from "../shared/changelog";
import { MOBILE_VERSION } from "./version";

export { MOBILE_VERSION };

export const MOBILE_CHANGELOG: ReleaseNote[] = [
  {
    version: MOBILE_VERSION,
    date: "2026-10-29",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "If you sign in with Google, GitHub or a Microsoft work or school account, your profile photo now shows in Settings next to your email, with your initials if there's no photo."
      },
      {
        type: "NEW",
        text: "If you haven't set a display name, the app can offer the name from your Google, GitHub or Microsoft account, once after you sign in and in Settings. It's only used if you choose \"Use this name\", and \"No thanks\" stops the offer in the app and on the web."
      },
      {
        type: "NEW",
        text: "When you share a Private list as View-Only or Collaborative, sYnX reminds you that anyone with the link can see your display name."
      },
      {
        type: "NEW",
        text: "On Collaborative lists, only the owner can delete tasks or the list right away. Everyone else sends a delete request the owner approves or declines, and tasks waiting on approval are marked clearly."
      },
      {
        type: "NEW",
        text: "Shared lists keep an Activity log for you (the owner): who changed tasks, who requested deletes, and from which IP. Collaborators and guests can't see it."
      },
      {
        type: "IMPR",
        text: "If you own a list and someone asks to delete something, you get an in-app review panel (and a push notification when your phone is set up for reminders)."
      }
    ]
  },
  {
    version: "v3.3.3",
    date: "2026-10-28",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
        text: "Signing out, or being signed out because your session ended, now stops sYnX reminders on this phone right away, even when the session had already expired or you're offline. Signing out no longer waits on the network."
      },
      {
        type: "FIX",
        text: "An expired session can no longer make the app repeat the same request in the background over and over, which wasted battery and data."
      },
      {
        type: "FIX",
        text: "On Android, tapping a shared sYnX list link (synx.christran.io followed by the list's ID) now opens the list in the app instead of the browser. Other sYnX web pages, like sign-in, still open in the browser."
      }
    ]
  },
  {
    version: "v3.3.2",
    date: "2026-10-27",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "New \"When a task is done\" setting under Device Calendar Integration: Mark as done (the default) keeps the event with ✅ in the title and the completion date in the description, or Delete event removes it. Un-checking a task restores its event."
      },
      {
        type: "NEW",
        text: "New \"Pick date & time\" option next to the quick reminders when adding or editing a task: choose any day and time, like an exam two weeks out, without going through the Calendar tab. The chosen time shows on the pill, and a task's existing reminder appears there when you edit it. A short line under the reminders spells out when you'll be reminded, like \"Reminds you tomorrow at 9:00 AM\"."
      },
      {
        type: "NEW",
        text: "Home time zone: repeating tasks keep their local time in your home zone, shown under Settings → Account, where you can switch it to this phone's zone. When you travel to another time zone, sYnX asks whether to switch your repeating reminders to the local time or keep your home time, and remembers your answer for that zone. One-time reminders don't change."
      },
      {
        type: "IMPR",
        text: "Calendar events now show which list a task belongs to, like \"sYnX Task · Groceries\", in the event description."
      },
      {
        type: "IMPR",
        text: "Calendar event descriptions mark priority with a color: 🟢 Low, 🟡 Medium, and 🔴 High."
      },
      {
        type: "IMPR",
        text: "What's New now lists each version's new features first, then improvements, then fixes."
      },
      {
        type: "IMPR",
        text: "Adding a task from the Calendar tab now shows its 9:00 AM reminder for that day on the \"Pick date & time\" pill, and you can change the time or day there."
      },
      {
        type: "FIX",
        text: "The sYnX notification icon shows in the status bar again, instead of a plain white square."
      },
      {
        type: "FIX",
        text: "Tasks without a duration now sync to your calendar as an event at the reminder time with no length (9:00 to 9:00) instead of a made-up 15-minute block."
      },
      {
        type: "FIX",
        text: "Tasks checked off from the home screen widget, the web app, or another device now update your calendar event the next time sYnX syncs, instead of leaving it as if the task were still open."
      },
      {
        type: "FIX",
        text: "Changing the target calendar now moves your existing task events to the new calendar instead of leaving old copies behind."
      },
      {
        type: "FIX",
        text: "Quick reminders (+5m to +60m) on a new task now always count from now. From the Calendar tab they used to be added to 9:00 AM on the selected day. When editing a task, they still push its existing reminder back."
      },
      {
        type: "FIX",
        text: "Repeating tasks keep their time across daylight saving changes: a task that repeats every Monday at 9:00 AM stays at 9:00 AM after the clocks change instead of moving to 8:00 or 10:00. Monthly repeats on the 29th to 31st now land on the last day of shorter months instead of spilling into the next month."
      }
    ]
  },
  {
    version: "v3.3.1",
    date: "2026-10-26",
    title: "What's new?",
    changes: [
      {
        type: "IMPR",
        text: "Flexible device calendar selection: Choose which calendar to sync tasks to, with zero-friction Google Calendar sync, local account guidance, and a 1-tap shortcut to open the calendar app."
      },
      {
        type: "FIX",
        text: "Standardized changelog category badge widths (NEW, IMPR, FIX) so tags align uniformly across all items."
      },
      {
        type: "FIX",
        text: "Raised the floating action button (+) across Tasks, Calendar, and Lists to float comfortably above the navigation bar with safe-area insets."
      },
      {
        type: "FIX",
        text: "Checking off a task in the Pinned List or Active List widget now completes it in sYnX, even when the pinned list isn't the list you have open. Tapping the checkbox used to tick it on the widget without saving."
      },
      {
        type: "FIX",
        text: "Widget checkoffs made while you're offline stay saved until sYnX can sync them, instead of being lost if the first try fails."
      },
      {
        type: "FIX",
        text: "The Progress widget ring now matches the web app: it always shows its background track (even at 0%), fills clockwise from the top, and shows the percentage in the middle."
      }
    ]
  },
  {
    version: "v3.3.0",
    date: "2026-10-25",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Android home screen widgets: Active List (4x2 resizable) with task checkoff, subtask count, and quick deep-linking."
      },
      {
        type: "NEW",
        text: "Pinned List & Up Next widget (4x2 resizable): Pin any owned or shared list to your home screen or view upcoming reminders."
      },
      {
        type: "NEW",
        text: "List Progress & Quick Add widget (2x2 / 2x1 adaptive): Material You circular progress ring and 1-tap task creation."
      },
      {
        type: "NEW",
        text: "Pin to Widget action on Lists: Easily pin any list to your home screen widget from My lists or Shared with me."
      },
      {
        type: "IMPR",
        text: "Upgraded mobile runtime to Expo SDK 58, React 19.3, and React Native 0.88.0."
      },
      {
        type: "IMPR",
        text: "Offline widget completion queue: Check off tasks from your home screen offline; sYnX safely replays and syncs them when reconnected."
      },
      {
        type: "IMPR",
        text: "Background widget refresh: Periodic background sync keeps widget snapshots fresh across shared and collaborative lists."
      },
      {
        type: "FIX",
        text: "Device calendar sync asks for calendar permission again and works with the updated calendar module; if access is blocked, Settings offers a shortcut to turn it on."
      }
    ]
  },
  {
    version: "v3.2.1",
    date: "2026-10-24",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Lists screen splits into My lists and Shared with me — opening a shared link remembers it across devices."
      },
      {
        type: "NEW",
        text: "Shared lists show the owner's display name on Tasks (instead of a generic “Shared with you”)."
      },
      {
        type: "NEW",
        text: "Settings lets you set a display name shown on lists you share (your email stays private)."
      },
      {
        type: "IMPR",
        text: "Stay signed in for weeks or months — the app quietly renews your session in the background and only asks you to sign in again if renewal fails."
      },
      {
        type: "IMPR",
        text: "Recurring tasks still move to the next reminder when marked done; a \"Rescheduled for …\" toast makes that clear instead of looking like the check snapped back."
      },
      {
        type: "FIX",
        text: "Marking a task done sends the intended done/undone state (not a blind flip), so a double tap on Tasks, Calendar, or a subtask no longer cancels itself."
      },
      {
        type: "FIX",
        text: "The checkbox locks while saving, updates immediately, and rolls back with an error toast if the request fails."
      }
    ]
  },
  {
    version: "v3.2.0",
    date: "2026-10-23",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Tasks screen shows which list you're in (Yours vs Shared with you) with a Switch control to jump to My Lists."
      },
      {
        type: "NEW",
        text: "Friendly notification prompt after sign-in — enable reminders without digging into Settings; tokens refresh automatically when permission is already granted."
      },
      {
        type: "NEW",
        text: "Settings includes your sYnID account, a System theme option, autosaved reminder channels, and a simple Push notifications toggle."
      },
      {
        type: "IMPR",
        text: "Failed saves show a toast and keep the sheet open; task load errors offer Retry instead of looking empty; offline shows a cached-copy note."
      },
      {
        type: "IMPR",
        text: "Larger tap targets, clearer priority and reminder pills, friendlier calendar dates, and better contrast for muted text and version badges."
      },
      {
        type: "IMPR",
        text: "Subtask minutes and titles edit locally and save on blur; list create/edit/share use bottom sheets with keyboard avoidance."
      },
      {
        type: "IMPR",
        text: "Readable type scale and centered wide-screen layout for tablets."
      },
      {
        type: "FIX",
        text: "Android / EAS builds now use the same version as What's New (3.2.0) — fixed app config drift that left the store-visible version stuck on 3.0.2."
      }
    ]
  },
  {
    version: "v3.1.0",
    date: "2026-10-22",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Opened lists show a clear permission banner on Tasks and Calendar — Private, View-Only, or Collaborative — whether you own the list or opened a shared link."
      },
      {
        type: "NEW",
        text: "If a shared list is private, missing, or can't load, you'll see a friendly message with a Go to my lists button instead of a blank screen."
      },
      {
        type: "NEW",
        text: "Each list card on My Lists now shows its share mode (Private, View-Only, or Collaborative)."
      },
      {
        type: "IMPR",
        text: "View-Only lists hide add, edit, delete, and check-off controls on Tasks and Calendar so you can't start an edit that would fail."
      },
      {
        type: "FIX",
        text: "Opening a shared list link keeps that list open after you sign in, instead of jumping back to one of your own lists."
      }
    ]
  },
  {
    version: "v3.0.2",
    date: "2026-08-03",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
        text: "Fixed deep link URL parsing to support root UUID list links (https://synx.christran.io/:id)."
      },
      {
        type: "FIX",
        text: "Updated shared list link format to match live web application routes."
      },
      {
        type: "FIX",
        text: "Updated logout flow to invalidate central OpenAuth server session on sign-out."
      },
      {
        type: "FIX",
        text: "Fixed task search filtering so searching subtask text displays the parent task and its nested subtasks."
      },
      {
        type: "FIX",
        text: "Fixed subtask creation in task breakdown modal by subscribing directly to query cache."
      },
      {
        type: "FIX",
        text: "Fixed Quick Reminder payload validation when selecting 'None' for new task creation."
      },
      {
        type: "FIX",
        text: "Fixed Calendar Sync toggle to recognize pre-granted OS calendar permissions."
      }
    ]
  },
  {
    version: "v3.0.1",
    date: "2026-08-02",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Added pull-to-refresh on Lists screen and automatic data refresh on screen navigation."
      },
      {
        type: "NEW",
        text: "Added optimistic cache updates across list creations, edits, deletions, and categories."
      },
      {
        type: "IMPR",
        text: "Separated mobile changelog constants to dedicated mobile constants module."
      },
      {
        type: "IMPR",
        text: "Change default value for task duration from 15 minutes to null."
      },
      {
        type: "FIX",
        text: "Resolve Expo SDK 57 version mismatches and EAS monorepo module resolution."
      }
    ]
  },
  {
    version: "v3.0.0",
    date: "2026-08-01",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Added native device calendar sync integration (expo-calendar)."
      },
      {
        type: "NEW",
        text: "Added native What's New / Version Log popup and Settings menu launcher."
      },
      {
        type: "FIX",
        text: "Fixed task creation on selected calendar date in Calendar screen."
      }
    ]
  },
  {
    version: "v2.0.2",
    date: "2026-07-30",
    changes: [
      {
        type: "NEW",
        text: "Enabled list sharing via system UI."
      },
      {
        type: "NEW",
        text: "Enabled adding a reminder to date selected on Calendar."
      },
      {
        type: "IMPR",
        text: "Converted from queued database operations to real-time CRUD operations."
      },
      {
        type: "IMPR",
        text: "Improved dropdown styling, task duration inputs, list categories, and sub-task hierarchy."
      },
      {
        type: "FIX",
        text: "Grouped subtask items under parent tasks and filtered child items out of top-level views."
      }
    ]
  },
  {
    version: "v2.0.1",
    date: "2026-07-29",
    changes: [
      {
        type: "IMPR",
        text: "Use list title as push notification subject"
      }
    ]
  },
  {
    version: "v2.0.0",
    date: "2026-07-28",
    changes: [
      {
        type: "NEW",
        text: "Added mobile app dark/light pastel theming, tactile haptics, and task breakdown UI."
      },
      {
        type: "NEW",
        text: "Added category support and task duration estimation pickers."
      },
      {
        type: "IMPR",
        text: "Single-column active preview layout for mobile lists."
      },
      {
        type: "FIX",
        text: "Wrapped Mobile App with SafeAreaProvider for notch and status bar bounds."
      }
    ]
  },
  {
    version: "v1.1.0",
    date: "2026-07-27",
    changes: [
      {
        type: "NEW",
        text: "Added pull-to-refresh and manual refresh controls."
      },
      {
        type: "NEW",
        text: "Added unsaved settings confirmation prompt."
      },
      {
        type: "IMPR",
        text: "Upgraded mobile runtime to Expo SDK 57, React 19, and React Native 0.86.0."
      },
      {
        type: "FIX",
        text: "Fixed Android status bar styling and push token retrieval."
      }
    ]
  },
  {
    version: "v1.0.0",
    date: "2026-07-26",
    changes: [
      {
        type: "NEW",
        text: "Initial Android & iOS Mobile App deployment with Expo."
      },
      {
        type: "NEW",
        text: "Installed react-native-svg peer dependency and excluded typescript from validation."
      }
    ]
  }
];
