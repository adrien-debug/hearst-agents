import { describe, it, expect } from "vitest";
import { activeItem, NAV_SECTIONS } from "../app/admin/_shell/nav";

describe("activeItem (admin nav)", () => {
  it("accueil exact /admin bat les préfixes plus longs", () => {
    expect(activeItem("/admin")?.href).toBe("/admin");
  });

  it("canvas live sur /admin/pipeline", () => {
    expect(activeItem("/admin/pipeline")?.href).toBe("/admin/pipeline");
  });

  it("agents détail bat /admin", () => {
    expect(activeItem("/admin/agents/xyz")?.href).toBe("/admin/agents");
  });

  it("settings bat pipeline et accueil", () => {
    expect(activeItem("/admin/settings")?.href).toBe("/admin/settings");
  });

  it("NAV contient Accueil puis Canvas live", () => {
    const pipeline = NAV_SECTIONS.find((s) => s.title === "Pipeline")?.items ?? [];
    expect(pipeline[0]?.label).toBe("Accueil");
    expect(pipeline[0]?.href).toBe("/admin");
    expect(pipeline[1]?.label).toBe("Canvas live");
    expect(pipeline[1]?.href).toBe("/admin/pipeline");
  });
});
