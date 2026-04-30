"use client";

/**
 * <RailSection> — section primitive du ContextRail.
 *
 * Wrapper standard pour chaque section d'un sub-rail (asset, mission,
 * meeting, kg, voice, simulation, runs, missions, apps).
 *
 * Padding uniforme `px-5 py-5` pour rythme cohérent verticalement.
 * Headers via <SectionHeader> (label + count + action optionnels).
 */

import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

interface RailSectionProps {
  label: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function RailSection({
  label,
  count,
  action,
  children,
  className = "",
}: RailSectionProps) {
  return (
    <section className={`px-5 py-5 ${className}`}>
      <SectionHeader label={label} count={count} action={action} />
      {children}
    </section>
  );
}
