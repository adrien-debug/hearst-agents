/**
 * Template hospitality — Dispatch service request guest.
 * Webhook (in-app messaging / front desk app) → classify priority (Haiku)
 * → si urgent → Slack alert manager, sinon routing standard → update PMS
 * status → output ticket asset.
 */

import type { WorkflowGraph } from "../../types";

export function serviceRequestDispatchTemplate(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "trigger_webhook",
        kind: "trigger",
        label: "Webhook — service request",
        config: { mode: "webhook", path: "/hospitality/service-request" },
        position: { x: 80, y: 220 },
      },
      {
        id: "classify_priority",
        kind: "tool_call",
        label: "Classify priority (Haiku)",
        config: {
          tool: "ai_classify_priority",
          args: {
            text: "${trigger_webhook.text}",
            type: "${trigger_webhook.type}",
            categories: ["urgent", "normal", "low"],
            model: "claude-haiku-latest",
          },
        },
        position: { x: 320, y: 220 },
      },
      {
        id: "priority_check",
        kind: "condition",
        label: "Priorité = urgent ?",
        config: { expression: "classify_priority.priority == 'urgent'" },
        position: { x: 580, y: 220 },
      },
      {
        id: "alert_manager",
        kind: "tool_call",
        label: "Alert manager (Slack)",
        config: {
          tool: "slack_send_message",
          args: {
            channel: "#ops-manager",
            content:
              "URGENT — Room ${trigger_webhook.room} (${trigger_webhook.guestName}) : ${trigger_webhook.text}",
          },
        },
        position: { x: 840, y: 100 },
      },
      {
        id: "route_normal",
        kind: "tool_call",
        label: "Routing standard (Slack)",
        config: {
          tool: "slack_send_message",
          args: {
            channel: "#${trigger_webhook.type}",
            content:
              "Room ${trigger_webhook.room} (${trigger_webhook.guestName}) : ${trigger_webhook.text}",
          },
        },
        position: { x: 840, y: 340 },
      },
      {
        id: "update_pms",
        kind: "tool_call",
        label: "Update PMS status",
        config: {
          tool: "pms_update_request_status",
          args: {
            requestId: "${trigger_webhook.id}",
            status: "dispatched",
          },
        },
        position: { x: 1100, y: 220 },
      },
      {
        id: "out",
        kind: "output",
        label: "Asset — Ticket service",
        config: {
          payload: {
            kind: "task",
            title: "Service request — ${trigger_webhook.type}",
            priority: "${classify_priority.priority}",
            room: "${trigger_webhook.room}",
            text: "${trigger_webhook.text}",
          },
        },
        position: { x: 1360, y: 220 },
      },
    ],
    edges: [
      { id: "e1", source: "trigger_webhook", target: "classify_priority" },
      { id: "e2", source: "classify_priority", target: "priority_check" },
      {
        id: "e3",
        source: "priority_check",
        target: "alert_manager",
        condition: "true",
      },
      {
        id: "e4",
        source: "priority_check",
        target: "route_normal",
        condition: "false",
      },
      { id: "e5", source: "alert_manager", target: "update_pms" },
      { id: "e6", source: "route_normal", target: "update_pms" },
      { id: "e7", source: "update_pms", target: "out" },
    ],
    startNodeId: "trigger_webhook",
    version: 1,
  };
}
