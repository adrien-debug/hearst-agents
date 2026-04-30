/**
 * Handler `pms_list_arrivals_today` — liste des arrivées du jour côté PMS.
 *
 * Aucun connecteur PMS réel branché (Mews/Cloudbeds/Opera roadmap). On
 * retourne un payload mock CLAIREMENT labellisé `source: "demo"` pour que
 * l'UI/asset puisse afficher un badge "demo data" et que l'agent QA ne
 * confonde pas une démo avec un vrai dataset PMS.
 */

import type { WorkflowHandler } from "./types";
import { getMockArrivals } from "@/lib/verticals/hospitality/mock-data";

export const pmsListArrivalsToday: WorkflowHandler = async (args) => {
  const date =
    typeof args.date === "string" && args.date.length > 0
      ? args.date
      : new Date().toISOString().slice(0, 10);
  const includeRequests = args.includeRequests === true;

  const arrivals = getMockArrivals().map((a) => ({
    guestName: a.guestName,
    room: a.room,
    eta: a.eta,
    vip: a.vip,
    ...(includeRequests ? { specialRequest: a.specialRequest } : {}),
  }));

  return {
    success: true,
    output: {
      source: "demo",
      pmsProvider: null,
      date,
      count: arrivals.length,
      arrivals,
    },
  };
};
