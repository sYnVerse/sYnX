import type { ReleaseNote } from "../../shared/changelog";

export const WEB_VERSION = "v5.1.1";

export const WEB_CHANGELOG: ReleaseNote[] = [
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
        type: "FIX",
        text: "Use theme tokens for task duration UI."
      },
      {
        type: "FIX",
        text: "Change z-indexes for DurationPicker, PriorityPicker, ReminderPicker, and RecurrencePicker components."
      },
      {
        type: "IMPR",
        text: "Change default value for task duration from 15 minutes to optional."
      },
      {
        type: "IMPR",
        text: "Removed 'N' avatar icon from desktop What's New modal header for a cleaner header design."
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
      },
      {
        type: "IMPR",
        text: "Added  unit tests to catch data integrity issues caused by the front-end."
      },
      {
        type: "IMPR",
        text: "Added unit tests for subtask cascade deletion and hierarchy tree builder."
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
