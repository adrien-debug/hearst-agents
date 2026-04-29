"use client";

/**
 * AlertingSettings — Configuration des canaux d'alerting (webhook, email, Slack).
 *
 * Sections :
 *  - Webhooks (liste + ajout + suppression + test)
 *  - Email (destinataires, signal types, toggle)
 *  - Slack (webhook URL, toggle, test)
 *  - Signal Types (master override global)
 *
 * Tokens design system : globals.css (spacing, radius, colors, shadows, typo).
 * Aucun magic number CSS.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BUSINESS_SIGNAL_TYPES } from "@/lib/reports/signals/types";
import type { AlertingPreferences } from "@/lib/notifications/schema";

// ── Types locaux ──────────────────────────────────────────────────────────────

type SignalType = (typeof BUSINESS_SIGNAL_TYPES)[number] | "*";

interface WebhookDraft {
  url: string;
  signalTypes: SignalType[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface State {
  prefs: AlertingPreferences;
  loading: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Formulaire webhook en cours d'ajout */
  newWebhook: WebhookDraft;
  showNewWebhookForm: boolean;
  /** Tests en cours { key → "testing" | "ok" | "error" } */
  testStates: Record<string, "testing" | "ok" | "error">;
  testMessages: Record<string, string>;
  /** Email input brut (tags) */
  emailInputRaw: string;
}

type Action =
  | { type: "LOADED"; prefs: AlertingPreferences }
  | { type: "LOAD_ERROR" }
  | { type: "SAVE_START" }
  | { type: "SAVE_OK"; prefs: AlertingPreferences }
  | { type: "SAVE_ERROR"; message: string }
  | { type: "SET_PREFS"; prefs: AlertingPreferences }
  | { type: "NEW_WEBHOOK_CHANGE"; draft: Partial<WebhookDraft> }
  | { type: "SHOW_NEW_WEBHOOK"; show: boolean }
  | { type: "ADD_WEBHOOK" }
  | { type: "REMOVE_WEBHOOK"; index: number }
  | { type: "TEST_START"; key: string }
  | { type: "TEST_DONE"; key: string; ok: boolean; message: string }
  | { type: "SET_EMAIL_INPUT"; raw: string };

const INITIAL_STATE: State = {
  prefs: { webhooks: [] },
  loading: true,
  saveStatus: "idle",
  saveError: null,
  newWebhook: { url: "", signalTypes: ["*"] },
  showNewWebhookForm: false,
  testStates: {},
  testMessages: {},
  emailInputRaw: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      return {
        ...state,
        loading: false,
        prefs: action.prefs,
        emailInputRaw: action.prefs.email?.recipients.join(", ") ?? "",
      };
    case "LOAD_ERROR":
      return { ...state, loading: false };
    case "SAVE_START":
      return { ...state, saveStatus: "saving", saveError: null };
    case "SAVE_OK":
      return { ...state, saveStatus: "saved", prefs: action.prefs };
    case "SAVE_ERROR":
      return { ...state, saveStatus: "error", saveError: action.message };
    case "SET_PREFS":
      return { ...state, prefs: action.prefs };
    case "NEW_WEBHOOK_CHANGE":
      return {
        ...state,
        newWebhook: { ...state.newWebhook, ...action.draft },
      };
    case "SHOW_NEW_WEBHOOK":
      return {
        ...state,
        showNewWebhookForm: action.show,
        newWebhook: action.show ? { url: "", signalTypes: ["*"] } : state.newWebhook,
      };
    case "ADD_WEBHOOK": {
      const webhooks = [
        ...state.prefs.webhooks,
        { url: state.newWebhook.url, signalTypes: state.newWebhook.signalTypes },
      ];
      return {
        ...state,
        prefs: { ...state.prefs, webhooks },
        showNewWebhookForm: false,
        newWebhook: { url: "", signalTypes: ["*"] },
      };
    }
    case "REMOVE_WEBHOOK": {
      const webhooks = state.prefs.webhooks.filter((_, i) => i !== action.index);
      return { ...state, prefs: { ...state.prefs, webhooks } };
    }
    case "TEST_START":
      return {
        ...state,
        testStates: { ...state.testStates, [action.key]: "testing" },
        testMessages: { ...state.testMessages, [action.key]: "" },
      };
    case "TEST_DONE":
      return {
        ...state,
        testStates: { ...state.testStates, [action.key]: action.ok ? "ok" : "error" },
        testMessages: { ...state.testMessages, [action.key]: action.message },
      };
    case "SET_EMAIL_INPUT":
      return { ...state, emailInputRaw: action.raw };
    default:
      return state;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEmailInput(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

const SIGNAL_SEVERITY: Record<(typeof BUSINESS_SIGNAL_TYPES)[number], "critical" | "warning" | "info"> = {
  mrr_drop: "critical",
  runway_risk: "critical",
  expense_spike: "critical",
  sla_breach: "critical",
  retention_drop: "critical",
  change_failure_high: "critical",
  incident_spike: "critical",
  pipeline_thin: "warning",
  cycle_time_drift: "warning",
  customer_at_risk: "warning",
  support_overload: "warning",
  feature_adoption_low: "warning",
  nps_decline: "warning",
  csat_drop: "warning",
  commit_velocity_drop: "warning",
  calendar_overload: "warning",
  auth_expiring: "warning",
  lead_time_drift: "warning",
  burnout_risk: "warning",
  meeting_overload: "warning",
  mrr_spike: "info",
};

// ── Sous-composants ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="t-9 mb-4"
      style={{
        color: "var(--text-muted)",
        letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </h3>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-4 mb-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full t-13"
      style={{
        background: "var(--mat-300)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-3)",
        color: "var(--text)",
        outline: "none",
        transition: `border-color var(--duration-base) var(--ease-standard), box-shadow var(--duration-base) var(--ease-standard)`,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--cykan)";
        e.currentTarget.style.boxShadow = "var(--shadow-input-focus)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 t-13"
      style={{ color: "var(--text-soft)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <span
        style={{
          display: "inline-flex",
          width: "var(--space-8)",
          height: "var(--space-4)",
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--cykan)" : "var(--mat-gray)",
          border: `1px solid ${checked ? "var(--cykan)" : "var(--border-default)"}`,
          alignItems: "center",
          padding: "2px",
          transition: `background var(--duration-base) var(--ease-standard)`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "calc(var(--space-4) - 6px)",
            height: "calc(var(--space-4) - 6px)",
            borderRadius: "var(--radius-pill)",
            background: "var(--text)",
            transform: checked ? "translateX(calc(var(--space-4) - 2px))" : "translateX(0)",
            transition: `transform var(--duration-base) var(--ease-spring)`,
          }}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

function Btn({
  children,
  onClick,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger" | "primary" | "ghost";
  disabled?: boolean;
}) {
  const colors = {
    default: { bg: "var(--surface-2)", color: "var(--text-soft)", border: "var(--border-default)" },
    danger: { bg: "var(--color-error-bg)", color: "var(--color-error)", border: "var(--color-error-border)" },
    primary: { bg: "var(--cykan)", color: "var(--text-on-cykan)", border: "transparent" },
    ghost: { bg: "transparent", color: "var(--text-muted)", border: "transparent" },
  };
  const c = colors[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="t-13"
      style={{
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-1) var(--space-3)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: `opacity var(--duration-fast) var(--ease-standard)`,
        letterSpacing: "var(--tracking-caption)",
      }}
    >
      {children}
    </button>
  );
}

function TestBadge({ state, message }: { state?: "testing" | "ok" | "error"; message?: string }) {
  if (!state || state === "testing") {
    return state === "testing" ? (
      <span className="t-9" style={{ color: "var(--text-faint)", letterSpacing: "var(--tracking-caption)" }}>
        Test en cours…
      </span>
    ) : null;
  }
  return (
    <span
      className="t-9"
      style={{
        color: state === "ok" ? "var(--color-success)" : "var(--color-error)",
        letterSpacing: "var(--tracking-caption)",
      }}
      title={message}
    >
      {state === "ok" ? "Connecté" : `Erreur${message ? `: ${message}` : ""}`}
    </span>
  );
}

function SignalBadge({ type }: { type: keyof typeof SIGNAL_SEVERITY | "*" }) {
  if (type === "*") {
    return (
      <span
        className="t-9"
        style={{
          background: "var(--cykan-surface)",
          color: "var(--cykan)",
          border: "1px solid var(--cykan-border)",
          borderRadius: "var(--radius-xs)",
          padding: "1px var(--space-1)",
          letterSpacing: "var(--tracking-caption)",
        }}
      >
        Tous
      </span>
    );
  }
  const sev = SIGNAL_SEVERITY[type as keyof typeof SIGNAL_SEVERITY];
  const colors = {
    critical: { bg: "var(--color-error-bg)", color: "var(--color-error)", border: "var(--color-error-border)" },
    warning: { bg: "var(--color-warning-bg)", color: "var(--color-warning)", border: "var(--color-warning-border)" },
    info: { bg: "var(--color-info-bg)", color: "var(--color-info)", border: "var(--color-info-border)" },
  };
  const c = colors[sev ?? "info"];
  return (
    <span
      className="t-9"
      style={{
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        borderRadius: "var(--radius-xs)",
        padding: "1px var(--space-1)",
        letterSpacing: "var(--tracking-caption)",
      }}
    >
      {type}
    </span>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function AlertingSettings() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Chargement initial ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings/alerting")
      .then((r) => r.json())
      .then((data: { prefs?: AlertingPreferences }) => {
        if (data.prefs) {
          dispatch({ type: "LOADED", prefs: data.prefs });
        } else {
          dispatch({ type: "LOAD_ERROR" });
        }
      })
      .catch(() => dispatch({ type: "LOAD_ERROR" }));
  }, []);

  // ── Sauvegarde explicite ─────────────────────────────────────────────────
  const handleSave = useCallback(async (prefs: AlertingPreferences) => {
    dispatch({ type: "SAVE_START" });
    try {
      const res = await fetch("/api/settings/alerting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json() as { ok?: boolean; prefs?: AlertingPreferences; error?: string };
      if (!res.ok || !data.ok) {
        dispatch({ type: "SAVE_ERROR", message: data.error ?? `HTTP ${res.status}` });
      } else {
        dispatch({ type: "SAVE_OK", prefs: data.prefs ?? prefs });
      }
    } catch (err) {
      dispatch({ type: "SAVE_ERROR", message: err instanceof Error ? err.message : "Erreur réseau" });
    }
  }, []);

  // ── Test canal ───────────────────────────────────────────────────────────
  const testChannel = useCallback(
    async (channel: "webhook" | "slack" | "email", targetIndex?: number) => {
      const key = channel === "webhook" ? `webhook-${targetIndex ?? 0}` : channel;
      dispatch({ type: "TEST_START", key });
      try {
        const res = await fetch("/api/settings/alerting/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, targetIndex }),
        });
        const data = await res.json() as { ok?: boolean; result?: { error?: string } };
        const ok = res.ok && data.ok === true;
        const message = data.result?.error ?? (ok ? "Signal envoyé" : "Échec");
        dispatch({ type: "TEST_DONE", key, ok, message });
      } catch (err) {
        dispatch({
          type: "TEST_DONE",
          key,
          ok: false,
          message: err instanceof Error ? err.message : "Erreur réseau",
        });
      }
    },
    [],
  );

  // ── Handlers email ───────────────────────────────────────────────────────
  const handleEmailToggle = (enabled: boolean) => {
    const base = state.prefs.email;
    if (enabled) {
      if (!base) {
        dispatch({
          type: "SET_PREFS",
          prefs: {
            ...state.prefs,
            email: { recipients: [], signalTypes: ["*"] },
          },
        });
      }
    } else {
      dispatch({ type: "SET_PREFS", prefs: { ...state.prefs, email: undefined } });
    }
  };

  const handleEmailRecipientsBlur = () => {
    const emails = parseEmailInput(state.emailInputRaw);
    if (emails.length > 0) {
      dispatch({
        type: "SET_PREFS",
        prefs: {
          ...state.prefs,
          email: {
            signalTypes: state.prefs.email?.signalTypes ?? ["*"],
            recipients: emails,
          },
        },
      });
    }
  };

  // ── Handlers Slack ───────────────────────────────────────────────────────
  const handleSlackToggle = (enabled: boolean) => {
    if (enabled) {
      if (!state.prefs.slack) {
        dispatch({
          type: "SET_PREFS",
          prefs: {
            ...state.prefs,
            slack: { webhookUrl: "", signalTypes: ["*"] },
          },
        });
      }
    } else {
      dispatch({ type: "SET_PREFS", prefs: { ...state.prefs, slack: undefined } });
    }
  };

  // ── Rendu ────────────────────────────────────────────────────────────────

  if (state.loading) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ color: "var(--text-faint)" }}
      >
        <span className="t-13">Chargement des préférences…</span>
      </div>
    );
  }

  const { prefs } = state;

  return (
    <div
      className="flex flex-col gap-8 w-full"
      style={{ maxWidth: "var(--width-center-max)" }}
    >

      {/* ── En-tête + bouton Enregistrer ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2
            className="t-15"
            style={{ color: "var(--text)", letterSpacing: "var(--tracking-tight)" }}
          >
            Alerting
          </h2>
          <p className="t-13" style={{ color: "var(--text-muted)", marginTop: "var(--space-1)" }}>
            Configurez les canaux de notification pour les signaux critiques.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {state.saveStatus === "saved" && (
            <span className="t-9" style={{ color: "var(--color-success)", letterSpacing: "var(--tracking-caption)" }}>
              Enregistré
            </span>
          )}
          {state.saveStatus === "error" && (
            <span className="t-9" style={{ color: "var(--color-error)", letterSpacing: "var(--tracking-caption)" }}>
              {state.saveError ?? "Erreur"}
            </span>
          )}
          <Btn
            variant="primary"
            onClick={() => handleSave(prefs)}
            disabled={state.saveStatus === "saving"}
          >
            {state.saveStatus === "saving" ? "Enregistrement…" : "Enregistrer"}
          </Btn>
        </div>
      </div>

      {/* ── Section Webhooks ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Webhooks</SectionTitle>

        {prefs.webhooks.length === 0 && !state.showNewWebhookForm && (
          <p className="t-13" style={{ color: "var(--text-faint)", marginBottom: "var(--space-3)" }}>
            Aucun webhook configuré.
          </p>
        )}

        {prefs.webhooks.map((wh, idx) => (
          <Card key={idx}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p
                  className="t-13"
                  style={{
                    color: "var(--text-soft)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                  }}
                >
                  {wh.url}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {wh.signalTypes.map((st) => (
                    <SignalBadge key={st} type={st} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TestBadge
                  state={state.testStates[`webhook-${idx}`]}
                  message={state.testMessages[`webhook-${idx}`]}
                />
                <Btn onClick={() => testChannel("webhook", idx)} disabled={state.testStates[`webhook-${idx}`] === "testing"}>
                  Tester
                </Btn>
                <Btn variant="danger" onClick={() => dispatch({ type: "REMOVE_WEBHOOK", index: idx })}>
                  Supprimer
                </Btn>
              </div>
            </div>
          </Card>
        ))}

        {/* Formulaire ajout webhook */}
        {state.showNewWebhookForm && (
          <Card>
            <div className="flex flex-col gap-3">
              <label className="t-9" style={{ color: "var(--text-muted)", letterSpacing: "var(--tracking-label)" }}>
                URL WEBHOOK
              </label>
              <Input
                value={state.newWebhook.url}
                onChange={(v) => dispatch({ type: "NEW_WEBHOOK_CHANGE", draft: { url: v } })}
                placeholder="https://hook.example.com/abc"
                type="url"
              />

              <label className="t-9" style={{ color: "var(--text-muted)", letterSpacing: "var(--tracking-label)", marginTop: "var(--space-2)" }}>
                SIGNAUX DÉCLENCHEURS
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1 t-13" style={{ color: "var(--text-soft)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={state.newWebhook.signalTypes.includes("*")}
                    onChange={(e) => {
                      const types: SignalType[] = e.target.checked
                        ? ["*"]
                        : state.newWebhook.signalTypes.filter((s) => s !== "*");
                      dispatch({ type: "NEW_WEBHOOK_CHANGE", draft: { signalTypes: types } });
                    }}
                    style={{ accentColor: "var(--cykan)" }}
                  />
                  Tous les signaux
                </label>
                {!state.newWebhook.signalTypes.includes("*") &&
                  BUSINESS_SIGNAL_TYPES.map((st) => (
                    <label key={st} className="flex items-center gap-1 t-13" style={{ color: "var(--text-soft)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={state.newWebhook.signalTypes.includes(st)}
                        onChange={(e) => {
                          const types: SignalType[] = e.target.checked
                            ? [...state.newWebhook.signalTypes, st]
                            : state.newWebhook.signalTypes.filter((s) => s !== st);
                          dispatch({ type: "NEW_WEBHOOK_CHANGE", draft: { signalTypes: types } });
                        }}
                        style={{ accentColor: "var(--cykan)" }}
                      />
                      {st}
                    </label>
                  ))}
              </div>

              <div className="flex gap-2 mt-2">
                <Btn
                  variant="primary"
                  onClick={() => dispatch({ type: "ADD_WEBHOOK" })}
                  disabled={!state.newWebhook.url.startsWith("http")}
                >
                  Ajouter
                </Btn>
                <Btn variant="ghost" onClick={() => dispatch({ type: "SHOW_NEW_WEBHOOK", show: false })}>
                  Annuler
                </Btn>
              </div>
            </div>
          </Card>
        )}

        {!state.showNewWebhookForm && prefs.webhooks.length < 10 && (
          <Btn onClick={() => dispatch({ type: "SHOW_NEW_WEBHOOK", show: true })}>
            + Ajouter un webhook
          </Btn>
        )}
      </section>

      {/* ── Section Email ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Email</SectionTitle>
        <Card>
          <div className="flex flex-col gap-4">
            <Toggle
              checked={!!prefs.email}
              onChange={handleEmailToggle}
              label="Activer les alertes email"
            />

            {prefs.email && (
              <>
                <div>
                  <label className="t-9 block mb-2" style={{ color: "var(--text-muted)", letterSpacing: "var(--tracking-label)" }}>
                    DESTINATAIRES (séparés par virgule)
                  </label>
                  <Input
                    value={state.emailInputRaw}
                    onChange={(v) => dispatch({ type: "SET_EMAIL_INPUT", raw: v })}
                    placeholder="alice@example.com, bob@example.com"
                    type="text"
                  />
                  <div
                    className="flex flex-wrap gap-1 mt-2"
                    onBlur={handleEmailRecipientsBlur}
                  >
                    {prefs.email.recipients.map((r) => (
                      <span
                        key={r}
                        className="t-9"
                        style={{
                          background: "var(--mat-300)",
                          color: "var(--text-soft)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius-xs)",
                          padding: "1px var(--space-2)",
                        }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="t-9 mt-1"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--cykan)",
                      cursor: "pointer",
                      padding: 0,
                      letterSpacing: "var(--tracking-caption)",
                    }}
                    onClick={handleEmailRecipientsBlur}
                  >
                    Valider les adresses
                  </button>
                </div>

                <div>
                  <label className="t-9 block mb-2" style={{ color: "var(--text-muted)", letterSpacing: "var(--tracking-label)" }}>
                    SIGNAUX DÉCLENCHEURS
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1 t-13" style={{ color: "var(--text-soft)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={prefs.email.signalTypes.includes("*")}
                        onChange={(e) => {
                          const types: SignalType[] = e.target.checked ? ["*"] : [];
                          dispatch({
                            type: "SET_PREFS",
                            prefs: { ...prefs, email: { ...prefs.email!, signalTypes: types } },
                          });
                        }}
                        style={{ accentColor: "var(--cykan)" }}
                      />
                      Tous les signaux critiques
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <TestBadge
                    state={state.testStates["email"]}
                    message={state.testMessages["email"]}
                  />
                  <Btn
                    onClick={() => testChannel("email")}
                    disabled={state.testStates["email"] === "testing" || prefs.email.recipients.length === 0}
                  >
                    Tester l&apos;envoi
                  </Btn>
                </div>
              </>
            )}
          </div>
        </Card>
      </section>

      {/* ── Section Slack ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Slack</SectionTitle>
        <Card>
          <div className="flex flex-col gap-4">
            <Toggle
              checked={!!prefs.slack}
              onChange={handleSlackToggle}
              label="Activer les alertes Slack"
            />

            {prefs.slack && (
              <>
                <div>
                  <label className="t-9 block mb-2" style={{ color: "var(--text-muted)", letterSpacing: "var(--tracking-label)" }}>
                    WEBHOOK URL SLACK
                  </label>
                  <Input
                    value={prefs.slack.webhookUrl}
                    onChange={(v) =>
                      dispatch({
                        type: "SET_PREFS",
                        prefs: { ...prefs, slack: { ...prefs.slack!, webhookUrl: v } },
                      })
                    }
                    placeholder="https://hooks.slack.com/services/T.../B.../..."
                    type="url"
                  />
                  <p className="t-9 mt-2" style={{ color: "var(--text-faint)" }}>
                    Pour obtenir une URL webhook : ouvrez Slack → Apps → Incoming Webhooks → Ajouter à Slack.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <TestBadge
                    state={state.testStates["slack"]}
                    message={state.testMessages["slack"]}
                  />
                  <Btn
                    onClick={() => testChannel("slack")}
                    disabled={
                      state.testStates["slack"] === "testing" ||
                      !prefs.slack.webhookUrl.startsWith("https://")
                    }
                  >
                    Tester la connexion
                  </Btn>
                </div>
              </>
            )}
          </div>
        </Card>
      </section>

      {/* ── Section Signal Types (master override) ────────────────────── */}
      <section>
        <SectionTitle>Types de signaux</SectionTitle>
        <p className="t-13 mb-4" style={{ color: "var(--text-muted)" }}>
          Référence de tous les signaux business et leur sévérité. Utilisez les filtres par canal ci-dessus.
        </p>
        <div className="flex flex-col gap-1">
          {(["critical", "warning", "info"] as const).map((sev) => (
            <div key={sev}>
              <p className="t-9 mb-2 mt-3" style={{ color: "var(--text-faint)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase" }}>
                {sev === "critical" ? "Critique" : sev === "warning" ? "Avertissement" : "Info"}
              </p>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_SIGNAL_TYPES.filter(
                  (st) => SIGNAL_SEVERITY[st as keyof typeof SIGNAL_SEVERITY] === sev,
                ).map((st) => (
                  <SignalBadge key={st} type={st as keyof typeof SIGNAL_SEVERITY} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
