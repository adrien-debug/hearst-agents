/**
 * Artifact Manager — CRUD + versioning for Artifacts.
 *
 * Source of truth during construction is DocumentSession (not here).
 * This manager handles the published snapshots.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Artifact,
  ArtifactRef,
  CreateArtifactInput,
  ReviseArtifactInput,
} from "../../../artifacts/types";

export class ArtifactManager {
  constructor(
    private db: SupabaseClient,
    private runId: string,
  ) {}

  async create(
    input: CreateArtifactInput,
    runId: string,
  ): Promise<Artifact> {
    const { data, error } = await this.db
      .from("artifacts")
      .insert({
        run_id: runId,
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        status: "draft" as const,
        format: input.format ?? "markdown",
        summary: input.summary ?? null,
        content: input.content,
        sections: input.sections ?? [],
        sources: input.sources ?? [],
        metadata: input.metadata ?? {},
        version: 1,
      })
      .select()
      .single();

    if (error) {
      console.error("[ArtifactManager] create error:", error.message);
      throw new Error(`Failed to create artifact: ${error.message}`);
    }

    // Save v1 snapshot
    await this.db.from("artifact_versions").insert({
      artifact_id: data!.id,
      version: 1,
      content: input.content,
      sections: input.sections ?? [],
      created_by: input.created_by,
    });

    return data as Artifact;
  }

  async revise(
    artifactId: string,
    changes: ReviseArtifactInput,
  ): Promise<Artifact> {
    const current = await this.load(artifactId);
    const newVersion = current.version + 1;

    let newSections = current.sections;
    let newContent = current.content;

    if (changes.sections) {
      newSections = changes.sections;
      newContent =
        changes.full_content ??
        newSections
          .sort((a, b) => a.order - b.order)
          .map((s) => `## ${s.title}\n\n${s.content}`)
          .join("\n\n");
    } else if (changes.section_id && changes.new_content) {
      newSections = newSections.map((s) =>
        s.id === changes.section_id
          ? { ...s, content: changes.new_content! }
          : s,
      );
      newContent = newSections
        .sort((a, b) => a.order - b.order)
        .map((s) => `## ${s.title}\n\n${s.content}`)
        .join("\n\n");
    } else if (changes.full_content) {
      newContent = changes.full_content;
    }

    const { error } = await this.db
      .from("artifacts")
      .update({
        content: newContent,
        sections: newSections,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", artifactId);

    if (error) {
      console.error("[ArtifactManager] revise error:", error.message);
    }

    await this.db.from("artifact_versions").insert({
      artifact_id: artifactId,
      version: newVersion,
      content: newContent,
      sections: newSections,
      change_summary: changes.change_summary,
      created_by: changes.created_by,
    });

    return this.load(artifactId);
  }

  async load(artifactId: string): Promise<Artifact> {
    const { data, error } = await this.db
      .from("artifacts")
      .select()
      .eq("id", artifactId)
      .single();

    if (error || !data) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }
    return data as Artifact;
  }

  async loadMany(ids: string[]): Promise<Artifact[]> {
    if (ids.length === 0) return [];
    const { data } = await this.db
      .from("artifacts")
      .select()
      .in("id", ids);
    return (data ?? []) as Artifact[];
  }

  async listRefs(runId: string): Promise<ArtifactRef[]> {
    const { data } = await this.db
      .from("artifacts")
      .select("id, type, title")
      .eq("run_id", runId);
    return (data ?? []).map((d: { id: string; type: string; title: string }) => ({
      artifact_id: d.id,
      type: d.type as ArtifactRef["type"],
      title: d.title,
    }));
  }

  async finalize(artifactId: string): Promise<void> {
    const { error } = await this.db
      .from("artifacts")
      .update({ status: "final", updated_at: new Date().toISOString() })
      .eq("id", artifactId);

    if (error) {
      console.error("[ArtifactManager] finalize error:", error.message);
    }
  }
}
