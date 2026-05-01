import { describe, it, expect, beforeEach } from "vitest";
import {
  registerRun,
  unregisterRun,
  abortRun,
  isRunRegistered,
} from "@/lib/engine/orchestrator/abort-registry";

describe("abort-registry", () => {
  beforeEach(() => {
    // Le registry est un module-scope Map. Un test précédent peut avoir laissé
    // des entrées : on force un cleanup en abort/unregister explicites.
    abortRun("run-1");
    abortRun("run-2");
    unregisterRun("run-1");
    unregisterRun("run-2");
  });

  it("enregistre un AbortController et le retrouve via abortRun", () => {
    const ctrl = new AbortController();
    registerRun("run-1", ctrl);
    expect(isRunRegistered("run-1")).toBe(true);
    expect(ctrl.signal.aborted).toBe(false);

    const aborted = abortRun("run-1");
    expect(aborted).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
    // Le registry purge l'entrée après abort
    expect(isRunRegistered("run-1")).toBe(false);
  });

  it("retourne false quand on tente d'abort un runId inconnu (idempotent)", () => {
    const aborted = abortRun("inexistant");
    expect(aborted).toBe(false);
  });

  it("unregisterRun nettoie sans aborter", () => {
    const ctrl = new AbortController();
    registerRun("run-2", ctrl);
    unregisterRun("run-2");
    expect(isRunRegistered("run-2")).toBe(false);
    expect(ctrl.signal.aborted).toBe(false);
  });

  it("ne re-abort pas un controller déjà aborté (no-op safe)", () => {
    const ctrl = new AbortController();
    ctrl.abort();
    registerRun("run-1", ctrl);
    const aborted = abortRun("run-1");
    expect(aborted).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
  });
});
