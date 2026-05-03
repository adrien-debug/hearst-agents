"use client";

/**
 * HaloAgentCore — Constellation des agents Hearst (Spline runtime).
 *
 * Le rendu 3D est délégué à Spline (scène designer-friendly, exportée depuis
 * spline.design). Le câblage métier reste ici :
 * - `dispatchAgent` mappe chaque agent à un Stage / route
 * - press feedback (scale dip 240 ms) via manipulation directe de l'objet Spline
 *
 * Le contrat avec la scène Spline : les 6 groupes parents doivent être nommés
 * `pilot` / `scribe` / `delve` / `pulse` / `warden` / `cortex` (kebab strict,
 * minuscules). C'est sur ces noms que `e.target.name` matche.
 */

import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Application, SPEObject } from "@splinetool/runtime";
import { useStageStore, type StagePayload } from "@/stores/stage";

// SSR-safe : Spline manipule WebGL au mount.
const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => <HaloPlaceholder kind="loading" />,
});

const SPLINE_SCENE_URL =
  "https://prod.spline.design/NdXjSGGZFpZ2L6dl/scene.splinecode";

export type HaloAgentId =
  | "pilot"
  | "scribe"
  | "delve"
  | "pulse"
  | "warden"
  | "cortex";

const HALO_AGENT_IDS: readonly HaloAgentId[] = [
  "pilot",
  "scribe",
  "delve",
  "pulse",
  "warden",
  "cortex",
] as const;

function isHaloAgentId(name: string | undefined): name is HaloAgentId {
  return typeof name === "string" && (HALO_AGENT_IDS as readonly string[]).includes(name);
}

// Mapping temporaire jusqu'à ce que les objets Spline soient renommés.
// Ordre dérivé de getAllObjects() : Block 6 → 1 visible dans la scène.
const BLOCK_TO_AGENT: Record<string, HaloAgentId> = {
  "Block 1": "pilot",
  "Block 2": "scribe",
  "Block 3": "delve",
  "Block 4": "pulse",
  "Block 5": "warden",
  "Block 6": "cortex",
};

function resolveAgentId(name: string | undefined): HaloAgentId | null {
  if (!name) return null;
  if (isHaloAgentId(name)) return name;
  return BLOCK_TO_AGENT[name] ?? null;
}

// --- Orchestration -----------------------------------------------------------

function dispatchAgent(
  id: HaloAgentId,
  ctx: {
    setMode: (p: StagePayload) => void;
    push: (href: string) => void;
    lastMissionId: string | null;
  },
) {
  switch (id) {
    case "pilot":
      if (ctx.lastMissionId) ctx.setMode({ mode: "mission", missionId: ctx.lastMissionId });
      else ctx.push("/missions/builder");
      return;
    case "scribe":
      ctx.push("/reports");
      return;
    case "delve":
      ctx.setMode({ mode: "kg", query: "data exploration" });
      return;
    case "pulse":
      ctx.push("/marketplace");
      return;
    case "warden":
      ctx.push("/apps");
      return;
    case "cortex":
      ctx.setMode({ mode: "kg" });
      return;
  }
}

// --- Scene adjustments -------------------------------------------------------

function applySceneAdjustments(app: Application) {
  // Grille → invisible
  const grid = app.findObjectByName("Grid");
  if (grid) grid.visible = false;

  // Fond = couleur exacte du cockpit --bg (#050709) pour ne pas transparaître
  // de différence de rendu à la jointure canvas/layout.
  app.setBackgroundColor?.("#050709");

  // Caméra : angle trop zénithal dans l'export par défaut.
  // Vue 3/4 haut (style isométrique référence) :
  //   - on recule en Z pour voir toute la constellation
  //   - on baisse Y pour réduire le plongeon
  //   - on réduit rotation.x (inclinaison) pour plus de perspective latérale
  const cam = app.findObjectByName("Camera");
  if (cam) {
    cam.position.y = cam.position.y * 0.58;
    cam.position.z = cam.position.z * 1.45;
    cam.rotation.x = cam.rotation.x * 0.50;
  }
}

// --- Public component --------------------------------------------------------

export function HaloAgentCore() {
  const router = useRouter();
  const setMode = useStageStore((s) => s.setMode);
  const lastMissionId = useStageStore((s) => s.lastMissionId);

  const splineRef = useRef<Application | null>(null);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  const onActivate = useCallback(
    (id: HaloAgentId) => {
      // Press visible : scale dip 240 ms sur le pédestal cliqué via l'API Spline.
      const app = splineRef.current;
      const target: SPEObject | undefined = app?.findObjectByName(id);
      if (target) {
        const sx = target.scale.x;
        const sy = target.scale.y;
        const sz = target.scale.z;
        target.scale.x = sx * 0.94;
        target.scale.y = sy * 0.94;
        target.scale.z = sz * 0.94;
        if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
        pressTimeoutRef.current = setTimeout(() => {
          target.scale.x = sx;
          target.scale.y = sy;
          target.scale.z = sz;
        }, 220);
      }

      // Dispatch après le press visible (240 ms ≈ feedback humainement perceptible).
      setTimeout(() => {
        dispatchAgent(id, {
          setMode,
          push: (href) => router.push(href),
          lastMissionId,
        });
      }, 240);
    },
    [router, setMode, lastMissionId],
  );

  useEffect(() => {
    return () => {
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      if (typeof document !== "undefined") document.body.style.cursor = "";
    };
  }, []);

  return (
    <section
      className="halo-agent-core relative h-full w-full select-none"
      aria-label="Système agentique Hearst"
      onMouseLeave={() => {
        if (typeof document !== "undefined") document.body.style.cursor = "";
      }}
    >
      {!ready && <HaloPlaceholder kind="loading" />}
      <SplineErrorBoundary fallback={<HaloPlaceholder kind="error" />}>
        <Spline
          scene={SPLINE_SCENE_URL}
          onLoad={(app) => {
            splineRef.current = app;
            applySceneAdjustments(app);
            setReady(true);
          }}
          onSplineMouseDown={(e) => {
            const id = resolveAgentId(e.target?.name);
            if (id) onActivate(id);
          }}
          onSplineMouseHover={(e) => {
            const id = resolveAgentId(e.target?.name);
            if (id && typeof document !== "undefined") {
              document.body.style.cursor = "pointer";
            }
          }}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      </SplineErrorBoundary>
    </section>
  );
}

function HaloPlaceholder({ kind }: { kind: "loading" | "error" }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ color: "var(--text-faint)", padding: "var(--space-6)", textAlign: "center" }}
      aria-hidden="true"
    >
      <span className="t-11 font-light">
        {kind === "loading"
          ? "Chargement de la constellation…"
          : "Constellation indisponible — vérifie l'URL Spline (.splinecode requis)."}
      </span>
    </div>
  );
}

/**
 * Le runtime Spline crash hard ("Data read, but end of buffer not reached")
 * quand on lui donne une URL non-binaire (ex: my.spline.design preview).
 * Cet ErrorBoundary contient le crash pour qu'il ne casse pas le cockpit
 * entier.
 */
class SplineErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[HaloAgentCore] Spline runtime error:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
