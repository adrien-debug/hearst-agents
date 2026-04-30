/**
 * Template hospitality — Préparation arrivées guests.
 * Cron 10h → fetch arrivals today → filtre VIP → génère welcome notes
 * personnalisés (Claude) → envoi Slack staff → approval gate → asset.
 */

import type { WorkflowGraph } from "../../types";

export function guestArrivalPrepTemplate(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "trigger_cron",
        kind: "trigger",
        label: "Tous les jours à 10h",
        config: { mode: "cron", cron: "0 10 * * *" },
        position: { x: 80, y: 200 },
      },
      {
        id: "fetch_arrivals",
        kind: "tool_call",
        label: "Arrivées du jour (PMS)",
        config: {
          tool: "pms_list_arrivals_today",
          args: { date: "${trigger_cron.date}", includeRequests: true },
        },
        position: { x: 320, y: 200 },
      },
      {
        id: "filter_vip",
        kind: "transform",
        label: "Filtre VIP",
        config: { expression: "fetch_arrivals.filter(a => a.vip === true)" },
        position: { x: 580, y: 200 },
      },
      {
        id: "draft_welcome_notes",
        kind: "tool_call",
        label: "Generate welcome notes (Claude)",
        config: {
          tool: "ai_draft_welcome_notes",
          args: {
            arrivals: "${filter_vip}",
            tone: "warm-professional",
            includeRoomNumber: true,
          },
        },
        position: { x: 840, y: 200 },
      },
      {
        id: "approval_send",
        kind: "approval",
        label: "Validation notes VIP",
        config: {
          preview:
            "Envoyer ${filter_vip.length} welcome notes VIP au staff frontdesk ?",
        },
        position: { x: 1100, y: 200 },
      },
      {
        id: "send_slack",
        kind: "tool_call",
        label: "Slack #frontdesk",
        config: {
          tool: "slack_send_message",
          args: {
            channel: "#frontdesk",
            content: "${draft_welcome_notes}",
          },
        },
        position: { x: 1360, y: 200 },
      },
      {
        id: "out",
        kind: "output",
        label: "Asset — VIP arrivals brief",
        config: {
          payload: {
            kind: "report",
            title: "VIP arrivals — welcome brief",
            content: "${draft_welcome_notes}",
            count: "${filter_vip.length}",
          },
        },
        position: { x: 1620, y: 200 },
      },
    ],
    edges: [
      { id: "e1", source: "trigger_cron", target: "fetch_arrivals" },
      { id: "e2", source: "fetch_arrivals", target: "filter_vip" },
      { id: "e3", source: "filter_vip", target: "draft_welcome_notes" },
      { id: "e4", source: "draft_welcome_notes", target: "approval_send" },
      { id: "e5", source: "approval_send", target: "send_slack" },
      { id: "e6", source: "send_slack", target: "out" },
    ],
    startNodeId: "trigger_cron",
    version: 1,
  };
}
