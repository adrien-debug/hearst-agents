/**
 * Alert dispatcher — branche les signaux critiques (et au-delà) sur les
 * canaux d'alerting configurés par tenant (webhooks, Slack, email).
 *
 * Architecture :
 *   1. `dispatchAlerts(input)` est l'entrée publique. Reçoit
 *      { tenantId, signals[], report, prefs?, ... }
 *   2. Filtre les signaux selon `severityFloor` (défaut "critical")
 *   3. Filtre par throttle in-memory (4h par signal type / tenant)
 *   4. Charge les préférences alerting si non fournies (Supabase)
 *   5. Pour chaque signal et chaque canal (webhooks[], slack, email),
 *      check le filtre signalTypes puis émet best-effort en parallèle.
 *   6. Logge structurellement le résultat (kind, ok, status, target).
 *
 * Le dispatcher est best-effort : un canal qui échoue n'invalide pas les
 * autres, et le report retourne toujours.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessSignal } from "@/lib/reports/signals/extract";
import type { Severity } from "@/lib/reports/signals/types";
import { getTenantSetting } from "@/lib/platform/settings";
import {
  ALERTING_PREFERENCES_SETTING_KEY,
  DEFAULT_ALERTING_PREFERENCES,
  parseAlertingPreferences,
  type AlertingPreferences,
} from "./schema";
import {
  dispatchEmail,
  dispatchSlack,
  dispatchWebhook,
  type AlertContext,
  type ChannelResult,
  type EmailSender,
} from "./channels";
import {
  inMemoryStore,
  shouldThrottle,
  type ThrottleStore,
} from "./throttle";

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export interface DispatchAlertsInput {
  tenantId: string;
  signals: ReadonlyArray<BusinessSignal>;
  report: { id: string; title: string };
  /** Sévérité minimale dispatchée. Défaut "critical". */
  severityFloor?: Severity;
  /**
   * Préférences pré-chargées (utile pour tests / pour éviter un round-trip
   * Supabase quand le caller a déjà la conf). Si absent + db fourni, on charge
   * via `loadAlertingPreferences`.
   */
  preferences?: AlertingPreferences;
  /** Supabase client (server-side). Requis si `preferences` non fourni. */
  db?: SupabaseClient;
  /** Override pour tests. Défaut : `inMemoryStore`. */
  throttleStore?: ThrottleStore;
  /** Override pour tests / SSR. Défaut : `Date.now()`. */
  now?: number;
  /** Override pour tests : injection canaux. */
  fetcher?: typeof fetch;
  emailSender?: EmailSender;
}

export interface DispatchAlertsResult {
  /** Signaux qui ont franchi le severityFloor + non throttlés. */
  dispatchedSignals: ReadonlyArray<BusinessSignal>;
  /** Signaux ignorés à cause du throttle. */
  throttledSignals: ReadonlyArray<BusinessSignal>;
  /** Résultats par canal, à plat. Vide si aucune préférence configurée. */
  results: ReadonlyArray<ChannelResult>;
  /** True si au moins un canal a renvoyé ok=true. Utile pour healthchecks. */
  anyDelivered: boolean;
}

/**
 * Charge les préférences alerting du tenant depuis `system_settings`.
 * Retourne `DEFAULT_ALERTING_PREFERENCES` si absent ou invalide.
 */
export async function loadAlertingPreferences(
  db: SupabaseClient,
  tenantId: string,
): Promise<AlertingPreferences> {
  // getTenantSetting est typé sur SettingValue ; on stocke un objet JSON et on
  // valide nous-même via Zod, donc cast en object pour respecter la signature.
  const value = await getTenantSetting<object>(
    db,
    tenantId,
    ALERTING_PREFERENCES_SETTING_KEY,
    DEFAULT_ALERTING_PREFERENCES,
  );
  return parseAlertingPreferences(value);
}

/**
 * Persiste les préférences alerting d'un tenant. Validation Zod via le
 * schéma — throw si invalide.
 */
export async function saveAlertingPreferences(
  db: SupabaseClient,
  tenantId: string,
  prefs: AlertingPreferences,
  updatedBy?: string,
): Promise<void> {
  // Re-validate avant écriture (defense en profondeur).
  const parsed = parseAlertingPreferences(prefs);
  const { setTenantSetting } = await import("@/lib/platform/settings");
  await setTenantSetting(
    db,
    tenantId,
    ALERTING_PREFERENCES_SETTING_KEY,
    parsed as unknown as Record<string, unknown>,
    "integrations",
    updatedBy,
  );
}

export async function dispatchAlerts(
  input: DispatchAlertsInput,
): Promise<DispatchAlertsResult> {
  const now = input.now ?? Date.now();
  const floor = input.severityFloor ?? "critical";
  const floorRank = SEVERITY_RANK[floor];
  const store = input.throttleStore ?? inMemoryStore;

  // ── 1. Sévérité filter ─────────────────────────────────
  const candidates = input.signals.filter(
    (s) => SEVERITY_RANK[s.severity] >= floorRank,
  );

  if (candidates.length === 0) {
    return {
      dispatchedSignals: [],
      throttledSignals: [],
      results: [],
      anyDelivered: false,
    };
  }

  // ── 2. Throttle filter ─────────────────────────────────
  const dispatchedSignals: BusinessSignal[] = [];
  const throttledSignals: BusinessSignal[] = [];
  for (const sig of candidates) {
    if (shouldThrottle(store, input.tenantId, sig.type, now)) {
      throttledSignals.push(sig);
      continue;
    }
    dispatchedSignals.push(sig);
  }

  if (dispatchedSignals.length === 0) {
    logStructured({
      tenantId: input.tenantId,
      reportId: input.report.id,
      throttled: throttledSignals.length,
      dispatched: 0,
      results: [],
    });
    return {
      dispatchedSignals: [],
      throttledSignals,
      results: [],
      anyDelivered: false,
    };
  }

  // ── 3. Load preferences ────────────────────────────────
  let prefs = input.preferences;
  if (!prefs) {
    if (!input.db) {
      console.warn(
        "[alerting] dispatchAlerts appelé sans preferences ni db — skip",
      );
      // On marque les signaux dispatchedSignals comme émis pour ne pas
      // re-spammer si l'appel est rejoué dans la fenêtre de throttle.
      for (const sig of dispatchedSignals) {
        store.markEmitted(`${input.tenantId}:${sig.type}`, now);
      }
      return {
        dispatchedSignals,
        throttledSignals,
        results: [],
        anyDelivered: false,
      };
    }
    prefs = await loadAlertingPreferences(input.db, input.tenantId);
  }

  // ── 4. Dispatch par canal ──────────────────────────────
  const results: ChannelResult[] = [];

  for (const sig of dispatchedSignals) {
    const ctx: AlertContext = {
      tenantId: input.tenantId,
      signal: sig,
      report: input.report,
      emittedAt: now,
    };

    const channelTasks: Array<Promise<ChannelResult | null>> = [];

    for (const w of prefs.webhooks) {
      channelTasks.push(dispatchWebhook(w, ctx, { fetcher: input.fetcher }));
    }
    if (prefs.slack) {
      channelTasks.push(dispatchSlack(prefs.slack, ctx, { fetcher: input.fetcher }));
    }
    if (prefs.email) {
      channelTasks.push(dispatchEmail(prefs.email, ctx, { sender: input.emailSender }));
    }

    const settled = await Promise.allSettled(channelTasks);
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value) {
        results.push(s.value);
      } else if (s.status === "rejected") {
        results.push({
          kind: "webhook",
          ok: false,
          error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        });
      }
    }

    // Marque comme émis même si tous les canaux ont échoué — on ne veut pas
    // retry agressivement le même signal toutes les minutes.
    store.markEmitted(`${input.tenantId}:${sig.type}`, now);
  }

  const anyDelivered = results.some((r) => r.ok);

  logStructured({
    tenantId: input.tenantId,
    reportId: input.report.id,
    throttled: throttledSignals.length,
    dispatched: dispatchedSignals.length,
    results,
  });

  return {
    dispatchedSignals,
    throttledSignals,
    results,
    anyDelivered,
  };
}

function logStructured(entry: {
  tenantId: string;
  reportId: string;
  throttled: number;
  dispatched: number;
  results: ReadonlyArray<ChannelResult>;
}): void {
  const summary = {
    src: "alerting",
    tenant: entry.tenantId,
    report: entry.reportId,
    dispatched: entry.dispatched,
    throttled: entry.throttled,
    channels: entry.results.map((r) => ({
      kind: r.kind,
      ok: r.ok,
      status: r.status,
      target: r.target,
      error: r.error,
    })),
  };
  // Log unique par dispatch — le caller (run-report) ne re-logge pas.
  console.log(`[alerting] ${JSON.stringify(summary)}`);
}
