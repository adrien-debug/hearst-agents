"use client";

import type { FlowPacket as FlowPacketType } from "./store";

interface Props {
  packet: FlowPacketType;
}

/**
 * SVG packet — a small glowing dot that travels along its parent edge's
 * <path id={edgeId}>. Uses <animateMotion> + <mpath> so the geometry is
 * shared with the edge (no duplicate path strings).
 *
 * Lifecycle: mounted by the canvas when an event emits a packet, auto-removed
 * after ~1.5 s via store.cleanupPackets.
 */
export default function FlowPacket({ packet }: Props) {
  return (
    <g>
      <circle r="4" fill="var(--cykan)" opacity="0.95">
        <animateMotion dur="1.2s" repeatCount="1" fill="freeze">
          <mpath href={`#${packet.edgeId}`} />
        </animateMotion>
      </circle>
      <circle r="8" fill="var(--cykan)" opacity="0.25">
        <animateMotion dur="1.2s" repeatCount="1" fill="freeze">
          <mpath href={`#${packet.edgeId}`} />
        </animateMotion>
      </circle>
    </g>
  );
}
