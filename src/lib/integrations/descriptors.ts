// Client-safe display metadata for the "Connect your school" section.
// The real capability check lives server-side in the integration registry;
// this is only what the UI renders.

export interface IntegrationCardInfo {
  id: string;
  name: string;
  blurb: string;
  status: "coming_soon" | "available";
  authType: string;
  /** Where "Connect" sends the student — the real connect UI lives in Settings. */
  settingsHref?: string;
}

export const SCHOOL_INTEGRATIONS: IntegrationCardInfo[] = [
  {
    id: "canvas",
    name: "Canvas LMS",
    blurb: "Automatically import your courses, assignments and due dates.",
    status: "available",
    authType: "oauth2",
    settingsHref: "/settings?tab=school",
  },
  {
    id: "infinite_campus",
    name: "Infinite Campus",
    blurb: "Connect when your school district supports the required integration.",
    status: "coming_soon",
    authType: "district_api",
  },
];

export const CALENDAR_INTEGRATIONS: IntegrationCardInfo[] = [
  {
    id: "google",
    name: "Google Calendar",
    blurb:
      "Bring your Google Calendar events into LifeOS. Read-only — nothing is ever written back to Google. Student+.",
    status: "available",
    authType: "oauth2",
    settingsHref: "/settings?tab=schedule",
  },
  {
    id: "microsoft",
    name: "Microsoft Outlook Calendar",
    blurb: "Sync your school and personal Outlook calendars.",
    status: "coming_soon",
    authType: "oauth2",
  },
];
