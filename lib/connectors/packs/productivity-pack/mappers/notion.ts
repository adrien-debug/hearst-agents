/**
 * Notion Connector — Mappers
 *
 * Path: lib/connectors/packs/productivity-pack/mappers/notion.ts
 */

import type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionUser,
  UnifiedDocument,
  UnifiedTask,
} from "../schemas/notion";

/**
 * Extract plain text from rich_text array
 */
function extractPlainText(richText: unknown[]): string {
  if (!Array.isArray(richText)) return "";
  return richText
    .map((rt: unknown) => {
      const text = rt as { plain_text?: string; text?: { content?: string } };
      return text.plain_text || text.text?.content || "";
    })
    .join("");
}

/**
 * Map Notion Page → Unified Document
 */
export function mapNotionPageToUnified(page: NotionPage): UnifiedDocument {
  const titleProperty = page.properties.title || page.properties.Name;
  let title = "Untitled";

  if (titleProperty && typeof titleProperty === "object") {
    if ("title" in titleProperty && Array.isArray(titleProperty.title)) {
      title = extractPlainText(titleProperty.title) || "Untitled";
    }
  }

  // Extract parent ID
  let parentId: string | undefined;
  if (page.parent.type === "page_id") {
    parentId = page.parent.page_id;
  } else if (page.parent.type === "database_id") {
    parentId = page.parent.database_id;
  }

  return {
    id: page.id,
    provider: "notion",
    title,
    content: undefined, // Would need to fetch blocks separately
    type: "page",
    parentId,
    url: page.url,
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
    author: page.created_by?.id
      ? { id: page.created_by.id }
      : undefined,
    archived: page.archived,
    raw: page,
  };
}

/**
 * Map Notion Database → Unified Document
 */
export function mapNotionDatabaseToUnified(
  database: NotionDatabase
): UnifiedDocument {
  const title = database.title
    .map((t) => t.plain_text)
    .join("") || "Untitled Database";

  return {
    id: database.id,
    provider: "notion",
    title,
    content: database.description?.map((d) => d.plain_text).join(""),
    type: "database",
    parentId: database.parent.page_id,
    url: database.url,
    createdAt: new Date(database.created_time),
    updatedAt: new Date(database.last_edited_time),
    author: database.created_by?.id
      ? { id: database.created_by.id }
      : undefined,
    archived: false,
    raw: database,
  };
}

/**
 * Map Notion Block → content text
 */
export function mapNotionBlockToContent(block: NotionBlock): string {
  switch (block.type) {
    case "paragraph":
      return block.paragraph?.rich_text
        ? extractPlainText(block.paragraph.rich_text)
        : "";
    case "heading_1":
      return block.heading_1?.rich_text
        ? "# " + extractPlainText(block.heading_1.rich_text)
        : "";
    case "heading_2":
      return block.heading_2?.rich_text
        ? "## " + extractPlainText(block.heading_2.rich_text)
        : "";
    case "heading_3":
      return block.heading_3?.rich_text
        ? "### " + extractPlainText(block.heading_3.rich_text)
        : "";
    case "bulleted_list_item":
      return block.bulleted_list_item?.rich_text
        ? "- " + extractPlainText(block.bulleted_list_item.rich_text)
        : "";
    case "numbered_list_item":
      return block.numbered_list_item?.rich_text
        ? "1. " + extractPlainText(block.numbered_list_item.rich_text)
        : "";
    case "to_do":
      const checked = block.to_do?.checked ? "[x]" : "[ ]";
      const text = block.to_do?.rich_text
        ? extractPlainText(block.to_do.rich_text)
        : "";
      return `- ${checked} ${text}`;
    default:
      return "";
  }
}

/**
 * Map Notion Block → Unified Task (for to_do items)
 */
export function mapNotionBlockToTask(
  block: NotionBlock,
  pageUrl: string
): UnifiedTask | null {
  if (block.type !== "to_do" || !block.to_do) {
    return null;
  }

  return {
    id: block.id,
    provider: "notion",
    title: extractPlainText(block.to_do.rich_text),
    completed: block.to_do.checked || false,
    url: `${pageUrl}#${block.id}`,
    createdAt: block.created_time
      ? new Date(block.created_time)
      : new Date(),
    updatedAt: block.last_edited_time
      ? new Date(block.last_edited_time)
      : new Date(),
    raw: block,
  };
}

/**
 * Map multiple items
 */
export function mapNotionPagesToUnified(
  pages: NotionPage[]
): UnifiedDocument[] {
  return pages.map(mapNotionPageToUnified);
}

export function mapNotionDatabasesToUnified(
  databases: NotionDatabase[]
): UnifiedDocument[] {
  return databases.map(mapNotionDatabaseToUnified);
}
