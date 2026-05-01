"use client";

import { ConnectionsHub } from "../components/ConnectionsHub";
import { PageHeader } from "../components/PageHeader";

export default function AppsPage() {
  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ background: "var(--bg-elev)" }}
    >
      <PageHeader
        title="Apps"
        subtitle="Catalogue des intégrations disponibles. Connectez les sources qui alimentent vos rapports et missions."
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Apps" }]}
      />
      <ConnectionsHub />
    </div>
  );
}
