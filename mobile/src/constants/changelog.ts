import type { ReleaseNote } from "../shared/changelog";
import { MOBILE_VERSION } from "./version";

export { MOBILE_VERSION };

export const MOBILE_CHANGELOG: ReleaseNote[] = [
  {
    version: MOBILE_VERSION,
    date: "2026-10-26",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
        text: "Standardized changelog category badge widths (NEW, IMPR, FIX) so tags align uniformly across all items."
      },
      {
        type: "IMPR",
        text: "Flexible device calendar selection: Choose which calendar to sync tasks to, with zero-friction Google Calendar sync, local account guidance, and a 1-tap shortcut to open the calendar app."
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
      },
      {
        type: "FIX",
        text: "The sYnX notification icon shows in the status bar again, instead of a plain white square."
      }
    ]
  },
  {
    version: "v3.3.0",
    date: "2026-10-25",
    title: "What's new?",
    changes: [
      {
        type: "IMPR",
        text: "Upgraded mobile runtime to Expo SDK 58, React 19.3, and React Native 0.88.0."
      },
      {
        type: "FIX",
        text: "Device calendar sync asks for calendar permission again and works with the updated calendar module; if access is blocked, Settings offers a shortcut to turn it on."
      },
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
        text: "Offline widget completion queue: Check off tasks from your home screen offline; sYnX safely replays and syncs them when reconnected."
      },
      {
        type: "IMPR",
        text: "Background widget refresh: Periodic background sync keeps widget snapshots fresh across shared and collaborative lists."
      }
    ]
  },
  {
    version: "v3.2.1",
    date: "2026-10-24",
    title: "What's new?",
    changes: [
      {
        type: "IMPR",
        text: "Stay signed in for weeks or months — the app quietly renews your session in the background and only asks you to sign in again if renewal fails."
      },
      {
        type: "FIX",
        text: "Marking a task done sends the intended done/undone state (not a blind flip), so a double tap on Tasks, Calendar, or a subtask no longer cancels itself."
      },
      {
        type: "FIX",
        text: "The checkbox locks while saving, updates immediately, and rolls back with an error toast if the request fails."
      },
      {
        type: "IMPR",
        text: "Recurring tasks still move to the next reminder when marked done; a \"Rescheduled for …\" toast makes that clear instead of looking like the check snapped back."
      },
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
      }
    ]
  },
  {
    version: "v3.2.0",
    date: "2026-10-23",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
        text: "Android / EAS builds now use the same version as What's New (3.2.0) — fixed app config drift that left the store-visible version stuck on 3.0.2."
      },
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
        type: "FIX",
        text: "Grouped subtask items under parent tasks and filtered child items out of top-level views."
      },
      {
        type: "IMPR",
        text: "Converted from queued database operations to real-time CRUD operations."
      },
      {
        type: "IMPR",
        text: "Improved dropdown styling, task duration inputs, list categories, and sub-task hierarchy."
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
        type: "FIX",
        text: "Wrapped Mobile App with SafeAreaProvider for notch and status bar bounds."
      },
      {
        type: "IMPR",
        text: "Single-column active preview layout for mobile lists."
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
        type: "FIX",
        text: "Fixed Android status bar styling and push token retrieval."
      },
      {
        type: "IMPR",
        text: "Upgraded mobile runtime to Expo SDK 57, React 19, and React Native 0.86.0."
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
