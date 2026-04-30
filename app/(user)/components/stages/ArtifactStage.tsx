"use client";

/**
 * ArtifactStage — Stage code-exec E2B (B8).
 *
 * Layout split horizontal : éditeur 50% | preview 50%.
 * Workflow : tape code → ⌘Enter → POST /api/v2/jobs/code-exec → poll
 * /api/v2/jobs/[jobId]/status → fetch result depuis storageUrl → render
 * dans PreviewPane.
 *
 * Hotkey ⌘0 (cf. STAGE_HOTKEYS dans stores/stage.ts).
 *
 * Asset persistence : la route code-exec persiste un asset kind=artifact
 * dès l'enqueue, le worker écrit le contentRef après run.
 *
 * Re-Run sur un asset existant : le payload Stage peut contenir un
 * `artifactId` → on charge le code et l'output existants. La création
 * de variants additionnels (versioning) est aussi gérée par le worker
 * existant — chaque run mint une nouvelle row asset_variants.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useStageStore } from "@/stores/stage";
import { CodeEditor } from "../artifact/CodeEditor";
import { PreviewPane, type ExecResult } from "../artifact/PreviewPane";
import { ProviderChip } from "../ProviderChip";
import { StageActionBar, type StageAction } from "./StageActionBar";
import { toast } from "@/app/hooks/use-toast";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 80;

const DEFAULT_PYTHON_CODE = `# Tape ton code Python ici. ⌘Enter pour exécuter.
print("hello hearst")
`;

const DEFAULT_NODE_CODE = `// Tape ton code Node ici. ⌘Enter pour exécuter.
console.log("hello hearst");
`;

interface ArtifactStageProps {
  artifactId?: string;
  initialCode?: string;
  initialLanguage?: "python" | "node";
}

type RunState = "idle" | "running" | "ready" | "failed";

interface AssetVariantRow {
  id: string;
  status: string;
  storage_url?: string | null;
  storageUrl?: string | null;
  metadata?: { runtime?: string; error?: string | null } | null;
  generated_at?: string | null;
}

export function ArtifactStage({
  artifactId,
  initialCode,
  initialLanguage = "python",
}: ArtifactStageProps) {
  const back = useStageStore((s) => s.back);

  const [language, setLanguage] = useState<"python" | "node">(initialLanguage);
  const [code, setCode] = useState<string>(
    initialCode ?? (initialLanguage === "node" ? DEFAULT_NODE_CODE : DEFAULT_PYTHON_CODE),
  );
  const [runState, setRunState] = useState<RunState>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [costUsd, setCostUsd] = useState<number | undefined>(undefined);
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [variants, setVariants] = useState<AssetVariantRow[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(artifactId ?? null);

  const pollAbortRef = useRef<AbortController | null>(null);

  const loadVariantOutput = useCallback(async (variant: AssetVariantRow) => {
    const url = variant.storage_url ?? variant.storageUrl;
    if (!url) return;
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const exec = (await res.json()) as ExecResult;
      setResult(exec);
      setRunState("ready");
    } catch {
      // silent
    }
  }, []);

  // Si on ouvre un artifact existant, charge variants + dernier output.
  useEffect(() => {
    if (!artifactId) return;
    let cancelled = false;
    (async () => {
      try {
        const [assetRes, variantsRes] = await Promise.all([
          fetch(`/api/v2/assets/${artifactId}`, { credentials: "include" }),
          fetch(`/api/v2/assets/${artifactId}/variants`, { credentials: "include" }),
        ]);
        if (assetRes.ok) {
          const data = (await assetRes.json()) as {
            asset?: { contentRef?: string; provenance?: { language?: string } };
          };
          if (!cancelled && data.asset?.contentRef) setCode(data.asset.contentRef);
          if (!cancelled && data.asset?.provenance?.language === "node")
            setLanguage("node");
        }
        if (variantsRes.ok) {
          const v = (await variantsRes.json()) as { variants?: AssetVariantRow[] };
          if (!cancelled && Array.isArray(v.variants)) {
            const codeVariants = v.variants.filter(
              (vv) => vv.status === "ready" && (vv.storage_url ?? vv.storageUrl),
            );
            setVariants(codeVariants);
            if (codeVariants.length > 0) {
              const latest = codeVariants[codeVariants.length - 1];
              setActiveVariantId(latest.id);
              void loadVariantOutput(latest);
            }
          }
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifactId, loadVariantOutput]);

  const handleRun = useCallback(async () => {
    if (!code.trim()) {
      toast.error("Code vide", "Tape un script avant de lancer.");
      return;
    }
    pollAbortRef.current?.abort();
    const abort = new AbortController();
    pollAbortRef.current = abort;

    setRunState("running");
    setProgress(0);
    setResult(null);
    setErrorMessage(null);
    const startedAt = Date.now();

    try {
      const enqRes = await fetch("/api/v2/jobs/code-exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, runtime: language }),
      });
      if (!enqRes.ok) {
        const err = (await enqRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? `HTTP ${enqRes.status}`);
      }
      const enq = (await enqRes.json()) as {
        jobId: string;
        assetId: string;
        variantId?: string;
        estimatedCostUsd?: number;
      };
      if (enq.assetId) setCurrentAssetId(enq.assetId);
      if (enq.estimatedCostUsd) setCostUsd(enq.estimatedCostUsd);

      // Poll — le state ne quitte "running" que sur completed/failed.
      let lastReturn: { storageUrl?: string; metadata?: Record<string, unknown> } | null = null;
      let attempts = 0;
      while (!abort.signal.aborted && attempts < POLL_MAX_ATTEMPTS) {
        attempts += 1;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abort.signal.aborted) return;

        const statusRes = await fetch(
          `/api/v2/jobs/${enq.jobId}/status?kind=code-exec`,
          { credentials: "include", signal: abort.signal },
        );
        if (!statusRes.ok) continue;
        const data = (await statusRes.json()) as {
          state: string;
          progress?: number;
          returnvalue?: { storageUrl?: string; metadata?: Record<string, unknown> } | null;
          failedReason?: string | null;
        };
        if (typeof data.progress === "number") setProgress(data.progress);

        if (data.state === "completed") {
          lastReturn = data.returnvalue ?? null;
          break;
        }
        if (data.state === "failed") {
          throw new Error(data.failedReason ?? "Job E2B a échoué.");
        }
      }

      setLatencyMs(Date.now() - startedAt);

      if (!lastReturn) {
        throw new Error("Timeout d'attente du résultat.");
      }

      // Le worker a uploadé un JSON ExecResult dans storageUrl.
      if (lastReturn.storageUrl) {
        const outRes = await fetch(lastReturn.storageUrl, { credentials: "include" });
        if (outRes.ok) {
          const exec = (await outRes.json()) as ExecResult;
          setResult(exec);
          setRunState(exec.error ? "failed" : "ready");
          if (exec.error) setErrorMessage(exec.error);
          return;
        }
      }

      // Fallback : on a au moins les metadata stdout/stderr du job
      const meta = (lastReturn.metadata ?? {}) as {
        stdout?: string;
        stderr?: string;
        error?: string | null;
      };
      setResult({
        stdout: meta.stdout ?? "",
        stderr: meta.stderr ?? "",
        results: [],
        error: meta.error ?? null,
      });
      setRunState(meta.error ? "failed" : "ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setRunState("failed");
    }
  }, [code, language]);

  const cutAction: StageAction = {
    id: "back",
    label: "Retour",
    onClick: back,
  };

  const runAction: StageAction = {
    id: "run",
    label: runState === "running" ? "Exécution…" : "Run ⌘Enter",
    variant: "primary",
    shortcut: "⌘⏎",
    onClick: handleRun,
    loading: runState === "running",
    disabled: runState === "running",
  };

  return (
    <div
      className="flex flex-1 flex-col min-h-0"
      style={{ background: "var(--bg-center)" }}
    >
      <StageActionBar
        context={
          <>
            <span
              className="rounded-pill bg-[var(--cykan)]"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-11 font-medium text-[var(--cykan)]">
              ARTIFACT
            </span>
            <span
              className="rounded-pill bg-[var(--text-ghost)]"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              aria-hidden
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "python" | "node")}
              disabled={runState === "running"}
              className="t-11 font-light bg-transparent border border-[var(--border-default)] rounded-md text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none"
              style={{
                paddingLeft: "var(--space-2)",
                paddingRight: "var(--space-2)",
                paddingTop: "var(--space-1)",
                paddingBottom: "var(--space-1)",
              }}
              aria-label="Runtime"
            >
              <option value="python">PYTHON</option>
              <option value="node">NODE</option>
            </select>
            {currentAssetId && (
              <>
                <span
                  className="rounded-pill bg-[var(--text-ghost)]"
                  style={{ width: "var(--space-1)", height: "var(--space-1)" }}
                  aria-hidden
                />
                <span className="t-11 font-light text-[var(--text-muted)]">
                  {currentAssetId.slice(0, 8)}
                </span>
              </>
            )}
            {variants.length > 1 && (
              <select
                value={activeVariantId ?? ""}
                onChange={(e) => {
                  const v = variants.find((vv) => vv.id === e.target.value);
                  if (v) {
                    setActiveVariantId(v.id);
                    void loadVariantOutput(v);
                  }
                }}
                className="t-11 font-light bg-transparent border border-[var(--border-default)] rounded-md text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none"
                style={{
                  paddingLeft: "var(--space-2)",
                  paddingRight: "var(--space-2)",
                  paddingTop: "var(--space-1)",
                  paddingBottom: "var(--space-1)",
                }}
                aria-label="Version"
              >
                {variants.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    V{i + 1}
                  </option>
                ))}
              </select>
            )}
          </>
        }
        primary={runAction}
        secondary={[cutAction]}
        onBack={back}
      />

      <div className="flex flex-1 min-h-0">
        <div
          className="flex flex-1 flex-col min-h-0 border-r border-[var(--border-default)]"
          style={{ padding: "var(--space-4)" }}
        >
          <CodeEditor
            value={code}
            onChange={setCode}
            onRun={handleRun}
            language={language}
            disabled={runState === "running"}
          />
        </div>
        <div className="flex flex-1 flex-col min-h-0">
          <PreviewPane
            state={runState}
            result={result}
            errorMessage={errorMessage}
            progress={progress}
          />
          <footer
            className="flex items-center justify-between border-t border-[var(--border-default)]"
            style={{
              paddingLeft: "var(--space-6)",
              paddingRight: "var(--space-6)",
              paddingTop: "var(--space-3)",
              paddingBottom: "var(--space-3)",
            }}
          >
            <ProviderChip
              providerId="e2b"
              label="E2B"
              status={
                runState === "running"
                  ? "pending"
                  : runState === "failed"
                    ? "error"
                    : "success"
              }
              latencyMs={latencyMs}
              costUSD={costUsd}
            />
            <span className="t-11 font-light text-[var(--text-faint)]">
              {runState === "idle"
                ? "STANDBY"
                : runState === "running"
                  ? "EXECUTING"
                  : runState === "ready"
                    ? "READY"
                    : "FAILED"}
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
