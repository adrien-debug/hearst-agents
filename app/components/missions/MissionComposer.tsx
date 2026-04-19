"use client";

import { useState, useCallback } from "react";
import { formatMissionSchedule } from "@/lib/runtime/missions/format";

const SCHEDULE_PRESETS = [
  { label: "Tous les jours à 08:00", value: "0 8 * * *" },
  { label: "Tous les jours à 18:00", value: "0 18 * * *" },
  { label: "Chaque lundi à 08:00", value: "0 8 * * 1" },
  { label: "Chaque vendredi à 17:00", value: "0 17 * * 5" },
] as const;

export interface MissionComposerProps {
  presetName?: string;
  presetPrompt?: string;
  presetSchedule?: string;
  onSaved?: (mission: { id: string; name: string; schedule: string }) => void;
  onCancel?: () => void;
}

export function MissionComposer({
  presetName = "",
  presetPrompt = "",
  presetSchedule = "0 8 * * *",
  onSaved,
  onCancel,
}: MissionComposerProps) {
  const [name, setName] = useState(presetName);
  const [input, setInput] = useState(presetPrompt);
  const [schedule, setSchedule] = useState(presetSchedule);
  const [customSchedule, setCustomSchedule] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const effectiveSchedule = useCustom ? customSchedule : schedule;

  const handleSave = useCallback(async () => {
    if (!input.trim()) {
      setError("Le prompt est requis");
      return;
    }
    if (!effectiveSchedule.trim()) {
      setError("La récurrence est requise");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/v2/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || input.slice(0, 80),
          input: input.trim(),
          schedule: effectiveSchedule.trim(),
          enabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de la création");
        setSaving(false);
        return;
      }

      const data = await res.json();
      setSuccess(true);
      onSaved?.({
        id: data.mission.id,
        name: data.mission.name,
        schedule: data.mission.schedule,
      });
    } catch {
      setError("Connexion impossible");
    } finally {
      setSaving(false);
    }
  }, [name, input, effectiveSchedule, enabled, onSaved]);

  if (success) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <p className="text-[11px] font-medium text-emerald-400">Mission créée</p>
        <p className="mt-0.5 text-[10px] text-zinc-400">
          {formatMissionSchedule(effectiveSchedule)}
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-2 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Fermer
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Nouvelle mission
      </p>

      {/* Name */}
      <label className="mb-1 block text-[10px] text-zinc-500">Nom</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Rapport Bitcoin quotidien"
        className="mb-2 w-full rounded-md border border-zinc-800/50 bg-zinc-950/60 px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-600/40"
      />

      {/* Prompt */}
      <label className="mb-1 block text-[10px] text-zinc-500">Prompt</label>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        placeholder="Fais-moi un rapport sur le bitcoin"
        className="mb-2 w-full resize-none rounded-md border border-zinc-800/50 bg-zinc-950/60 px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-600/40"
      />

      {/* Schedule */}
      <label className="mb-1 block text-[10px] text-zinc-500">Récurrence</label>
      {!useCustom ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {SCHEDULE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setSchedule(p.value)}
              className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
                schedule === p.value
                  ? "bg-cyan-500/15 text-cyan-400"
                  : "bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className="rounded-md bg-zinc-800/40 px-2 py-1 text-[10px] text-zinc-500 transition-colors hover:bg-zinc-800/60"
          >
            Personnalisé…
          </button>
        </div>
      ) : (
        <div className="mb-2">
          <input
            type="text"
            value={customSchedule}
            onChange={(e) => setCustomSchedule(e.target.value)}
            placeholder="0 8 * * *"
            className="w-full rounded-md border border-zinc-800/50 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-600/40"
          />
          <button
            onClick={() => setUseCustom(false)}
            className="mt-1 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ← Préréglages
          </button>
        </div>
      )}

      {/* Enabled toggle */}
      <label className="mb-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-3 w-3 rounded border-zinc-700 bg-zinc-900 accent-cyan-500"
        />
        <span className="text-[10px] text-zinc-400">Activer immédiatement</span>
      </label>

      {error && (
        <p className="mb-2 text-[10px] text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-cyan-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-50"
        >
          {saving ? "Création…" : "Créer la mission"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
