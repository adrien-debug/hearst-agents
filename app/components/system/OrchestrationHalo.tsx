"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnectorsPanel, type PanelConnection } from "@/app/hooks/use-connectors-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import { getProviderForTool } from "@/lib/providers/registry";

type SystemState = "idle" | "thinking" | "executing" | "error" | "success";

const ServiceIcon = memo(function ServiceIcon({
  connection,
  isActive,
  cascadeDelay,
}: {
  connection: PanelConnection;
  isActive: boolean;
  cascadeDelay: string;
}) {
  const connected = connection.status === "connected";
  return (
    <div
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[9px] transition-all duration-300 ${
        isActive
          ? "scale-[1.08] -translate-y-px opacity-100 ring-1 ring-cyan-400/20 shadow-[0_0_6px_rgba(34,211,238,0.1)]"
          : connected
            ? "opacity-70"
            : "opacity-25 grayscale"
      }`}
      style={{ animationDelay: cascadeDelay }}
    >
      <span className={isActive ? "text-cyan-400" : "text-white/80"}>
        {connection.provider.charAt(0).toUpperCase()}
      </span>
      {isActive && (
        <div className="absolute inset-0 rounded-full border border-cyan-400/20 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
      )}
    </div>
  );
});

export function OrchestrationHalo() {
  const { connections, health } = useConnectorsPanel();
  const stream = useRunStreamOptional();

  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [executionFlow, setExecutionFlow] = useState<string[]>([]);
  const [systemState, setSystemState] = useState<SystemState>("idle");
  const [successCascade, setSuccessCascade] = useState(false);
  const [neuralStreak, setNeuralStreak] = useState(false);

  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!stream) return;

    const unsub = stream.subscribe((event) => {
      if (event.type === "run_started") {
        setSystemState("thinking");
        setExecutionFlow([]);
        setSuccessCascade(false);
      } else if (event.type === "tool_call_started") {
        setSystemState("executing");
        setNeuralStreak(true);
        safeTimeout(() => setNeuralStreak(false), 600);

        const provider =
          (event.providerId as string)
          || getProviderForTool((event.tool as string) || "")?.id
          || "system";
        setActiveProvider(provider);

        setExecutionFlow((prev) => {
          const label = provider.toUpperCase();
          if (prev[prev.length - 1] === label) return prev;
          const next = [...prev, label];
          return next.length > 4 ? next.slice(-4) : next;
        });
      } else if (event.type === "tool_call_completed") {
        safeTimeout(() => setActiveProvider(null), 1500);
      } else if (event.type === "asset_generated") {
        setExecutionFlow((prev) => {
          if (prev[prev.length - 1] === "ASSET") return prev;
          const next = [...prev, "ASSET"];
          return next.length > 4 ? next.slice(-4) : next;
        });
      } else if (event.type === "run_completed") {
        setSystemState("success");
        setSuccessCascade(true);
        safeTimeout(() => {
          setSuccessCascade(false);
          setSystemState("idle");
          setExecutionFlow([]);
        }, 2000);
      } else if (event.type === "run_failed") {
        setSystemState("error");
        safeTimeout(() => setSystemState("idle"), 4000);
      }
    });

    return unsub;
  }, [stream, safeTimeout]);

  const visibleConnections = useMemo(() => connections.slice(0, 5), [connections]);

  const hasDegraded = health ? health.degraded > 0 : false;

  const { coreColor, coreGlow, coreAnim } = useMemo(() => {
    if (systemState === "error" || hasDegraded) {
      return { coreColor: "bg-amber-400/80", coreGlow: "bg-amber-400/10", coreAnim: "" };
    }
    if (systemState === "thinking") {
      return { coreColor: "bg-cyan-400/80", coreGlow: "bg-cyan-400/10", coreAnim: "animate-pulse" };
    }
    if (systemState === "executing") {
      return { coreColor: "bg-cyan-400", coreGlow: "bg-cyan-400/15", coreAnim: "" };
    }
    if (systemState === "success") {
      return { coreColor: "bg-emerald-400/80", coreGlow: "bg-emerald-400/10", coreAnim: "" };
    }
    return { coreColor: "bg-white/15", coreGlow: "bg-white/[0.03]", coreAnim: "animate-[pulse_4s_ease-in-out_infinite]" };
  }, [systemState, hasDegraded]);

  return (
    <div className="flex h-10 w-full items-center justify-center relative shrink-0">
      {neuralStreak && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent" />
      )}

      <div className="flex items-center gap-6 rounded-full bg-white/[0.02] px-6 py-2 backdrop-blur-xl">
        {/* System Core */}
        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <div className={`absolute inset-0 rounded-full blur-sm transition-colors duration-500 ${coreGlow} ${coreAnim}`} />
          <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${coreColor}`} />
        </div>

        {/* Service Orbit */}
        {visibleConnections.length > 0 && (
          <div className="flex items-center gap-3">
            {visibleConnections.map((c, i) => (
              <ServiceIcon
                key={c.provider}
                connection={c}
                isActive={activeProvider === c.provider}
                cascadeDelay={successCascade ? `${i * 70}ms` : "0ms"}
              />
            ))}
          </div>
        )}

        {/* Execution Flow — fixed min-w prevents layout jump */}
        <div className="flex items-center gap-1.5 font-mono text-[9px] shrink-0 min-w-[60px]">
          {executionFlow.map((step, i) => (
            <span key={`${step}-${i}`} className="flex items-center gap-1.5 animate-[fadeIn_200ms_ease-out]">
              {i > 0 && <span className="text-white/10">→</span>}
              <span className="text-cyan-400/70">{step}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
