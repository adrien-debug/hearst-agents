/**
 * Génère des fichiers GLB valides (glTF 2.0 binaire) pour HaloAgentCore.
 * Usage : node scripts/generate-halo-agent-glbs.mjs
 *
 * Note : GLTFExporter utilise FileReader (API navigateur) pour assembler le GLB ;
 * en Node on fournit un polyfill minimal.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReaderPolyfill {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((ab) => {
          this.result = ab;
          if (typeof this.onloadend === "function") this.onloadend();
        })
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
    }
    readAsDataURL(blob) {
      blob
        .arrayBuffer()
        .then((ab) => {
          const b64 = Buffer.from(ab).toString("base64");
          this.result = `data:application/octet-stream;base64,${b64}`;
          if (typeof this.onloadend === "function") this.onloadend();
        })
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
    }
  };
}

import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/models");

const mat = () =>
  new THREE.MeshStandardMaterial({
    color: 0x6b6b70,
    metalness: 0.35,
    roughness: 0.35,
  });

/** Une mesh distinctive par agent (remplaçable plus tard par un vrai asset). */
const builders = {
  pilot: () => {
    // Boussole / flèche directrice
    const group = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 3), mat());
    cone.rotation.x = Math.PI / 2;
    group.add(cone);
    return group;
  },
  delve: () => {
    // Stack disques (extraction de couches data)
    const group = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 32), mat());
      ring.position.y = i * 0.18 - 0.18;
      group.add(ring);
    }
    return group;
  },
  scribe: () => {
    // Document / feuille
    const group = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.05), mat());
    group.add(sheet);
    return group;
  },
  pulse: () => {
    // Onde / signal
    const group = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 16, 32, Math.PI), mat());
    torus.rotation.z = Math.PI / 2;
    group.add(torus);
    return group;
  },
  warden: () => {
    // Bouclier stylisé
    const group = new THREE.Group();
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.1, 6), mat());
    shield.rotation.x = Math.PI / 2;
    group.add(shield);
    return group;
  },
  cortex: () => {
    // Cerveau / réseau de noeuds
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat());
    group.add(core);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat());
      const a = (i / 4) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0);
      group.add(s);
    }
    return group;
  },
};

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const exporter = new GLTFExporter();

  for (const [id, build] of Object.entries(builders)) {
    const root = new THREE.Group();
    const mesh = build();
    mesh.name = "AgentCore";
    root.add(mesh);

    const scene = new THREE.Scene();
    scene.name = id;
    scene.add(root);

    const arrayBuffer = await exporter.parseAsync(scene, { binary: true });
    const buf = Buffer.from(arrayBuffer);
    const outPath = path.join(outDir, `${id}.glb`);
    fs.writeFileSync(outPath, buf);
    console.log(`Wrote ${outPath} (${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
