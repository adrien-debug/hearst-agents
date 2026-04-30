/**
 * Template — Daily standup automation.
 * Trigger cron 9h → fetch GitHub commits → fetch Linear updates → synthesize → send Slack.
 */

import type { WorkflowGraph } from "../types";

export function dailyStandupTemplate(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "trigger_cron",
        kind: "trigger",
        label: "Tous les jours à 9h",
        config: { mode: "cron", cron: "0 9 * * 1-5" },
        position: { x: 80, y: 200 },
      },
      {
        id: "fetch_github",
        kind: "tool_call",
        label: "Commits GitHub (24h)",
        config: {
          tool: "github_list_commits",
          args: { since: "24h", repo: "${trigger_cron.repo}" },
        },
        position: { x: 320, y: 120 },
      },
      {
        id: "fetch_linear",
        kind: "tool_call",
        label: "Updates Linear",
        config: {
          tool: "linear_recent_updates",
          args: { since: "24h" },
        },
        position: { x: 320, y: 280 },
      },
      {
        id: "synth",
        kind: "transform",
        label: "Synthèse standup",
        config: { expression: "fetch_github" },
        position: { x: 580, y: 200 },
      },
      {
        id: "send_slack",
        kind: "tool_call",
        label: "Envoi Slack #standup",
        config: {
          tool: "slack_send_message",
          args: {
            channel: "#standup",
            content: "${synth}",
          },
        },
        position: { x: 840, y: 200 },
      },
      {
        id: "out",
        kind: "output",
        label: "Asset standup",
        config: {
          payload: { source: "${synth}", channel: "#standup" },
        },
        position: { x: 1100, y: 200 },
      },
    ],
    edges: [
      { id: "e_trigger_github", source: "trigger_cron", target: "fetch_github" },
      { id: "e_trigger_linear", source: "trigger_cron", target: "fetch_linear" },
      { id: "e_github_synth", source: "fetch_github", target: "synth" },
      { id: "e_linear_synth", source: "fetch_linear", target: "synth" },
      { id: "e_synth_slack", source: "synth", target: "send_slack" },
      { id: "e_slack_out", source: "send_slack", target: "out" },
    ],
    startNodeId: "trigger_cron",
    version: 1,
  };
}
