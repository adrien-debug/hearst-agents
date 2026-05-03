// lint-visual-disable-file
"use client";

/**
 * HaloAgentCore — Vue 3D isométrique premium des agents Hearst.
 * Performance optimisée, burst central, icônes élégantes, labels français.
 */

import { Suspense, useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  RoundedBox,
  Html,
  ContactShadows,
  Line,
  PerspectiveCamera,
  Float,
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
  angleDeg: number;
  icon: string;
}

// Agents avec labels en voix régulière (pas de mono caps)
export const HALO_AGENTS_V1: readonly HaloAgentDef[] = [
  {
    id: "mission-planner",
    label: "Mission Planner",
    desc: "Planifie et structure\nles objectifs stratégiques",
    angleDeg: -90,
    icon: "cursor",
  },
  {
    id: "report-generator",
    label: "Report Generator",
    desc: "Analyse et synthétise\nles données en rapports",
    angleDeg: -30,
    icon: "document",
  },
  {
    id: "asset-monitor",
    label: "Asset Monitor",
    desc: "Surveille et protège\nles actifs en temps réel",
    angleDeg: 30,
    icon: "shield",
  },
  {
    id: "memory-knowledge",
    label: "Memory & Knowledge",
    desc: "Connecte et active\nl'intelligence collective",
    angleDeg: 90,
    icon: "brain",
  },
  {
    id: "market-watch",
    label: "Market Watch",
    desc: "Anticipe les tendances\net signaux faibles",
    angleDeg: 150,
    icon: "chart",
  },
  {
    id: "data-miner",
    label: "Data Miner",
    desc: "Transforme les données\nen insights actionnables",
    angleDeg: 210,
    icon: "database",
  },
] as const;

const ORBIT_RADIUS = 10;

// Materials optimisés - instanciés une seule fois
function useMaterials() {
  return useMemo(() => ({
    base: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    }),
    iconInactive: new THREE.MeshStandardMaterial({
      color: "#64748b",
      roughness: 0.3,
      metalness: 0.3,
    }),
    iconActive: new THREE.MeshStandardMaterial({
      color: "#14b8a6",
      roughness: 0.2,
      metalness: 0.2,
      emissive: "#14b8a6",
      emissiveIntensity: 0.3,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      roughness: 0.2,
      metalness: 0.6,
      emissive: "#f59e0b",
      emissiveIntensity: 0.1,
    }),
    glow: new THREE.MeshBasicMaterial({
      color: "#14b8a6",
      transparent: true,
      opacity: 0.15,
    }),
  }), []);
}

// Icônes 3D élégantes
function Icon3D({ type, isActive, materials }: { type: string; isActive: boolean; materials: ReturnType<typeof useMaterials> }) {
  const mat = isActive ? materials.iconActive : materials.iconInactive;
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && isActive) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
  });

  switch (type) {
    case "database":
      return (
        <group ref={groupRef} position={[0, 0.35, 0]}>
          {/* Disques empilés avec bords arrondis */}
          <RoundedBox args={[0.9, 0.08, 0.9]} radius={0.04} material={mat} castShadow>
            <mesh position={[0, 0.12, 0]}>
              <RoundedBox args={[0.85, 0.08, 0.85]} radius={0.04} material={mat} castShadow />
            </mesh>
            <mesh position={[0, 0.24, 0]}>
              <RoundedBox args={[0.8, 0.08, 0.8]} radius={0.04} material={mat} castShadow />
            </mesh>
          </RoundedBox>
        </group>
      );
    case "document":
      return (
        <group ref={groupRef} position={[0, 0.3, 0]}>
          {/* Document avec coin plié */}
          <RoundedBox args={[0.7, 0.08, 0.9]} radius={0.03} material={mat} castShadow />
          <mesh position={[0.25, 0.05, -0.3]}>
            <boxGeometry args={[0.2, 0.02, 0.2]} />
            <primitive object={materials.base} attach="material" />
          </mesh>
          {/* Lignes de texte */}
          <mesh position={[-0.1, 0.06, 0]}>
            <boxGeometry args={[0.4, 0.02, 0.06]} />
            <primitive object={materials.base} attach="material" />
          </mesh>
          <mesh position={[0, 0.06, 0.15]}>
            <boxGeometry args={[0.5, 0.02, 0.06]} />
            <primitive object={materials.base} attach="material" />
          </mesh>
        </group>
      );
    case "chart":
      return (
        <group ref={groupRef} position={[0, 0.35, 0]}>
          {/* Base carrée */}
          <RoundedBox args={[0.8, 0.08, 0.8]} radius={0.03} material={mat} castShadow />
          {/* Barres du graphique */}
          <mesh position={[-0.2, 0.15, -0.1]} castShadow>
            <RoundedBox args={[0.12, 0.25, 0.12]} radius={0.02} material={materials.gold} />
          </mesh>
          <mesh position={[0.05, 0.2, 0.05]} castShadow>
            <RoundedBox args={[0.12, 0.35, 0.12]} radius={0.02} material={mat} />
          </mesh>
          <mesh position={[0.25, 0.12, 0.15]} castShadow>
            <RoundedBox args={[0.12, 0.18, 0.12]} radius={0.02} material={materials.gold} />
          </mesh>
          {/* Ligne tendance */}
          <Line
            points={[
              new THREE.Vector3(-0.3, 0.35, -0.2),
              new THREE.Vector3(-0.1, 0.45, -0.05),
              new THREE.Vector3(0.15, 0.4, 0.1),
              new THREE.Vector3(0.35, 0.5, 0.25),
            ]}
            color="#f59e0b"
            lineWidth={2}
          />
        </group>
      );
    case "shield":
      return (
        <group ref={groupRef} position={[0, 0.35, 0]}>
          {/* Bouclier stylisé */}
          <RoundedBox args={[0.7, 0.12, 0.8]} radius={0.08} material={mat} castShadow />
          {/* Croix centrale */}
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.4, 0.02, 0.08]} />
            <primitive object={materials.gold} attach="material" />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.08, 0.02, 0.4]} />
            <primitive object={materials.gold} attach="material" />
          </mesh>
        </group>
      );
    case "brain":
      return (
        <group ref={groupRef} position={[0, 0.35, 0]}>
          {/* Deux hémisphères */}
          <RoundedBox args={[0.35, 0.35, 0.5]} radius={0.15} position={[-0.2, 0, 0]} material={mat} castShadow />
          <RoundedBox args={[0.35, 0.35, 0.5]} radius={0.15} position={[0.2, 0, 0]} material={mat} castShadow />
          {/* Connection centrale */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.15, 0.25, 0.15]} />
            <primitive object={mat} attach="material" />
          </mesh>
          {/* Points de connexion */}
          <mesh position={[-0.15, 0.1, 0.2]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <primitive object={materials.gold} attach="material" />
          </mesh>
          <mesh position={[0.15, -0.05, -0.15]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <primitive object={materials.gold} attach="material" />
          </mesh>
        </group>
      );
    case "cursor":
      return (
        <group ref={groupRef} position={[0, 0.35, 0]} rotation={[0, -Math.PI / 4, 0]}>
          {/* Curseur flèche 3D élégant */}
          <RoundedBox args={[0.5, 0.08, 0.7]} radius={0.03} material={mat} castShadow />
          <mesh position={[0, 0.05, 0.35]} rotation={[Math.PI / 6, 0, 0]}>
            <coneGeometry args={[0.25, 0.5, 4]} />
            <primitive object={mat} attach="material" />
          </mesh>
          {/* Halo point */}
          <mesh position={[0.3, 0.1, -0.4]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <primitive object={materials.gold} attach="material" />
          </mesh>
        </group>
      );
    default:
      return (
        <RoundedBox args={[0.6, 0.08, 0.6]} radius={0.03} position={[0, 0.35, 0]} material={mat} castShadow />
      );
  }
}

// Nœud agent individuel
function AgentNode({
  agent,
  isHovered,
  onHover,
  materials,
}: {
  agent: HaloAgentDef;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  materials: ReturnType<typeof useMaterials>;
}) {
  const rad = (agent.angleDeg * Math.PI) / 180;
  const x = Math.cos(rad) * ORBIT_RADIUS;
  const z = Math.sin(rad) * ORBIT_RADIUS;

  const groupRef = useRef<THREE.Group>(null);
  const baseRef = useRef<THREE.Group>(null);

  // Animation hover fluide sans useFrame global
  useFrame((_, delta) => {
    if (baseRef.current) {
      const targetY = isHovered ? 0.6 : 0.35;
      baseRef.current.position.y += (targetY - baseRef.current.position.y) * 8 * delta;
    }
    if (groupRef.current && isHovered) {
      groupRef.current.scale.lerp(new THREE.Vector3(1.1, 1.1, 1.1), delta * 6);
    } else if (groupRef.current) {
      groupRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 6);
    }
  });

  const handlePointerOver = useCallback(() => onHover(agent.id), [onHover, agent.id]);
  const handlePointerOut = useCallback(() => onHover(null), [onHover]);

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Zone de hit invisible */}
      <mesh position={[0, 1, 0]} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} visible={false}>
        <boxGeometry args={[3.5, 3.5, 3.5]} />
        <meshBasicMaterial />
      </mesh>

      <group ref={baseRef}>
        {/* Socle avec bordure subtile */}
        <RoundedBox args={[2.2, 0.15, 2.2]} radius={0.08} smoothness={4} material={materials.base} castShadow receiveShadow />
        
        {/* Anneau lumineux quand actif */}
        {isHovered && (
          <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.3, 1.5, 32]} />
            <primitive object={materials.glow} attach="material" />
          </mesh>
        )}

        {/* Icône 3D */}
        <Icon3D type={agent.icon} isActive={isHovered} materials={materials} />
      </group>

      {/* Label HTML */}
      <Html position={[0, -0.8, 0]} center zIndexRange={[100, 0]}>
        <div
          className="flex w-48 flex-col items-center justify-center text-center transition-all duration-300"
          style={{
            opacity: isHovered ? 1 : 0.8,
            transform: isHovered ? "scale(1.05)" : "scale(1)",
            filter: isHovered ? "none" : "grayscale(0.3)",
          }}
        >
          <span className="mb-1 font-medium text-(--text-l1)" style={{ fontSize: "12px" }}>
            {agent.label}
          </span>
          <span className="whitespace-pre-line font-light leading-tight text-text-muted" style={{ fontSize: "10px" }}>
            {agent.desc}
          </span>
        </div>
      </Html>
    </group>
  );
}

// Burst central 3D avec particules
function CenterBurst({ materials }: { materials: ReturnType<typeof useMaterials> }) {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Group>(null);

  // Animation du burst
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    if (groupRef.current) {
      // Pulse respiratoire
      const scale = 1 + Math.sin(t * 1.5) * 0.05;
      groupRef.current.scale.setScalar(scale);
    }

    if (particlesRef.current) {
      // Rotation lente des particules
      particlesRef.current.rotation.y = t * 0.1;
      particlesRef.current.rotation.z = t * 0.05;
    }
  });

  // Particules orbitales - valeurs pseudo-aléatoires déterministes
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      // Pseudo-random basé sur l'index pour éviter Math.random() dans le render
      const pseudoRand1 = ((i * 9301 + 49297) % 233280) / 233280;
      const pseudoRand2 = ((i * 49297 + 9301) % 233280) / 233280;
      const pseudoRand3 = ((i * 12345 + 67890) % 233280) / 233280;
      const radius = 1.8 + pseudoRand1 * 0.5;
      const y = (pseudoRand2 - 0.5) * 0.8;
      return {
        position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as [number, number, number],
        size: 0.04 + pseudoRand3 * 0.04,
        phase: pseudoRand1 * Math.PI * 2,
      };
    });
  }, []);

  return (
    <group ref={groupRef}>
      {/* Base centrale en spirale */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
        <group>
          {/* Niveau 1 - base large */}
          <RoundedBox args={[2, 0.12, 2]} radius={0.06} position={[0, 0.1, 0]} material={materials.base} castShadow receiveShadow />
          
          {/* Niveau 2 - medium */}
          <RoundedBox args={[1.4, 0.1, 1.4]} radius={0.05} position={[0, 0.25, 0]} material={materials.base} castShadow receiveShadow />
          
          {/* Niveau 3 - top */}
          <RoundedBox args={[0.9, 0.08, 0.9]} radius={0.04} position={[0, 0.38, 0]} material={materials.base} castShadow receiveShadow />
          
          {/* Cyan glow ring */}
          <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.7, 32]} />
            <primitive object={materials.glow} attach="material" />
          </mesh>
        </group>
      </Float>

      {/* Particules orbitales */}
      <group ref={particlesRef}>
        {particles.map((p, i) => (
          <mesh key={i} position={p.position}>
            <sphereGeometry args={[p.size, 8, 8]} />
            <meshBasicMaterial
              color={i % 3 === 0 ? "#f59e0b" : "#14b8a6"}
              transparent
              opacity={0.6 + (p.phase % 0.4)}
            />
          </mesh>
        ))}
      </group>

      {/* Halo H élégant */}
      <Html position={[0, 0.65, 0]} center zIndexRange={[100, 0]}>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 backdrop-blur-md transition-all duration-500"
          style={{
            boxShadow: "0 0 20px rgba(20, 184, 166, 0.3), 0 4px 12px rgba(0,0,0,0.1)",
            border: "2px solid rgba(20, 184, 166, 0.3)",
          }}
        >
          <span className="font-semibold text-(--cykan)" style={{ fontSize: "20px" }}>
            H
          </span>
        </div>
      </Html>
    </group>
  );
}

// Connexions élégantes
function Connections() {
  const orbitPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS));
    }
    return points;
  }, []);

  const radiusLines = useMemo(() => {
    return HALO_AGENTS_V1.map((agent) => {
      const rad = (agent.angleDeg * Math.PI) / 180;
      const x = Math.cos(rad) * ORBIT_RADIUS;
      const z = Math.sin(rad) * ORBIT_RADIUS;
      return [new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(x, 0.1, z)];
    });
  }, []);

  return (
    <group>
      {/* Orbite */}
      <Line points={orbitPoints} color="#94a3b8" lineWidth={1} opacity={0.2} transparent dashed dashScale={10} dashSize={0.2} gapSize={0.1} />
      
      {/* Rayons vers agents */}
      {radiusLines.map((pts, i) => (
        <Line key={i} points={pts} color="#94a3b8" lineWidth={1} opacity={0.15} transparent />
      ))}
    </group>
  );
}

// Caméra fixe optimisée
function CameraSetup() {
  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 18, 28]}
      fov={30}
      near={1}
      far={100}
    />
  );
}

// Scene principale
function Scene() {
  const materials = useMaterials();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Lumières optimisées
  const lights = useMemo(() => {
    return {
      ambient: { intensity: 0.8 },
      main: {
        position: [8, 15, 8] as [number, number, number],
        intensity: 1.2,
      },
      fill: {
        position: [-8, 10, -8] as [number, number, number],
        intensity: 0.6,
      },
      rim: {
        position: [0, 5, 10] as [number, number, number],
        intensity: 0.4,
      },
    };
  }, []);

  return (
    <Suspense fallback={null}>
      <CameraSetup />

      {/* Lumières */}
      <ambientLight intensity={lights.ambient.intensity} />
      <directionalLight
        position={lights.main.position}
        intensity={lights.main.intensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.001}
      />
      <directionalLight position={lights.fill.position} intensity={lights.fill.intensity} />
      <pointLight position={lights.rim.position} intensity={lights.rim.intensity} color="#14b8a6" distance={20} />

      {/* Ombres de contact */}
      <ContactShadows position={[0, -0.05, 0]} opacity={0.3} scale={30} blur={1.5} far={4} />

      {/* Contenu */}
      <group>
        <CenterBurst materials={materials} />
        <Connections />
        {HALO_AGENTS_V1.map((agent) => (
          <AgentNode
            key={agent.id}
            agent={agent}
            isHovered={hoveredId === agent.id}
            onHover={setHoveredId}
            materials={materials}
          />
        ))}
      </group>
    </Suspense>
  );
}

export function HaloAgentCore() {
  return (
    <section
      className="relative h-full w-full select-none"
      style={{
        minHeight: "400px",
        background: "transparent",
      }}
      aria-label="Système agentique Hearst"
    >
      <Canvas
        shadows
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
        <Scene />
      </Canvas>
    </section>
  );
}
