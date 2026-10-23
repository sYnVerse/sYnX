import type { ReleaseNote } from "../shared/changelog";

export const MOBILE_VERSION = "v3.1.0";

export const MOBILE_CHANGELOG: ReleaseNote[] = [
  {
    version: "v3.1.0",
    date: "2026-10-23",
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
