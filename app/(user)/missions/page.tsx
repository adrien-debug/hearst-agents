"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MissionEditor } from "../components/MissionEditor";
import { toast } from "@/app/hooks/use-toast";
import { usePollingEffect } from "@/app/hooks/use-polling-effect";
import { GhostIconX } from "../components/ghost-icons";
import { useStageStore } from "@/stores/stage";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal";
import { Action, EmptyState, RowSkeleton } from "../components/ui";
import { MissionRow, type Mission, type MissionOpsStatus } from "../components/missions/MissionRow";

function MissionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(() => searchParams.get("new") === "1");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [confirmDelete, setConfirmDelete] = useState<Mission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      router.replace("/missions");
    }
  }, [searchParams, router]);

  const handleRowOpen = (mission: Mission) => {
    // Stage polymorphe : ouvrir le MissionStage dédié (rendu par
    // Stage.tsx quand mode === "mission"). Pattern aligné sur
    // GeneralDashboard.handleMissionClick.
    useStageStore.getState().setMode({ mode: "mission", missionId: mission.id });
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
  }, []);

  // Refresh ops status toutes les 5s — silencieux en cas d'erreur réseau
  usePollingEffect(async () => {
    try {
      const res = await fetch("/api/v2/missions/ops");
      if (!res.ok) return;
      const opsData = await res.json();
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
    } catch (err) {
      console.error("[MissionsPage] Background ops refresh failed:", err);
    }
  }, 5000);

  // Update current time toutes les secondes pour le compteur "running"
  usePollingEffect(() => setCurrentTime(Date.now()), 1000);

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

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const missionId = confirmDelete.id;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v2/missions/${missionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMissions((prev) => prev.filter((m) => m.id !== missionId));
        toast.success("Mission supprimée", "La mission a été retirée");
        setConfirmDelete(null);
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
    } finally {
      setIsDeleting(false);
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
      <div className="flex-1 overflow-y-auto px-12 py-6" style={{ background: "var(--bg-elev)" }}>
        <RowSkeleton count={5} height="var(--space-16)" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-elev)" }}>
      <PageHeader
        title="Missions"
        subtitle="Automatisations planifiées"
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Missions" }]}
        actions={
          <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
            <Action variant="link" tone="neutral" onClick={() => router.push("/missions/builder")}>
              Builder visuel
            </Action>
            <Action variant="link" tone="brand" onClick={openNewMission}>
              Nouvelle mission
            </Action>
          </div>
        }
      />

      {/* Stats — chips visibles uniquement si compteur > 0, pour éviter le bruit
          des "0 en cours · 0 échecs · 0 bloqués" qui saturait l'écran à vide. */}
      {(() => {
        const stats = [
          { count: missions.filter((m) => m.enabled).length, label: "activées", color: "var(--money)" as const, pulse: false },
          { count: missions.filter((m) => m.opsStatus === "running").length, label: "en cours", color: "var(--cykan)" as const, pulse: true },
          { count: missions.filter((m) => m.opsStatus === "failed").length, label: "échecs", color: "var(--danger)" as const, pulse: false },
          { count: missions.filter((m) => m.opsStatus === "blocked").length, label: "bloqués", color: "var(--warn)" as const, pulse: false },
        ].filter((s) => s.count > 0);
        if (stats.length === 0) return null;
        return (
          <div className="flex items-center gap-4 px-12 py-4 border-b border-[var(--border-shell)]">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2 t-9">
                <span
                  className={`w-2 h-2 rounded-pill ${s.pulse ? "animate-pulse" : ""}`}
                  style={{ background: s.color }}
                />
                <span className="text-[var(--text-muted)]">{s.count} {s.label}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-12 py-6">
        {missions.length === 0 ? (
          <EmptyState
            title="Aucune mission"
            description="Les missions sont des tâches récurrentes planifiées. Exécution automatique selon calendrier."
            cta={{ label: "Créer la première", onClick: openNewMission }}
          />
        ) : (
          <div className="border-t border-[var(--line)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 gap-y-0 px-2 py-3 t-11 font-medium text-[var(--text-l1)] border-b border-[var(--border-soft)]">
              <span>Référence</span>
              <span className="text-right">État</span>
              <span className="text-right">Actions</span>
            </div>
            {missions.map((mission) => (
              <MissionRow
                key={mission.id}
                mission={mission}
                currentTime={currentTime}
                onToggle={handleToggle}
                onOpen={handleRowOpen}
                onEdit={openEditMission}
                onRunNow={handleRunNow}
                onDelete={setConfirmDelete}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer cette mission ?"
        description={confirmDelete ? `« ${confirmDelete.name} » sera supprimée définitivement. Cette action est irréversible.` : undefined}
        confirmLabel="Supprimer"
        variant="danger"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Editor — drawer depuis la droite */}
      {showEditor && (
        <>
        <div className="ghost-overlay-backdrop z-[60]" onClick={closeEditor} />
        <div
          className="fixed top-0 right-0 bottom-0 z-[61] flex flex-col overflow-y-auto pointer-events-auto"
          style={{ width: "clamp(320px, 36vw, 520px)", background: "var(--rail)", borderLeft: "1px solid var(--border-shell)" }}
          onClick={(e) => e.stopPropagation()}
        >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8 border-b border-[var(--line)] pb-4">
                <h2 className="t-15 font-medium tracking-tight text-[var(--text)]">
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
