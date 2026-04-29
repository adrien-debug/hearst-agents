"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MissionEditor } from "../components/MissionEditor";
import { toast } from "@/app/hooks/use-toast";
import { GhostIconPencil, GhostIconPlay, GhostIconTrash, GhostIconX } from "../components/ghost-icons";
import { useStageStore } from "@/stores/stage";
import { Breadcrumb, type Crumb } from "../components/Breadcrumb";

type MissionOpsStatus = "idle" | "running" | "success" | "failed" | "blocked";

interface Mission {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "error";
  lastRun?: string;
  nextRun?: string;
  frequency: string;
  enabled: boolean;
  input?: string; // From API - mapped to prompt in editor
  opsStatus?: MissionOpsStatus;
  lastError?: string;
  runningSince?: number;
}

function MissionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(() => searchParams.get("new") === "1");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      router.replace("/missions");
    }
  }, [searchParams, router]);

  const handleRowOpen = (mission: Mission) => {
    // Cohérence post-pivot : pas de "mode mission" dédié dans le Stage
    // polymorphe — une mission s'observe depuis son thread chat. Si la
    // mission n'a pas de threadId associé (mission ad hoc / sans run),
    // fallback sur cockpit où les missions du jour sont visibles.
    const threadId = (mission as { threadId?: string }).threadId;
    if (threadId) {
      useStageStore.getState().setMode({ mode: "chat", threadId });
    } else {
      useStageStore.getState().setMode({ mode: "cockpit" });
    }
    router.push("/");
  };

  useEffect(() => {
    async function loadMissions() {
      try {
        // Load base missions
        const res = await fetch("/api/v2/missions");
        if (!res.ok) {
          toast.error("Échec du chargement", "Impossible de charger les missions");
          return;
        }
        const data = await res.json();
        const baseMissions = data.missions || [];

        // Enrich with ops status
        const opsRes = await fetch("/api/v2/missions/ops");
        if (opsRes.ok) {
          const opsData = await opsRes.json();
          const opsMap = new Map(
            opsData.missions?.map((op: { missionId: string; status: MissionOpsStatus; lastError?: string; runningSince?: number }) => [
              op.missionId,
              { opsStatus: op.status, lastError: op.lastError, runningSince: op.runningSince },
            ]) || []
          );

          const enriched = baseMissions.map((m: Mission) => ({
            ...m,
            ...(opsMap.get(m.id) || {}),
          }));
          setMissions(enriched);
        } else {
          setMissions(baseMissions);
        }
      } catch (error) {
        console.error("Failed to load missions:", error);
        toast.error("Erreur de chargement", "Une erreur est survenue");
      } finally {
        setLoading(false);
      }
    }
    loadMissions();

    // Refresh ops status every 5s
    const opsInterval = setInterval(() => {
      fetch("/api/v2/missions/ops")
        .then((res) => {
          if (!res.ok) throw new Error(`ops status fetch failed: ${res.status}`);
          return res.json();
        })
        .then((opsData) => {
          const opsMap = new Map(
            opsData.missions?.map((op: { missionId: string; status: MissionOpsStatus; lastError?: string; runningSince?: number }) => [
              op.missionId,
              { opsStatus: op.status, lastError: op.lastError, runningSince: op.runningSince },
            ]) || []
          );
          setMissions((prev) =>
            prev.map((m) => ({
              ...m,
              ...(opsMap.get(m.id) || {}),
            }))
          );
        })
        .catch((err) => {
          console.error("[MissionsPage] Background ops refresh failed:", err);
          // Silent fail for background refresh — keep showing last known state
        });
    }, 5000);

    // Update current time every second for running duration
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(opsInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const CRON_SCHEDULES: Record<string, string> = {
    daily: "0 9 * * *",
    weekly: "0 9 * * 1",
    monthly: "0 9 1 * *",
  };

  const handleSave = async (formData: {
    name: string;
    description: string;
    prompt: string;
    frequency: "daily" | "weekly" | "monthly" | "custom";
    customCron?: string;
    enabled: boolean;
  }) => {
    setIsSaving(true);
    try {
      if (editingMission) {
        // Update existing — la route PATCH [id] gère prompt→input et frequency→schedule
        const res = await fetch(`/api/v2/missions/${editingMission.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setMissions((prev) =>
            prev.map((m) =>
              m.id === editingMission.id
                ? { ...m, ...formData, status: formData.enabled ? "active" : "paused" }
                : m
            )
          );
        }
      } else {
        // Create new — la route POST attend `input` + `schedule`, pas `prompt` + `frequency`
        const schedule =
          formData.frequency === "custom"
            ? (formData.customCron ?? "")
            : CRON_SCHEDULES[formData.frequency];
        const res = await fetch("/api/v2/missions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            input: formData.prompt,
            schedule,
            enabled: formData.enabled,
          }),
        });
        if (res.ok) {
          const newMission = await res.json();
          setMissions((prev) => [...prev, {
            ...newMission.mission,
            frequency: formData.frequency,
          }]);
        }
      }
      setShowEditor(false);
      setEditingMission(null);
    } catch (error) {
      console.error("Failed to save mission:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (missionId: string) => {
    if (!confirm("Supprimer cette mission ?")) return;
    try {
      const res = await fetch(`/api/v2/missions/${missionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMissions((prev) => prev.filter((m) => m.id !== missionId));
        toast.success("Mission supprimée", "La mission a été retirée");
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast.error("Suppression impossible", data.error ?? `Erreur serveur (${res.status})`);
    } catch (error) {
      console.error("Failed to delete mission:", error);
      toast.error(
        "Erreur de suppression",
        error instanceof Error ? error.message : "Erreur réseau",
      );
    }
  };

  const handleToggle = async (mission: Mission) => {
    try {
      const res = await fetch(`/api/v2/missions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mission.id, enabled: !mission.enabled }),
      });
      if (res.ok) {
        setMissions((prev) =>
          prev.map((m) =>
            m.id === mission.id
              ? { ...m, enabled: !m.enabled, status: !m.enabled ? "active" : "paused" }
              : m
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle mission:", error);
    }
  };

  const handleRunNow = async (missionId: string) => {
    try {
      const res = await fetch(`/api/v2/missions/${missionId}/run`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Mission lancée", "La mission a été démarrée avec succès");
      } else {
        const data = await res.json();
        toast.error("Échec du lancement", data.error || "Impossible de lancer la mission");
      }
    } catch (error) {
      console.error("Failed to run mission:", error);
      toast.error("Erreur de lancement", "Une erreur est survenue");
    }
  };

  const openNewMission = () => {
    setEditingMission(null);
    setShowEditor(true);
  };

  const openEditMission = (mission: Mission) => {
    setEditingMission(mission);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingMission(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8" style={{ background: "var(--bg)" }}>
        <p className="ghost-meta-label">LOAD_MISSIONS</p>
        <div className="w-full max-w-xs space-y-2">
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-6">
        <Breadcrumb trail={[{ label: "Hearst", href: "/" }, { label: "Missions" }] as Crumb[]} className="mb-4" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="t-34 font-semibold tracking-[-0.025em] mb-1">Missions</h1>
            <p className="t-11 font-mono uppercase tracking-display text-[var(--text-muted)]">Automatisations planifiées</p>
          </div>
          <button type="button" onClick={openNewMission} className="font-mono t-10 uppercase tracking-[0.16em] text-[var(--cykan)] border-b border-[var(--cykan)] pb-[2px] bg-transparent hover:text-[var(--text)] hover:border-[var(--text)] transition-colors">
            Nouvelle mission
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 t-9">
            <span className="w-2 h-2 rounded-pill bg-[var(--money)]" />
            <span className="text-[var(--text-muted)]">{missions.filter((m) => m.enabled).length} activées</span>
          </div>
          <div className="flex items-center gap-2 t-9">
            <span className="w-2 h-2 rounded-pill bg-[var(--cykan)] animate-pulse" />
            <span className="text-[var(--text-muted)]">{missions.filter((m) => m.opsStatus === "running").length} en cours</span>
          </div>
          <div className="flex items-center gap-2 t-9">
            <span className="w-2 h-2 rounded-pill bg-[var(--danger)]" />
            <span className="text-[var(--text-muted)]">{missions.filter((m) => m.opsStatus === "failed").length} échecs</span>
          </div>
          <div className="flex items-center gap-2 t-9">
            <span className="w-2 h-2 rounded-pill bg-[var(--warn)]" />
            <span className="text-[var(--text-muted)]">{missions.filter((m) => m.opsStatus === "blocked").length} bloqués</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {missions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
            <p className="ghost-meta-label">Registre vide</p>
            <h2 className="t-34 font-semibold tracking-[-0.025em]">Aucune mission</h2>
            <p className="t-13 font-light leading-relaxed text-[var(--text-muted)] max-w-md">
              Les missions sont des tâches récurrentes planifiées. Exécution automatique selon calendrier.
            </p>
            <button type="button" onClick={openNewMission} className="font-mono t-10 uppercase tracking-[0.16em] text-[var(--cykan)] border-b border-[var(--cykan)] pb-[2px] bg-transparent hover:text-[var(--text)] hover:border-[var(--text)] transition-colors">
              Créer la première
            </button>
          </div>
        ) : (
          <div className="border-t border-[var(--line)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 gap-y-0 px-2 py-3 t-9 font-mono uppercase tracking-display text-[var(--text-faint)] border-b border-[var(--border-soft)]">
              <span>ID_REF / Descriptor</span>
              <span className="text-right">STATUS_OPS</span>
              <span className="text-right">CMD</span>
            </div>
            {missions.map((mission) => {
              const effectiveOpsStatus = mission.opsStatus || "idle";
              const statusLine =
                effectiveOpsStatus === "running"
                  ? "border-[var(--cykan)] text-[var(--cykan)]"
                  : effectiveOpsStatus === "success"
                    ? "border-[var(--money)] text-[var(--money)]"
                    : effectiveOpsStatus === "failed"
                      ? "border-[var(--danger)] text-[var(--danger)]"
                      : effectiveOpsStatus === "blocked"
                        ? "border-[var(--warn)] text-[var(--warn)]"
                        : "border-[var(--line-strong)] text-[var(--text-muted)]";

              const opsStatusLabel =
                effectiveOpsStatus === "running"
                  ? "RUN"
                  : effectiveOpsStatus === "success"
                    ? "OK"
                    : effectiveOpsStatus === "failed"
                      ? "FAIL"
                      : effectiveOpsStatus === "blocked"
                        ? "BLOCK"
                        : "IDLE";

              return (
                <div
                  key={mission.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 items-start py-6 border-b border-[var(--border-soft)] px-2 group transition-colors"
                >
                  <div className="min-w-0 flex gap-4">
                    <button
                      type="button"
                      onClick={() => handleToggle(mission)}
                      className={`w-2 h-2 rounded-pill mt-1 shrink-0 transition-colors ${
                        mission.enabled ? "bg-[var(--money)]" : "bg-[var(--text-faint)]"
                      }`}
                      title={mission.enabled ? "Désactiver" : "Activer"}
                      aria-label={mission.enabled ? "Désactiver" : "Activer"}
                    />
                    <button
                      type="button"
                      onClick={() => handleRowOpen(mission)}
                      className="min-w-0 text-left group/open cursor-pointer"
                      title={`Open ${mission.name}`}
                    >
                      <p className="font-mono t-9 uppercase tracking-display text-[var(--text-faint)] mb-1">ID_REF: {mission.id.slice(0, 8)}</p>
                      <h3 className="t-13 font-medium text-[var(--text)] tracking-tight group-hover/open:text-[var(--cykan)] group-hover/open:halo-cyan-sm transition-colors">{mission.name}</h3>
                      <p className="t-11 font-light leading-relaxed text-[var(--text-muted)] mt-1">{mission.description}</p>
                      {mission.lastError && (
                        <p className="t-10 font-mono text-[var(--danger)] truncate mt-2 border-b border-[var(--danger)] pb-0.5 inline-block max-w-full" title={mission.lastError}>
                          ERR_LOG: {mission.lastError}
                        </p>
                      )}
                    </button>
                  </div>
                  <div className="text-right space-y-2">
                    <span className={`inline-block font-mono t-9 uppercase tracking-label border-b pb-0.5 ${statusLine}`}>
                      STATUS_{opsStatusLabel}
                    </span>
                    <div className="t-10 font-mono text-[var(--text-faint)] space-y-1">
                      <div>{mission.frequency}</div>
                      {mission.runningSince && (
                        <div className="text-[var(--cykan)]">ELAPSED_{Math.floor((currentTime - mission.runningSince) / 1000)}S</div>
                      )}
                      {mission.nextRun && <div>NEXT_{new Date(mission.nextRun).toLocaleDateString()}</div>}
                    </div>
                  </div>
                  <div className="flex items-start justify-end gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleRunNow(mission.id)}
                      disabled={mission.opsStatus === "running"}
                      className="p-2 text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Exécuter maintenant"
                    >
                      <GhostIconPlay className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditMission(mission)}
                      className="p-2 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                      title="Modifier"
                    >
                      <GhostIconPencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(mission.id)}
                      className="p-2 text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
                      title="Supprimer"
                    >
                      <GhostIconTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor — drawer depuis la droite */}
      {showEditor && (
        <>
        <div className="ghost-overlay-backdrop z-[60]" onClick={closeEditor} />
        <div
          className="fixed top-0 right-0 bottom-0 z-[61] flex flex-col overflow-y-auto pointer-events-auto"
          style={{ width: "clamp(320px, 36vw, 520px)", background: "var(--bg-rail)", borderLeft: "1px solid var(--border-shell)" }}
          onClick={(e) => e.stopPropagation()}
        >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8 border-b border-[var(--line)] pb-4">
                <h2 className="ghost-title-impact">
                  {editingMission ? "Modifier la mission" : "Nouvelle mission"}
                </h2>
                <button type="button" onClick={closeEditor} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1" aria-label="Fermer">
                  <GhostIconX className="w-5 h-5" />
                </button>
              </div>
              <MissionEditor
                initialData={
                  editingMission
                    ? {
                        name: editingMission.name,
                        description: editingMission.description,
                        prompt: editingMission.input || "",
                        frequency: editingMission.frequency as "daily" | "weekly" | "monthly" | "custom",
                        enabled: editingMission.enabled,
                      }
                    : undefined
                }
                onSave={handleSave}
                onCancel={closeEditor}
                isLoading={isSaving}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function MissionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center min-h-[min(50vh,var(--space-32))] px-(--space-8)">
          <p className="t-13 text-text-muted">Chargement des missions…</p>
        </div>
      }
    >
      <MissionsPageContent />
    </Suspense>
  );
}
