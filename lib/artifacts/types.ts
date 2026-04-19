/**
 * Artifact types — Unified model for all document/output types.
 */

export type ArtifactType =
  | "chat_response"
  | "draft"
  | "memo"
  | "report"
  | "deliverable";

export type ArtifactStatus = "draft" | "final";

export type ArtifactFormat =
  | "text"
  | "markdown"
  | "html"
  | "pdf_ready"
  | "json";

export interface ArtifactSection {
  id: string;
  title: string;
  content: string;
  order: number;
  sources?: string[];
}

export interface ArtifactSourceRef {
  id: string;
  source_type:
    | "email"
    | "slack"
    | "drive_file"
    | "notion_page"
    | "calendar_event"
    | "metric"
    | "manual";
  source_id: string;
  label: string;
  excerpt?: string;
  url?: string;
}

export interface Artifact {
  id: string;
  run_id: string | null;
  user_id: string;
  type: ArtifactType;
  title: string;
  status: ArtifactStatus;
  format: ArtifactFormat;
  summary: string | null;
  content: string;
  sections: ArtifactSection[];
  sources: ArtifactSourceRef[];
  metadata: ArtifactMetadata;
  version: number;
  parent_artifact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactMetadata {
  template_id?: string;
  audience?: "self" | "team" | "exec" | "client";
  export_targets?: ("html" | "pdf" | "docx")[];
  tags?: string[];
  word_count?: number;
}

export interface ArtifactRef {
  artifact_id: string;
  type: ArtifactType;
  title: string;
}

export interface CreateArtifactInput {
  user_id: string;
  type: ArtifactType;
  title: string;
  format?: ArtifactFormat;
  summary?: string;
  content: string;
  sections?: ArtifactSection[];
  sources?: ArtifactSourceRef[];
  metadata?: ArtifactMetadata;
  created_by: string;
}

export interface ReviseArtifactInput {
  section_id?: string;
  new_content?: string;
  full_content?: string;
  sections?: ArtifactSection[];
  change_summary: string;
  created_by: string;
}
