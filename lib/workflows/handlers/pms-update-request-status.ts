/**
 * Handler `pms_update_request_status` — update du statut d'une service request.
 *
 * Pas de PMS branché → log + retourne un payload mock structuré clairement
 * labellisé `source: "demo"`. Quand un connecteur Mews/Cloudbeds sera ajouté,
 * cette implémentation passera l'API call réel et conservera le même output
 * shape pour la compat workflow.
 */

import type { WorkflowHandler } from "./types";

export const pmsUpdateRequestStatus: WorkflowHandler = async (args) => {
  const requestId = typeof args.requestId === "string" ? args.requestId : "";
  const status = typeof args.status === "string" ? args.status : "dispatched";

  if (!requestId) {
    return {
      success: false,
      error: "pms_update_request_status: requestId manquant",
    };
  }

  console.log(
    `[handler:pms_update_request_status] (demo) requestId=${requestId} → ${status}`,
  );

  return {
    success: true,
    output: {
      source: "demo",
      pmsProvider: null,
      requestId,
      status,
      updatedAt: Date.now(),
    },
  };
};
