/**
 * Figma Connector — Mappers
 *
 * Path: lib/connectors/packs/design-pack/mappers/figma.ts
 */

import type {
  FigmaFile,
  FigmaComponent,
  FigmaStyle,
  FigmaVariable,
  FigmaComment,
  UnifiedDesignFile,
  UnifiedDesignToken,
} from "../schemas/figma";

/**
 * Map Figma File → Unified Design File
 */
export function mapFigmaFileToUnified(file: FigmaFile): UnifiedDesignFile {
  return {
    id: file.key,
    provider: "figma",
    name: file.name,
    thumbnailUrl: file.thumbnail_url,
    lastModified: new Date(file.last_modified),
    owner: file.owner
      ? { id: file.owner.id, name: file.owner.handle }
      : undefined,
    type: "file",
    url: `https://figma.com/file/${file.key}`,
    raw: file,
  };
}

/**
 * Map Figma Component → Unified Design File
 */
export function mapFigmaComponentToUnified(
  component: FigmaComponent,
  fileKey: string
): UnifiedDesignFile {
  return {
    id: component.key,
    provider: "figma",
    name: component.name,
    lastModified: new Date(), // Components don't have modification date in API
    type: "component",
    url: `https://figma.com/file/${fileKey}?node-id=${encodeURIComponent(
      component.key
    )}`,
    raw: component,
  };
}

/**
 * Map Figma Variable → Unified Design Token
 */
export function mapFigmaVariableToUnified(
  variable: FigmaVariable,
  collectionName: string,
  modeId?: string
): UnifiedDesignToken {
  // Determine token type from resolved_type
  let type: UnifiedDesignToken["type"];
  switch (variable.resolved_type) {
    case "COLOR":
      type = "color";
      break;
    case "FLOAT":
      type = "spacing";
      break;
    case "STRING":
      type = "typography";
      break;
    default:
      type = "other";
  }

  // Get value for specific mode or first available
  const value = modeId
    ? variable.values_by_mode[modeId]
    : Object.values(variable.values_by_mode)[0];

  return {
    id: variable.id,
    provider: "figma",
    name: variable.name,
    type,
    value,
    collection: collectionName,
    mode: modeId,
    raw: variable,
  };
}

/**
 * Map Figma Style → Unified Design Token
 */
export function mapFigmaStyleToUnified(style: FigmaStyle): UnifiedDesignToken {
  let type: UnifiedDesignToken["type"];
  switch (style.style_type) {
    case "FILL":
      type = "color";
      break;
    case "TEXT":
      type = "typography";
      break;
    case "EFFECT":
      type = "shadow";
      break;
    default:
      type = "other";
  }

  return {
    id: style.key,
    provider: "figma",
    name: style.name,
    type,
    value: null, // Would need to fetch style details separately
    collection: "Styles",
    raw: style,
  };
}

/**
 * Map Figma Comment → plain text summary
 */
export function mapFigmaCommentToText(comment: FigmaComment): string {
  const resolved = comment.resolved ? "[Resolved] " : "";
  const location = comment.client_meta
    ? `(@ ${Math.round(comment.client_meta.x)},${Math.round(
        comment.client_meta.y
      )})`
    : "";
  return `${resolved}${comment.user.handle}: ${comment.message} ${location}`;
}

/**
 * Map multiple files
 */
export function mapFigmaFilesToUnified(
  files: FigmaFile[]
): UnifiedDesignFile[] {
  return files.map(mapFigmaFileToUnified);
}

/**
 * Map multiple variables
 */
export function mapFigmaVariablesToUnified(
  variables: FigmaVariable[],
  collectionName: string,
  modeId?: string
): UnifiedDesignToken[] {
  return variables.map((v) => mapFigmaVariableToUnified(v, collectionName, modeId));
}
