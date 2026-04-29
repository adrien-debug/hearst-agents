import Link from "next/link";
import { NAV_SECTIONS } from "./_shell/nav";

export const dynamic = "force-dynamic";

/**
 * Accueil administration — vue d’ensemble et liens vers toutes les sections.
 * Le canvas live est sur `/admin/pipeline` (voir `CanvasShell`).
 */
export default function AdminHomePage() {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
      <div className="px-(--space-8) py-(--space-10) mx-auto w-full max-w-[min(100%,var(--width-actions))]">
        <p className="t-10 font-mono uppercase tracking-(--tracking-stretch) text-text-faint mb-(--space-2)">
          Hearst OS
        </p>
        <h1 className="t-28 font-semibold text-text mb-(--space-3)">Accueil administration</h1>
        <p className="t-15 text-text-muted max-w-[min(100%,var(--width-center-max))] mb-(--space-6)">
          Raccourcis vers chaque outil admin. Le graphe orchestrateur (SSE, replay des runs) vit sur
          le canvas dédié.
        </p>

        <div className="mb-(--space-10)">
          <Link
            href="/admin/pipeline"
            className="inline-flex items-center gap-(--space-3) ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm) px-(--space-5) py-(--space-3) t-13"
          >
            Ouvrir le canvas pipeline (live)
          </Link>
        </div>

        <div className="flex flex-col gap-(--space-8)">
          {NAV_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="t-10 font-mono uppercase tracking-(--tracking-stretch) text-text-faint mb-(--space-3)">
                {section.title}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-(--space-3)">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex flex-col gap-(--space-2) rounded-(--radius-md) border border-line-strong bg-bg-elev p-(--space-4) transition-colors duration-(--duration-base) ease-(--ease-standard) hover:border-(--cykan)/40 hover:bg-(--surface-1)"
                    >
                      <span className="t-13 font-medium text-text">{item.label}</span>
                      <span className="t-9 font-mono text-text-faint truncate">{item.href}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
