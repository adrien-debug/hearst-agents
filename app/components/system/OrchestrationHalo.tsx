"use client";

import { useEffect, useState } from "react";
import { useConnectorsPanel } from "@/app/hooks/use-connectors-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";

// Deterministic mapping of tools to providers
const TOOL_TO_PROVIDER: Record<string, string> = {
  search_web: "web",
  get_messages: "google",
  post_message: "slack",
  query_database: "notion",
  generate_pdf: "system",
  generate_xlsx: "system",
};

export function OrchestrationHalo() {
  const { connections, health } = useConnectorsPanel();
  const stream = useRunStreamOptional();
  
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [executionFlow, setExecutionFlow] = useState<string[]>([]);
  const [systemState, setSystemState] = useState<"idle" | "thinking" | "executing" | "error" | "success">("idle");
  const [successCascade, setSuccessCascade] = useState(false);
  const [neuralStreak, setNeuralStreak] = useState(false);

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
        setTimeout(() => setNeuralStreak(false), 600);
        
        const toolName = (event.tool_name as string) || "unknown";
        const provider = TOOL_TO_PROVIDER[toolName] || "system";
        setActiveProvider(provider);
        
        setExecutionFlow(prev => {
          const next = [...prev, provider.toUpperCase()];
          return next.slice(-4); // max 4 steps
        });
      } else if (event.type === "tool_call_completed") {
        setTimeout(() => setActiveProvider(null), 1500);
      } else if (event.type === "asset_generated") {
        setExecutionFlow(prev => {
          const next = [...prev, "ASSET"];
          return next.slice(-4);
        });
      } else if (event.type === "run_completed") {
        setSystemState("success");
        setSuccessCascade(true);
        setTimeout(() => {
          setSuccessCascade(false);
          setSystemState("idle");
          setExecutionFlow([]);
        }, 2000);
      } else if (event.type === "run_failed") {
        setSystemState("error");
      }
    });

    return unsub;
  }, [stream]);

  // Derive system core color
  let coreColor = "bg-white/20";
  let coreGlow = "bg-white/5";
  let coreAnim = "animate-[pulse_4s_ease-in-out_infinite]";
  
  if (systemState === "error" || (health && health.degraded > 0)) {
    coreColor = "bg-amber-400";
    coreGlow = "bg-amber-400/20";
    coreAnim = "";
  } else if (systemState === "thinking") {
    coreColor = "bg-cyan-400";
    coreGlow = "bg-cyan-400/20";
    coreAnim = "animate-pulse"; 
  } else if (systemState === "executing") {
    coreColor = "bg-cyan-400";
    coreGlow = "bg-cyan-400/40";
    coreAnim = "";
  } else if (systemState === "success") {
    coreColor = "bg-emerald-400";
    coreGlow = "bg-emerald-400/20";
    coreAnim = "";
  }

  return (
    <div className="flex items-center justify-center h-10 w-full relative">
      {/* Neural Streak */}
      {neuralStreak && (
        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-linear-to-r from-transparent via-cyan-400 to-transparent opacity-15 animate-[slide-right_0.6s_ease-in-out]" />
      )}
      
      <div className="flex items-center gap-6 px-6 py-2 rounded-full bg-white/2 backdrop-blur-xl">
        {/* System Core */}
        <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
          <div className={`absolute inset-0 rounded-full blur-sm transition-colors duration-500 ${coreGlow} ${coreAnim}`} />
          <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${coreColor}`} />
        </div>

        {/* Service Orbit */}
        <div className="flex items-center gap-3">
          {connections.slice(0, 5).map((c, i) => {
            const isActive = activeProvider === c.provider;
            const isCascade = successCascade;
            
            let iconClass = "opacity-80 scale-100";
            let ringClass = "ring-0";
            let shadowClass = "";
            let yShift = "translate-y-0";
            
            if (isActive) {
              iconClass = "opacity-100 scale-105";
              ringClass = "ring-1 ring-cyan-400/40";
              shadowClass = "shadow-[0_0_8px_rgba(34,211,238,0.2)]";
              yShift = "-translate-y-px";
            } else if (c.status !== "connected") {
              iconClass = "opacity-30 grayscale";
            }
            
            const cascadeDelay = isCascade ? `${i * 70}ms` : "0ms";
            const cascadeAnim = isCascade ? "animate-pulse" : "";

            return (
              <div 
                key={c.provider} 
                className={`relative w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-white/90 transition-all duration-300 ${iconClass} ${ringClass} ${shadowClass} ${yShift} ${cascadeAnim}`}
                style={{ animationDelay: cascadeDelay }}
              >
                {c.provider.charAt(0).toUpperCase()}
                
                {/* Active Ripple */}
                {isActive && (
                  <div className="absolute inset-0 rounded-full border border-cyan-400/40 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
                )}
              </div>
            );
          })}
        </div>

        {/* Execution Flow */}
        <div className="flex items-center gap-2 text-[10px] font-mono shrink-0 min-w-[100px]">
          {executionFlow.length > 0 && (
            executionFlow.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-white/20">→</span>}
                <span className="text-cyan-400/90">{step}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
