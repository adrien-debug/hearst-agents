"use client";

import { useState, useEffect, useRef } from "react";
import { useRunStreamOptional, type StreamEvent } from "@/app/lib/run-stream-context";

function mapEventToThought(event: StreamEvent): string | null {
  if (event.type === "tool_call_started") {
    const t = String(event.tool).toLowerCase();
    if (t.includes("slack") || t.includes("message")) return "Lecture des messages Slack";
    if (t.includes("calendar") || t.includes("event")) return "Vérification de votre agenda";
    if (t.includes("search") || t.includes("web")) return "Recherche sur le web";
    if (t.includes("db") || t.includes("query") || t.includes("sql")) return "Consultation de la base de données";
    if (t.includes("generate") || t.includes("report") || t.includes("doc")) return "Rédaction du document";
    if (t.includes("file") || t.includes("read")) return "Extraction des idées clés";
    return "Collecte du contexte";
  }
  if (event.type === "run_started") return "Initialisation de la réflexion";
  if (event.type === "execution_mode_selected") return "Ajustement du mode d'exécution";
  if (event.type === "agent_selected") return "Assignation de l'agent";
  if (event.type === "asset_generated") return "Finalisation de l'objet";
  if (event.type === "run_completed") return "Stabilisation de la réponse";
  if (event.type === "run_failed") return "Blocage détecté";
  return null;
}

export function useThoughtStream(isFocalReady: boolean) {
  const stream = useRunStreamOptional();
  const [activeThought, setActiveThought] = useState<string | null>(null);
  const pendingThoughtRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const clearThought = (delayMs: number) => {
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setActiveThought(null), delayMs);
    };

    if (isFocalReady) {
      pendingThoughtRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (activeThought) clearThought(1200);
      return () => {
        if (clearRef.current) clearTimeout(clearRef.current);
      };
    }

    if (!stream) return;

    const unsub = stream.subscribe((event) => {
      const thought = mapEventToThought(event);
      if (!thought) return;

      const now = Date.now();
      const timeSinceLast = now - lastUpdateRef.current;

      if (timeSinceLast < 500) {
        // Coalesce fast events
        pendingThoughtRef.current = thought;
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => {
            setActiveThought(pendingThoughtRef.current);
            lastUpdateRef.current = Date.now();
            timerRef.current = null;
            clearThought(1800);
          }, 500 - timeSinceLast);
        }
      } else {
        // Immediate display
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setActiveThought(thought);
        lastUpdateRef.current = now;
        clearThought(1800);
      }
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (clearRef.current) clearTimeout(clearRef.current);
    };
  }, [stream, isFocalReady, activeThought]);

  return activeThought;
}
