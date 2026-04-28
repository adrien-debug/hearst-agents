/* TEMPORAIRE — page de validation visuelle HaloLogo3D, à supprimer.
   Calé sur le contexte de production : data-theme="light", fond
   --bg-center (#F4F4F6) du surface user. Tailles 56 / 96 / 160 px
   pour montrer le composant à l'échelle réelle (PulseStrip = 56). */

import { HaloLogo3D } from "@/app/(user)/components/right-panel/HaloLogo3D";

const STATES = ["idle", "running", "awaiting", "error"] as const;
const SIZES = [56, 96, 160];

export default function HaloTestPage() {
  return (
    <div data-theme="light" style={{ minHeight: "100vh", background: "var(--surface)" }}>
      <main
        style={{
          minHeight: "100vh",
          padding: "var(--space-12)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-12)",
          color: "var(--text)",
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h1 className="t-28" style={{ color: "var(--text)" }}>
            HaloLogo3D
          </h1>
          <p className="t-13" style={{ color: "var(--text-muted)", maxWidth: 640 }}>
            Pulsar gyroscope 3D — calibré sur le surface light theme (–bg-center).
            Couleurs strictes du design system : --cykan / --warn / --danger / --text-faint.
            Fond canvas 100 % transparent.
          </p>
        </header>

        {SIZES.map((size) => (
          <section key={size} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div
              className="t-9 font-mono"
              style={{
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.22em",
              }}
            >
              size · {size} px
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-16)",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {STATES.map((s) => (
                <div
                  key={s}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                    alignItems: "center",
                  }}
                >
                  <HaloLogo3D size={size} state={s} />
                  <div
                    className="t-11 font-mono"
                    style={{
                      color: "var(--text-soft)",
                      textTransform: "uppercase",
                      letterSpacing: "0.18em",
                    }}
                  >
                    {s}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer
          className="t-11"
          style={{
            color: "var(--text-faint)",
            paddingTop: "var(--space-8)",
            borderTop: "1px solid var(--border-shell)",
          }}
        >
          Tokens utilisés : --cykan #2DD4BF · --warn #ffcc00 · --danger #ff3333 · --text-faint
        </footer>
      </main>
    </div>
  );
}
