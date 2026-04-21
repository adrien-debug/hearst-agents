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
  if (event.type === "asset_generated") return "Finalisation de l'objet";
  return null;
}

export function useThoughtStream(isFocalReady: boolean) {
  const stream = useRunStreamOptional();
  const [activeThought, setActiveThought] = useState<string | null>(null);
  const pendingThoughtRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (isFocalReady) {
      pendingThoughtRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const t = setTimeout(() => setActiveThought(null), 0);
      return () => clearTimeout(t);
    }

    if (!stream) return;

    const unsub = stream.subscribe((event) => {
      const thought = mapEventToThought(event);
      if (!thought) return;

      const now = Date.now();
      const timeSinceLast = now - lastUpdateRef.current;

      if (timeSinceLast < 800) {
        // Coalesce fast events
        pendingThoughtRef.current = thought;
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => {
            setActiveThought(pendingThoughtRef.current);
            lastUpdateRef.current = Date.now();
            timerRef.current = null;
          }, 800 - timeSinceLast);
        }
      } else {
        // Immediate display
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setActiveThought(thought);
        lastUpdateRef.current = now;
      }
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stream, isFocalReady]);

  return activeThought;
}
