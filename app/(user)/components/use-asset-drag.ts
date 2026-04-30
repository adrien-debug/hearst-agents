"use client";

/**
 * useAssetDrag — Hook réutilisable pour rendre un asset draggable.
 *
 * Pattern : tout composant qui rend une carte/tile/preview asset peut
 * appeler `getDragProps({ id, kind, title })` et spread les props sur son
 * élément racine. Le receveur (ChatInput, AssetCompareStage, …) lit
 * `dataTransfer.getData("application/x-hearst-asset+json")`.
 *
 * Pas de state local — tout est dérivé du payload donné à chaque appel.
 */

import { useCallback } from "react";

export const ASSET_DRAG_MIME = "application/x-hearst-asset+json";

export interface AssetDragPayload {
  assetId: string;
  kind: string;
  title: string;
}

export interface AssetDragInput {
  id: string;
  kind: string;
  title: string;
}

export interface AssetDragProps {
  draggable: true;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
}

export function useAssetDrag(): {
  getDragProps: (input: AssetDragInput) => AssetDragProps;
} {
  const getDragProps = useCallback((input: AssetDragInput): AssetDragProps => {
    return {
      draggable: true,
      onDragStart: (event) => {
        const payload: AssetDragPayload = {
          assetId: input.id,
          kind: input.kind,
          title: input.title,
        };
        try {
          event.dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload));
          event.dataTransfer.setData("text/plain", `@asset:${input.title}`);
          event.dataTransfer.effectAllowed = "copyLink";
        } catch {
          // Browsers peuvent throw si dataTransfer indisponible — fail-soft.
        }
      },
    };
  }, []);

  return { getDragProps };
}

/**
 * Utilitaire côté receveur : extrait le payload d'un drop event si présent.
 * Retourne `null` si le drop ne porte pas notre MIME type ou si le JSON est
 * invalide.
 */
export function readAssetDragPayload(
  event: React.DragEvent<HTMLElement>,
): AssetDragPayload | null {
  try {
    const raw = event.dataTransfer.getData(ASSET_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AssetDragPayload>;
    if (
      typeof parsed?.assetId === "string" &&
      typeof parsed?.kind === "string" &&
      typeof parsed?.title === "string"
    ) {
      return parsed as AssetDragPayload;
    }
    return null;
  } catch {
    return null;
  }
}
