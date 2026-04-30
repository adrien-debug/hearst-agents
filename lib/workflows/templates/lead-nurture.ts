/**
 * Template — Lead nurture flow.
 * Webhook → fetch HubSpot contact → condition deal stage → email draft → approval → send.
 */

import type { WorkflowGraph } from "../types";

export function leadNurtureTemplate(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "trigger_webhook",
        kind: "trigger",
        label: "Webhook entrant",
        config: { mode: "webhook", path: "/lead-nurture" },
        position: { x: 80, y: 220 },
      },
      {
        id: "fetch_contact",
        kind: "tool_call",
        label: "HubSpot — contact",
        config: {
          tool: "hubspot_get_contact",
          args: { contactId: "${trigger_webhook.contactId}" },
        },
        position: { x: 320, y: 220 },
      },
      {
        id: "stage_check",
        kind: "condition",
        label: "Deal stage = qualified ?",
        config: {
          expression: "fetch_contact.stage == 'qualified'",
        },
        position: { x: 580, y: 220 },
      },
      {
        id: "draft_email",
        kind: "tool_call",
        label: "Brouillon email",
        config: {
          tool: "ai_draft_email",
          args: {
            to: "${fetch_contact.email}",
            template: "follow-up",
          },
        },
        position: { x: 840, y: 120 },
      },
      {
        id: "approval_send",
        kind: "approval",
        label: "Validation envoi",
        config: { preview: "Envoyer cet email à ${fetch_contact.email} ?" },
        position: { x: 1100, y: 120 },
      },
      {
        id: "send_email",
        kind: "tool_call",
        label: "Envoi email",
        config: {
          tool: "gmail_send",
          args: {
            to: "${fetch_contact.email}",
            content: "${draft_email}",
          },
        },
        position: { x: 1360, y: 120 },
      },
      {
        id: "skip_out",
        kind: "output",
        label: "Lead non qualifié",
        config: { payload: { stage: "${fetch_contact.stage}", action: "skip" } },
        position: { x: 840, y: 320 },
      },
    ],
    edges: [
      {
        id: "e_trigger_fetch",
        source: "trigger_webhook",
        target: "fetch_contact",
      },
      { id: "e_fetch_stage", source: "fetch_contact", target: "stage_check" },
      {
        id: "e_stage_true",
        source: "stage_check",
        target: "draft_email",
        condition: "true",
      },
      {
        id: "e_stage_false",
        source: "stage_check",
        target: "skip_out",
        condition: "false",
      },
      { id: "e_draft_approval", source: "draft_email", target: "approval_send" },
      { id: "e_approval_send", source: "approval_send", target: "send_email" },
    ],
    startNodeId: "trigger_webhook",
    version: 1,
  };
}
