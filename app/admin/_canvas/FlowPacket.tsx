"use client";

import type { FlowPacket as FlowPacketType } from "./store";

interface Props {
  packet: FlowPacketType;
}

/**
 * Packet SVG — petit disque lumineux qui voyage le long de son edge parent
 * via <animateMotion> + <mpath>. Supprimé après ~1.5s par store.cleanupPackets.
 */
export default function FlowPacket({ packet }: Props) {
  return (
    <g>
      <circle r="4" fill="var(--cykan)" opacity="0.95" filter="drop-shadow(0 0 10px var(--cykan))">
        <animateMotion dur="1.2s" repeatCount="1" fill="freeze">
          <mpath href={`#${packet.edgeId}`} />
        </animateMotion>
      </circle>
    </g>
  );
}
