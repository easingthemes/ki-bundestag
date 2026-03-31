import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import common from "./de/common.json";
import legislation from "./de/legislation.json";
import parliament from "./de/parliament.json";
import elections from "./de/elections.json";
import media from "./de/media.json";
import budget from "./de/budget.json";
import polls from "./de/polls.json";
import parties from "./de/parties.json";
import dashboard from "./de/dashboard.json";
import notifications from "./de/notifications.json";
import admin from "./de/admin.json";

i18n.use(initReactI18next).init({
  lng: "de",
  fallbackLng: "de",
  ns: [
    "common",
    "legislation",
    "parliament",
    "elections",
    "media",
    "budget",
    "polls",
    "parties",
    "dashboard",
    "notifications",
    "admin",
  ],
  defaultNS: "common",
  resources: {
    de: {
      common,
      legislation,
      parliament,
      elections,
      media,
      budget,
      polls,
      parties,
      dashboard,
      notifications,
      admin,
    },
  },
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
