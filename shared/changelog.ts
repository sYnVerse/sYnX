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

export const WEB_VERSION = "v8.0.2";
export const MOBILE_VERSION = "v4.0.0";

export const WEB_CHANGELOG: ReleaseNote[] = [
  {
    version: "v8.0.2",
    date: "2026-08-01",
    title: "What's new?",
    changes: [
      { type: "NEW", text: "Added Version Log & Release Notes modal to inform users of latest feature updates, fixes, and improvements." },
      { type: "NEW", text: "Added manual Version Log launcher inside Profile & Settings drawer." },
      { type: "IMPR", text: "Standardized Semantic Versioning (SemVer) guidelines and automated commit tracking across web and mobile." },
      { type: "FIX", text: "Resolved subtask hierarchy tree rendering, dropdown styling, and task duration inputs." }
    ]
  },
  {
    version: "v8.0.1",
    date: "2026-07-31",
    changes: [
      { type: "NEW", text: "Added unit tests for subtask cascade deletion and task hierarchy tree builder." },
      { type: "NEW", text: "Added durationMinutes field and database column for time estimation." }
    ]
  },
  {
    version: "v8.0.0",
    date: "2026-07-30",
    changes: [
      { type: "NEW", text: "Added category support to lists for better task organization." },
      { type: "NEW", text: "Added email notification subject customization using list title." },
      { type: "IMPR", text: "Added custom glassmorphic themed scrollbar styles." },
      { type: "FIX", text: "Fixed sidebar list scrolling and small-screen overflow issue." }
    ]
  },
  {
    version: "v7.0.0",
    date: "2026-07-28",
    changes: [
      { type: "NEW", text: "Added pull-to-refresh and manual refresh buttons across list views." },
      { type: "NEW", text: "Added local storage fallback for guest list management." },
      { type: "FIX", text: "Fixed guest list migration edge case when skipping empty lists." }
    ]
  },
  {
    version: "v6.0.0",
    date: "2026-07-25",
    changes: [
      { type: "NEW", text: "Implemented interactive monthly calendar view with drag-and-drop task rescheduling." },
      { type: "IMPR", text: "Added support for 'none' priority level and inline text editing." }
    ]
  },
  {
    version: "v5.0.0",
    date: "2026-07-20",
    changes: [
      { type: "NEW", text: "Added task recurrence (daily, weekly, monthly) and subtask nesting." },
      { type: "NEW", text: "Added public/private list sharing permissions." }
    ]
  },
  {
    version: "v4.0.0",
    date: "2026-07-15",
    changes: [
      { type: "NEW", text: "Registered WebMCP tools for AI coding agent integration." },
      { type: "IMPR", text: "Added Terms of Service and Privacy Policy footer links." }
    ]
  },
  {
    version: "v3.0.0",
    date: "2026-07-10",
    changes: [
      { type: "NEW", text: "Added multi-channel notification support: Email, SMS, and Discord webhooks." },
      { type: "IMPR", text: "Upgraded backend storage engine to Cloudflare D1 database." }
    ]
  },
  {
    version: "v2.0.0",
    date: "2026-07-05",
    changes: [
      { type: "NEW", text: "Integrated sYnID Single Sign-On (SSO) authentication." },
      { type: "IMPR", text: "Added guest user session support with instant onboarding." }
    ]
  },
  {
    version: "v1.0.0",
    date: "2026-07-01",
    changes: [
      { type: "NEW", text: "Initial release of sYnX Web Application with task management, categories, and glassmorphic UI." }
    ]
  }
];

export const MOBILE_CHANGELOG: ReleaseNote[] = [
  {
    version: "v4.0.0",
    date: "2026-08-01",
    title: "What's new?",
    changes: [
      { type: "NEW", text: "Added native What's New / Version Log popup and Settings menu launcher." },
      { type: "NEW", text: "Added Task Breakdown modal and task duration support." },
      { type: "IMPR", text: "Added tactile haptic feedback and modern dark/light pastel theme presets." },
      { type: "IMPR", text: "Upgraded Mobile app to Expo SDK 57, React 19, and React Native 0.86.0." },
      { type: "FIX", text: "Fixed dropdown picker styling, Android status bar padding, and safe area bounds." }
    ]
  },
  {
    version: "v3.0.0",
    date: "2026-07-28",
    changes: [
      { type: "NEW", text: "Added push token registration with Expo Notifications." },
      { type: "NEW", text: "Added single-column active preview layout for ListsScreen." }
    ]
  },
  {
    version: "v2.0.0",
    date: "2026-07-20",
    changes: [
      { type: "NEW", text: "Added deep link auto-verification with EAS SHA-256 fingerprints." },
      { type: "IMPR", text: "Added unsaved settings confirmation sheet." }
    ]
  },
  {
    version: "v1.0.0",
    date: "2026-07-15",
    changes: [
      { type: "NEW", text: "Initial release of sYnX Mobile App for Android and iOS." }
    ]
  }
];
