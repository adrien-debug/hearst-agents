export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_executions: {
        Row: {
          action_step_id: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          params: Json
          result: Json | null
          run_id: string
          status: string
          step_id: string
          tool: string
        }
        Insert: {
          action_step_id: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          params: Json
          result?: Json | null
          run_id: string
          status?: string
          step_id: string
          tool: string
        }
        Update: {
          action_step_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          params?: Json
          result?: Json | null
          run_id?: string
          status?: string
          step_id?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_executions_action_step_id_fkey"
            columns: ["action_step_id"]
            isOneToOne: false
            referencedRelation: "action_plan_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_executions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_executions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "run_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      action_plan_steps: {
        Row: {
          action_plan_id: string
          approval_status: string
          description: string
          error: Json | null
          executed_at: string | null
          execution_status: string
          id: string
          idempotency_key: string
          order: number
          pack: string
          params: Json
          requires_approval: boolean
          result: Json | null
          reversible: boolean
          severity: string
          tool: string
        }
        Insert: {
          action_plan_id: string
          approval_status?: string
          description: string
          error?: Json | null
          executed_at?: string | null
          execution_status?: string
          id?: string
          idempotency_key: string
          order: number
          pack: string
          params: Json
          requires_approval?: boolean
          result?: Json | null
          reversible?: boolean
          severity: string
          tool: string
        }
        Update: {
          action_plan_id?: string
          approval_status?: string
          description?: string
          error?: Json | null
          executed_at?: string | null
          execution_status?: string
          id?: string
          idempotency_key?: string
          order?: number
          pack?: string
          params?: Json
          requires_approval?: boolean
          result?: Json | null
          reversible?: boolean
          severity?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_steps_action_plan_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      action_plans: {
        Row: {
          created_at: string
          created_by: string
          decided_at: string | null
          id: string
          plan_id: string | null
          run_id: string
          status: string
          summary: string
        }
        Insert: {
          created_at?: string
          created_by: string
          decided_at?: string | null
          id?: string
          plan_id?: string | null
          run_id: string
          status?: string
          summary: string
        }
        Update: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          id?: string
          plan_id?: string | null
          run_id?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          asset_id: string | null
          id: string
          metadata: Json
          provider: string
          status: string
          thread_id: string
          timestamp: string
          type: string
        }
        Insert: {
          asset_id?: string | null
          id: string
          metadata?: Json
          provider: string
          status?: string
          thread_id: string
          timestamp?: string
          type: string
        }
        Update: {
          asset_id?: string | null
          id?: string
          metadata?: Json
          provider?: string
          status?: string
          thread_id?: string
          timestamp?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_catalog: {
        Row: {
          agent_id: string
          author: string | null
          created_at: string
          description: string
          icon_url: string | null
          id: string
          kind: string
          metadata: Json
          name: string
          requirements: Json
          status: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          author?: string | null
          created_at?: string
          description?: string
          icon_url?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name: string
          requirements?: Json
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          author?: string | null
          created_at?: string
          description?: string
          icon_url?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          requirements?: Json
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_events: {
        Row: {
          action: string
          category: string
          command: string | null
          created_at: string
          description: string
          duration_ms: number | null
          error: string | null
          id: string
          level: string
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          result: string | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          category: string
          command?: string | null
          created_at?: string
          description: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          level: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          result?: string | null
          status: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          action?: string
          category?: string
          command?: string | null
          created_at?: string
          description?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          level?: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          result?: string | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_knowledge: {
        Row: {
          agent_id: string
          knowledge_base_id: string
        }
        Insert: {
          agent_id: string
          knowledge_base_id: string
        }
        Update: {
          agent_id?: string
          knowledge_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string | null
          id: string
          importance: number
          key: string
          last_accessed_at: string
          memory_type: string
          value: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          importance?: number
          key: string
          last_accessed_at?: string
          memory_type?: string
          value: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          importance?: number
          key?: string
          last_accessed_at?: string
          memory_type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs_log: {
        Row: {
          agent_id: string
          agent_version: string
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input: Json | null
          output: Json | null
          run_id: string
          started_at: string | null
          status: string
          steps: Json | null
          tenant_id: string
          usage_cost_usd: number | null
          usage_tokens: number | null
          user_id: string
        }
        Insert: {
          agent_id: string
          agent_version: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          run_id: string
          started_at?: string | null
          status?: string
          steps?: Json | null
          tenant_id: string
          usage_cost_usd?: number | null
          usage_tokens?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string
          agent_version?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          run_id?: string
          started_at?: string | null
          status?: string
          steps?: Json | null
          tenant_id?: string
          usage_cost_usd?: number | null
          usage_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          description: string
          id: string
          idempotent: boolean
          input_schema: Json
          metadata: Json | null
          name: string
          output_schema: Json
          priority: number
          risk_level: string
          skill_id: string
          version: number
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          description?: string
          id?: string
          idempotent?: boolean
          input_schema?: Json
          metadata?: Json | null
          name: string
          output_schema?: Json
          priority?: number
          risk_level?: string
          skill_id: string
          version: number
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          description?: string
          id?: string
          idempotent?: boolean
          input_schema?: Json
          metadata?: Json | null
          name?: string
          output_schema?: Json
          priority?: number
          risk_level?: string
          skill_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_catalog"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_skills_agent_id_version_fkey"
            columns: ["agent_id", "version"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["agent_id", "version"]
          },
        ]
      }
      agent_tenant_configs: {
        Row: {
          agent_id: string
          budget_max_usd_per_month: number | null
          config: Json
          created_at: string
          enabled: boolean
          id: string
          metadata: Json | null
          pinned_version: string | null
          quota_max_runs_per_hour: number | null
          quota_max_tokens_per_day: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          budget_max_usd_per_month?: number | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json | null
          pinned_version?: string | null
          quota_max_runs_per_hour?: number | null
          quota_max_tokens_per_day?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          budget_max_usd_per_month?: number | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json | null
          pinned_version?: string | null
          quota_max_runs_per_hour?: number | null
          quota_max_tokens_per_day?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tenant_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_catalog"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          agent_id: string
          config: Json
          enabled: boolean
          max_calls_per_run: number | null
          risk_accepted: boolean
          timeout_override_ms: number | null
          tool_id: string
        }
        Insert: {
          agent_id: string
          config?: Json
          enabled?: boolean
          max_calls_per_run?: number | null
          risk_accepted?: boolean
          timeout_override_ms?: number | null
          tool_id: string
        }
        Update: {
          agent_id?: string
          config?: Json
          enabled?: boolean
          max_calls_per_run?: number | null
          risk_accepted?: boolean
          timeout_override_ms?: number | null
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          changelog: string | null
          config_schema: Json | null
          config_snapshot: Json
          created_at: string
          id: string
          image_ref: string | null
          is_latest: boolean
          is_stable: boolean
          model_profile_id: string | null
          published_at: string
          system_prompt: string
          version: number
        }
        Insert: {
          agent_id: string
          changelog?: string | null
          config_schema?: Json | null
          config_snapshot?: Json
          created_at?: string
          id?: string
          image_ref?: string | null
          is_latest?: boolean
          is_stable?: boolean
          model_profile_id?: string | null
          published_at?: string
          system_prompt?: string
          version: number
        }
        Update: {
          agent_id?: string
          changelog?: string | null
          config_schema?: Json | null
          config_snapshot?: Json
          created_at?: string
          id?: string
          image_ref?: string | null
          is_latest?: boolean
          is_stable?: boolean
          model_profile_id?: string | null
          published_at?: string
          system_prompt?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_catalog"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_versions_model_profile_id_fkey"
            columns: ["model_profile_id"]
            isOneToOne: false
            referencedRelation: "model_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          active_version_id: string | null
          avatar_url: string | null
          cost_budget_per_run: number | null
          created_at: string
          description: string | null
          guard_policy: Json
          id: string
          max_tokens: number
          memory_policy_id: string | null
          metadata: Json
          model_name: string
          model_profile_id: string | null
          model_provider: string
          name: string
          slug: string
          status: string
          system_prompt: string
          temperature: number
          top_p: number
          updated_at: string
          version: number
        }
        Insert: {
          active_version_id?: string | null
          avatar_url?: string | null
          cost_budget_per_run?: number | null
          created_at?: string
          description?: string | null
          guard_policy?: Json
          id?: string
          max_tokens?: number
          memory_policy_id?: string | null
          metadata?: Json
          model_name?: string
          model_profile_id?: string | null
          model_provider?: string
          name: string
          slug: string
          status?: string
          system_prompt?: string
          temperature?: number
          top_p?: number
          updated_at?: string
          version?: number
        }
        Update: {
          active_version_id?: string | null
          avatar_url?: string | null
          cost_budget_per_run?: number | null
          created_at?: string
          description?: string | null
          guard_policy?: Json
          id?: string
          max_tokens?: number
          memory_policy_id?: string | null
          metadata?: Json
          model_name?: string
          model_profile_id?: string | null
          model_provider?: string
          name?: string
          slug?: string
          status?: string
          system_prompt?: string
          temperature?: number
          top_p?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agents_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_memory_policy_id_fkey"
            columns: ["memory_policy_id"]
            isOneToOne: false
            referencedRelation: "memory_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_model_profile_id_fkey"
            columns: ["model_profile_id"]
            isOneToOne: false
            referencedRelation: "model_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applied_changes: {
        Row: {
          actor: string
          after_value: Json
          before_value: Json
          change_type: string
          created_at: string
          id: string
          reason: string | null
          signal_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          actor?: string
          after_value?: Json
          before_value?: Json
          change_type: string
          created_at?: string
          id?: string
          reason?: string | null
          signal_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          actor?: string
          after_value?: Json
          before_value?: Json
          change_type?: string
          created_at?: string
          id?: string
          reason?: string | null
          signal_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "applied_changes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "improvement_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_versions: {
        Row: {
          artifact_id: string
          change_summary: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          sections: Json
          version: number
        }
        Insert: {
          artifact_id: string
          change_summary?: string | null
          content: string
          created_at?: string
          created_by: string
          id?: string
          sections: Json
          version: number
        }
        Update: {
          artifact_id?: string
          change_summary?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          sections?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          content: string
          created_at: string
          format: string
          id: string
          metadata: Json
          parent_artifact_id: string | null
          run_id: string | null
          sections: Json
          sources: Json
          status: string
          summary: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          format?: string
          id?: string
          metadata?: Json
          parent_artifact_id?: string | null
          run_id?: string | null
          sections?: Json
          sources?: Json
          status?: string
          summary?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          format?: string
          id?: string
          metadata?: Json
          parent_artifact_id?: string | null
          run_id?: string | null
          sections?: Json
          sources?: Json
          status?: string
          summary?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_parent_artifact_id_fkey"
            columns: ["parent_artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_variants: {
        Row: {
          asset_id: string
          created_at: string
          duration_seconds: number | null
          error: string | null
          generated_at: string | null
          id: string
          job_id: string | null
          kind: string
          metadata: Json
          mime_type: string | null
          provider: string | null
          size_bytes: number | null
          status: string
          storage_url: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          generated_at?: string | null
          id?: string
          job_id?: string | null
          kind: string
          metadata?: Json
          mime_type?: string | null
          provider?: string | null
          size_bytes?: number | null
          status?: string
          storage_url?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          generated_at?: string | null
          id?: string
          job_id?: string | null
          kind?: string
          metadata?: Json
          mime_type?: string | null
          provider?: string | null
          size_bytes?: number | null
          status?: string
          storage_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_variants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          content_ref: string | null
          created_at: string
          id: string
          kind: string
          output_tier: string | null
          provenance: Json
          run_id: string | null
          summary: string | null
          thread_id: string
          title: string
        }
        Insert: {
          content_ref?: string | null
          created_at?: string
          id: string
          kind: string
          output_tier?: string | null
          provenance?: Json
          run_id?: string | null
          summary?: string | null
          thread_id: string
          title?: string
        }
        Update: {
          content_ref?: string | null
          created_at?: string
          id?: string
          kind?: string
          output_tier?: string | null
          provenance?: Json
          run_id?: string | null
          summary?: string | null
          thread_id?: string
          title?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          ip_address: unknown
          resource: string
          resource_id: string | null
          severity: string
          success: boolean
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          ip_address?: unknown
          resource: string
          resource_id?: string | null
          severity?: string
          success?: boolean
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          ip_address?: unknown
          resource?: string
          resource_id?: string | null
          severity?: string
          success?: boolean
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          payload: Json | null
          role: string
          tenant_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          role: string
          tenant_id?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          role?: string
          tenant_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      clawd_memory: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          relations: Json | null
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          relations?: Json | null
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          relations?: Json | null
          session_id?: string
        }
        Relationships: []
      }
      clawd_missions: {
        Row: {
          config: Json | null
          created_at: string
          description: string | null
          id: string
          priority: string
          result: Json | null
          status: string
          tenant_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          result?: Json | null
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          result?: Json | null
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clawd_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          metadata: Json
          status: string
          title: string | null
          user_identifier: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          metadata?: Json
          status?: string
          title?: string | null
          user_identifier?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          status?: string
          title?: string | null
          user_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          generation_type: string | null
          id: string
          prompt_id: string | null
          prompt_text: string | null
          provider: string | null
          result: Json | null
          settings: Json | null
          started_at: string | null
          status: string
          user_id: string | null
          workflow_def_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          generation_type?: string | null
          id: string
          prompt_id?: string | null
          prompt_text?: string | null
          provider?: string | null
          result?: Json | null
          settings?: Json | null
          started_at?: string | null
          status?: string
          user_id?: string | null
          workflow_def_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          generation_type?: string | null
          id?: string
          prompt_id?: string | null
          prompt_text?: string | null
          provider?: string | null
          result?: Json | null
          settings?: Json | null
          started_at?: string | null
          status?: string
          user_id?: string | null
          workflow_def_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          amount_usd: number
          balance_after_usd: number
          created_at: string
          description: string
          id: string
          job_id: string | null
          job_kind: string | null
          operation: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          amount_usd: number
          balance_after_usd: number
          created_at?: string
          description: string
          id?: string
          job_id?: string | null
          job_kind?: string | null
          operation: string
          tenant_id: string
          user_id: string
        }
        Update: {
          amount_usd?: number
          balance_after_usd?: number
          created_at?: string
          description?: string
          id?: string
          job_id?: string | null
          job_kind?: string | null
          operation?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      cursor_conversations: {
        Row: {
          conversation_id: string
          created_at: string
          duration_minutes: number
          estimated_cost: number
          estimated_tokens: number
          first_seen_at: string
          last_seen_at: string
          model: string
          status: string
          synced_at: string
          title: string | null
          total_entries: number
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          duration_minutes?: number
          estimated_cost?: number
          estimated_tokens?: number
          first_seen_at: string
          last_seen_at: string
          model: string
          status: string
          synced_at?: string
          title?: string | null
          total_entries?: number
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          duration_minutes?: number
          estimated_cost?: number
          estimated_tokens?: number
          first_seen_at?: string
          last_seen_at?: string
          model?: string
          status?: string
          synced_at?: string
          title?: string | null
          total_entries?: number
          updated_at?: string
        }
        Relationships: []
      }
      cursor_daily_stats: {
        Row: {
          created_at: string
          date: string
          models_used: Json
          total_conversations: number
          total_cost: number
          total_entries: number
          total_tokens: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          models_used?: Json
          total_conversations?: number
          total_cost?: number
          total_entries?: number
          total_tokens?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          models_used?: Json
          total_conversations?: number
          total_cost?: number
          total_entries?: number
          total_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      cursor_model_usage: {
        Row: {
          conversation_id: string
          date: string
          entries: number
          estimated_cost: number
          estimated_tokens: number
          id: string
          model: string
          timestamp: string
        }
        Insert: {
          conversation_id: string
          date?: string
          entries?: number
          estimated_cost?: number
          estimated_tokens?: number
          id?: string
          model: string
          timestamp?: string
        }
        Update: {
          conversation_id?: string
          date?: string
          entries?: number
          estimated_cost?: number
          estimated_tokens?: number
          id?: string
          model?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "cursor_model_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cursor_conversations"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      cursor_sync_status: {
        Row: {
          id: string
          last_sync_at: string
          last_sync_error: string | null
          last_sync_success: boolean
          total_synced: number
          updated_at: string
        }
        Insert: {
          id?: string
          last_sync_at?: string
          last_sync_error?: string | null
          last_sync_success?: boolean
          total_synced?: number
          updated_at?: string
        }
        Update: {
          id?: string
          last_sync_at?: string
          last_sync_error?: string | null
          last_sync_success?: boolean
          total_synced?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string
          id: string
          lifetime_value: number
          name: string
          phone: string | null
          shipping_addresses: Json
          tenant_id: string
          total_orders: number
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          lifetime_value?: number
          name: string
          phone?: string | null
          shipping_addresses?: Json
          tenant_id: string
          total_orders?: number
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          lifetime_value?: number
          name?: string
          phone?: string | null
          shipping_addresses?: Json
          tenant_id?: string
          total_orders?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_entries: {
        Row: {
          created_at: string
          dataset_id: string
          expected_output: string
          id: string
          input: string
          metadata: Json
          tags: string[]
        }
        Insert: {
          created_at?: string
          dataset_id: string
          expected_output: string
          id?: string
          input: string
          metadata?: Json
          tags?: string[]
        }
        Update: {
          created_at?: string
          dataset_id?: string
          expected_output?: string
          id?: string
          input?: string
          metadata?: Json
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dataset_entries_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          agent_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "datasets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          status: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          status?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          code: string
          id: string
          max_usage: number | null
          tenant_id: string
          type: string
          usage_count: number
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          code: string
          id?: string
          max_usage?: number | null
          tenant_id: string
          type: string
          usage_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value: number
        }
        Update: {
          code?: string
          id?: string
          max_usage?: number | null
          tenant_id?: string
          type?: string
          usage_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sessions: {
        Row: {
          artifact_id: string | null
          created_at: string
          current_version: number
          document_type: string
          id: string
          metadata: Json
          outline: Json
          run_id: string
          sources: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_id?: string | null
          created_at?: string
          current_version?: number
          document_type: string
          id?: string
          metadata?: Json
          outline?: Json
          run_id: string
          sources?: Json
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_id?: string | null
          created_at?: string
          current_version?: number
          document_type?: string
          id?: string
          metadata?: Json
          outline?: Json
          run_id?: string
          sources?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sessions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_sessions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          actual_output: string | null
          agent_id: string
          created_at: string
          dataset_entry_id: string | null
          eval_type: string
          expected_output: string | null
          id: string
          max_score: number
          passed: boolean
          run_id: string | null
          score: number
          test_input: string | null
        }
        Insert: {
          actual_output?: string | null
          agent_id: string
          created_at?: string
          dataset_entry_id?: string | null
          eval_type?: string
          expected_output?: string | null
          id?: string
          max_score?: number
          passed?: boolean
          run_id?: string | null
          score: number
          test_input?: string | null
        }
        Update: {
          actual_output?: string | null
          agent_id?: string
          created_at?: string
          dataset_entry_id?: string | null
          eval_type?: string
          expected_output?: string | null
          id?: string
          max_score?: number
          passed?: boolean
          run_id?: string | null
          score?: number
          test_input?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_dataset_entry_id_fkey"
            columns: ["dataset_entry_id"]
            isOneToOne: false
            referencedRelation: "dataset_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hearst_users: {
        Row: {
          agent_name: string | null
          agent_personality: string | null
          auth_provider: string | null
          company: string | null
          created_at: string
          email: string
          google_refresh_token: string | null
          google_token_rotated_at: string | null
          id: string
          name: string
          onboarding_completed: boolean
          password_hash: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_personality?: string | null
          auth_provider?: string | null
          company?: string | null
          created_at?: string
          email: string
          google_refresh_token?: string | null
          google_token_rotated_at?: string | null
          id?: string
          name: string
          onboarding_completed?: boolean
          password_hash?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_personality?: string | null
          auth_provider?: string | null
          company?: string | null
          created_at?: string
          email?: string
          google_refresh_token?: string | null
          google_token_rotated_at?: string | null
          id?: string
          name?: string
          onboarding_completed?: boolean
          password_hash?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      hospitality_campaigns: {
        Row: {
          budget: number | null
          clicks: number | null
          conversions: number | null
          created_at: string
          currency: string
          end_date: string | null
          id: string
          impressions: number | null
          name: string
          platform: string
          roi: number | null
          spent: number | null
          start_date: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          impressions?: number | null
          name: string
          platform: string
          roi?: number | null
          spent?: number | null
          start_date?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          impressions?: number | null
          name?: string
          platform?: string
          roi?: number | null
          spent?: number | null
          start_date?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_cashflow: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          currency: string
          date: string
          flow_type: string
          id: string
          label: string
          merge_id: string | null
          source: string
          tenant_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          currency?: string
          date: string
          flow_type: string
          id?: string
          label: string
          merge_id?: string | null
          source?: string
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          currency?: string
          date?: string
          flow_type?: string
          id?: string
          label?: string
          merge_id?: string | null
          source?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_contracts: {
        Row: {
          auto_renew: boolean | null
          contract_type: string
          counterparty: string
          created_at: string
          currency: string
          end_date: string | null
          id: string
          renewal_date: string | null
          start_date: string | null
          status: string
          tenant_id: string | null
          title: string
          value: number | null
        }
        Insert: {
          auto_renew?: boolean | null
          contract_type: string
          counterparty: string
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          renewal_date?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string | null
          title: string
          value?: number | null
        }
        Update: {
          auto_renew?: boolean | null
          contract_type?: string
          counterparty?: string
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          renewal_date?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string | null
          title?: string
          value?: number | null
        }
        Relationships: []
      }
      hospitality_design_assets: {
        Row: {
          asset_type: string
          brief_id: string | null
          category: string | null
          created_at: string
          file_size: number | null
          file_url: string | null
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          asset_type: string
          brief_id?: string | null
          category?: string | null
          created_at?: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          asset_type?: string
          brief_id?: string | null
          category?: string | null
          created_at?: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_design_assets_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "hospitality_design_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_design_briefs: {
        Row: {
          assignee: string | null
          brief_type: string
          budget: number | null
          created_at: string
          currency: string
          deadline: string | null
          id: string
          progress: number | null
          status: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          assignee?: string | null
          brief_type: string
          budget?: number | null
          created_at?: string
          currency?: string
          deadline?: string | null
          id?: string
          progress?: number | null
          status?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          assignee?: string | null
          brief_type?: string
          budget?: number | null
          created_at?: string
          currency?: string
          deadline?: string | null
          id?: string
          progress?: number | null
          status?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: []
      }
      hospitality_ebitda: {
        Row: {
          currency: string
          ebitda: number | null
          ebitda_margin: number | null
          fixed_charges: number | null
          food_cost: number | null
          id: string
          period_month: string
          raw_data: Json | null
          revenue: number
          source: string
          staff_cost: number | null
          synced_at: string
          tenant_id: string | null
          variable_charges: number | null
        }
        Insert: {
          currency?: string
          ebitda?: number | null
          ebitda_margin?: number | null
          fixed_charges?: number | null
          food_cost?: number | null
          id?: string
          period_month: string
          raw_data?: Json | null
          revenue?: number
          source?: string
          staff_cost?: number | null
          synced_at?: string
          tenant_id?: string | null
          variable_charges?: number | null
        }
        Update: {
          currency?: string
          ebitda?: number | null
          ebitda_margin?: number | null
          fixed_charges?: number | null
          food_cost?: number | null
          id?: string
          period_month?: string
          raw_data?: Json | null
          revenue?: number
          source?: string
          staff_cost?: number | null
          synced_at?: string
          tenant_id?: string | null
          variable_charges?: number | null
        }
        Relationships: []
      }
      hospitality_employees: {
        Row: {
          department: string | null
          email: string | null
          employment_status: string | null
          end_date: string | null
          first_name: string
          fte: number | null
          id: string
          job_title: string | null
          last_name: string
          merge_id: string | null
          start_date: string | null
          synced_at: string
          tenant_id: string | null
        }
        Insert: {
          department?: string | null
          email?: string | null
          employment_status?: string | null
          end_date?: string | null
          first_name: string
          fte?: number | null
          id?: string
          job_title?: string | null
          last_name: string
          merge_id?: string | null
          start_date?: string | null
          synced_at?: string
          tenant_id?: string | null
        }
        Update: {
          department?: string | null
          email?: string | null
          employment_status?: string | null
          end_date?: string | null
          first_name?: string
          fte?: number | null
          id?: string
          job_title?: string | null
          last_name?: string
          merge_id?: string | null
          start_date?: string | null
          synced_at?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_forecast: {
        Row: {
          computed_at: string
          confidence: number | null
          currency: string
          horizon: string
          id: string
          projected_ebitda: number | null
          projected_occupancy: number | null
          projected_revenue: number
          tenant_id: string | null
        }
        Insert: {
          computed_at?: string
          confidence?: number | null
          currency?: string
          horizon: string
          id?: string
          projected_ebitda?: number | null
          projected_occupancy?: number | null
          projected_revenue?: number
          tenant_id?: string | null
        }
        Update: {
          computed_at?: string
          confidence?: number | null
          currency?: string
          horizon?: string
          id?: string
          projected_ebitda?: number | null
          projected_occupancy?: number | null
          projected_revenue?: number
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_insurance: {
        Row: {
          coverage: number | null
          created_at: string
          currency: string
          expiry_date: string | null
          id: string
          insurer: string
          policy_type: string
          premium: number | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          coverage?: number | null
          created_at?: string
          currency?: string
          expiry_date?: string | null
          id?: string
          insurer: string
          policy_type: string
          premium?: number | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          coverage?: number | null
          created_at?: string
          currency?: string
          expiry_date?: string | null
          id?: string
          insurer?: string
          policy_type?: string
          premium?: number | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_legal_updates: {
        Row: {
          action_required: boolean | null
          category: string
          created_at: string
          deadline: string | null
          id: string
          published_at: string | null
          severity: string | null
          source: string | null
          summary: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          action_required?: boolean | null
          category: string
          created_at?: string
          deadline?: string | null
          id?: string
          published_at?: string | null
          severity?: string | null
          source?: string | null
          summary?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          action_required?: boolean | null
          category?: string
          created_at?: string
          deadline?: string | null
          id?: string
          published_at?: string | null
          severity?: string | null
          source?: string | null
          summary?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: []
      }
      hospitality_payroll: {
        Row: {
          benefits: number | null
          currency: string
          fte: number | null
          gross_pay: number
          headcount: number | null
          id: string
          net_pay: number | null
          period_month: string
          ratio_vs_revenue: number | null
          source: string
          synced_at: string
          taxes: number | null
          tenant_id: string | null
        }
        Insert: {
          benefits?: number | null
          currency?: string
          fte?: number | null
          gross_pay?: number
          headcount?: number | null
          id?: string
          net_pay?: number | null
          period_month: string
          ratio_vs_revenue?: number | null
          source?: string
          synced_at?: string
          taxes?: number | null
          tenant_id?: string | null
        }
        Update: {
          benefits?: number | null
          currency?: string
          fte?: number | null
          gross_pay?: number
          headcount?: number | null
          id?: string
          net_pay?: number | null
          period_month?: string
          ratio_vs_revenue?: number | null
          source?: string
          synced_at?: string
          taxes?: number | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_purchase_orders: {
        Row: {
          created_at: string
          currency: string
          delivery_date: string | null
          id: string
          items: Json | null
          merge_id: string | null
          number: string | null
          order_date: string | null
          status: string
          tenant_id: string | null
          total: number
          updated_at: string
          vendor: string
        }
        Insert: {
          created_at?: string
          currency?: string
          delivery_date?: string | null
          id?: string
          items?: Json | null
          merge_id?: string | null
          number?: string | null
          order_date?: string | null
          status?: string
          tenant_id?: string | null
          total?: number
          updated_at?: string
          vendor: string
        }
        Update: {
          created_at?: string
          currency?: string
          delivery_date?: string | null
          id?: string
          items?: Json | null
          merge_id?: string | null
          number?: string | null
          order_date?: string | null
          status?: string
          tenant_id?: string | null
          total?: number
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      hospitality_rents: {
        Row: {
          address: string
          charges: number | null
          created_at: string
          currency: string
          id: string
          lease_end: string | null
          lease_start: string | null
          monthly_rent: number
          next_payment_date: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          address: string
          charges?: number | null
          created_at?: string
          currency?: string
          id?: string
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent: number
          next_payment_date?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          address?: string
          charges?: number | null
          created_at?: string
          currency?: string
          id?: string
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number
          next_payment_date?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      hospitality_revenue: {
        Row: {
          avg_check: number | null
          covers: number | null
          currency: string
          id: string
          period_date: string
          provider: string | null
          raw_data: Json | null
          source: string
          synced_at: string
          tenant_id: string | null
          total_revenue: number
        }
        Insert: {
          avg_check?: number | null
          covers?: number | null
          currency?: string
          id?: string
          period_date: string
          provider?: string | null
          raw_data?: Json | null
          source?: string
          synced_at?: string
          tenant_id?: string | null
          total_revenue?: number
        }
        Update: {
          avg_check?: number | null
          covers?: number | null
          currency?: string
          id?: string
          period_date?: string
          provider?: string | null
          raw_data?: Json | null
          source?: string
          synced_at?: string
          tenant_id?: string | null
          total_revenue?: number
        }
        Relationships: []
      }
      hospitality_schedules: {
        Row: {
          created_at: string
          date: string
          employee_id: string | null
          end_time: string | null
          hours: number | null
          id: string
          start_time: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          employee_id?: string | null
          end_time?: string | null
          hours?: number | null
          id?: string
          start_time?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string | null
          end_time?: string | null
          hours?: number | null
          id?: string
          start_time?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hospitality_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_stock_items: {
        Row: {
          category: string
          currency: string
          current_stock: number
          dlc: string | null
          id: string
          max_stock: number | null
          min_stock: number | null
          name: string
          supplier: string | null
          tenant_id: string | null
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category: string
          currency?: string
          current_stock?: number
          dlc?: string | null
          id?: string
          max_stock?: number | null
          min_stock?: number | null
          name: string
          supplier?: string | null
          tenant_id?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          currency?: string
          current_stock?: number
          dlc?: string | null
          id?: string
          max_stock?: number | null
          min_stock?: number | null
          name?: string
          supplier?: string | null
          tenant_id?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      hospitality_stock_movements: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          movement_type: string
          quantity: number
          reference: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          movement_type: string
          quantity: number
          reference?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          movement_type?: string
          quantity?: number
          reference?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_sync_log: {
        Row: {
          connection_id: string | null
          domain: string
          duration_ms: number | null
          entity_type: string
          error: string | null
          id: string
          records_synced: number | null
          status: string
          synced_at: string
          tenant_id: string | null
        }
        Insert: {
          connection_id?: string | null
          domain: string
          duration_ms?: number | null
          entity_type: string
          error?: string | null
          id?: string
          records_synced?: number | null
          status?: string
          synced_at?: string
          tenant_id?: string | null
        }
        Update: {
          connection_id?: string | null
          domain?: string
          duration_ms?: number | null
          entity_type?: string
          error?: string | null
          id?: string
          records_synced?: number | null
          status?: string
          synced_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_sync_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "merge_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_turnover: {
        Row: {
          created_at: string
          department: string | null
          employee_id: string | null
          event_date: string
          event_type: string
          id: string
          reason: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          employee_id?: string | null
          event_date: string
          event_type: string
          id?: string
          reason?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          employee_id?: string | null
          event_date?: string
          event_type?: string
          id?: string
          reason?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_turnover_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hospitality_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_signals: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          data: Json
          description: string
          id: string
          kind: string
          priority: string
          resolution: string | null
          status: string
          suggestion: string
          target_id: string
          target_type: string
          title: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          data?: Json
          description?: string
          id?: string
          kind: string
          priority?: string
          resolution?: string | null
          status?: string
          suggestion?: string
          target_id: string
          target_type: string
          title: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          data?: Json
          description?: string
          id?: string
          kind?: string
          priority?: string
          resolution?: string | null
          status?: string
          suggestion?: string
          target_id?: string
          target_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          auth_type: string
          config: Json
          created_at: string
          credentials: Json
          health: string
          id: string
          last_health_check: string | null
          name: string
          provider: string
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          auth_type?: string
          config?: Json
          created_at?: string
          credentials?: Json
          health?: string
          id?: string
          last_health_check?: string | null
          name: string
          provider: string
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          auth_type?: string
          config?: Json
          created_at?: string
          credentials?: Json
          health?: string
          id?: string
          last_health_check?: string | null
          name?: string
          provider?: string
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          change_type: string
          created_at: string
          id: string
          product_id: string
          quantity_change: number
          reason: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          id?: string
          product_id: string
          quantity_change: number
          reason?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity_change?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string
          due_date: string
          grand_total: number
          id: string
          issue_date: string
          notes: string | null
          number: string
          paid_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name: string
          due_date?: string
          grand_total?: number
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string
          due_date?: string
          grand_total?: number
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bases: {
        Row: {
          chunk_overlap: number
          chunk_size: number
          created_at: string
          description: string | null
          embedding_model: string
          id: string
          name: string
        }
        Insert: {
          chunk_overlap?: number
          chunk_size?: number
          created_at?: string
          description?: string | null
          embedding_model?: string
          id?: string
          name: string
        }
        Update: {
          chunk_overlap?: number
          chunk_size?: number
          created_at?: string
          description?: string | null
          embedding_model?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          knowledge_base_id: string
          metadata: Json
          source_url: string | null
          title: string
        }
        Insert: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_base_id: string
          metadata?: Json
          source_url?: string | null
          title: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_base_id?: string
          metadata?: Json
          source_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_policies: {
        Row: {
          auto_expire: boolean
          auto_summarize: boolean
          created_at: string
          dedup_strategy: string
          description: string | null
          id: string
          max_entries: number
          min_importance: number
          name: string
          ttl_seconds: number | null
        }
        Insert: {
          auto_expire?: boolean
          auto_summarize?: boolean
          created_at?: string
          dedup_strategy?: string
          description?: string | null
          id?: string
          max_entries?: number
          min_importance?: number
          name: string
          ttl_seconds?: number | null
        }
        Update: {
          auto_expire?: boolean
          auto_summarize?: boolean
          created_at?: string
          dedup_strategy?: string
          description?: string | null
          id?: string
          max_entries?: number
          min_importance?: number
          name?: string
          ttl_seconds?: number | null
        }
        Relationships: []
      }
      merge_connections: {
        Row: {
          account_token: string
          category: string
          created_at: string
          id: string
          integration_id: string | null
          last_sync_at: string | null
          provider: string
          status: string
          sync_error: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          account_token: string
          category: string
          created_at?: string
          id?: string
          integration_id?: string | null
          last_sync_at?: string | null
          provider: string
          status?: string
          sync_error?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          account_token?: string
          category?: string
          created_at?: string
          id?: string
          integration_id?: string | null
          last_sync_at?: string | null
          provider?: string
          status?: string
          sync_error?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          latency_ms: number | null
          model_used: string | null
          role: string
          token_count: number | null
          tool_calls: Json | null
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          model_used?: string | null
          role: string
          token_count?: number | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          model_used?: string | null
          role?: string
          token_count?: number | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_runs: {
        Row: {
          action_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          latency_ms: number | null
          mission_id: string
          output: Json
          started_at: string | null
          status: string
        }
        Insert: {
          action_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          latency_ms?: number | null
          mission_id: string
          output?: Json
          started_at?: string | null
          status?: string
        }
        Update: {
          action_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          latency_ms?: number | null
          mission_id?: string
          output?: Json
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_runs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          actions: Json
          agent_id: string | null
          created_at: string
          error: string | null
          id: string
          result: string | null
          services: string[]
          status: Database["public"]["Enums"]["mission_status"]
          surface: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json
          agent_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          result?: string | null
          services?: string[]
          status?: Database["public"]["Enums"]["mission_status"]
          surface?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: Json
          agent_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          result?: string | null
          services?: string[]
          status?: Database["public"]["Enums"]["mission_status"]
          surface?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      model_profiles: {
        Row: {
          cost_per_1k_in: number
          cost_per_1k_out: number
          created_at: string
          fallback_profile_id: string | null
          id: string
          is_default: boolean
          max_cost_per_run: number | null
          max_tokens: number
          metadata: Json
          model: string
          name: string
          provider: string
          temperature: number
          top_p: number
        }
        Insert: {
          cost_per_1k_in?: number
          cost_per_1k_out?: number
          created_at?: string
          fallback_profile_id?: string | null
          id?: string
          is_default?: boolean
          max_cost_per_run?: number | null
          max_tokens?: number
          metadata?: Json
          model: string
          name: string
          provider: string
          temperature?: number
          top_p?: number
        }
        Update: {
          cost_per_1k_in?: number
          cost_per_1k_out?: number
          created_at?: string
          fallback_profile_id?: string | null
          id?: string
          is_default?: boolean
          max_cost_per_run?: number | null
          max_tokens?: number
          metadata?: Json
          model?: string
          name?: string
          provider?: string
          temperature?: number
          top_p?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_profiles_fallback_profile_id_fkey"
            columns: ["fallback_profile_id"]
            isOneToOne: false
            referencedRelation: "model_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          price_at_purchase: number
          product_id: string
          quantity: number
        }
        Insert: {
          id?: string
          order_id: string
          price_at_purchase: number
          product_id: string
          quantity: number
        }
        Update: {
          id?: string
          order_id?: string
          price_at_purchase?: number
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          payment_status: string
          shipping_address: Json
          status: string
          tenant_id: string
          total: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          payment_status?: string
          shipping_address?: Json
          status?: string
          tenant_id: string
          total?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          payment_status?: string
          shipping_address?: Json
          status?: string
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_steps: {
        Row: {
          agent: string
          completed_at: string | null
          depends_on: string[] | null
          expected_output: string
          id: string
          intent: string
          optional: boolean
          order: number
          plan_id: string
          retrieval_mode: string | null
          run_step_id: string | null
          status: string
          task_description: string
        }
        Insert: {
          agent: string
          completed_at?: string | null
          depends_on?: string[] | null
          expected_output: string
          id?: string
          intent: string
          optional?: boolean
          order: number
          plan_id: string
          retrieval_mode?: string | null
          run_step_id?: string | null
          status?: string
          task_description: string
        }
        Update: {
          agent?: string
          completed_at?: string | null
          depends_on?: string[] | null
          expected_output?: string
          id?: string
          intent?: string
          optional?: boolean
          order?: number
          plan_id?: string
          retrieval_mode?: string | null
          run_step_id?: string | null
          status?: string
          task_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_steps_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_steps_run_step_id_fkey"
            columns: ["run_step_id"]
            isOneToOne: false
            referencedRelation: "run_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          reasoning: string
          run_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          reasoning: string
          run_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          reasoning?: string
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          images: Json
          name: string
          price: number
          sku: string
          stock_quantity: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: Json
          name: string
          price: number
          sku: string
          stock_quantity?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: Json
          name?: string
          price?: number
          sku?: string
          stock_quantity?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_artifacts: {
        Row: {
          agent_id: string | null
          content: string
          content_hash: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          metadata: Json
          parent_id: string | null
          scope: string
          skill_id: string | null
          slug: string
          version: number
          workflow_id: string | null
        }
        Insert: {
          agent_id?: string | null
          content: string
          content_hash: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          metadata?: Json
          parent_id?: string | null
          scope?: string
          skill_id?: string | null
          slug: string
          version?: number
          workflow_id?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: string
          content_hash?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          parent_id?: string | null
          scope?: string
          skill_id?: string | null
          slug?: string
          version?: number
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_artifacts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_artifacts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "prompt_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_artifacts_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_artifacts_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      report_render_cache: {
        Row: {
          created_at: string
          expires_at: string
          narration: string | null
          payload_hash: string
          payload_json: Json
          spec_id: string
          version: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          narration?: string | null
          payload_hash: string
          payload_json: Json
          spec_id: string
          version: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          narration?: string | null
          payload_hash?: string
          payload_json?: Json
          spec_id?: string
          version?: number
        }
        Relationships: []
      }
      report_source_cache: {
        Row: {
          created_at: string
          expires_at: string
          hash: string
          payload: Json
        }
        Insert: {
          created_at?: string
          expires_at: string
          hash: string
          payload: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          hash?: string
          payload?: Json
        }
        Relationships: []
      }
      report_transform_cache: {
        Row: {
          created_at: string
          expires_at: string
          hash: string
          payload: Json
        }
        Insert: {
          created_at?: string
          expires_at: string
          hash: string
          payload: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          hash?: string
          payload?: Json
        }
        Relationships: []
      }
      run_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          id: string
          kind: string
          proposed_action: Json
          reversible: boolean
          run_id: string
          status: string
          step_id: string
          summary: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          kind: string
          proposed_action: Json
          reversible?: boolean
          run_id: string
          status?: string
          step_id: string
          summary: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          kind?: string
          proposed_action?: Json
          reversible?: boolean
          run_id?: string
          status?: string
          step_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_approvals_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "run_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      run_logs: {
        Row: {
          actor: string | null
          at: string
          id: string
          level: string
          message: string
          run_id: string
          step_id: string | null
        }
        Insert: {
          actor?: string | null
          at?: string
          id?: string
          level: string
          message: string
          run_id: string
          step_id?: string | null
        }
        Update: {
          actor?: string | null
          at?: string
          id?: string
          level?: string
          message?: string
          run_id?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "run_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      run_steps: {
        Row: {
          actor: string
          completed_at: string | null
          created_at: string
          error: Json | null
          id: string
          input: Json | null
          output: Json | null
          parent_step_id: string | null
          retry_count: number
          run_id: string
          seq: number
          started_at: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          actor: string
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          id?: string
          input?: Json | null
          output?: Json | null
          parent_step_id?: string | null
          retry_count?: number
          run_id: string
          seq: number
          started_at?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          actor?: string
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          id?: string
          input?: Json | null
          output?: Json | null
          parent_step_id?: string | null
          retry_count?: number
          run_id?: string
          seq?: number
          started_at?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_steps_parent_step_id_fkey"
            columns: ["parent_step_id"]
            isOneToOne: false
            referencedRelation: "run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          agent_id: string | null
          agent_version_id: string | null
          conversation_id: string | null
          cost: Json | null
          cost_budget_usd: number | null
          cost_usd: number
          created_at: string
          current_action_plan_id: string | null
          current_plan_id: string | null
          entrypoint: string | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["run_kind"]
          latency_ms: number | null
          max_retries: number
          metadata: Json
          model_profile_id: string | null
          output: Json
          parent_run_id: string | null
          prompt_artifact_id: string | null
          replay_mode: string
          replay_of_run_id: string | null
          request: Json | null
          retry_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          timeout_ms: number | null
          tokens_in: number
          tokens_out: number
          trigger: string
          updated_at: string | null
          user_id: string | null
          workflow_id: string | null
          workflow_version_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_version_id?: string | null
          conversation_id?: string | null
          cost?: Json | null
          cost_budget_usd?: number | null
          cost_usd?: number
          created_at?: string
          current_action_plan_id?: string | null
          current_plan_id?: string | null
          entrypoint?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["run_kind"]
          latency_ms?: number | null
          max_retries?: number
          metadata?: Json
          model_profile_id?: string | null
          output?: Json
          parent_run_id?: string | null
          prompt_artifact_id?: string | null
          replay_mode?: string
          replay_of_run_id?: string | null
          request?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          timeout_ms?: number | null
          tokens_in?: number
          tokens_out?: number
          trigger?: string
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string | null
          workflow_version_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_version_id?: string | null
          conversation_id?: string | null
          cost?: Json | null
          cost_budget_usd?: number | null
          cost_usd?: number
          created_at?: string
          current_action_plan_id?: string | null
          current_plan_id?: string | null
          entrypoint?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["run_kind"]
          latency_ms?: number | null
          max_retries?: number
          metadata?: Json
          model_profile_id?: string | null
          output?: Json
          parent_run_id?: string | null
          prompt_artifact_id?: string | null
          replay_mode?: string
          replay_of_run_id?: string | null
          request?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          timeout_ms?: number | null
          tokens_in?: number
          tokens_out?: number
          trigger?: string
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string | null
          workflow_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_runs_current_action_plan"
            columns: ["current_action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_runs_current_plan"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_model_profile_id_fkey"
            columns: ["model_profile_id"]
            isOneToOne: false
            referencedRelation: "model_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_prompt_artifact_id_fkey"
            columns: ["prompt_artifact_id"]
            isOneToOne: false
            referencedRelation: "prompt_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_replay_of_run_id_fkey"
            columns: ["replay_of_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_task_logs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          result: string | null
          run_id: string | null
          started_at: string | null
          success: boolean | null
          task_id: string | null
          trigger_instance_id: string | null
          trigger_source: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: string | null
          run_id?: string | null
          started_at?: string | null
          success?: boolean | null
          task_id?: string | null
          trigger_instance_id?: string | null
          trigger_source?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: string | null
          run_id?: string | null
          started_at?: string | null
          success?: boolean | null
          task_id?: string | null
          trigger_instance_id?: string | null
          trigger_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_task_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "scheduled_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_tasks: {
        Row: {
          active: boolean | null
          config: Json | null
          created_at: string | null
          cron_expression: string
          description: string | null
          id: string
          last_result: string | null
          last_run_at: string | null
          name: string
          run_count: number | null
          tenant_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          config?: Json | null
          created_at?: string | null
          cron_expression: string
          description?: string | null
          id?: string
          last_result?: string | null
          last_run_at?: string | null
          name: string
          run_count?: number | null
          tenant_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          config?: Json | null
          created_at?: string | null
          cron_expression?: string
          description?: string | null
          id?: string
          last_result?: string | null
          last_run_at?: string | null
          name?: string
          run_count?: number | null
          tenant_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scheduler_leases: {
        Row: {
          acquired_at: string
          expires_at: string
          instance_id: string
          key: string
          metadata: Json | null
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          instance_id: string
          key: string
          metadata?: Json | null
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          instance_id?: string
          key?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      scraper_assets: {
        Row: {
          asset_type: string | null
          created_at: string | null
          id: string
          job_id: string | null
          mime_type: string | null
          original_url: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          asset_type?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          mime_type?: string | null
          original_url: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          asset_type?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          mime_type?: string | null
          original_url?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scraper_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_configs: {
        Row: {
          category: string | null
          config: Json
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          slug: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          slug: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          slug?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      scraper_jobs: {
        Row: {
          asset_count: number | null
          completed_at: string | null
          config_id: string | null
          created_at: string | null
          duration_ms: number | null
          error: string | null
          html_path: string | null
          id: string
          mode: string | null
          options: Json | null
          result: Json | null
          screenshot_path: string | null
          status: string | null
          tenant_id: string | null
          url: string
        }
        Insert: {
          asset_count?: number | null
          completed_at?: string | null
          config_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          html_path?: string | null
          id?: string
          mode?: string | null
          options?: Json | null
          result?: Json | null
          screenshot_path?: string | null
          status?: string | null
          tenant_id?: string | null
          url: string
        }
        Update: {
          asset_count?: number | null
          completed_at?: string | null
          config_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          html_path?: string | null
          id?: string
          mode?: string | null
          options?: Json | null
          result?: Json | null
          screenshot_path?: string | null
          status?: string | null
          tenant_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_jobs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "scraper_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_versions: {
        Row: {
          changelog: string | null
          created_at: string
          id: string
          input_schema: Json
          output_schema: Json
          prompt_template: string
          skill_id: string
          version: number
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          id?: string
          input_schema?: Json
          output_schema?: Json
          prompt_template?: string
          skill_id: string
          version: number
        }
        Update: {
          changelog?: string | null
          created_at?: string
          id?: string
          input_schema?: Json
          output_schema?: Json
          prompt_template?: string
          skill_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_versions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          active_version: number
          category: string
          created_at: string
          description: string | null
          id: string
          input_schema: Json
          name: string
          output_schema: Json
          prompt_template: string
          slug: string
        }
        Insert: {
          active_version?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          input_schema?: Json
          name: string
          output_schema?: Json
          prompt_template?: string
          slug: string
        }
        Update: {
          active_version?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          input_schema?: Json
          name?: string
          output_schema?: Json
          prompt_template?: string
          slug?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json | null
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          description: string | null
          id: string
          is_encrypted: boolean | null
          key: string
          tenant_id: string | null
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          category: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          key: string
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          category?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          key?: string
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          integration_id: string
          status: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_id: string
          status?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          settings: Json | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          auth_config: Json
          auth_type: string
          created_at: string
          description: string | null
          enabled: boolean
          endpoint_url: string | null
          http_method: string
          id: string
          input_schema: Json
          integration_id: string | null
          kill_switch: boolean
          name: string
          output_schema: Json
          rate_limit: Json
          requires_sandbox: boolean
          retry_policy: Json
          risk_level: string
          slug: string
          timeout_ms: number
        }
        Insert: {
          auth_config?: Json
          auth_type?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          endpoint_url?: string | null
          http_method?: string
          id?: string
          input_schema?: Json
          integration_id?: string | null
          kill_switch?: boolean
          name: string
          output_schema?: Json
          rate_limit?: Json
          requires_sandbox?: boolean
          retry_policy?: Json
          risk_level?: string
          slug: string
          timeout_ms?: number
        }
        Update: {
          auth_config?: Json
          auth_type?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          endpoint_url?: string | null
          http_method?: string
          id?: string
          input_schema?: Json
          integration_id?: string | null
          kill_switch?: boolean
          name?: string
          output_schema?: Json
          rate_limit?: Json
          requires_sandbox?: boolean
          retry_policy?: Json
          risk_level?: string
          slug?: string
          timeout_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "tools_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      traces: {
        Row: {
          cost_usd: number | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["trace_kind"]
          latency_ms: number | null
          metadata: Json
          model_used: string | null
          name: string
          output: Json
          output_trust: string | null
          parent_trace_id: string | null
          run_id: string
          started_at: string
          status: string
          step_index: number
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["trace_kind"]
          latency_ms?: number | null
          metadata?: Json
          model_used?: string | null
          name?: string
          output?: Json
          output_trust?: string | null
          parent_trace_id?: string | null
          run_id: string
          started_at?: string
          status?: string
          step_index?: number
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["trace_kind"]
          latency_ms?: number | null
          metadata?: Json
          model_used?: string | null
          name?: string
          output?: Json
          output_trust?: string | null
          parent_trace_id?: string | null
          run_id?: string
          started_at?: string
          status?: string
          step_index?: number
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "traces_parent_trace_id_fkey"
            columns: ["parent_trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traces_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          agent_id: string
          conversation_id: string | null
          cost_usd: number
          created_at: string
          id: string
          latency_ms: number | null
          model_used: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_id: string
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          latency_ms?: number | null
          model_used?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_id?: string
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          latency_ms?: number | null
          model_used?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_connections: {
        Row: {
          api_key_encrypted: string | null
          connected_at: string
          display_name: string | null
          id: string
          service_id: string
          status: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          connected_at?: string
          display_name?: string | null
          id?: string
          service_id: string
          status?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          connected_at?: string
          display_name?: string | null
          id?: string
          service_id?: string
          status?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance_usd: number
          reserved_usd: number
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_usd?: number
          reserved_usd?: number
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_usd?: number
          reserved_usd?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_dashboard_access: {
        Row: {
          dashboard: Database["public"]["Enums"]["dashboard_id"]
          granted_at: string
          id: string
          role: Database["public"]["Enums"]["dashboard_role"]
          user_id: string
        }
        Insert: {
          dashboard: Database["public"]["Enums"]["dashboard_id"]
          granted_at?: string
          id?: string
          role?: Database["public"]["Enums"]["dashboard_role"]
          user_id: string
        }
        Update: {
          dashboard?: Database["public"]["Enums"]["dashboard_id"]
          granted_at?: string
          id?: string
          role?: Database["public"]["Enums"]["dashboard_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dashboard_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "clawd_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_dashboard_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "hearst_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          role: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sidebar_prefs: {
        Row: {
          active_environment: string | null
          created_at: string
          enabled_modules: Json
          environment: string
          id: string
          sidebar_added_modules: Json
          sidebar_layout: Json
          tenant_id: string | null
          theme_preset: string | null
          theme_tokens: Json | null
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          active_environment?: string | null
          created_at?: string
          enabled_modules?: Json
          environment?: string
          id?: string
          sidebar_added_modules?: Json
          sidebar_layout?: Json
          tenant_id?: string | null
          theme_preset?: string | null
          theme_tokens?: Json | null
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          active_environment?: string | null
          created_at?: string
          enabled_modules?: Json
          environment?: string
          id?: string
          sidebar_added_modules?: Json
          sidebar_layout?: Json
          tenant_id?: string | null
          theme_preset?: string | null
          theme_tokens?: Json | null
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      user_tokens: {
        Row: {
          access_token_enc: string | null
          auth_failure_count: number | null
          created_at: string | null
          expires_at: number | null
          id: string
          last_used_at: string | null
          provider: string
          refresh_rotated_at: string | null
          refresh_token_enc: string | null
          revoked_at: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          auth_failure_count?: number | null
          created_at?: string | null
          expires_at?: number | null
          id?: string
          last_used_at?: string | null
          provider?: string
          refresh_rotated_at?: string | null
          refresh_token_enc?: string | null
          revoked_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          auth_failure_count?: number | null
          created_at?: string | null
          expires_at?: number | null
          id?: string
          last_used_at?: string | null
          provider?: string
          refresh_rotated_at?: string | null
          refresh_token_enc?: string | null
          revoked_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          name: string | null
          provider: string | null
          provider_account_id: string | null
          role: string
          tenant_ids: string[] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          last_login_at?: string | null
          name?: string | null
          provider?: string | null
          provider_account_id?: string | null
          role?: string
          tenant_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string | null
          provider?: string | null
          provider_account_id?: string | null
          role?: string
          tenant_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json
          started_at: string | null
          status: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json
          started_at?: string | null
          status?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json
          started_at?: string | null
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          action_type: string
          agent_id: string | null
          config: Json
          id: string
          on_failure_step_id: string | null
          on_success_step_id: string | null
          step_order: number
          workflow_id: string
        }
        Insert: {
          action_type?: string
          agent_id?: string | null
          config?: Json
          id?: string
          on_failure_step_id?: string | null
          on_success_step_id?: string | null
          step_order?: number
          workflow_id: string
        }
        Update: {
          action_type?: string
          agent_id?: string | null
          config?: Json
          id?: string
          on_failure_step_id?: string | null
          on_success_step_id?: string | null
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_on_failure_step_id_fkey"
            columns: ["on_failure_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_on_success_step_id_fkey"
            columns: ["on_success_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          changelog: string | null
          config_snapshot: Json
          created_at: string
          id: string
          published_by: string | null
          steps_snapshot: Json
          version: number
          workflow_id: string
        }
        Insert: {
          changelog?: string | null
          config_snapshot?: Json
          created_at?: string
          id?: string
          published_by?: string | null
          steps_snapshot?: Json
          version?: number
          workflow_id: string
        }
        Update: {
          changelog?: string | null
          config_snapshot?: Json
          created_at?: string
          id?: string
          published_by?: string | null
          steps_snapshot?: Json
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          active_version_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          trigger_type: string
          version: number
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          trigger_type?: string
          version?: number
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          trigger_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflows_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clawd_users: {
        Row: {
          agent_name: string | null
          agent_personality: string | null
          auth_provider: string | null
          company: string | null
          created_at: string | null
          email: string | null
          google_refresh_token: string | null
          google_token_rotated_at: string | null
          id: string | null
          name: string | null
          onboarding_completed: boolean | null
          password_hash: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_personality?: string | null
          auth_provider?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          google_refresh_token?: string | null
          google_token_rotated_at?: string | null
          id?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          password_hash?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_personality?: string | null
          auth_provider?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          google_refresh_token?: string | null
          google_token_rotated_at?: string | null
          id?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          password_hash?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      exec: { Args: { sql: string }; Returns: undefined }
      grant_trial_credits: {
        Args: { p_amount_usd?: number; p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      mark_overdue_invoices: { Args: never; Returns: undefined }
      reserve_credits: {
        Args: {
          p_amount_usd: number
          p_job_id: string
          p_job_kind: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      settle_credits: {
        Args: {
          p_actual_usd: number
          p_description: string
          p_job_id: string
          p_job_kind: string
          p_reserved_usd: number
          p_tenant_id: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      dashboard_id: "cloud"
      dashboard_role: "admin" | "editor" | "viewer"
      mission_status:
        | "created"
        | "running"
        | "awaiting_approval"
        | "completed"
        | "failed"
        | "cancelled"
      run_kind: "chat" | "workflow" | "evaluation" | "tool_test"
      run_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "timeout"
        | "created"
        | "awaiting_approval"
        | "awaiting_clarification"
      trace_kind:
        | "llm_call"
        | "tool_call"
        | "memory_read"
        | "memory_write"
        | "skill_invoke"
        | "condition_eval"
        | "error"
        | "guard"
        | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      dashboard_id: ["cloud"],
      dashboard_role: ["admin", "editor", "viewer"],
      mission_status: [
        "created",
        "running",
        "awaiting_approval",
        "completed",
        "failed",
        "cancelled",
      ],
      run_kind: ["chat", "workflow", "evaluation", "tool_test"],
      run_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "timeout",
        "created",
        "awaiting_approval",
        "awaiting_clarification",
      ],
      trace_kind: [
        "llm_call",
        "tool_call",
        "memory_read",
        "memory_write",
        "skill_invoke",
        "condition_eval",
        "error",
        "guard",
        "custom",
      ],
    },
  },
} as const
