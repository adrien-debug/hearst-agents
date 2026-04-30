"use client";

import { ConnectionsHub } from "../components/ConnectionsHub";

export default function AppsPage() {
  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ background: "var(--bg)" }}
    >
      <header
        className="flex flex-col"
        style={{
          paddingLeft: "var(--space-8)",
          paddingRight: "var(--space-8)",
          paddingTop: "var(--space-8)",
          paddingBottom: "var(--space-2)",
          gap: "var(--space-1)",
        }}
      >
        <h1 className="t-28 font-light tracking-tight text-[var(--text)]">
          Apps
        </h1>
        <p className="t-13 font-light text-[var(--text-muted)]">
          Catalogue des intégrations disponibles. Connectez les sources qui alimentent vos rapports et missions.
        </p>
      </header>
      <ConnectionsHub />
    </div>
  );
}
