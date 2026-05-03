// lint-visual-disable-file
"use client";

/**
 * HaloAgentCore — Constellation 3D des agents Hearst.
 *
 * Orchestrateur cockpit : chaque agent est cliquable, route vers son Stage
 * dédié ou la page métier. Clic → press (scale dip + flash cykan) puis
 * dispatch.
 *
 * Caméra et orbite recalculées selon la taille du canvas (responsive).
 * Couleurs lues depuis les tokens DS (--cykan, --gold, --text-l1, --text-muted).
 * Auto-rotation lente, pause au hover. Shadows allégées pour stabilité GPU.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useStageStore, type StagePayload } from "@/stores/stage";
import {
  RoundedBox,
  Html,
  ContactShadows,
  Line,
  PerspectiveCamera,
  Float,
  AdaptiveDpr,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";

export type HaloAgentId =
  | "mission-planner"
  | "data-miner"
  | "report-generator"
  | "market-watch"
  | "asset-monitor"
  | "memory-knowledge";

export interface HaloAgentDef {
  id: HaloAgentId;
  label: string;
  desc: string;
  /** Position angulaire (deg). 0 = +X, 90 = +Z (face camera). */
  angleDeg: number;
  /** Couleur de la sphère centrale. */
  tone: "primary" | "accent";
}

export const HALO_AGENTS_V1: readonly HaloAgentDef[] = [
  { id: "mission-planner",  label: "Mission Planner",    desc: "Planifie et structure\nles objectifs stratégiques", angleDeg: -90, tone: "primary" },
  { id: "report-generator", label: "Report Generator",   desc: "Analyse et synthétise\nles données en rapports",   angleDeg: -30, tone: "accent"  },
  { id: "asset-monitor",    label: "Asset Monitor",      desc: "Surveille et protège\nles actifs en temps réel",   angleDeg:  30, tone: "primary" },
  { id: "memory-knowledge", label: "Memory & Knowledge", desc: "Connecte et active\nl'intelligence collective",     angleDeg:  90, tone: "accent"  },
  { id: "market-watch",     label: "Market Watch",       desc: "Anticipe les tendances\net signaux faibles",        angleDeg: 150, tone: "primary" },
  { id: "data-miner",       label: "Data Miner",         desc: "Transforme les données\nen insights actionnables",  angleDeg: 210, tone: "accent"  },
] as const;

if (typeof window !== "undefined") {
  for (const a of HALO_AGENTS_V1) {
    useGLTF.preload(`/models/${a.id}.glb`);
  }
}

type ThemeMode = "light" | "dark";

interface ThemeColors {
  mode: ThemeMode;
  cykan: string;
  gold: string;
  /** Couleur principale des socles + tour. Inversée selon mode. */
  pedestal: string;
  /** Couleur des satellites (sphères secondaires). */
  satellite: string;
  /** Couleur du badge H (fond). */
  badgeBg: string;
  /** Couleur du badge H (texte). */
  badgeText: string;
  /** Couleur des labels HTML. */
  text: string;
  textMuted: string;
}

const FALLBACK_COLORS: ThemeColors = {
  mode: "light",
  cykan: "#2DD4BF",
  gold: "#C8A961",
  pedestal: "#FFFFFF",
  satellite: "#E5E7EB",
  badgeBg: "#FFFFFF",
  badgeText: "#1C1D20",
  text: "rgba(20, 20, 25, 0.85)",
  textMuted: "rgba(20, 20, 25, 0.55)",
};

function readThemeColors(mode: ThemeMode): ThemeColors {
  const get = (key: string, fallback: string) => {
    if (typeof document === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    return v.length > 0 ? v : fallback;
  };

  const cykan = get("--cykan", "#2DD4BF");
  const gold = get("--gold", "#C8A961");
  const text = get("--text-l1", mode === "light" ? "rgba(20, 20, 25, 0.85)" : "rgba(255, 255, 255, 0.78)");
  const textMuted = get("--text-muted", mode === "light" ? "rgba(20, 20, 25, 0.55)" : "rgba(255, 255, 255, 0.55)");

  return {
    mode,
    cykan,
    gold,
    pedestal: get("--bg-elev", mode === "light" ? "#FAFAFB" : "#3A3A44"),
    satellite: get("--text-decor-25", mode === "light" ? "rgba(28, 29, 32, 0.25)" : "rgba(255, 255, 255, 0.25)"),
    badgeBg: get("--surface", mode === "light" ? "#FFFFFF" : "#111111"),
    badgeText: cykan,
    text,
    textMuted,
  };
}

const colorsByMode = new Map<ThemeMode, ThemeColors>();

function getColorsSnapshot(mode: ThemeMode): ThemeColors {
  let cached = colorsByMode.get(mode);
  if (!cached) {
    cached = readThemeColors(mode);
    colorsByMode.set(mode, cached);
  }
  return cached;
}

function subscribeColors(): () => void {
  return () => {};
}

function useThemeColors(mode: ThemeMode): ThemeColors {
  return useSyncExternalStore(
    subscribeColors,
    () => getColorsSnapshot(mode),
    () => FALLBACK_COLORS,
  );
}

interface ResponsiveLayout {
  orbitRadius: number;
  cameraPos: [number, number, number];
  fov: number;
  isCompact: boolean;
}

function useResponsiveLayout(): ResponsiveLayout {
  const { size } = useThree();
  const width = size.width;
  return useMemo<ResponsiveLayout>(() => {
    const isCompact = width < 720;
    const isXL = width >= 1400;
    const orbitRadius = isCompact ? 7 : isXL ? 11 : 9.5;
    const camY = orbitRadius * 1.7;
    const camZ = orbitRadius * 2.55;
    const fov = isCompact ? 38 : 30;
    return {
      orbitRadius,
      cameraPos: [0, camY, camZ],
      fov,
      isCompact,
    };
  }, [width]);
}

// --- Materials ---------------------------------------------------------------

function useMaterials(colors: ThemeColors) {
  return useMemo(() => {
    const isLight = colors.mode === "light";

    // Standard partout : pas de clearcoat / transmission, ~3× moins de coût
    // shader que MeshPhysicalMaterial. Suffit pour un look céramique propre.
    const surface = new THREE.MeshStandardMaterial({
      color: "#FAFAFB",
      roughness: 0.32,
      metalness: 0.08,
    });

    const surfaceMuted = new THREE.MeshStandardMaterial({
      color: "#E5E7EB",
      roughness: 0.55,
      metalness: 0,
    });

    const silverIcon = new THREE.MeshStandardMaterial({
      color: "#E2E8F0",
      roughness: 0.28,
      metalness: 0.85,
    });

    const cykanCore = new THREE.MeshStandardMaterial({
      color: colors.cykan,
      roughness: 0.22,
      metalness: 0.4,
      emissive: colors.cykan,
      emissiveIntensity: isLight ? 0.35 : 0.7,
    });

    const goldCore = new THREE.MeshStandardMaterial({
      color: colors.gold,
      roughness: 0.2,
      metalness: 0.7,
      emissive: colors.gold,
      emissiveIntensity: isLight ? 0.4 : 0.9,
    });

    const cykanGlow = new THREE.MeshBasicMaterial({
      color: colors.cykan,
      transparent: true,
      opacity: isLight ? 0.22 : 0.32,
    });

    return { surface, surfaceMuted, silverIcon, cykanCore, goldCore, cykanGlow };
  }, [colors]);
}

type Materials = ReturnType<typeof useMaterials>;

// --- Pedestal (un agent) -----------------------------------------------------

interface PedestalProps {
  agent: HaloAgentDef;
  isHovered: boolean;
  isPressed: boolean;
  onHover: (id: HaloAgentId | null) => void;
  onActivate: (id: HaloAgentId) => void;
  materials: Materials;
  colors: ThemeColors;
  orbitRadius: number;
}

function AgentPedestal({ agent, isHovered, isPressed, onHover, onActivate, materials, colors, orbitRadius }: PedestalProps) {
  const rad = (agent.angleDeg * Math.PI) / 180;
  const x = Math.cos(rad) * orbitRadius;
  const z = Math.sin(rad) * orbitRadius;

  const baseRef = useRef<THREE.Group>(null);
  const iconRef = useRef<THREE.Group>(null);
  const iconMat = materials.silverIcon;

  const { scene } = useGLTF(`/models/${agent.id}.glb`);
  const clonedScene = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = iconMat;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return root;
  }, [scene, iconMat]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (baseRef.current) {
      // Lift au hover, dip bref au press
      const targetY = isPressed ? -0.12 : isHovered ? 0.45 : 0;
      baseRef.current.position.y += (targetY - baseRef.current.position.y) * d * 14;
      const targetScale = isPressed ? 0.94 : 1;
      const cur = baseRef.current.scale.x;
      const next = cur + (targetScale - cur) * d * 14;
      baseRef.current.scale.setScalar(next);
    }
    if (iconRef.current) {
      iconRef.current.rotation.y += d * (isHovered ? 1.2 : 0.25);
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 1, 0]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(agent.id);
          if (typeof document !== "undefined") document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
          if (typeof document !== "undefined") document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onActivate(agent.id);
        }}
      >
        <boxGeometry args={[3.6, 4, 3.6]} />
        <meshBasicMaterial />
      </mesh>

      <group ref={baseRef}>
        <RoundedBox
          args={[2.4, 0.35, 2.4]}
          radius={0.15}
          smoothness={4}
          material={materials.surface}
          castShadow
          receiveShadow
        />

        {(isHovered || isPressed) && (
          <mesh position={[0, -0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.4, isPressed ? 1.85 : 1.6, 48]} />
            <primitive object={materials.cykanGlow} attach="material" />
          </mesh>
        )}

        <group ref={iconRef} position={[0, 0.5, 0]}>
          <primitive object={clonedScene} scale={isHovered ? 1.4 : 1.2} />
          
          {/* On garde les petits satellites pour le style Hearst */}
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8]}
                castShadow
              >
                <sphereGeometry args={[0.1, 16, 16]} />
                <primitive object={materials.surfaceMuted} attach="material" />
              </mesh>
            );
          })}
        </group>
      </group>

      <Html
        position={[0, -0.7, 0]}
        center
        zIndexRange={[100, 0]}
        wrapperClass="halo-agent-label-wrap"
      >
        <div
          className="halo-agent-label"
          data-active={isHovered ? "true" : "false"}
          style={{ color: colors.text }}
        >
          <span className="halo-agent-label-name">{agent.label}</span>
          <span className="halo-agent-label-desc" style={{ color: colors.textMuted }}>
            {agent.desc}
          </span>
        </div>
      </Html>
    </group>
  );
}

// --- Center core -------------------------------------------------------------

function CenterCore({ materials, colors }: { materials: Materials; colors: ThemeColors }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      const scale = 1 + Math.sin(t * 1.2) * 0.02;
      groupRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.4} rotationIntensity={0.05} floatIntensity={0.1}>
        <group position={[0, -0.2, 0]}>
          <RoundedBox args={[3.2, 0.25, 3.2]} radius={0.2} material={materials.surface} castShadow receiveShadow />
          <RoundedBox args={[2.4, 0.2, 2.4]} radius={0.15} position={[0, 0.22, 0]} material={materials.surface} castShadow receiveShadow />
          <RoundedBox args={[1.6, 0.15, 1.6]} radius={0.1} position={[0, 0.4, 0]} material={materials.surface} castShadow receiveShadow />
        </group>
      </Float>

      <Html position={[0, 0.8, 0]} center zIndexRange={[100, 0]} wrapperClass="halo-core-badge-wrap">
        <div
          className="halo-core-badge"
          data-mode={colors.mode}
          style={{
            color: colors.badgeText,
            backgroundColor: colors.badgeBg,
            borderColor: colors.cykan,
          }}
        >
          H
        </div>
      </Html>
    </group>
  );
}

// --- Orbit -------------------------------------------------------------------

function OrbitTrack({ orbitRadius, colors }: { orbitRadius: number; colors: ThemeColors }) {
  const orbitPoints = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 96;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
    }
    return points;
  }, [orbitRadius]);

  // THREE.Color n'accepte pas le hex à alpha (#RRGGBBAA) ni rgba(),
  // donc on extrait un hex pur depuis le DS et on contrôle l'alpha via `opacity`.
  return (
    <Line
      points={orbitPoints}
      color={colors.mode === "light" ? "#E5E7EB" : "#FFFFFF"}
      lineWidth={1}
      opacity={colors.mode === "light" ? 0.55 : 0.22}
      transparent
    />
  );
}

// --- Camera ------------------------------------------------------------------

function ResponsiveCamera({ layout }: { layout: ResponsiveLayout }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  // PerspectiveCamera de drei ne fait pas de lookAt auto : on le force vers
  // l'origine sinon les agents (au plan y=0) sont sous le frustum.
  useEffect(() => {
    cameraRef.current?.lookAt(0, 0, 0);
  }, [layout.cameraPos, layout.fov]);
  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={layout.cameraPos}
      fov={layout.fov}
      near={1}
      far={120}
    />
  );
}

// --- Auto-rotation -----------------------------------------------------------

function AutoRotateGroup({ children, paused }: { children: ReactNode; paused: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current && !paused) {
      ref.current.rotation.y += Math.min(delta, 0.05) * 0.05;
    }
  });
  return <group ref={ref}>{children}</group>;
}

// --- Scene -------------------------------------------------------------------

interface SceneProps {
  mode: ThemeMode;
  pressedId: HaloAgentId | null;
  onActivate: (id: HaloAgentId) => void;
}

function Scene({ mode, pressedId, onActivate }: SceneProps) {
  const colors = useThemeColors(mode);
  const materials = useMaterials(colors);
  const layout = useResponsiveLayout();
  const [hoveredId, setHoveredId] = useState<HaloAgentId | null>(null);

  return (
    <Suspense fallback={null}>
      <ResponsiveCamera layout={layout} />

      {/* Lights — pas d'Environment HDRI (lourd à charger + au shading).
          On compense avec un trio key/fill/rim qui donne assez de relief
          aux MeshStandardMaterial sans IBL. */}
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[10, 14, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.001}
      />
      <directionalLight position={[-8, 6, -10]} intensity={0.45} />
      <pointLight position={[0, -4, 0]} color={colors.cykan} intensity={0.6} distance={18} />

      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.14}
        scale={36}
        blur={1.6}
        far={4}
        resolution={512}
        color="#000000"
      />

      <AutoRotateGroup paused={hoveredId !== null || pressedId !== null}>
        <CenterCore materials={materials} colors={colors} />
        <OrbitTrack orbitRadius={layout.orbitRadius} colors={colors} />
        {HALO_AGENTS_V1.map((agent) => (
          <AgentPedestal
            key={agent.id}
            agent={agent}
            isHovered={hoveredId === agent.id}
            isPressed={pressedId === agent.id}
            onHover={setHoveredId}
            onActivate={onActivate}
            materials={materials}
            colors={colors}
            orbitRadius={layout.orbitRadius}
          />
        ))}
      </AutoRotateGroup>
    </Suspense>
  );
}

// --- Orchestration -----------------------------------------------------------

/**
 * Mapping agent → action. Stage natif quand le sub-Stage existe et a du sens
 * pour la fonction de l'agent ; sinon route vers la page métier dédiée.
 */
function dispatchAgent(
  id: HaloAgentId,
  ctx: {
    setMode: (p: StagePayload) => void;
    push: (href: string) => void;
    lastMissionId: string | null;
  },
) {
  switch (id) {
    case "mission-planner":
      // Reprend la dernière mission ouverte ; sinon ouvre le builder.
      if (ctx.lastMissionId) ctx.setMode({ mode: "mission", missionId: ctx.lastMissionId });
      else ctx.push("/missions/builder");
      return;
    case "report-generator":
      // Reports a un studio dédié hors Stage system.
      ctx.push("/reports");
      return;
    case "data-miner":
      // Exploration de données → KG avec query d'amorce.
      ctx.setMode({ mode: "kg", query: "data exploration" });
      return;
    case "market-watch":
      // Pas de browserStage sans sessionId valide ; marketplace est l'entrée.
      ctx.push("/marketplace");
      return;
    case "asset-monitor":
      // Liste des connexions / apps surveillées.
      ctx.push("/apps");
      return;
    case "memory-knowledge":
      ctx.setMode({ mode: "kg" });
      return;
  }
}

// --- Public component --------------------------------------------------------

interface HaloAgentCoreProps {
  mode?: ThemeMode;
}

export function HaloAgentCore({ mode = "dark" }: HaloAgentCoreProps = {}) {
  const router = useRouter();
  const setMode = useStageStore((s) => s.setMode);
  const lastMissionId = useStageStore((s) => s.lastMissionId);
  const [pressedId, setPressedId] = useState<HaloAgentId | null>(null);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onActivate = useCallback(
    (id: HaloAgentId) => {
      // Press visible 320ms (scale dip + halo flash) avant le dispatch ;
      // donne du feedback même quand l'action est instantanée (Stage switch).
      setPressedId(id);
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = setTimeout(() => {
        setPressedId(null);
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
    >
      <Canvas
        shadows="basic"
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          stencil: false,
        }}
        dpr={[1, 1.5]}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <AdaptiveDpr pixelated={false} />
        <Scene mode={mode} pressedId={pressedId} onActivate={onActivate} />
      </Canvas>
    </section>
  );
}
