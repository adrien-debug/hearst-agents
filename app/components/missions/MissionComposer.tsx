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
      <div className="border border-white/[0.05] p-3">
        <p className="text-[11px] font-mono text-white/50">Mission créée</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {formatMissionSchedule(effectiveSchedule)}
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-2 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
          >
            Fermer
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-white/[0.05] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Nouvelle mission
      </p>

      <label className="mb-1 block text-[10px] text-zinc-600">Nom</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Rapport Bitcoin quotidien"
        className="mb-2 w-full border border-white/[0.05] bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-700 outline-none focus:border-white/[0.1]"
      />

      <label className="mb-1 block text-[10px] text-zinc-600">Prompt</label>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        placeholder="Fais-moi un rapport sur le bitcoin"
        className="mb-2 w-full resize-none border border-white/[0.05] bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-700 outline-none focus:border-white/[0.1]"
      />

      <label className="mb-1 block text-[10px] text-zinc-600">Récurrence</label>
      {!useCustom ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {SCHEDULE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setSchedule(p.value)}
              className={`px-2 py-1 text-[10px] transition-colors border ${
                schedule === p.value
                  ? "border-white/[0.15] text-white/60"
                  : "border-white/[0.05] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className="border border-white/[0.05] px-2 py-1 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
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
            className="w-full border border-white/[0.05] bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 placeholder-zinc-700 outline-none focus:border-white/[0.1]"
          />
          <button
            onClick={() => setUseCustom(false)}
            className="mt-1 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
          >
            ← Préréglages
          </button>
        </div>
      )}

      <label className="mb-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-3 w-3 border-zinc-700 bg-transparent"
        />
        <span className="text-[10px] text-zinc-500">Activer immédiatement</span>
      </label>

      {error && (
        <p className="mb-2 text-[10px] text-red-400/70">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="border border-white/[0.1] px-3 py-1.5 text-[11px] font-mono text-white/60 transition-colors hover:text-white/90 hover:border-white/[0.2] disabled:opacity-30"
        >
          {saving ? "Création…" : "Créer la mission"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
