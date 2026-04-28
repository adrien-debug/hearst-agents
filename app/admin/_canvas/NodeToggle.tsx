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
        "relative inline-flex items-center h-(--space-4) w-(--space-8) rounded-(--radius-pill) transition-all",
        "duration-(--duration-fast) ease-(--ease-standard) border",
        value
          ? "bg-(--cykan)/30 border-(--cykan)/50"
          : "bg-(--bg-soft) border-(--line-strong)",
        loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-(--space-3) rounded-(--radius-pill) transition-transform",
          "duration-(--duration-fast) ease-(--ease-standard)",
          value
            ? "translate-x-(--space-4) bg-(--cykan)"
            : "translate-x-(--space-1) bg-(--text-muted)",
        ].join(" ")}
      />
    </button>
  );
}
