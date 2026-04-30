"use client";

/**
 * StudioToolbar — barre d'actions principales du Studio.
 *
 * Actions :
 *   - Méta : édition title / summary inline (popover)
 *   - Sample run : POST .../run avec sample:true → met à jour PreviewPane
 *   - Save : POST /api/v2/reports/specs (custom spec persisted)
 *   - Schedule : ouvre dialog → POST /api/v2/missions (mission cron)
 *   - Share : POST /api/reports/share (signed URL — nécessite asset persisté)
 *   - Export PDF : redirige vers la route export existante (post-save)
 *
 * Tokens uniquement, conforme CLAUDE.md.
 */

import { useState } from "react";
import type { ReportSpec } from "@/lib/reports/spec/schema";

export interface StudioToolbarProps {
  spec: ReportSpec;
  /** Id du custom spec si déjà sauvegardé. */
  savedSpecId: string | null;
  /** Save handler (POST /api/v2/reports/specs ou PATCH si déjà id). */
  onSave: (name: string, description?: string) => Promise<{ id: string } | null>;
  /** Sample run handler (préview live). */
  onSampleRun: () => Promise<void>;
  /** Schedule mission cron handler. */
  onSchedule: (schedule: string) => Promise<boolean>;
  /** Share asset handler (nécessite save ⊕ run ⊕ asset). */
  onShare?: () => Promise<{ url: string } | null>;
  /** Publish to marketplace handler (ouvre modal de publication). */
  onPublishMarketplace?: () => void;
  isSaving?: boolean;
  isSampling?: boolean;
}

const SCHEDULE_PRESETS: ReadonlyArray<{ label: string; cron: string }> = [
  { label: "Quotidien · 09h",        cron: "0 9 * * *" },
  { label: "Hebdo · Lun 09h",        cron: "0 9 * * 1" },
  { label: "Mensuel · 1er à 09h",    cron: "0 9 1 * *" },
];

export function StudioToolbar({
  spec,
  savedSpecId,
  onSave,
  onSampleRun,
  onSchedule,
  onShare,
  onPublishMarketplace,
  isSaving,
  isSampling,
}: StudioToolbarProps) {
  // ── Save form state ─────────────────────────────────────
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(spec.meta.title);
  const [saveDesc, setSaveDesc] = useState(spec.meta.summary);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // ── Schedule form state ─────────────────────────────────
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<"idle" | "ok" | "err">("idle");

  // ── Share form state ────────────────────────────────────
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareErr, setShareErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    const result = await onSave(saveName.trim(), saveDesc?.trim() || undefined);
    if (result) {
      setSaveStatus("saved");
      setSaveOpen(false);
    } else {
      setSaveStatus("error");
    }
  };

  const handleSchedule = async (cron: string) => {
    const ok = await onSchedule(cron);
    setScheduleStatus(ok ? "ok" : "err");
    if (ok) setScheduleOpen(false);
  };

  const handleShare = async () => {
    setShareErr(null);
    if (!onShare) return;
    const r = await onShare();
    if (r) {
      setShareUrl(r.url);
      try {
        await navigator.clipboard.writeText(r.url);
      } catch {
        // Clipboard not available — affichage suffit.
      }
    } else {
      setShareErr("Échec du partage");
    }
  };

  const canSchedule = savedSpecId !== null;
  const canShare = savedSpecId !== null;

  return (
    <header
      data-testid="studio-toolbar"
      className="flex items-center justify-between"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--surface-card)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      {/* Left : title */}
      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <span
          className="t-9 font-mono uppercase"
          style={{
            color: "var(--text-muted)",
            letterSpacing: "var(--tracking-display)",
          }}
        >
          Studio
        </span>
        <span className="t-13" style={{ color: "var(--text-soft)" }}>
          {spec.meta.title || "Nouveau rapport"}
        </span>
        {savedSpecId && (
          <span
            className="t-9 font-mono"
            style={{
              padding: "var(--space-0) var(--space-2)",
              background: "var(--cykan-surface)",
              color: "var(--cykan)",
              borderRadius: "var(--radius-xs)",
            }}
          >
            sauvegardé
          </span>
        )}
        {saveStatus === "saved" && !saveOpen && (
          <span className="t-9" style={{ color: "var(--color-success)" }}>
            ✓
          </span>
        )}
      </div>

      {/* Right : actions */}
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <ToolbarButton
          label={isSampling ? "Sample…" : "Tester"}
          testid="toolbar-sample"
          onClick={() => void onSampleRun()}
          disabled={isSampling || spec.blocks.length === 0}
        />
        <ToolbarButton
          label={isSaving ? "Sauvegarde…" : savedSpecId ? "Mettre à jour" : "Sauvegarder"}
          testid="toolbar-save"
          variant="primary"
          onClick={() => setSaveOpen((v) => !v)}
          disabled={isSaving}
        />
        <ToolbarButton
          label="Programmer"
          testid="toolbar-schedule"
          onClick={() => setScheduleOpen((v) => !v)}
          disabled={!canSchedule}
        />
        {onShare && (
          <ToolbarButton
            label="Partager"
            testid="toolbar-share"
            onClick={() => void handleShare()}
            disabled={!canShare}
          />
        )}
        {onPublishMarketplace && (
          <ToolbarButton
            label="Publier marketplace"
            testid="toolbar-publish-marketplace"
            onClick={onPublishMarketplace}
            disabled={spec.blocks.length === 0}
          />
        )}
      </div>

      {/* Save popover */}
      {saveOpen && (
        <div
          data-testid="toolbar-save-form"
          className="absolute flex flex-col"
          style={{
            top: "var(--space-12)",
            right: "var(--space-4)",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-card)",
            width: "var(--space-32)",
            zIndex: 50,
          }}
        >
          <span
            className="t-9 font-mono uppercase"
            style={{
              color: "var(--text-muted)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            {savedSpecId ? "Mise à jour" : "Sauvegarder"}
          </span>
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Nom du rapport"
            data-testid="toolbar-save-name"
            className="t-11"
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xs)",
              outline: "none",
            }}
          />
          <textarea
            value={saveDesc}
            onChange={(e) => setSaveDesc(e.target.value)}
            placeholder="Description courte (optionnel)"
            data-testid="toolbar-save-desc"
            rows={2}
            className="t-11"
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xs)",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div className="flex justify-end" style={{ gap: "var(--space-2)" }}>
            <ToolbarButton
              label="Annuler"
              testid="toolbar-save-cancel"
              onClick={() => setSaveOpen(false)}
            />
            <ToolbarButton
              label="Confirmer"
              testid="toolbar-save-confirm"
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!saveName.trim() || isSaving}
            />
          </div>
          {saveStatus === "error" && (
            <span className="t-9" style={{ color: "var(--color-error)" }}>
              Échec — vérifie le spec.
            </span>
          )}
        </div>
      )}

      {/* Schedule popover */}
      {scheduleOpen && (
        <div
          data-testid="toolbar-schedule-form"
          className="absolute flex flex-col"
          style={{
            top: "var(--space-12)",
            right: "var(--space-4)",
            gap: "var(--space-2)",
            padding: "var(--space-4)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-card)",
            zIndex: 50,
          }}
        >
          <span
            className="t-9 font-mono uppercase"
            style={{
              color: "var(--text-muted)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            Programmer
          </span>
          {SCHEDULE_PRESETS.map((p) => (
            <ToolbarButton
              key={p.cron}
              label={p.label}
              testid={`toolbar-schedule-${p.cron.replace(/\s/g, "_")}`}
              onClick={() => void handleSchedule(p.cron)}
            />
          ))}
          {scheduleStatus === "err" && (
            <span className="t-9" style={{ color: "var(--color-error)" }}>
              Échec création routine.
            </span>
          )}
        </div>
      )}

      {/* Share popover (inline minimal) */}
      {shareUrl && (
        <div
          data-testid="toolbar-share-result"
          className="absolute flex flex-col"
          style={{
            top: "var(--space-12)",
            right: "var(--space-4)",
            gap: "var(--space-2)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-card)",
            zIndex: 50,
            maxWidth: "var(--space-32)",
          }}
        >
          <span className="t-9 font-mono uppercase" style={{ color: "var(--cykan)", letterSpacing: "var(--tracking-display)" }}>
            URL copiée
          </span>
          <span className="t-9 truncate" style={{ color: "var(--text-soft)" }} title={shareUrl}>
            {shareUrl}
          </span>
        </div>
      )}
      {shareErr && (
        <span className="t-9" style={{ color: "var(--color-error)" }}>
          {shareErr}
        </span>
      )}
    </header>
  );
}

// ── ToolbarButton ──────────────────────────────────────────

function ToolbarButton({
  label,
  testid,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  testid?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary";
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className="t-11 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: "var(--space-2) var(--space-3)",
        background: isPrimary ? "var(--cykan)" : "var(--surface-2)",
        color: isPrimary ? "var(--text-on-cykan)" : "var(--text-soft)",
        border: `1px solid ${isPrimary ? "var(--cykan)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-xs)",
        transitionDuration: "var(--duration-base)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
