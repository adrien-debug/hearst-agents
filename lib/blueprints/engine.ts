import { BLUEPRINT_REGISTRY } from "./registry";
import { ALL_CONNECTORS } from "../connectors/registry";

export interface BlueprintConnectionState {
  provider: string;
  status: string;
}

export interface BlueprintReadinessReport {
  blueprintId: string;
  ready: boolean;
  missingConnectorIds: string[];
  connectedConnectorIds: string[];
  degraded?: boolean;
  reason?: string;
}

export interface ActivatedBlueprintMission {
  id: string;
  name: string;
  input: string;
  schedule: string;
  enabled: boolean;
}

export interface BlueprintActivationResult {
  success: boolean;
  readiness: BlueprintReadinessReport;
  missingConnectors: string[];
  mission?: ActivatedBlueprintMission;
  activatedWorkflowId?: string;
  error?: string;
}

/**
 * Neural Blueprint Engine
 * Orchestrates the activation and validation of multi-service blueprints.
 */
export class BlueprintEngine {
  static async validate(
    blueprintId: string,
    connections: BlueprintConnectionState[],
  ): Promise<BlueprintReadinessReport> {
    return this.validateSync(blueprintId, connections);
  }

  static validateSync(
    blueprintId: string,
    connections: BlueprintConnectionState[],
  ): BlueprintReadinessReport {
    const blueprint = BLUEPRINT_REGISTRY.find((b) => b.id === blueprintId);
    if (!blueprint) {
      return {
        blueprintId,
        ready: false,
        missingConnectorIds: [],
        connectedConnectorIds: [],
        degraded: true,
        reason: "blueprint_not_found",
      };
    }

    const connectedConnectorIds = this.resolveConnectorIdsByStatus(connections, "connected");
    const degradedConnectorIds = this.resolveConnectorIdsByStatus(connections, "degraded", "error");

    const missingConnectorIds = blueprint.requiredConnectors.filter(
      (connectorId) => !connectedConnectorIds.includes(connectorId),
    );
    const degraded = blueprint.requiredConnectors.some((connectorId) =>
      degradedConnectorIds.includes(connectorId),
    );

    let reason: string | undefined;
    if (missingConnectorIds.length > 0) {
      reason = "missing_connectors";
    } else if (degraded) {
      reason = "degraded_connectors";
    } else if (!blueprint.missionTemplate) {
      reason = "missing_mission_template";
    }

    return {
      blueprintId,
      ready: missingConnectorIds.length === 0 && !degraded && Boolean(blueprint.missionTemplate),
      missingConnectorIds,
      connectedConnectorIds,
      degraded,
      reason,
    };
  }

  static async activate(
    blueprintId: string,
    connections: BlueprintConnectionState[],
  ): Promise<BlueprintActivationResult> {
    const blueprint = BLUEPRINT_REGISTRY.find((b) => b.id === blueprintId);
    if (!blueprint) {
      const readiness: BlueprintReadinessReport = {
        blueprintId,
        ready: false,
        missingConnectorIds: [],
        connectedConnectorIds: [],
        degraded: true,
        reason: "blueprint_not_found",
      };
      return {
        success: false,
        readiness,
        missingConnectors: [],
        error: "Blueprint introuvable",
      };
    }

    const readiness = await this.validate(blueprintId, connections);

    if (!readiness.ready) {
      return {
        success: false,
        readiness,
        missingConnectors: readiness.missingConnectorIds,
        error:
          readiness.reason === "degraded_connectors"
            ? "Connecteurs dégradés"
            : "Connecteurs requis manquants",
      };
    }

    if (!blueprint.missionTemplate) {
      return {
        success: false,
        readiness: {
          ...readiness,
          ready: false,
          degraded: true,
          reason: "missing_mission_template",
        },
        missingConnectors: readiness.missingConnectorIds,
        error: "Template de mission introuvable",
      };
    }

    const response = await fetch("/api/v2/missions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: blueprint.missionTemplate.name,
        input: blueprint.missionTemplate.input,
        schedule: blueprint.missionTemplate.schedule,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          mission?: ActivatedBlueprintMission;
        }
      | null;

    if (!response.ok || !payload?.mission) {
      return {
        success: false,
        readiness,
        missingConnectors: readiness.missingConnectorIds,
        error: payload?.error ?? "mission_activation_failed",
      };
    }

    return {
      success: true,
      readiness,
      missingConnectors: [],
      mission: payload.mission,
      activatedWorkflowId: blueprint.workflowId,
    };
  }

  static getRequiredConnectorMetas(blueprintId: string) {
    const blueprint = BLUEPRINT_REGISTRY.find((b) => b.id === blueprintId);
    if (!blueprint) return [];

    return blueprint.requiredConnectors
      .map((id) => ALL_CONNECTORS.find((c) => c.id === id))
      .filter(Boolean);
  }

  static isConnectorConnected(
    connectorId: string,
    connections: BlueprintConnectionState[],
  ): boolean {
    return this.resolveConnectorIdsByStatus(connections, "connected").includes(connectorId);
  }

  private static resolveConnectorIdsByStatus(
    connections: BlueprintConnectionState[],
    ...statuses: string[]
  ): string[] {
    const matchedProviderIds = new Set(
      connections
        .filter((connection) => statuses.includes(connection.status))
        .map((connection) => connection.provider),
    );
    const resolvedConnectorIds = new Set<string>();

    for (const connector of ALL_CONNECTORS) {
      if (matchedProviderIds.has(connector.id)) {
        resolvedConnectorIds.add(connector.id);
      }
      if (connector.provider && matchedProviderIds.has(connector.provider)) {
        resolvedConnectorIds.add(connector.id);
      }
    }

    return Array.from(resolvedConnectorIds);
  }
}
