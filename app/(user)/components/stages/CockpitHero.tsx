"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface CockpitHeroProps {
  /** Briefing optionnel : si fourni, on rend la zone summary sous le greeting. */
  briefing?: {
    headline: string;
    body: string | null;
    empty: boolean;
  };
  /** CTA contextuel rendu sous le briefing (ex : "Connecte tes apps"). */
  emptyAction?: { label: string; href: string };
}

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

/**
 * CockpitHero — Hero éditorial statutaire (pivot UI 2026-05-01, direction A).
 *
 * Le hero est le premier point d'attention du cockpit : prénom + date complète
 * + heure, briefing court en sous-texte. Posture éditoriale calme, pas
 * "panneau de contrôle". Quand le briefing est vide, le fallback est un
 * statement éditorial assumé (pas une mendiance d'apps connectées).
 *
 * Voix typo :
 *   prénom (h1)        — voix éditoriale t-30 / text-l1
 *   date + heure       — voix système discrète t-13 / text-faint (mono tabular pour l'heure)
 *   briefing headline  — voix éditoriale t-15 / text-l1
 *   briefing body      — voix éditoriale t-13 / text-l2
 *   CTA empty          — voix éditoriale gold (PAS cykan : lien de contenu)
 */
export function CockpitHero({ briefing, emptyAction }: CockpitHeroProps = {}) {
  const { data: session } = useSession();
  const [time, setTime] = useState("--:--");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      setDateLabel(DATE_FORMATTER.format(d));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  return (
    <div
      style={{
        padding: "var(--space-14) var(--space-12) var(--space-12)",
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: "var(--space-8)" }}>
        <h1
          className="t-30"
          style={{
            fontWeight: 500,
            lineHeight: "var(--leading-tight)",
            color: "var(--text-l1)",
          }}
        >
          {firstName}
        </h1>
        <div
          className="flex flex-col items-end shrink-0"
          style={{ gap: "var(--space-1)", marginTop: "var(--space-2)" }}
        >
          <span
            className="t-13 font-light first-letter:uppercase"
            style={{ color: "var(--text-l2)" }}
          >
            {dateLabel}
          </span>
          <span
            className="t-13 font-mono tabular-nums"
            style={{ color: "var(--text-faint)" }}
          >
            {time}
          </span>
        </div>
      </div>

      {briefing && !briefing.empty && (() => {
        const stripMarker = (s: string) =>
          s.replace(/\s*\[Résumé précédent\]\s*/g, "").trim();
        const headline = stripMarker(briefing.headline);
        const body = briefing.body ? stripMarker(briefing.body) : null;
        if (!headline && !body) return null;
        return (
          <div style={{ marginTop: "var(--space-8)", maxWidth: "var(--width-actions)" }}>
            {headline && (
              <p
                className="t-15"
                style={{
                  fontWeight: 400,
                  lineHeight: "var(--leading-tight)",
                  color: "var(--text-l1)",
                }}
              >
                {headline}
              </p>
            )}
            {body && (
              <p
                className="t-13"
                style={{
                  lineHeight: "var(--leading-tight)",
                  color: "var(--text-l2)",
                  marginTop: "var(--space-3)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {body}
              </p>
            )}
          </div>
        );
      })()}

      {briefing?.empty && emptyAction && (
        <div style={{ marginTop: "var(--space-8)", maxWidth: "var(--width-actions)" }}>
          <p
            className="t-15"
            style={{
              fontWeight: 400,
              lineHeight: "var(--leading-tight)",
              color: "var(--text-l1)",
            }}
          >
            Aucun signal pour aujourd{"'"}hui.
          </p>
          <p
            className="t-13"
            style={{
              lineHeight: "var(--leading-tight)",
              color: "var(--text-l2)",
              marginTop: "var(--space-3)",
              marginBottom: "var(--space-4)",
            }}
          >
            Hearst observe ton quotidien dès que tu lui donnes accès à tes outils.
          </p>
          <a
            href={emptyAction.href}
            className="t-13 inline-flex items-center transition-colors hover:opacity-80"
            style={{
              color: "var(--gold)",
              gap: "var(--space-2)",
              borderBottom: "1px solid var(--gold-border)",
              paddingBottom: "var(--space-1)",
            }}
          >
            {emptyAction.label} →
          </a>

          {/* Aperçu grisé — montre à quoi ressemblera un brief réel.
              Vague 9 action #5 : empty states explicatifs (pas glyphes seuls). */}
          <div
            style={{
              marginTop: "var(--space-10)",
              padding: "var(--space-5) var(--space-6)",
              border: "1px dashed var(--border-shell)",
              borderRadius: "var(--radius-md)",
              opacity: 0.4,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            <span
              className="t-9 font-medium"
              style={{
                color: "var(--text-l2)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Aperçu — exemple type
            </span>
            <p
              className="t-13 font-light"
              style={{
                color: "var(--text-l1)",
                marginTop: "var(--space-3)",
                lineHeight: 1.5,
                fontStyle: "italic",
              }}
            >
              Matinée à fort enjeu : la term sheet Sequoia se reclarifie en parallèle de la signature Acme. Le staging encore instable côté backend pèse sur la confiance opérationnelle.
            </p>
            <p
              className="t-11 font-light"
              style={{
                color: "var(--text-l2)",
                marginTop: "var(--space-2)",
                lineHeight: 1.5,
              }}
            >
              9 signaux ingérés cross-app — 3 emails urgents, 2 PRs stuck, 1 issue P1.
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          height: "1px",
          marginTop: "var(--space-12)",
          background:
            "linear-gradient(90deg, transparent 0%, var(--sep) 30%, var(--sep) 70%, transparent 100%)",
        }}
      />
    </div>
  );
}
