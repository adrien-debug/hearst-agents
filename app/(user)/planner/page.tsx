"use client";

import { useState, useEffect } from "react";
import { toast } from "@/app/hooks/use-toast";

type PlanStatus = "draft" | "ready" | "awaiting_approval" | "executing" | "completed" | "failed" | "degraded";
type PlanType = "one_shot" | "mission" | "monitoring";

interface Plan {
  id: string;
  threadId: string;
  intent: string;
  type: PlanType;
  status: PlanStatus;
  requiresApproval: boolean;
  createdAt: number;
  updatedAt: number;
  steps?: Array<{
    id: string;
    kind: string;
    title: string;
    status: string;
  }>;
}

export default function PlannerPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | PlanStatus>("all");

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/v2/plans");
      if (!res.ok) {
        if (!loading) return;
        toast.error("Erreur", "Impossible de charger les plans");
        return;
      }
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (error) {
      console.error("Failed to load plans:", error);
      if (!loading) return;
      toast.error("Erreur", "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadPlans();
    });
    const interval = setInterval(() => {
      void loadPlans();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? plans : plans.filter((p) => p.status === filter);

  const statusColor = (status: PlanStatus) => {
    switch (status) {
      case "draft": return "text-[var(--text-faint)]";
      case "ready": return "text-[var(--money)]";
      case "awaiting_approval": return "text-[var(--warn)]";
      case "executing": return "text-[var(--cykan)]";
      case "completed": return "text-[var(--money)]";
      case "failed": return "text-[var(--danger)]";
      case "degraded": return "text-[var(--warn)]";
      default: return "text-[var(--text-muted)]";
    }
  };

  const statusLabel = (status: PlanStatus) => {
    switch (status) {
      case "draft": return "Brouillon";
      case "ready": return "Prêt";
      case "awaiting_approval": return "Validation";
      case "executing": return "Exécution";
      case "completed": return "Terminé";
      case "failed": return "Échec";
      case "degraded": return "Dégradé";
      default: return status;
    }
  };

  const typeLabel = (type: PlanType) => {
    switch (type) {
      case "one_shot": return "Ponctuel";
      case "mission": return "Mission";
      case "monitoring": return "Surveillance";
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
        <span className="text-[var(--text-muted)] text-sm">Chargement des plans...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)]">
      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="t-18 font-medium text-[var(--text)] mb-1">Planner</h1>
            <p className="text-sm text-[var(--text-muted)]">Plans d&apos;exécution et orchestration</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["all", "draft", "ready", "awaiting_approval", "executing", "completed", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filter === f
                  ? "bg-[var(--cykan)] text-[var(--text-on-cykan)]"
                  : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {f === "all" ? "Tous" : statusLabel(f)}
              {f !== "all" && ` (${plans.filter((p) => p.status === f).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--card-flat-bg)] border border-[var(--line)] flex items-center justify-center mb-4">
              <span className="text-2xl">◉</span>
            </div>
            <h2 className="t-13 font-medium text-[var(--text)] mb-2">Aucun plan</h2>
            <p className="text-sm text-[var(--text-muted)]">Les plans d&apos;exécution apparaîtront ici</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((plan) => (
              <div
                key={plan.id}
                className="p-4 rounded-xl bg-[var(--card-flat-bg)] border border-[var(--line)] hover:bg-[var(--surface-1)] transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${statusColor(plan.status)}`}>
                        {statusLabel(plan.status)}
                      </span>
                      <span className="text-[var(--text-faint)]">·</span>
                      <span className="text-xs text-[var(--text-faint)]">{typeLabel(plan.type)}</span>
                      {plan.requiresApproval && (
                        <>
                          <span className="text-[var(--text-faint)]">·</span>
                          <span className="text-xs text-[var(--warn)]">Approbation requise</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text)] font-medium mb-1">{plan.intent}</p>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
                      <span>ID: {plan.id.slice(0, 8)}</span>
                      <span>·</span>
                      <span>Thread: {plan.threadId.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                {plan.steps && plan.steps.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--line)]">
                    <p className="text-xs text-[var(--text-muted)] mb-2">Étapes ({plan.steps.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {plan.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`px-2 py-1 rounded t-10 font-medium ${
                            step.status === "done"
                              ? "bg-[var(--money)]/20 text-[var(--money)]"
                              : step.status === "running"
                              ? "bg-[var(--cykan)]/20 text-[var(--cykan)]"
                              : step.status === "failed"
                              ? "bg-[var(--danger)]/20 text-[var(--danger)]"
                              : "bg-[var(--surface-1)] text-[var(--text-faint)]"
                          }`}
                        >
                          {step.kind}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
