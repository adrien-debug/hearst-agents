import { BLUEPRINT_REGISTRY, type Blueprint } from "./registry";
import { ALL_CONNECTORS } from "../connectors/registry";

export interface BlueprintActivationResult {
  success: boolean;
  missingConnectors: string[];
  activatedWorkflowId?: string;
  error?: string;
}

/**
 * Neural Blueprint Engine
 * Orchestrates the activation and validation of multi-service blueprints.
 */
export class BlueprintEngine {
  static async validate(blueprintId: string, connectedProviders: string[]): Promise<{
    isValid: boolean;
    missing: string[];
  }> {
    return this.validateSync(blueprintId, connectedProviders);
  }

  static validateSync(blueprintId: string, connectedProviders: string[]): {
    isValid: boolean;
    missing: string[];
  } {
    const blueprint = BLUEPRINT_REGISTRY.find(b => b.id === blueprintId);
    if (!blueprint) return { isValid: false, missing: [] };

    const missing = blueprint.requiredConnectors.filter(
      req => !connectedProviders.includes(req)
    );

    return {
      isValid: missing.length === 0,
      missing
    };
  }

  static async activate(blueprintId: string, connectedProviders: string[]): Promise<BlueprintActivationResult> {
    const blueprint = BLUEPRINT_REGISTRY.find(b => b.id === blueprintId);
    if (!blueprint) return { success: false, missingConnectors: [], error: "Blueprint introuvable" };

    const { isValid, missing } = await this.validate(blueprintId, connectedProviders);

    if (!isValid) {
      return {
        success: false,
        missingConnectors: missing,
        error: "Connecteurs requis manquants"
      };
    }

    // Logic to link the workflow to the user's active missions
    // This is where the "Billion Dollar" magic happens: 
    // transforming a static blueprint into a living mission.
    
    return {
      success: true,
      missingConnectors: [],
      activatedWorkflowId: blueprint.workflowId
    };
  }

  static getRequiredConnectorMetas(blueprintId: string) {
    const blueprint = BLUEPRINT_REGISTRY.find(b => b.id === blueprintId);
    if (!blueprint) return [];
    
    return blueprint.requiredConnectors.map(id => 
      ALL_CONNECTORS.find(c => c.id === id)
    ).filter(Boolean);
  }
}
