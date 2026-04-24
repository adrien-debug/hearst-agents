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
];

export function MissionEditor({
  initialData,
  onSave,
  onCancel,
  isLoading,
}: MissionEditorProps) {
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-2">
          Nom de la mission
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="ex: Rapport hebdo ventes"
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-2">
          Description
        </label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Objectif de cette mission..."
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30"
        />
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-2">
          Prompt
        </label>
        <textarea
          value={formData.prompt}
          onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
          placeholder="Instructions pour l'IA... ex: Génère un rapport des ventes Stripe de la semaine"
          rows={4}
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30 resize-none"
        />
      </div>

      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-2">
          Fréquence
        </label>
        <div className="grid grid-cols-2 gap-2">
          {FREQUENCY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, frequency: option.value as MissionFormData["frequency"] })}
              className={`p-3 rounded-lg border text-left transition-colors ${
                formData.frequency === option.value
                  ? "bg-cyan-500/10 border-cyan-500/30"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03]"
              }`}
            >
              <p className={`text-sm font-medium ${
                formData.frequency === option.value ? "text-cyan-400" : "text-white/70"
              }`}>
                {option.label}
              </p>
              <p className="text-xs text-white/40 mt-0.5">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Cron */}
      {formData.frequency === "custom" && (
        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Expression Cron
          </label>
          <input
            type="text"
            value={formData.customCron}
            onChange={(e) => setFormData({ ...formData, customCron: e.target.value })}
            placeholder="0 9 * * 1"
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30 font-mono"
          />
          <p className="text-xs text-white/30 mt-1">
            Format: minute heure jour-mois mois jour-semaine
          </p>
        </div>
      )}

      {/* Enabled toggle */}
      <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
        <div>
          <p className="text-sm font-medium text-white/80">Activer la mission</p>
          <p className="text-xs text-white/40">La mission s&apos;exécutera selon la fréquence</p>
        </div>
        <button
          type="button"
          onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            formData.enabled ? "bg-cyan-500/30" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
              formData.enabled ? "left-7 bg-cyan-400" : "left-1 bg-white/40"
            }`}
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 bg-transparent border border-white/[0.08] text-white/60 rounded-lg text-sm font-medium hover:bg-white/[0.03] transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={!isValid || isLoading}
          className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>
    </form>
  );
}
