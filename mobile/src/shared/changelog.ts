export type ChangelogCategory = "NEW" | "IMPR" | "FIX";

export interface ChangelogItem {
  type: ChangelogCategory;
  text: string;
}

export interface ReleaseNote {
  version: string;
  date?: string;
  title?: string;
  changes: ChangelogItem[];
}

export const WEB_VERSION = "v5.1.1";
export const MOBILE_VERSION = "v3.1.2";

export const WEB_CHANGELOG: ReleaseNote[] = [
  {
    version: "v5.1.1",
    date: "2026-08-02",
    title: "What's new?",
    changes: [
      {
        type: "FIX",
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
        type: "FIX",
        text: "Resolved mobile/web app bugs and implemented feature parity across platforms."
      },
      {
        type: "FIX",
        text: "Improved dropdown styling, task duration inputs, list categories, and sub-task hierarchy."
      },
      {
        type: "IMPR",
        text: "Added durationMinutes database column and comprehensive test suite."
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
        type: "NEW",
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
      },
      {
        type: "FIX",
        text: "Wrapped Mobile App with SafeAreaProvider for notch and status bar bounds."
      },
      {
        type: "IMPR",
        text: "Single-column layout and active task preview for mobile lists."
      }
    ]
  },
  {
    version: "v3.4.0",
    date: "2026-07-27",
    changes: [
      {
        type: "NEW",
        text: "Added pull-to-refresh and manual refresh controls."
      },
      {
        type: "NEW",
        text: "Added EAS build SHA-256 fingerprint for automatic deep link verification."
      },
      {
        type: "FIX",
        text: "Fixed Android status bar styling and push token retrieval."
      },
      {
        type: "FIX",
        text: "Fixed empty 'My Tasks' list skipping during guest data migration."
      },
      {
        type: "FIX",
        text: "Added unsaved settings confirmation prompt."
      },
      {
        type: "IMPR",
        text: "Upgraded mobile runtime to Expo SDK 57, React 19, and React Native 0.86.0."
      }
    ]
  },
  {
    version: "v3.3.0",
    date: "2026-07-26",
    changes: [
      {
        type: "NEW",
        text: "Initial Android & iOS Mobile App deployment with Expo."
      },
      {
        type: "NEW",
        text: "Added localStorage-based guest list management."
      },
      {
        type: "FIX",
        text: "Installed react-native-svg peer dependency and excluded typescript from validation."
      }
    ]
  },
  {
    version: "v3.2.2",
    date: "2026-07-25",
    changes: [
      {
        type: "IMPR",
        text: "Upgraded core React & React-DOM dependencies."
      }
    ]
  },
  {
    version: "v3.2.1",
    date: "2026-07-23",
    changes: [
      {
        type: "IMPR",
        text: "Upgraded user-agent detection engine."
      }
    ]
  },
  {
    version: "v3.2.0",
    date: "2026-07-15",
    changes: [
      {
        type: "NEW",
        text: "Implemented monthly calendar view with drag-and-drop task rescheduling."
      },
      {
        type: "IMPR",
        text: "Updated Graphify project knowledge graph."
      }
    ]
  },
  {
    version: "v3.1.1",
    date: "2026-07-04",
    changes: [
      {
        type: "IMPR",
        text: "Upgraded Valibot schema validation and core utilities."
      }
    ]
  },
  {
    version: "v3.1.0",
    date: "2026-06-27",
    changes: [
      {
        type: "NEW",
        text: "Added support for 'none' priority level and inline text editing."
      },
      {
        type: "NEW",
        text: "Set up Graphify knowledge graph."
      }
    ]
  },
  {
    version: "v3.0.0",
    date: "2026-06-20",
    changes: [
      {
        type: "FIX",
        text: "Fixed local sign-out flow by properly clearing session cookies."
      },
      {
        type: "IMPR",
        text: "Updated D1 database schema and production dependency packages."
      }
    ]
  },
  {
    version: "v2.1.1",
    date: "2026-06-19",
    changes: [
      {
        type: "FIX",
        text: "Adjusted EmptyState layout bounds and slate color themes."
      }
    ]
  },
  {
    version: "v2.1.0",
    date: "2026-06-18",
    changes: [
      {
        type: "NEW",
        text: "Added task recurrence (daily, weekly, monthly), subtasks, and public/private list sharing."
      },
      {
        type: "IMPR",
        text: "Added worker test suites for subtasks and recurrence."
      }
    ]
  },
  {
    version: "v2.0.1",
    date: "2026-06-05",
    changes: [
      {
        type: "IMPR",
        text: "Registered WebMCP tools for AI coding agent integration."
      },
      {
        type: "IMPR",
        text: "Scoped todo list endpoints and validated Discord webhooks."
      }
    ]
  },
  {
    version: "v2.0.0",
    date: "2026-05-30",
    changes: [
      {
        type: "NEW",
        text: "Integrated sYnID Single Sign-On (SSO) authentication."
      },
      {
        type: "NEW",
        text: "Added multi-channel notifications (Email, SMS, Discord webhooks)."
      },
      {
        type: "IMPR",
        text: "Migrated backend storage engine from Workers KV to Cloudflare D1 database."
      },
      {
        type: "FIX",
        text: "Resolved Resend API email delivery issues and session cookie domain attributes."
      }
    ]
  },
  {
    version: "v1.0.4",
    date: "2026-05-29",
    changes: [
      {
        type: "NEW",
        text: "Added browser push notification reminders."
      },
      {
        type: "FIX",
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

export const MOBILE_CHANGELOG: ReleaseNote[] = [
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
        type: "FIX",
        text: "Added optimistic cache updates across list creations, edits, deletions, and categories."
      },
      {
        type: "FIX",
        text: "resolve Expo SDK 57 version mismatches and EAS monorepo module resolution"
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
        type: "FIX",
        text: "Resolved mobile/web app bugs and implemented feature parity across platforms."
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
