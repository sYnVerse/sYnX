import type { ReleaseNote } from "../../shared/changelog";

export const WEB_VERSION = "v5.3.1";

export const WEB_CHANGELOG: ReleaseNote[] = [
  {
    version: "v5.3.1",
    date: "2026-10-28",
    title: "What's new?",
    changes: [
      {
        type: "IMPR",
        text: "Pages and the sYnX phone app load faster: the server no longer re-checks the database layout on every request, and the busiest lookups (your lists, their tasks and due reminders) now use indexes."
      },
      {
        type: "FIX",
        text: "Signing out of the sYnX phone app now always stops reminders on that phone, even if the session had already expired. Reminders also stop being sent to phones that no longer have the app."
      }
    ]
  },
  {
    version: "v5.3.0",
    date: "2026-10-27",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Home time zone setting in your profile: repeating tasks keep their local time in this zone. Search the list or use this browser's zone. It's filled in from your browser the first time and only changes when you change it."
      },
      {
        type: "FIX",
        text: "Repeating tasks keep their time across daylight saving changes: a task that repeats every Monday at 9:00 AM stays at 9:00 AM after the clocks change instead of moving to 8:00 or 10:00. Monthly repeats on the 29th to 31st now land on the last day of shorter months instead of spilling into the next month."
      }
    ]
  },
  {
    version: "v5.2.2",
    date: "2026-10-26",
    title: "What's new?",
    changes: [
      {
        type: "IMPR",
        text: "What's New now lists each version's new features first, then improvements, then fixes."
      }
    ]
  },
  {
    version: "v5.2.1",
    date: "2026-10-25",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
        text: "Standardized changelog category badge widths (NEW, IMPR, FIX) so tags align uniformly across all items."
      },
      {
        type: "FIX",
        text: "Security: sYnX now only accepts sign-ins issued to sYnX itself. A sign-in token from another app that uses the same sYnID account can no longer be used to open your lists."
      }
    ]
  },
  {
    version: "v5.2.0",
    date: "2026-10-24",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Set a display name in your profile — shared lists show your name instead of a generic label (your email is never shared)."
      },
      {
        type: "NEW",
        text: "Sidebar splits into My lists and Shared with me. Opening a shared link remembers it across devices; you can remove a list from Shared with me anytime."
      },
      {
        type: "IMPR",
        text: "Shared list views show the owner's display name in the header and view-only banner."
      },
      {
        type: "IMPR",
        text: "Seamless 14-day stay-signed-in with silent session renewal and 15-minute access token rotation."
      }
    ]
  },
  {
    version: "v5.1.4",
    date: "2026-10-23",
    title: "What's new?",
    changes: [
      {
        type: "IMPR",
        text: "Recurring tasks still reschedule when marked done; you now get a short check animation and a \"Rescheduled for …\" toast so it does not look like the check snapped back."
      },
      {
        type: "FIX",
        text: "Marking a task done now sends the intended done/undone state instead of blindly flipping, so a double tap no longer cancels itself."
      },
      {
        type: "FIX",
        text: "The checkbox stays locked while a mark-done request is in flight, with an optimistic update and an error toast if the save fails."
      }
    ]
  },
  {
    version: "v5.1.3",
    date: "2026-10-18",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
        text: "Web sign-in now uses PKCE S256 (required by sYnID) and validates OAuth state before exchanging the authorization code."
      },
      {
        type: "FIX",
        text: "Logout clears the sYnX session cookie when logout is confirmed via sYnID or /logout?local=true (not before the central logout redirect)."
      },
      {
        type: "FIX",
        text: "Reminder emails HTML-escape task text and list titles so collaborative list content cannot inject markup into notification emails."
      },
      {
        type: "FIX",
        text: "Fixed sYnID logout Cancel and return: sYnX no longer clears synx_auth_session before redirecting to central logout."
      }
    ]
  },
  {
    version: "v5.1.2",
    date: "2026-08-03",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Added 'Open in App' button to mobile header on list pages for seamless mobile app handoff."
      },
      {
        type: "FIX",
        text: "Fixed deep link routing for direct root list URLs."
      },
      {
        type: "FIX",
        text: "Fixed task search filtering so searching subtask text displays the parent task and its nested subtasks."
      }
    ]
  },
  {
    version: "v5.1.1",
    date: "2026-08-02",
    title: "What's new?",
    changes: [
      {
        type: "NEW",
        text: "Add DurationPicker to allow viewing/changing task duration of a task."
      },
      {
        type: "IMPR",
        text: "Change default value for task duration from 15 minutes to optional."
      },
      {
        type: "IMPR",
        text: "Removed 'N' avatar icon from desktop What's New modal header for a cleaner header design."
      },
      {
        type: "FIX",
        text: "Use theme tokens for task duration UI."
      },
      {
        type: "FIX",
        text: "Change z-indexes for DurationPicker, PriorityPicker, ReminderPicker, and RecurrencePicker components."
      }
    ]
  },
  {
    version: "v5.1.0",
    date: "2026-08-01",
    changes: [
      {
        type: "NEW",
        text: "Added native device calendar sync integration (expo-calendar)."
      },
      {
        type: "NEW",
        text: "Added cross-platform Version Log & What's New popup with date-aggregated SemVer tracking."
      }
    ]
  },
  {
    version: "v5.0.0",
    date: "2026-07-30",
    changes: [
      {
        type: "NEW",
        text: "Task duration: You can now specify an amount of time you estimate the task will take for you to complete."
      },
      {
        type: "NEW",
        text: "List category: You can now add a category to lists to better organize your day."
      },
      {
        type: "IMPR",
        text: "Added  unit tests to catch data integrity issues caused by the front-end."
      },
      {
        type: "IMPR",
        text: "Added unit tests for subtask cascade deletion and hierarchy tree builder."
      },
      {
        type: "FIX",
        text: "Shared Lists: Hide controls for editing while viewing a non-permissive list."
      },
      {
        type: "FIX",
        text: "Improved dropdown styling, task duration inputs, list categories, and sub-task hierarchy."
      },
      {
        type: "FIX",
        text: "Raised z-index of Share List modal to prevent list element overlapping."
      }
    ]
  },
  {
    version: "v4.1.0",
    date: "2026-07-29",
    changes: [
      {
        type: "IMPR",
        text: "Use active list title as notification subject line across email, SMS, and Discord channels."
      }
    ]
  },
  {
    version: "v4.0.0",
    date: "2026-07-28",
    changes: [
      {
        type: "NEW",
        text: "Added category support to task lists."
      },
      {
        type: "NEW",
        text: "Added custom themed scrollbar styles for dark themes."
      },
      {
        type: "NEW",
        text: "Added mobile app dark/light pastel theming, tactile haptics, and task breakdown UI."
      },
      {
        type: "NEW",
        text: "Added inline task duration picker and editing support."
      },
      {
        type: "FIX",
        text: "Fixed sidebar list scrolling and small-screen layout overflow."
      }
    ]
  },
  {
    version: "v3.2.0",
    date: "2026-07-27",
    changes: [
      {
        type: "NEW",
        text: "Added custom task duration estimation (minutes)."
      },
      {
        type: "NEW",
        text: "Added email carrier SMS gateways (T-Mobile, AT&T, Verizon) for instant SMS reminder alerts."
      },
      {
        type: "NEW",
        text: "Added Discord Webhook integration for instant task reminders directly in your Discord server."
      },
      {
        type: "NEW",
        text: "Added push notification delivery via Expo push service."
      }
    ]
  },
  {
    version: "v3.1.0",
    date: "2026-07-26",
    changes: [
      {
        type: "NEW",
        text: "Added recurrent task scheduling (Daily, Weekly, Monthly)."
      },
      {
        type: "NEW",
        text: "Added interactive calendar view for date-filtered task management."
      },
      {
        type: "NEW",
        text: "Added full task search bar with instant client-side filtering."
      }
    ]
  },
  {
    version: "v3.0.0",
    date: "2026-07-25",
    changes: [
      {
        type: "NEW",
        text: "Added subtask hierarchy support (nested task trees)."
      },
      {
        type: "NEW",
        text: "Added list sharing modes: Private, Public Read-only, and Public Editable."
      },
      {
        type: "NEW",
        text: "Added priority levels (High, Medium, Low) with visual indicator badges."
      }
    ]
  },
  {
    version: "v2.2.0",
    date: "2026-07-20",
    changes: [
      {
        type: "NEW",
        text: "Added dark mode & theme customizer (Indigo, Emerald, Violet, Rose themes)."
      },
      {
        type: "IMPR",
        text: "Redesigned task card layout with smooth animation transitions."
      }
    ]
  },
  {
    version: "v2.1.0",
    date: "2026-07-10",
    changes: [
      {
        type: "NEW",
        text: "Added scheduled reminder notifications via background worker cron jobs."
      },
      {
        type: "IMPR",
        text: "Optimized database queries with Cloudflare D1 index additions."
      }
    ]
  },
  {
    version: "v2.0.0",
    date: "2026-06-15",
    changes: [
      {
        type: "NEW",
        text: "Added multi-list organization support."
      },
      {
        type: "IMPR",
        text: "Migrated state persistence to Cloudflare D1 SQLite database."
      }
    ]
  },
  {
    version: "v1.1.0",
    date: "2026-06-01",
    changes: [
      {
        type: "IMPR",
        text: "Fixed UI button visibility for user stats and sign-out buttons."
      }
    ]
  },
  {
    version: "v1.0.3",
    date: "2026-05-28",
    changes: [
      {
        type: "NEW",
        text: "Added authentication system and guest session support."
      }
    ]
  },
  {
    version: "v1.0.2",
    date: "2026-05-27",
    changes: [
      {
        type: "IMPR",
        text: "Applied UI and UX design enhancements."
      }
    ]
  },
  {
    version: "v1.0.1",
    date: "2025-08-03",
    changes: [
      {
        type: "IMPR",
        text: "Updated app title and added footer links."
      }
    ]
  },
  {
    version: "v1.0.0",
    date: "2025-05-01",
    changes: [
      {
        type: "NEW",
        text: "Initial commit of sYnX repository with Cloudflare Workers Assets + Remix foundation."
      }
    ]
  }
];
