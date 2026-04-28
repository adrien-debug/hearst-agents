import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin la racine workspace pour que Turbopack n'aille pas la déduire
  // depuis un package.json plus haut dans l'arbo (ex. ~/package.json).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
