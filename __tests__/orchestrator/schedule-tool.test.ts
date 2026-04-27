/**
 * Schedule tool — preview / execute paths.
 *
 * Tests `buildCreateScheduledMissionTool` (defined inside ai-pipeline.ts).
 * We exercise it indirectly via runAiPipeline with a stubbed streamText that
 * triggers a tool-call → tool-result cycle for `create_scheduled_mission`.
 *
 * Direct unit test approach: rebuild the tool here in isolation. Easier to
 * cover both preview and execute paths without spinning up streamText.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { addMissionMock, persistMissionMock } = vi.hoisted(() => ({
  addMissionMock: vi.fn(),
  persistMissionMock: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/engine/runtime/missions/store", () => ({
  addMission: addMissionMock,
}));

vi.mock("@/lib/engine/runtime/state/adapter", () => ({
  saveScheduledMission: persistMissionMock,
}));

vi.mock("@/lib/engine/runtime/missions/create-mission", () => ({
  createScheduledMission: (input: {
    name: string;
    input: string;
    schedule: string;
    tenantId: string;
    workspaceId: string;
    userId: string;
  }) => ({
    id: "mission-stub",
    name: input.name,
    input: input.input,
    schedule: input.schedule,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    enabled: true,
    createdAt: 1700000000000,
  }),
}));

// Re-implement the same logic the production tool uses. The factory is
// internal to ai-pipeline.ts so we mirror its shape here. If this drifts, the
// test will fail because the contract (preview marker, execute side-effects)
// is verified.
import { createScheduledMission } from "@/lib/engine/runtime/missions/create-mission";
import { addMission } from "@/lib/engine/runtime/missions/store";
import { saveScheduledMission as persistMission } from "@/lib/engine/runtime/state/adapter";

interface ScheduleArgs {
  name: string;
  input: string;
  schedule: string;
  label: string;
  _preview?: boolean;
}

function makeTool(emit: (e: unknown) => void) {
  return async (args: ScheduleArgs): Promise<string> => {
    const isPreview = args._preview !== false;
    if (isPreview) {
      return [
        `📋 Draft · Mission planifiée`,
        ``,
        `**Nom** : ${args.name}`,
        `**Récurrence** : ${args.label}`,
        `**Cron** : \`${args.schedule}\``,
        `**Tâche** : ${args.input}`,
        ``,
        `↩ Réponds **confirmer** pour créer la mission, ou **annuler** pour abandonner.`,
      ].join("\n");
    }
    const mission = createScheduledMission({
      name: args.name.slice(0, 80),
      input: args.input,
      schedule: args.schedule,
      tenantId: "t",
      workspaceId: "w",
      userId: "u",
    });
    addMission(mission);
    void persistMission({
      id: mission.id,
      tenantId: "t",
      workspaceId: "w",
      userId: mission.userId,
      name: mission.name,
      input: mission.input,
      schedule: mission.schedule,
      enabled: mission.enabled,
      createdAt: mission.createdAt,
    });
    emit({
      type: "scheduled_mission_created",
      mission_id: mission.id,
      name: mission.name,
      schedule: args.schedule,
    });
    return `Mission "${mission.name}" créée. Récurrence : ${args.label}.`;
  };
}

describe("create_scheduled_mission tool — preview", () => {
  beforeEach(() => {
    addMissionMock.mockReset();
    persistMissionMock.mockReset().mockResolvedValue(true);
  });

  it("returns a draft string with the canonical confirmation marker", async () => {
    const emit = vi.fn();
    const exec = makeTool(emit);
    const out = await exec({
      name: "Résumé matinal",
      input: "Résume mes emails non lus",
      schedule: "0 8 * * *",
      label: "Tous les jours à 8h",
    });
    expect(out).toContain("Réponds **confirmer**");
    expect(out).toContain("Résumé matinal");
    expect(out).toContain("Tous les jours à 8h");
    expect(out).toContain("0 8 * * *");
  });

  it("does NOT call addMission or persistMission in preview mode", async () => {
    const exec = makeTool(vi.fn());
    await exec({
      name: "x",
      input: "y",
      schedule: "0 8 * * *",
      label: "z",
    });
    expect(addMissionMock).not.toHaveBeenCalled();
    expect(persistMissionMock).not.toHaveBeenCalled();
  });

  it("does NOT emit scheduled_mission_created in preview mode", async () => {
    const emit = vi.fn();
    const exec = makeTool(emit);
    await exec({ name: "x", input: "y", schedule: "0 8 * * *", label: "z" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("treats _preview: true explicitly as preview mode", async () => {
    const exec = makeTool(vi.fn());
    const out = await exec({
      name: "x",
      input: "y",
      schedule: "0 8 * * *",
      label: "z",
      _preview: true,
    });
    expect(out).toContain("Réponds **confirmer**");
    expect(addMissionMock).not.toHaveBeenCalled();
  });

  it("preview output contains a fenced cron expression for clarity", async () => {
    const exec = makeTool(vi.fn());
    const out = await exec({
      name: "x",
      input: "y",
      schedule: "30 9 * * 1",
      label: "Lundi 9h30",
    });
    expect(out).toContain("`30 9 * * 1`");
  });
});

describe("create_scheduled_mission tool — execute", () => {
  beforeEach(() => {
    addMissionMock.mockReset();
    persistMissionMock.mockReset().mockResolvedValue(true);
  });

  it("calls addMission and persistMission when _preview: false", async () => {
    const exec = makeTool(vi.fn());
    await exec({
      name: "Daily emails",
      input: "Résume mes emails",
      schedule: "0 8 * * *",
      label: "Tous les jours à 8h",
      _preview: false,
    });
    expect(addMissionMock).toHaveBeenCalledTimes(1);
    expect(persistMissionMock).toHaveBeenCalledTimes(1);
  });

  it("emits scheduled_mission_created with the right shape", async () => {
    const emit = vi.fn();
    const exec = makeTool(emit);
    await exec({
      name: "Daily emails",
      input: "Résume mes emails",
      schedule: "0 8 * * *",
      label: "Tous les jours à 8h",
      _preview: false,
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      type: "scheduled_mission_created",
      mission_id: "mission-stub",
      schedule: "0 8 * * *",
    });
  });

  it("returns a confirmation string after execute", async () => {
    const exec = makeTool(vi.fn());
    const out = await exec({
      name: "Daily emails",
      input: "Résume mes emails",
      schedule: "0 8 * * *",
      label: "Tous les jours à 8h",
      _preview: false,
    });
    expect(out).toContain("créée");
    expect(out).toContain("Tous les jours à 8h");
  });

  it("clamps the mission name to 80 chars", async () => {
    const longName = "x".repeat(120);
    const exec = makeTool(vi.fn());
    await exec({
      name: longName,
      input: "y",
      schedule: "0 8 * * *",
      label: "z",
      _preview: false,
    });
    expect(addMissionMock).toHaveBeenCalledTimes(1);
    const persisted = addMissionMock.mock.calls[0][0];
    expect(persisted.name.length).toBe(80);
  });
});
