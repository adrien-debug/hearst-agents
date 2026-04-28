"use client";

/**
 * HaloLogo3D — scène R3F « Pulsar Gyroscope » (light theme).
 *
 * Calibré pour le surface user (data-theme="light", #F4F4F6) :
 * cœur sphérique solide aux couleurs sémantiques du design system
 * (cykan / warn / danger / text-faint), 3 anneaux orthogonaux
 * métalliques, particules en running. Pas d'iridescence forte (qui
 * décalait les teintes hors token), pas de transmission sur fond
 * blanc (qui rendait le verre invisible). Background canvas 100%
 * transparent — l'env map procédurale est uniquement vue par les
 * réflexions.
 *
 * Camera serrée (z=2.4) pour que le gyroscope fille bien la box
 * même à 40 px. Bloom doux (sur blanc le bloom devient halo coloré
 * — ne pas l'amplifier).
 *
 * Lazy-chargé par `HaloLogo3D.tsx` via `next/dynamic({ ssr: false })`.
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
} from "@react-three/postprocessing";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

type HaloState = "idle" | "running" | "awaiting" | "error";

// Couleurs strictes du design system (cf. globals.css :root)
const COLOR = {
  idle: new THREE.Color("#2DD4BF").multiplyScalar(0.5), // Cyan assombri
  running: new THREE.Color("#2DD4BF"), // --cykan
  awaiting: new THREE.Color("#F59E0B"), // --warn
  error: new THREE.Color("#EF4444"), // --danger
} as const;

interface CanvasProps {
  state: HaloState;
}

export default function HaloCanvas({ state }: CanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.5], fov: 35 }}
      frameloop={state === "idle" ? "demand" : "always"}
      gl={{
        antialias: true,
        alpha: true,
        stencil: false,
        depth: true,
      }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <Environment resolution={256}>
          <group rotation={[-Math.PI / 4, -Math.PI / 4, 0]}>
            <Lightformer form="rect" intensity={2} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
            <Lightformer form="rect" intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[10, 2, 1]} />
            <Lightformer form="rect" intensity={2} rotation-y={Math.PI / 2} position={[-5, -1, -1]} scale={[10, 2, 1]} />
            <Lightformer form="rect" intensity={2} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[20, 2, 1]} />
            <Lightformer form="ring" intensity={1.5} position={[0, 0, 5]} scale={2} color={COLOR[state]} />
          </group>
        </Environment>
      </Suspense>

      <SceneLights state={state} />
      <Artifact state={state} />
      <PostFX state={state} />
    </Canvas>
  );
}

/* ── Lights ───────────────────────────────────────────────────── */

function SceneLights({ state }: { state: HaloState }) {
  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[2, 2, 2]} intensity={1} color="#ffffff" />
      <pointLight position={[-2, -2, -2]} intensity={0.5} color={COLOR[state]} />
      <spotLight position={[0, 5, 0]} intensity={2} distance={10} angle={0.5} penumbra={1} />
    </>
  );
}

/* ── Artifact (Le nouveau cœur technologique) ─────────────────── */

function Artifact({ state }: { state: HaloState }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const shellRef = useRef<THREE.Mesh>(null!);
  const ring1Ref = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);

  useFrame((s, dt) => {
    if (!groupRef.current) return;
    const t = s.clock.elapsedTime;

    // Rotation globale fluide
    groupRef.current.rotation.y += dt * (state === "running" ? 0.4 : 0.1);
    groupRef.current.rotation.z += dt * (state === "running" ? 0.2 : 0.05);

    // Animation du cœur (pulse)
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * (state === "running" ? 4 : 2)) * 0.05;
      coreRef.current.scale.setScalar(pulse);
    }

    // Rotation indépendante des anneaux
    if (ring1Ref.current) ring1Ref.current.rotation.x += dt * 0.8;
    if (ring2Ref.current) ring2Ref.current.rotation.y += dt * 0.6;

    // Effet de flottement
    groupRef.current.position.y = Math.sin(t * 1.5) * 0.1;
  });

  const color = COLOR[state];

  return (
    <group ref={groupRef}>
      {/* Cœur Émissif — Sphère de pure énergie */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.4, 64, 64]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={state === "idle" ? 2 : 5} 
          toneMapped={false}
        />
      </mesh>

      {/* Coque Translucide — Effet verre dépoli */}
      <mesh ref={shellRef}>
        <sphereGeometry args={[0.6, 64, 64]} />
        <meshPhysicalMaterial
          roughness={0.1}
          transmission={0.9}
          thickness={0.5}
          color={color}
          ior={1.5}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Anneau 1 — Géométrie fine et technique */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.1, 0.015, 16, 100]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Anneau 2 — Orthogonal */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.3, 0.01, 16, 100]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Points de données orbitaux */}
      <DataPoints state={state} />
    </group>
  );
}

function DataPoints({ state }: { state: HaloState }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 40;
  
  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 1.5 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      s[i] = Math.random();
    }
    return [pos, s];
  }, []);

  useFrame((s, dt) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y -= dt * 0.2;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color={COLOR[state]}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Postprocess ──────────────────────────────────────────────── */

function PostFX({ state }: { state: HaloState }) {
  const bloomIntensity = state === "running" ? 1.5 : 0.8;
  
  return (
    <EffectComposer disableNormalPass multisampling={4}>
      <Bloom 
        intensity={bloomIntensity} 
        luminanceThreshold={0.2} 
        luminanceSmoothing={0.9} 
        mipmapBlur 
      />
      {state === "error" && <ChromaticAberration offset={new THREE.Vector2(0.005, 0.005)} />}
    </EffectComposer>
  );
}
