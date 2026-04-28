"use client";

import { useState } from "react";

interface MissionFormData {
  name: string;
  description: string;
  prompt: string;
  frequency: "daily" | "weekly" | "monthly" | "custom";
  customCron?: string;
  enabled: boolean;
}

interface MissionEditorProps {
  initialData?: Partial<MissionFormData>;
  onSave: (data: MissionFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Quotidien", description: "Tous les jours à 9h" },
  { value: "weekly", label: "Hebdomadaire", description: "Tous les lundis à 9h" },
  { value: "monthly", label: "Mensuel", description: "Le 1er de chaque mois" },
  { value: "custom", label: "Personnalisé", description: "Expression cron custom" },
] as const;

export function MissionEditor({ initialData, onSave, onCancel, isLoading }: MissionEditorProps) {
  const [formData, setFormData] = useState<MissionFormData>({
    name: initialData?.name || "",
    description: initialData?.description || "",
    prompt: initialData?.prompt || "",
    frequency: initialData?.frequency || "daily",
    customCron: initialData?.customCron || "",
    enabled: initialData?.enabled ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const isValid = formData.name.trim() && formData.prompt.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <label className="ghost-meta-label block mb-2">Nom</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="ex: Rapport hebdo ventes"
          className="ghost-input-line w-full"
        />
      </div>

      <div>
        <label className="ghost-meta-label block mb-2">Description</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Objectif de cette mission..."
          className="ghost-input-line w-full"
        />
      </div>

      <div>
        <label className="ghost-meta-label block mb-2">Instructions</label>
        <textarea
          value={formData.prompt}
          onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
          placeholder="Instructions pour l'IA..."
          rows={4}
          className="ghost-input-line w-full resize-none min-h-[120px]"
        />
      </div>

      <div>
        <label className="ghost-meta-label block mb-4">Fréquence</label>
        <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
          {FREQUENCY_OPTIONS.map((option) => {
            const selected = formData.frequency === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormData({ ...formData, frequency: option.value })}
                className={`text-left p-4 transition-colors ${
                  selected ? "bg-[var(--bg-soft)] text-[var(--cykan)]" : "bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elev)]"
                }`}
              >
                <p className={`text-xs font-black uppercase tracking-tighter ${selected ? "" : "text-[var(--text-soft)]"}`}>{option.label}</p>
                <p className="t-10 font-mono uppercase tracking-[0.08em] text-[var(--text-faint)] mt-1">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {formData.frequency === "custom" && (
        <div>
          <label className="ghost-meta-label block mb-2">Expression cron</label>
          <input
            type="text"
            value={formData.customCron}
            onChange={(e) => setFormData({ ...formData, customCron: e.target.value })}
            placeholder="0 9 * * 1"
            className="ghost-input-line w-full font-mono text-xs"
          />
          <p className="t-10 font-mono text-[var(--text-faint)] mt-2 uppercase tracking-[0.1em]">min heure jour mois jour-semaine</p>
        </div>
      )}

      <div className="flex items-center justify-between py-4 border-y border-[var(--line)]">
        <div>
          <p className="text-xs font-medium text-[var(--text-soft)]">Mission activée</p>
          <p className="t-10 font-mono text-[var(--text-faint)] mt-1 uppercase tracking-[0.12em]">Exécution selon fréquence</p>
        </div>
        <button
          type="button"
          onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
          className={`w-12 h-6 rounded-sm transition-colors relative border ${
            formData.enabled ? "border-[var(--cykan)] bg-[var(--bg-soft)]" : "border-[var(--line-strong)] bg-[var(--bg)]"
          }`}
          aria-pressed={formData.enabled}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-sm transition-all ${
              formData.enabled ? "left-6 bg-[var(--cykan)]" : "left-1 bg-[var(--text-muted)]"
            }`}
          />
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="ghost-btn-solid ghost-btn-ghost flex-1 rounded-sm">
          Annuler
        </button>
        <button
          type="submit"
          disabled={!isValid || isLoading}
          className="ghost-btn-solid ghost-btn-cykan flex-1 rounded-sm disabled:opacity-40"
        >
          {isLoading ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
