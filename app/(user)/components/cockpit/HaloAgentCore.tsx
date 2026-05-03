// lint-visual-disable-file
"use client";

/**
 * HaloAgentCore — Constellation 3D des agents Hearst.
 *
 * Caméra et orbite recalculées selon la taille du canvas (responsive).
 * Couleurs lues depuis les tokens DS (--cykan, --gold, --text-l1, --text-muted).
 * Auto-rotation lente, pause au hover. Shadows allégées pour stabilité GPU.
 */

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  RoundedBox,
  Html,
  ContactShadows,
  Line,
  PerspectiveCamera,
  Float,
  AdaptiveDpr,
  Environment,
  useGLTF,
} from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
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
  pedestal: "#2A2A30",
  satellite: "#9CA3AF",
  badgeBg: "#2DD4BF",
  badgeText: "#FFFFFF",
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

  if (mode === "light") {
    return {
      mode,
      cykan,
      gold,
      pedestal: "#2A2A30",
      satellite: "#9CA3AF",
      badgeBg: cykan,
      badgeText: "#FFFFFF",
      text: "rgba(20, 20, 25, 0.85)",
      textMuted: "rgba(20, 20, 25, 0.55)",
    };
  }

  return {
    mode,
    cykan,
    gold,
    pedestal: "#FAFAFA",
    satellite: "#CFD1D6",
    badgeBg: "rgba(255, 255, 255, 0.92)",
    badgeText: cykan,
    text: get("--text-l1", "rgba(255, 255, 255, 0.78)"),
    textMuted: get("--text-muted", "rgba(255, 255, 255, 0.55)"),
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
    
    // Socles : Aspect céramique/verre dépoli
    const surface = new THREE.MeshPhysicalMaterial({
      color: colors.pedestal,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.2,
      thickness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    });

    const surfaceMuted = new THREE.MeshPhysicalMaterial({
      color: colors.satellite,
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 0.5,
    });

    // Cœurs : Aspect gemme émissive
    const cykanCore = new THREE.MeshPhysicalMaterial({
      color: colors.cykan,
      roughness: 0,
      metalness: 0.8,
      emissive: colors.cykan,
      emissiveIntensity: isLight ? 2.5 : 1.8,
      clearcoat: 1,
    });

    const goldCore = new THREE.MeshPhysicalMaterial({
      color: colors.gold,
      roughness: 0.1,
      metalness: 0.9,
      emissive: colors.gold,
      emissiveIntensity: isLight ? 1.5 : 1.2,
      clearcoat: 1,
    });

    const cykanGlow = new THREE.MeshBasicMaterial({
      color: colors.cykan,
      transparent: true,
      opacity: isLight ? 0.4 : 0.3,
    });

    return { surface, surfaceMuted, cykanCore, goldCore, cykanGlow };
  }, [colors]);
}

type Materials = ReturnType<typeof useMaterials>;

// --- Pedestal (un agent) -----------------------------------------------------

interface PedestalProps {
  agent: HaloAgentDef;
  isHovered: boolean;
  onHover: (id: HaloAgentId | null) => void;
  materials: Materials;
  colors: ThemeColors;
  orbitRadius: number;
}

function AgentPedestal({ agent, isHovered, onHover, materials, colors, orbitRadius }: PedestalProps) {
  const rad = (agent.angleDeg * Math.PI) / 180;
  const x = Math.cos(rad) * orbitRadius;
  const z = Math.sin(rad) * orbitRadius;

  const baseRef = useRef<THREE.Group>(null);
  const iconRef = useRef<THREE.Group>(null);
  const accentMat = agent.tone === "primary" ? materials.cykanCore : materials.goldCore;

  const { scene } = useGLTF(`/models/${agent.id}.glb`);
  const clonedScene = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = accentMat;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return root;
  }, [scene, accentMat]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (baseRef.current) {
      const targetY = isHovered ? 0.45 : 0;
      baseRef.current.position.y += (targetY - baseRef.current.position.y) * d * 8;
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
        onPointerOver={() => onHover(agent.id)}
        onPointerOut={() => onHover(null)}
      >
        <boxGeometry args={[3.6, 4, 3.6]} />
        <meshBasicMaterial />
      </mesh>

      <group ref={baseRef}>
        <RoundedBox
          args={[2.2, 0.18, 2.2]}
          radius={0.08}
          smoothness={4}
          material={materials.surface}
          castShadow
          receiveShadow
        />

        {isHovered && (
          <mesh position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.32, 1.55, 48]} />
            <primitive object={materials.cykanGlow} attach="material" />
          </mesh>
        )}

        <group ref={iconRef} position={[0, 0.6, 0]}>
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
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      const scale = 1 + Math.sin(t * 1.2) * 0.04;
      groupRef.current.scale.setScalar(scale);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.35;
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.4} rotationIntensity={0.1} floatIntensity={0.22}>
        <group>
          <RoundedBox args={[2, 0.14, 2]} radius={0.06} position={[0, 0.07, 0]} material={materials.surface} castShadow receiveShadow />
          <RoundedBox args={[1.4, 0.12, 1.4]} radius={0.05} position={[0, 0.21, 0]} material={materials.surface} castShadow receiveShadow />
          <RoundedBox args={[0.9, 0.1, 0.9]} radius={0.04} position={[0, 0.34, 0]} material={materials.surface} castShadow receiveShadow />

          <mesh position={[0, 0.55, 0]} castShadow>
            <sphereGeometry args={[0.3, 32, 32]} />
            <primitive object={materials.cykanCore} attach="material" />
          </mesh>

          <mesh ref={ringRef} position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.62, 64]} />
            <primitive object={materials.cykanGlow} attach="material" />
          </mesh>
        </group>
      </Float>

      <Html position={[0, 1.15, 0]} center zIndexRange={[100, 0]} wrapperClass="halo-core-badge-wrap">
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

  return (
    <Line
      points={orbitPoints}
      color={colors.cykan}
      lineWidth={1}
      opacity={0.32}
      transparent
      dashed
      dashScale={8}
      dashSize={0.2}
      gapSize={0.12}
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

function Scene({ mode }: { mode: ThemeMode }) {
  const colors = useThemeColors(mode);
  const materials = useMaterials(colors);
  const layout = useResponsiveLayout();
  const [hoveredId, setHoveredId] = useState<HaloAgentId | null>(null);

  return (
    <Suspense fallback={null}>
      <ResponsiveCamera layout={layout} />
      <Environment preset="city" />

      <ambientLight intensity={0.4} />
      <spotLight
        position={[15, 20, 15]}
        angle={0.3}
        penumbra={1}
        intensity={2}
        castShadow
      />
      <pointLight position={[-10, -10, -10]} color={colors.cykan} intensity={1} />

      <ContactShadows position={[0, -0.05, 0]} opacity={0.4} scale={30} blur={2.5} far={4} />

      <AutoRotateGroup paused={hoveredId !== null}>
        <CenterCore materials={materials} colors={colors} />
        <OrbitTrack orbitRadius={layout.orbitRadius} colors={colors} />
        {HALO_AGENTS_V1.map((agent) => (
          <AgentPedestal
            key={agent.id}
            agent={agent}
            isHovered={hoveredId === agent.id}
            onHover={setHoveredId}
            materials={materials}
            colors={colors}
            orbitRadius={layout.orbitRadius}
          />
        ))}
      </AutoRotateGroup>

      <EffectComposer>
        <Bloom 
          luminanceThreshold={1} 
          mipmapBlur 
          intensity={0.8} 
          radius={0.4}
        />
      </EffectComposer>
    </Suspense>
  );
}

// --- Public component --------------------------------------------------------

interface HaloAgentCoreProps {
  mode?: ThemeMode;
}

export function HaloAgentCore({ mode = "dark" }: HaloAgentCoreProps = {}) {
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
        dpr={[1, 1.75]}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <AdaptiveDpr pixelated={false} />
        <Scene mode={mode} />
      </Canvas>
    </section>
  );
}
