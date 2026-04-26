import { describe, expect, it } from "vitest";
import { detectRetrievalMode } from "@/lib/engine/orchestrator/index";

describe("provider routing helpers", () => {
  it("detects calendar requests as structured_data", () => {
    expect(detectRetrievalMode("Quels sont mes rendez-vous aujourd'hui ?")).toBe("structured_data");
    expect(detectRetrievalMode("What meetings do I have this week?")).toBe("structured_data");
  });

  it("keeps document and message detection stable", () => {
    expect(detectRetrievalMode("Montre-moi mes emails récents")).toBe("messages");
    expect(detectRetrievalMode("Quels sont mes fichiers Drive ?")).toBe("documents");
  });
});
