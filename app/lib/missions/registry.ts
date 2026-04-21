/**
 * @deprecated Legacy client mission registry (in-memory + localStorage).
 * Canonical mission system: lib/runtime/missions/*, /api/v2/missions*.
 * Still used by ControlPanel (v1 mission panel) and GlobalChat (proactive suggestions).
 */
import type { Mission, MissionAction, MissionEvent, MissionSnapshot, Surface } from "./types";

const STORAGE_KEY = "hearst_missions";

type Listener = (snapshot: MissionSnapshot) => void;

/**
 * Pure mission registry — no React dependency.
 * Manages multi-mission state, transitions, and optional persistence.
 */
export class MissionRegistry {
  private missions: Map<string, Mission> = new Map();
  private activeMissionId: string | null = null;
  private activeSurface: Surface = "home";
  private listeners: Set<Listener> = new Set();
  private eventLog: MissionEvent[] = [];
  private cachedSnapshot: MissionSnapshot | null = null;

  constructor() {
    this.restore();
  }

  /* ─── Subscriptions ─── */

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.cachedSnapshot = null;
    const snap = this.getSnapshot();
    this.persist(snap);
    for (const fn of this.listeners) fn(snap);
  }

  /* ─── Queries ─── */

  getSnapshot(): MissionSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    this.cachedSnapshot = {
      missions: Array.from(this.missions.values()),
      activeMissionId: this.activeMissionId,
      activeSurface: this.activeSurface,
    };
    return this.cachedSnapshot;
  }

  getActiveMission(): Mission | null {
    if (!this.activeMissionId) return null;
    return this.missions.get(this.activeMissionId) ?? null;
  }

  getMission(id: string): Mission | null {
    return this.missions.get(id) ?? null;
  }

  getBackgroundMissions(): Mission[] {
    return Array.from(this.missions.values()).filter(
      (m) => m.id !== this.activeMissionId && (m.status === "running" || m.status === "awaiting_approval"),
    );
  }

  getActiveSurface(): Surface {
    return this.activeSurface;
  }

  getEventLog(): readonly MissionEvent[] {
    return this.eventLog;
  }

  /* ─── Commands (apply event → mutate → notify) ─── */

  dispatch(event: MissionEvent): void {
    this.eventLog.push(event);
    this.applyEvent(event);
    this.notify();
  }

  setActiveSurface(surface: Surface): void {
    this.activeSurface = surface;
    this.notify();
  }

  setActiveMission(missionId: string | null): void {
    this.activeMissionId = missionId;
    this.notify();
  }

  /* ─── Event application (state machine) ─── */

  private applyEvent(event: MissionEvent): void {
    switch (event.type) {
      case "mission_created": {
        const m = { ...event.mission, createdAt: Date.now(), updatedAt: Date.now() };
        this.missions.set(m.id, m);
        this.activeMissionId = m.id;
        break;
      }
      case "mission_started":
        this.updateMission(event.missionId, { status: "running" });
        break;

      case "step_started":
        this.updateAction(event.missionId, event.actionId, { status: "in_progress" });
        break;

      case "step_completed":
        this.updateAction(event.missionId, event.actionId, {
          status: "done",
          preview: event.preview,
        });
        break;

      case "step_failed":
        this.updateAction(event.missionId, event.actionId, {
          status: "error",
          error: event.error,
        });
        break;

      case "step_needs_approval":
        this.updateAction(event.missionId, event.actionId, { status: "needs_approval" });
        break;

      case "mission_awaiting_approval":
        this.updateMission(event.missionId, { status: "awaiting_approval" });
        break;

      case "mission_completed":
        this.updateMission(event.missionId, { status: "completed", result: event.result, resultData: event.resultData });
        break;

      case "mission_failed":
        this.updateMission(event.missionId, { status: "failed", error: event.error });
        break;

      case "mission_cancelled":
        this.updateMission(event.missionId, { status: "cancelled" });
        break;

      case "mission_dismissed":
        this.missions.delete(event.missionId);
        if (this.activeMissionId === event.missionId) {
          const running = this.getBackgroundMissions();
          this.activeMissionId = running.length > 0 ? running[0].id : null;
        }
        break;
    }
  }

  /* ─── Helpers ─── */

  private updateMission(id: string, patch: Partial<Mission>): void {
    const m = this.missions.get(id);
    if (!m) return;
    this.missions.set(id, { ...m, ...patch, updatedAt: Date.now() });
  }

  private updateAction(missionId: string, actionId: string, patch: Partial<MissionAction>): void {
    const m = this.missions.get(missionId);
    if (!m) return;
    this.missions.set(missionId, {
      ...m,
      updatedAt: Date.now(),
      actions: m.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
    });
  }

  /* ─── Persistence (sessionStorage for now, easy to swap) ─── */

  private persist(snap: MissionSnapshot): void {
    try {
      if (typeof window === "undefined") return;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      /* quota exceeded or SSR */
    }
  }

  private restore(): void {
    try {
      if (typeof window === "undefined") return;
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as MissionSnapshot;
      for (const m of snap.missions) {
        if (m.status === "running") {
          m.status = "failed";
          m.error = "Interrompu (rechargement de la page)";
          for (const a of m.actions) {
            if (a.status === "in_progress") {
              a.status = "error";
              a.error = "Interrompu";
            }
          }
        }
        if (m.status === "awaiting_approval") {
          m.status = "cancelled";
          m.error = "Expirée";
        }
        this.missions.set(m.id, m);
      }
      this.activeMissionId = snap.activeMissionId;
      if (this.activeMissionId) {
        const active = this.missions.get(this.activeMissionId);
        if (active && (active.status === "cancelled" || active.status === "failed")) {
          this.activeMissionId = null;
        }
      }
      this.activeSurface = snap.activeSurface;
    } catch {
      /* corrupted data */
    }
  }

  /** Full reset — useful for tests */
  reset(): void {
    this.missions.clear();
    this.activeMissionId = null;
    this.activeSurface = "home";
    this.eventLog = [];
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ok */ }
    this.notify();
  }
}

/** Singleton — shared across the app */
let _instance: MissionRegistry | null = null;

export function getMissionRegistry(): MissionRegistry {
  if (!_instance) _instance = new MissionRegistry();
  return _instance;
}
