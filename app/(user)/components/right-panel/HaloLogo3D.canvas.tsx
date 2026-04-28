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
  idle: new THREE.Color("#5a6066"), // approx --text-faint sur fond clair
  running: new THREE.Color("#2DD4BF"), // --cykan
  awaiting: new THREE.Color("#ffcc00"), // --warn
  error: new THREE.Color("#ff3333"), // --danger
} as const;

interface CanvasProps {
  state: HaloState;
}

export default function HaloCanvas({ state }: CanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.25, 3.8], fov: 32 }}
      frameloop={state === "idle" ? "demand" : "always"}
      gl={{
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <Environment background={false} resolution={128}>
          <Lightformer
            form="ring"
            intensity={1.6}
            position={[0, 2, 1]}
            scale={3}
            color="#ffffff"
          />
          <Lightformer
            form="rect"
            intensity={1.0}
            position={[2, 0, 1.5]}
            scale={[2, 4, 1]}
            color="#ffffff"
          />
          <Lightformer
            form="rect"
            intensity={0.9}
            position={[-2, 0.5, 0.5]}
            scale={[2, 4, 1]}
            color="#dfe7ee"
          />
          <Lightformer
            form="ring"
            intensity={1.0}
            position={[0, -1.5, -1]}
            scale={2.2}
            color="#ffffff"
          />
        </Environment>
      </Suspense>

      <SceneLights state={state} />
      <Gyroscope state={state} />
      <Particles state={state} />
      <PostFX state={state} />
    </Canvas>
  );
}

/* ── Lights ───────────────────────────────────────────────────── */

function SceneLights({ state }: { state: HaloState }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[2.5, 3, 3]} intensity={0.8} />
      <directionalLight position={[-2, -1, 1]} intensity={0.25} color="#a0b0c0" />
      <pointLight
        position={[0, 0, 0]}
        intensity={state === "idle" ? 0.6 : 2.4}
        distance={3.5}
        decay={2}
        color={COLOR[state]}
      />
    </>
  );
}

/* ── Gyroscope (cœur + 3 anneaux métalliques colorés) ─────────── */

function Gyroscope({ state }: { state: HaloState }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const ringXRef = useRef<THREE.Mesh>(null!);
  const ringYRef = useRef<THREE.Mesh>(null!);
  const ringZRef = useRef<THREE.Mesh>(null!);

  // Anneaux plus charnus + plus écartés → moins d'overlap visuel,
  // chaque axe se distingue clairement à 56 px comme à 160 px.
  const ringGeomA = useMemo(
    () => new THREE.TorusGeometry(0.82, 0.055, 24, 160),
    [],
  );
  const ringGeomB = useMemo(
    () => new THREE.TorusGeometry(0.96, 0.05, 24, 160),
    [],
  );
  const ringGeomC = useMemo(
    () => new THREE.TorusGeometry(1.10, 0.045, 24, 160),
    [],
  );
  const coreGeom = useMemo(() => new THREE.SphereGeometry(0.36, 32, 32), []);

  useFrame((s, dt) => {
    if (
      !groupRef.current ||
      !coreRef.current ||
      !ringXRef.current ||
      !ringYRef.current ||
      !ringZRef.current
    )
      return;

    const t = s.clock.elapsedTime;

    if (state !== "error") {
      groupRef.current.position.x = THREE.MathUtils.lerp(
        groupRef.current.position.x,
        0,
        dt * 10,
      );
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        0,
        dt * 10,
      );
    }
    if (state !== "awaiting") {
      coreRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 4);
    }

    if (state === "running") {
      ringXRef.current.rotation.x += dt * 0.42;
      ringYRef.current.rotation.y += dt * 0.58;
      ringZRef.current.rotation.z += dt * 0.34;
      groupRef.current.rotation.y += dt * 0.06;
    } else if (state === "idle") {
      groupRef.current.rotation.y += dt * 0.04;
    } else if (state === "awaiting") {
      const pulse = 1 + Math.sin(t * 3.0) * 0.1;
      coreRef.current.scale.setScalar(pulse);
      ringXRef.current.rotation.x = Math.sin(t * 1.2) * 0.05;
      ringYRef.current.rotation.y = Math.cos(t * 1.4) * 0.05;
      ringZRef.current.rotation.z = Math.sin(t * 1.6) * 0.05;
    } else if (state === "error") {
      ringXRef.current.rotation.x = 0.22;
      ringYRef.current.rotation.y = -0.26;
      ringZRef.current.rotation.z = 0.14;
      const phase = t % 3.4;
      if (phase > 3.15) {
        groupRef.current.position.x = (Math.random() - 0.5) * 0.06;
        groupRef.current.position.y = (Math.random() - 0.5) * 0.06;
      } else {
        groupRef.current.position.x = THREE.MathUtils.lerp(
          groupRef.current.position.x,
          0,
          dt * 8,
        );
        groupRef.current.position.y = THREE.MathUtils.lerp(
          groupRef.current.position.y,
          0,
          dt * 8,
        );
      }
    }
  });

  // Anneaux : couleur token directe, métal modéré (0.6) — au-delà
  // les reflets blancs cachent la teinte ; en-dessous on perd la
  // précieuseté. Pas d'iridescence (décalait les hues hors token).
  const ringColor = COLOR[state];

  return (
    <group ref={groupRef} rotation={[0.32, 0.55, 0]}>
      {/* Cœur — couleur token PURE + emissive forte. metalness=0 pour
          que la couleur ne soit pas masquée par les reflets blancs
          de l'env map sur fond clair. */}
      <mesh ref={coreRef} geometry={coreGeom}>
        {/* MeshBasicMaterial : indépendant de la lumière, la couleur
            token reste 100% fidèle quel que soit l'env map. C'est ce
            cœur saturé pur qui donne au composant son centre lisible. */}
        <meshBasicMaterial
          color={COLOR[state]}
          toneMapped={false}
        />
        {/* coreMatRef pas utile sans emissive — pulse géré par scale */}
      </mesh>

      <mesh ref={ringXRef} geometry={ringGeomA}>
        <meshPhysicalMaterial
          color={ringColor}
          metalness={0.15}
          roughness={0.35}
          clearcoat={0.6}
          clearcoatRoughness={0.18}
          envMapIntensity={0.45}
        />
      </mesh>
      <mesh ref={ringYRef} geometry={ringGeomB} rotation={[Math.PI / 2, 0, 0]}>
        <meshPhysicalMaterial
          color={ringColor}
          metalness={0.15}
          roughness={0.35}
          clearcoat={0.6}
          clearcoatRoughness={0.18}
          envMapIntensity={0.45}
        />
      </mesh>
      <mesh ref={ringZRef} geometry={ringGeomC} rotation={[0, Math.PI / 2, 0]}>
        <meshPhysicalMaterial
          color={ringColor}
          metalness={0.15}
          roughness={0.35}
          clearcoat={0.6}
          clearcoatRoughness={0.18}
          envMapIntensity={0.45}
        />
      </mesh>
    </group>
  );
}

/* ── Particles ────────────────────────────────────────────────── */

const PARTICLE_COUNT = 90;

function Particles({ state }: { state: HaloState }) {
  const ref = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);

  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const r = 1.3;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      arr[i * 3] = r * Math.cos(theta) * radius;
      arr[i * 3 + 1] = r * y;
      arr[i * 3 + 2] = r * Math.sin(theta) * radius;
    }
    return arr;
  }, []);

  const targetOpacity = state === "running" ? 0.7 : state === "error" ? 0.3 : 0;

  useFrame((s, dt) => {
    if (!ref.current || !matRef.current) return;
    matRef.current.opacity = THREE.MathUtils.lerp(
      matRef.current.opacity,
      targetOpacity,
      dt * 4,
    );
    if (state === "running") {
      ref.current.rotation.y += dt * 0.15;
      ref.current.rotation.x += dt * 0.04;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={PARTICLE_COUNT}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0}
        color={COLOR[state]}
        depthWrite={false}
      />
    </points>
  );
}

/* ── Postprocess ──────────────────────────────────────────────── */

function PostFX({ state }: { state: HaloState }) {
  // Sur fond blanc, le bloom ne fait pas "halo" mais "haze coloré" —
  // donc on le garde discret. C'est le metalness + clearcoat qui
  // porte la richesse, pas le bloom.
  const bloomIntensity =
    state === "running"
      ? 0.35
      : state === "awaiting"
        ? 0.3
        : state === "error"
          ? 0.28
          : 0.0;
  const chromatic = state === "error" ? 0.0035 : 0;

  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.95}
        luminanceSmoothing={0.3}
        radius={0.5}
        mipmapBlur
      />
      <ChromaticAberration offset={[chromatic, chromatic]} />
    </EffectComposer>
  );
}
