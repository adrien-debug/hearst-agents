/**
 * UI primitives — design system Hearst OS.
 *
 * Re-exporte les primitives unifiées du DS pour import simple :
 *   import { Action, SectionHeader, RailSection } from "@/app/(user)/components/ui";
 */

export { Action } from "./Action";
export type { ActionVariant, ActionTone, ActionSize } from "./Action";

export { SectionHeader } from "./SectionHeader";
export { RailSection } from "./RailSection";
export { EmptyState } from "./EmptyState";
export { RowSkeleton, CardSkeleton } from "./Skeleton";
