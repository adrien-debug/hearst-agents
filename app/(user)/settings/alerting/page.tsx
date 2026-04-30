/**
 * /settings/alerting — Page configuration des alertes Hearst OS.
 */

import { AlertingSettings } from "@/app/(user)/components/settings/AlertingSettings";

export default function AlertingSettingsPage() {
  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-y-auto panel-enter"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-full px-12 py-10"
        style={{ maxWidth: "var(--width-center-max)", margin: "0 auto" }}
      >
        <header className="mb-8">
          <h1 className="t-28 font-light tracking-tight text-[var(--text)]">
            Alerting
          </h1>
          <p className="t-13 font-light text-[var(--text-muted)] mt-2">
            Canaux de notification pour les signaux critiques de Hearst OS.
          </p>
        </header>
        <AlertingSettings />
      </div>
    </div>
  );
}
