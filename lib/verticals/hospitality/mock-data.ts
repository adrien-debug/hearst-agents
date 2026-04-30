/**
 * Mock data hospitality — données plausibles pour démo MVP.
 *
 * Pas de connecteur PMS/POS réel pour l'instant. Ces générateurs produisent
 * des datasets cohérents (occupancy, ADR, RevPAR, arrivals, requests) que
 * les reports specs et le briefing peuvent consommer. Tout est clairement
 * labellisé `source: "demo"` quand exposé à l'UI.
 */

export interface HospitalityArrival {
  guestName: string;
  room: string;
  eta: string; // HH:MM
  vip: boolean;
  specialRequest: string | null;
}

export interface HospitalityDeparture {
  guestName: string;
  room: string;
  lateCheckout: boolean;
}

export interface HospitalityKpiSnapshot {
  occupancy: number; // 0..1
  occupancyYesterday: number;
  occupancyForecast: number;
  adr: number; // €
  revpar: number; // €
  arrivalsCount: number;
  departuresCount: number;
  vipCount: number;
  pendingServiceRequests: number;
}

export interface HospitalityServiceRequest {
  id: string;
  guestName: string;
  room: string;
  type: "housekeeping" | "concierge" | "maintenance" | "f_and_b";
  priority: "low" | "normal" | "urgent";
  text: string;
  receivedAt: number;
}

export interface HospitalityRevenueBySource {
  source: "direct" | "ota" | "corporate" | "group";
  amount: number;
}

export interface HospitalityRevparPoint {
  date: string; // YYYY-MM-DD
  occupancy: number;
  adr: number;
  revpar: number;
}

export interface HospitalitySatisfactionRow {
  channel: "post_stay_survey" | "google_reviews" | "tripadvisor" | "in_app";
  responses: number;
  nps: number;
  averageScore: number;
}

const ARRIVALS: HospitalityArrival[] = [
  {
    guestName: "M. Bernard Lefèvre",
    room: "412",
    eta: "14:30",
    vip: true,
    specialRequest: "Champagne en chambre + accueil concierge personnalisé",
  },
  {
    guestName: "Mme. Akiko Tanaka",
    room: "508",
    eta: "16:00",
    vip: true,
    specialRequest: "Oreillers anti-allergéniques",
  },
  {
    guestName: "M. & Mme. Dupuis",
    room: "215",
    eta: "15:00",
    vip: false,
    specialRequest: "Lit bébé",
  },
  {
    guestName: "M. Marco Rossi",
    room: "320",
    eta: "17:45",
    vip: false,
    specialRequest: null,
  },
  {
    guestName: "Mme. Sophie Lambert",
    room: "601",
    eta: "13:15",
    vip: false,
    specialRequest: "Vue jardin si possible",
  },
];

const DEPARTURES: HospitalityDeparture[] = [
  { guestName: "M. James Whitfield", room: "402", lateCheckout: true },
  { guestName: "Mme. Catherine Roux", room: "306", lateCheckout: false },
  { guestName: "M. Liu Wei", room: "510", lateCheckout: false },
  { guestName: "M. & Mme. Garcia", room: "208", lateCheckout: true },
];

const SERVICE_REQUESTS: HospitalityServiceRequest[] = [
  {
    id: "sr-001",
    guestName: "Mme. Akiko Tanaka",
    room: "508",
    type: "housekeeping",
    priority: "normal",
    text: "Serviettes supplémentaires SVP",
    receivedAt: Date.now() - 12 * 60_000,
  },
  {
    id: "sr-002",
    guestName: "M. Bernard Lefèvre",
    room: "412",
    type: "concierge",
    priority: "urgent",
    text: "Réservation Le Cinq pour 4 ce soir 20h, VIP",
    receivedAt: Date.now() - 4 * 60_000,
  },
  {
    id: "sr-003",
    guestName: "M. Marco Rossi",
    room: "320",
    type: "maintenance",
    priority: "normal",
    text: "Robinet salle de bain qui goutte",
    receivedAt: Date.now() - 30 * 60_000,
  },
];

const REVENUE_BY_SOURCE: HospitalityRevenueBySource[] = [
  { source: "direct", amount: 18_240 },
  { source: "ota", amount: 24_600 },
  { source: "corporate", amount: 9_120 },
  { source: "group", amount: 6_450 },
];

const REVPAR_30D: HospitalityRevparPoint[] = (() => {
  const out: HospitalityRevparPoint[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const occ = 0.62 + 0.18 * Math.sin(i / 4) + (i % 7 < 2 ? 0.12 : 0);
    const adr = 245 + 18 * Math.cos(i / 5) + (i % 7 < 2 ? 22 : 0);
    out.push({
      date: d.toISOString().slice(0, 10),
      occupancy: Math.max(0.35, Math.min(0.98, occ)),
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(occ * adr * 100) / 100,
    });
  }
  return out;
})();

const SATISFACTION: HospitalitySatisfactionRow[] = [
  { channel: "post_stay_survey", responses: 84, nps: 62, averageScore: 8.7 },
  { channel: "google_reviews", responses: 36, nps: 48, averageScore: 4.5 },
  { channel: "tripadvisor", responses: 22, nps: 55, averageScore: 4.6 },
  { channel: "in_app", responses: 51, nps: 71, averageScore: 9.1 },
];

export function getMockArrivals(): HospitalityArrival[] {
  return ARRIVALS.slice();
}

export function getMockDepartures(): HospitalityDeparture[] {
  return DEPARTURES.slice();
}

export function getMockServiceRequests(): HospitalityServiceRequest[] {
  return SERVICE_REQUESTS.slice();
}

export function getMockRevenueBySource(): HospitalityRevenueBySource[] {
  return REVENUE_BY_SOURCE.slice();
}

export function getMockRevpar30d(): HospitalityRevparPoint[] {
  return REVPAR_30D.slice();
}

export function getMockSatisfaction(): HospitalitySatisfactionRow[] {
  return SATISFACTION.slice();
}

export function getMockKpiSnapshot(): HospitalityKpiSnapshot {
  const arrivals = getMockArrivals();
  const departures = getMockDepartures();
  const requests = getMockServiceRequests();
  const today = REVPAR_30D[REVPAR_30D.length - 1];
  const yesterday = REVPAR_30D[REVPAR_30D.length - 2];
  return {
    occupancy: today.occupancy,
    occupancyYesterday: yesterday.occupancy,
    occupancyForecast: Math.min(0.95, today.occupancy + 0.04),
    adr: today.adr,
    revpar: today.revpar,
    arrivalsCount: arrivals.length,
    departuresCount: departures.length,
    vipCount: arrivals.filter((a) => a.vip).length,
    pendingServiceRequests: requests.length,
  };
}
