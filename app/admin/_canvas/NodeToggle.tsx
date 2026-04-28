"use client";

import { useFeatureFlag } from "./use-feature-flag";

interface Props {
  flagKey: string;
}

/**
 * Inline switch on a node — toggles a boolean feature flag end-to-end via
 * `POST /api/admin/settings`. Optimistic flip + revert on error.
 */
export default function NodeToggle({ flagKey }: Props) {
  const { value, loading, error, setValue } = useFeatureFlag(flagKey, true);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setValue(!value);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={error ? `Erreur : ${error}` : value ? "Désactiver" : "Activer"}
      className={[
        "relative inline-flex items-center h-[var(--space-4)] w-[28px] rounded-[var(--radius-full)] transition-all",
        "duration-[var(--duration-fast)] ease-[var(--ease-standard)] border",
        value
          ? "bg-[var(--cykan)]/30 border-[var(--cykan)]/50"
          : "bg-[var(--bg-soft)] border-[var(--line-strong)]",
        loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-[10px] rounded-[var(--radius-full)] transition-transform",
          "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          value
            ? "translate-x-[14px] bg-[var(--cykan)]"
            : "translate-x-[2px] bg-[var(--text-muted)]",
        ].join(" ")}
      />
    </button>
  );
}
