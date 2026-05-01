/**
 * /settings/alerting — Page configuration des alertes Hearst OS.
 */

import { AlertingSettings } from "@/app/(user)/components/settings/AlertingSettings";
import { PageHeader } from "@/app/(user)/components/PageHeader";

export default function AlertingSettingsPage() {
  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-y-auto panel-enter"
      style={{ background: "var(--bg)" }}
    >
      <PageHeader
        title="Alerting"
        subtitle="Canaux de notification pour les signaux critiques de Hearst OS."
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Réglages", href: "/settings/alerting" }, { label: "Alerting" }]}
      />
      <div
        className="w-full px-12 py-6"
        style={{ maxWidth: "var(--width-center-max)", margin: "0 auto" }}
      >
        <AlertingSettings />
      </div>
    </div>
  );
}
