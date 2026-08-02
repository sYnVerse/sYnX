import type { ReleaseNote } from "../shared/changelog";

export const MOBILE_VERSION = "v3.0.1";

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
        type: "NEW",
        text: "Added optimistic cache updates across list creations, edits, deletions, and categories."
      },
      {
        type: "IMPR",
        text: "Separated mobile changelog constants to dedicated mobile constants module."
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
