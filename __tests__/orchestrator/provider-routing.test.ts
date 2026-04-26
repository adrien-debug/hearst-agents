import { describe, expect, it } from "vitest";
import { resolveRetrievalMode } from "@/lib/capabilities/taxonomy";

describe("provider routing helpers", () => {
  it("detects calendar requests as structured_data", () => {
    expect(resolveRetrievalMode("Quels sont mes rendez-vous aujourd'hui ?")).toBe("structured_data");
    expect(resolveRetrievalMode("What meetings do I have this week?")).toBe("structured_data");
  });

  it("keeps document and message detection stable", () => {
    expect(resolveRetrievalMode("Montre-moi mes emails récents")).toBe("messages");
    expect(resolveRetrievalMode("Quels sont mes fichiers Drive ?")).toBe("documents");
  });
});
