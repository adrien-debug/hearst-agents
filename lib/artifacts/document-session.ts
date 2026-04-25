/**
 * DocumentSession — Source of truth during document construction.
 *
 * State machine:
 *   building → review → revising → review → finalized → exported
 *
 * During construction/revision, DocumentSession owns the content.
 * The Artifact is only updated (synced) when the session reaches "review"
 * or "finalized" — never during incremental section writes.
 *
 * This prevents partial/incomplete documents from appearing in the UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Artifact,
  ArtifactType,
  ArtifactSection,
  ArtifactSourceRef,
  ArtifactMetadata,
} from "./types";
import { ArtifactManager } from "../engine/runtime/engine/artifact-manager";
import type { RunEventBus } from "../events/bus";

// ── Types ────────────────────────────────────────────────

export type SessionStatus =
  | "building"
  | "review"
  | "revising"
  | "finalized"
  | "exported";

export type SectionState = "pending" | "generating" | "complete" | "locked";

export interface OutlineSection {
  id: string;
  title: string;
  order: number;
  description: string;
  state: SectionState;
}

export interface DocumentSession {
  id: string;
  run_id: string;
  artifact_id: string | null;
  user_id: string;
  title: string;
  document_type: ArtifactType;
  status: SessionStatus;
  outline: OutlineSection[];
  sections: Map<string, string>;
  sources: ArtifactSourceRef[];
  metadata: ArtifactMetadata;
  current_version: number;
}

// ── Transitions ──────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  building: ["review"],
  review: ["revising", "finalized"],
  revising: ["review"],
  finalized: ["exported", "revising"],
  exported: [],
};

// ── Manager ──────────────────────────────────────────────

export class DocumentSessionManager {
  constructor(
    private db: SupabaseClient,
    private events: RunEventBus,
  ) {}

  async create(
    runId: string,
    userId: string,
    title: string,
    documentType: ArtifactType,
    metadata?: ArtifactMetadata,
  ): Promise<DocumentSession> {
    const { data, error } = await this.db
      .from("document_sessions")
      .insert({
        run_id: runId,
        user_id: userId,
        title,
        document_type: documentType,
        status: "building",
        outline: [],
        sources: [],
        metadata: metadata ?? {},
        current_version: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[DocumentSession] create error:", error.message);
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return this.toSession(data);
  }

  async setOutline(
    sessionId: string,
    outline: OutlineSection[],
  ): Promise<void> {
    const { error } = await this.db
      .from("document_sessions")
      .update({
        outline: outline.map((s) => ({ ...s, state: "pending" })),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      console.error("[DocumentSession] setOutline error:", error.message);
    }
  }

  async writeSection(
    sessionId: string,
    sectionId: string,
    content: string,
    sources?: ArtifactSourceRef[],
  ): Promise<void> {
    const session = await this.load(sessionId);

    // Update outline section state
    const updatedOutline = session.outline.map((s) =>
      s.id === sectionId ? { ...s, state: "complete" as SectionState } : s,
    );

    // Merge sources
    const allSources = [...session.sources];
    if (sources) {
      for (const src of sources) {
        if (!allSources.find((s) => s.source_id === src.source_id)) {
          allSources.push(src);
        }
      }
    }

    // Store section content in session metadata (sections are in-progress data)
    const currentSections =
      ((await this.loadRawSections(sessionId)) as Record<string, string>) ?? {};
    currentSections[sectionId] = content;

    const { error } = await this.db
      .from("document_sessions")
      .update({
        outline: updatedOutline,
        sources: allSources,
        metadata: {
          ...session.metadata,
          _sections: currentSections,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      console.error("[DocumentSession] writeSection error:", error.message);
    }
  }

  /**
   * Transition to "review" and sync content to Artifact.
   * This is the ONLY moment the Artifact gets created/updated.
   */
  async submitForReview(
    sessionId: string,
    artifactManager: ArtifactManager,
    runId: string,
  ): Promise<Artifact> {
    const session = await this.load(sessionId);
    this.assertTransition(session.status, "review");

    const sections = this.buildSections(session);
    const fullContent = this.renderContent(sections, session.title);
    const newVersion = session.current_version + 1;

    let artifact: Artifact;
    if (!session.artifact_id) {
      // First sync — create the Artifact
      artifact = await artifactManager.create(
        {
          user_id: session.user_id,
          type: session.document_type,
          title: session.title,
          format: "markdown",
          summary: this.generateSummary(sections),
          content: fullContent,
          sections,
          sources: session.sources,
          metadata: {
            ...session.metadata,
            word_count: this.countWords(fullContent),
          },
          created_by: "DocBuilder",
        },
        runId,
      );

      // Link artifact to session
      await this.db
        .from("document_sessions")
        .update({
          artifact_id: artifact.id,
          status: "review",
          current_version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      this.events.emit({
        type: "artifact_created",
        run_id: runId,
        artifact_id: artifact.id,
        artifact_type: session.document_type,
        title: session.title,
      });
    } else {
      // Subsequent sync — revise the Artifact
      artifact = await artifactManager.revise(session.artifact_id, {
        sections,
        full_content: fullContent,
        change_summary: `Version ${newVersion}`,
        created_by: "DocBuilder",
      });

      await this.db
        .from("document_sessions")
        .update({
          status: "review",
          current_version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      this.events.emit({
        type: "artifact_revised",
        run_id: runId,
        artifact_id: session.artifact_id,
        version: newVersion,
      });
    }

    return artifact;
  }

  async startRevision(
    sessionId: string,
    sectionId: string,
  ): Promise<void> {
    const session = await this.load(sessionId);
    this.assertTransition(session.status, "revising");

    const updatedOutline = session.outline.map((s) =>
      s.id === sectionId
        ? { ...s, state: "generating" as SectionState }
        : { ...s, state: "locked" as SectionState },
    );

    await this.db
      .from("document_sessions")
      .update({
        status: "revising",
        outline: updatedOutline,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  }

  async finalize(
    sessionId: string,
    artifactManager: ArtifactManager,
  ): Promise<void> {
    const session = await this.load(sessionId);
    this.assertTransition(session.status, "finalized");

    if (session.artifact_id) {
      await artifactManager.finalize(session.artifact_id);
    }

    await this.db
      .from("document_sessions")
      .update({
        status: "finalized",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  }

  async load(sessionId: string): Promise<DocumentSession> {
    const { data, error } = await this.db
      .from("document_sessions")
      .select()
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      throw new Error(`DocumentSession not found: ${sessionId}`);
    }

    return this.toSession(data);
  }

  // ── Private helpers ────────────────────────────────────

  private toSession(data: Record<string, unknown>): DocumentSession {
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const rawSections =
      (metadata._sections as Record<string, string>) ?? {};

    const sections = new Map<string, string>();
    for (const [k, v] of Object.entries(rawSections)) {
      sections.set(k, v);
    }

    return {
      id: data.id as string,
      run_id: data.run_id as string,
      artifact_id: (data.artifact_id as string) ?? null,
      user_id: data.user_id as string,
      title: data.title as string,
      document_type: data.document_type as ArtifactType,
      status: data.status as SessionStatus,
      outline: (data.outline ?? []) as OutlineSection[],
      sections,
      sources: (data.sources ?? []) as ArtifactSourceRef[],
      metadata: {
        audience: metadata.audience as ArtifactMetadata["audience"],
        export_targets: metadata.export_targets as ArtifactMetadata["export_targets"],
        tags: metadata.tags as ArtifactMetadata["tags"],
        template_id: metadata.template_id as string | undefined,
        word_count: metadata.word_count as number | undefined,
      },
      current_version: data.current_version as number,
    };
  }

  private async loadRawSections(
    sessionId: string,
  ): Promise<Record<string, string>> {
    const { data } = await this.db
      .from("document_sessions")
      .select("metadata")
      .eq("id", sessionId)
      .single();

    const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
    return (metadata._sections as Record<string, string>) ?? {};
  }

  private buildSections(session: DocumentSession): ArtifactSection[] {
    return session.outline
      .filter((o) => o.state === "complete" || session.sections.has(o.id))
      .sort((a, b) => a.order - b.order)
      .map((o) => ({
        id: o.id,
        title: o.title,
        content: session.sections.get(o.id) ?? "",
        order: o.order,
      }));
  }

  private renderContent(
    sections: ArtifactSection[],
    title: string,
  ): string {
    const header = `# ${title}\n\n`;
    const body = sections
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join("\n\n---\n\n");
    return header + body;
  }

  private generateSummary(sections: ArtifactSection[]): string {
    return `Document en ${sections.length} sections : ${sections.map((s) => s.title).join(", ")}.`;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private assertTransition(
    from: SessionStatus,
    to: SessionStatus,
  ): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new Error(
        `Invalid session transition: ${from} → ${to}`,
      );
    }
  }
}
