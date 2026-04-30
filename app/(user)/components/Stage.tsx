"use client";

import { useStageStore } from "@/stores/stage";
import { CockpitStage } from "./stages/CockpitStage";
import { ChatStage } from "./stages/ChatStage";
import { AssetStage } from "./stages/AssetStage";
import { MissionStage } from "./stages/MissionStage";
import { BrowserStage } from "./stages/BrowserStage";
import { MeetingStage } from "./stages/MeetingStage";
import { KnowledgeStage } from "./stages/KnowledgeStage";
import { VoiceStage } from "./stages/VoiceStage";
import { SimulationStage } from "./stages/SimulationStage";
import type { Message } from "@/lib/core/types";

interface StageProps {
  /** Messages du thread actif (utilisé par ChatStage). */
  messages: Message[];
  /** Handler quick-reply (consommé par ChatMessages). */
  onSubmit: (message: string) => Promise<void>;
  hasMessages: boolean;
}

/**
 * Stage — Router polymorphe central.
 *
 * Rend le sub-Stage approprié selon `useStageStore.current.mode`.
 */
export function Stage(props: StageProps) {
  const current = useStageStore((s) => s.current);

  switch (current.mode) {
    case "cockpit":
      return <CockpitStage />;
    case "chat":
      return (
        <ChatStage
          messages={props.messages}
          hasMessages={props.hasMessages}
          onSubmit={props.onSubmit}
        />
      );
    case "asset":
      return <AssetStage assetId={current.assetId} variantKind={current.variantKind} />;
    case "mission":
      return <MissionStage missionId={current.missionId} />;
    case "browser":
      return <BrowserStage sessionId={current.sessionId} />;
    case "meeting":
      return <MeetingStage meetingId={current.meetingId} />;
    case "kg":
      return <KnowledgeStage entityId={current.entityId} query={current.query} />;
    case "voice":
      return <VoiceStage sessionId={current.sessionId} />;
    case "simulation":
      return <SimulationStage />;
    default:
      return null;
  }
}
