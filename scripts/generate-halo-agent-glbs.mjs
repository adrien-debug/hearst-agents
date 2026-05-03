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
  "mission-planner": () => new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.55), mat()),
  "data-miner": () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), mat()),
  "report-generator": () => new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.65, 24), mat()),
  "market-watch": () => new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.12, 16, 40), mat()),
  "asset-monitor": () => new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), mat()),
  "memory-knowledge": () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.44, 0), mat()),
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
