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
      agent_skills: {
        Row: {
          agent_id: string
          config: Json
          priority: number
          skill_id: string
        }
        Insert: {
          agent_id: string
          config?: Json
          priority?: number
          skill_id: string
        }
        Update: {
          agent_id?: string
          config?: Json
          priority?: number
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
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
          config_snapshot: Json
          created_at: string
          id: string
          model_profile_id: string | null
          system_prompt: string
          version: number
        }
        Insert: {
          agent_id: string
          changelog?: string | null
          config_snapshot?: Json
          created_at?: string
          id?: string
          model_profile_id?: string | null
          system_prompt?: string
          version: number
        }
        Update: {
          agent_id?: string
          changelog?: string | null
          config_snapshot?: Json
          created_at?: string
          id?: string
          model_profile_id?: string | null
          system_prompt?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
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
      daily_reports: {
        Row: {
          content_markdown: string | null
          created_at: string
          error_message: string | null
          highlights: Json | null
          id: string
          idempotency_decision: string | null
          report_date: string
          report_type: string
          run_id: string | null
          status: string
          summary: string | null
          triggered_by: string
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          content_markdown?: string | null
          created_at?: string
          error_message?: string | null
          highlights?: Json | null
          id?: string
          idempotency_decision?: string | null
          report_date: string
          report_type?: string
          run_id?: string | null
          status?: string
          summary?: string | null
          triggered_by?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          content_markdown?: string | null
          created_at?: string
          error_message?: string | null
          highlights?: Json | null
          id?: string
          idempotency_decision?: string | null
          report_date?: string
          report_type?: string
          run_id?: string | null
          status?: string
          summary?: string | null
          triggered_by?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
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
      runs: {
        Row: {
          agent_id: string | null
          agent_version_id: string | null
          conversation_id: string | null
          cost_budget_usd: number | null
          cost_usd: number
          created_at: string
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
          retry_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          timeout_ms: number | null
          tokens_in: number
          tokens_out: number
          trigger: string
          workflow_id: string | null
          workflow_version_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_version_id?: string | null
          conversation_id?: string | null
          cost_budget_usd?: number | null
          cost_usd?: number
          created_at?: string
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
          retry_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          timeout_ms?: number | null
          tokens_in?: number
          tokens_out?: number
          trigger?: string
          workflow_id?: string | null
          workflow_version_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_version_id?: string | null
          conversation_id?: string | null
          cost_budget_usd?: number | null
          cost_usd?: number
          created_at?: string
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
          retry_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          timeout_ms?: number | null
          tokens_in?: number
          tokens_out?: number
          trigger?: string
          workflow_id?: string | null
          workflow_version_id?: string | null
        }
        Relationships: [
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
      system_settings: {
        Row: {
          id: string
          key: string
          value: string
          category: string
          description: string | null
          is_encrypted: boolean
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          key: string
          value: string
          category: string
          description?: string | null
          is_encrypted?: boolean
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          key?: string
          value?: string
          category?: string
          description?: string | null
          is_encrypted?: boolean
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          resource: string
          resource_id: string | null
          details: Json
          severity: string
          ip_address: string | null
          user_agent: string | null
          tenant_id: string | null
          success: boolean
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          resource: string
          resource_id?: string | null
          details?: Json
          severity?: string
          ip_address?: string | null
          user_agent?: string | null
          tenant_id?: string | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          resource?: string
          resource_id?: string | null
          details?: Json
          severity?: string
          ip_address?: string | null
          user_agent?: string | null
          tenant_id?: string | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          tenant_id: string | null
          role: string
          assigned_by: string | null
          assigned_at: string
          expires_at: string | null
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id?: string | null
          role: string
          assigned_by?: string | null
          assigned_at?: string
          expires_at?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string | null
          role?: string
          assigned_by?: string | null
          assigned_at?: string
          expires_at?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          thread_id: string
          run_id: string | null
          kind: string
          title: string
          summary: string | null
          content_ref: string | null
          output_tier: string | null
          provenance: Json
          created_at: string
        }
        Insert: {
          id: string
          thread_id: string
          run_id?: string | null
          kind: string
          title?: string
          summary?: string | null
          content_ref?: string | null
          output_tier?: string | null
          provenance?: Json
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          run_id?: string | null
          kind?: string
          title?: string
          summary?: string | null
          content_ref?: string | null
          output_tier?: string | null
          provenance?: Json
          created_at?: string
        }
        Relationships: []
      }
      actions: {
        Row: {
          id: string
          thread_id: string
          type: string
          provider: string
          status: string
          timestamp: string
          metadata: Json
          asset_id: string | null
        }
        Insert: {
          id: string
          thread_id: string
          type: string
          provider: string
          status?: string
          timestamp?: string
          metadata?: Json
          asset_id?: string | null
        }
        Update: {
          id?: string
          thread_id?: string
          type?: string
          provider?: string
          status?: string
          timestamp?: string
          metadata?: Json
          asset_id?: string | null
        }
        Relationships: []
      }
      run_steps: {
        Row: {
          id: string
          run_id: string
          parent_step_id: string | null
          seq: number
          type: string
          actor: string
          title: string
          status: string
          input: Json | null
          output: Json | null
          error: Json | null
          retry_count: number
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          parent_step_id?: string | null
          seq: number
          type: string
          actor: string
          title: string
          status?: string
          input?: Json | null
          output?: Json | null
          error?: Json | null
          retry_count?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          parent_step_id?: string | null
          seq?: number
          type?: string
          actor?: string
          title?: string
          status?: string
          input?: Json | null
          output?: Json | null
          error?: Json | null
          retry_count?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      run_approvals: {
        Row: {
          id: string
          run_id: string
          step_id: string
          status: string
          kind: string
          summary: string
          proposed_action: Json
          reversible: boolean
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          step_id: string
          status?: string
          kind: string
          summary: string
          proposed_action: Json
          reversible?: boolean
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          step_id?: string
          status?: string
          kind?: string
          summary?: string
          proposed_action?: Json
          reversible?: boolean
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      run_logs: {
        Row: {
          id: string
          run_id: string
          step_id: string | null
          at: string
          level: string
          actor: string | null
          message: string
        }
        Insert: {
          id?: string
          run_id: string
          step_id?: string | null
          at?: string
          level: string
          actor?: string | null
          message: string
        }
        Update: {
          id?: string
          run_id?: string
          step_id?: string | null
          at?: string
          level?: string
          actor?: string | null
          message?: string
        }
        Relationships: []
      }
      artifacts: {
        Row: {
          id: string
          run_id: string | null
          user_id: string
          type: string
          title: string
          status: string
          format: string
          summary: string | null
          content: string
          sections: Json
          sources: Json
          metadata: Json
          version: number
          parent_artifact_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_id?: string | null
          user_id: string
          type: string
          title: string
          status?: string
          format?: string
          summary?: string | null
          content: string
          sections?: Json
          sources?: Json
          metadata?: Json
          version?: number
          parent_artifact_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          run_id?: string | null
          user_id?: string
          type?: string
          title?: string
          status?: string
          format?: string
          summary?: string | null
          content?: string
          sections?: Json
          sources?: Json
          metadata?: Json
          version?: number
          parent_artifact_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      artifact_versions: {
        Row: {
          id: string
          artifact_id: string
          version: number
          content: string
          sections: Json
          change_summary: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          artifact_id: string
          version: number
          content: string
          sections: Json
          change_summary?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          artifact_id?: string
          version?: number
          content?: string
          sections?: Json
          change_summary?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      document_sessions: {
        Row: {
          id: string
          run_id: string
          artifact_id: string | null
          user_id: string
          title: string
          document_type: string
          status: string
          outline: Json
          sources: Json
          metadata: Json
          current_version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_id: string
          artifact_id?: string | null
          user_id: string
          title: string
          document_type: string
          status?: string
          outline?: Json
          sources?: Json
          metadata?: Json
          current_version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          artifact_id?: string | null
          user_id?: string
          title?: string
          document_type?: string
          status?: string
          outline?: Json
          sources?: Json
          metadata?: Json
          current_version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          run_id: string
          reasoning: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          reasoning: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          reasoning?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      plan_steps: {
        Row: {
          id: string
          plan_id: string
          order: number
          intent: string
          agent: string
          task_description: string
          expected_output: string
          retrieval_mode: string | null
          depends_on: string[] | null
          optional: boolean
          status: string
          run_step_id: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          plan_id: string
          order: number
          intent: string
          agent: string
          task_description: string
          expected_output: string
          retrieval_mode?: string | null
          depends_on?: string[] | null
          optional?: boolean
          status?: string
          run_step_id?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          plan_id?: string
          order?: number
          intent?: string
          agent?: string
          task_description?: string
          expected_output?: string
          retrieval_mode?: string | null
          depends_on?: string[] | null
          optional?: boolean
          status?: string
          run_step_id?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      action_plans: {
        Row: {
          id: string
          run_id: string
          plan_id: string | null
          created_by: string
          summary: string
          status: string
          created_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          run_id: string
          plan_id?: string | null
          created_by: string
          summary: string
          status?: string
          created_at?: string
          decided_at?: string | null
        }
        Update: {
          id?: string
          run_id?: string
          plan_id?: string | null
          created_by?: string
          summary?: string
          status?: string
          created_at?: string
          decided_at?: string | null
        }
        Relationships: []
      }
      action_plan_steps: {
        Row: {
          id: string
          action_plan_id: string
          order: number
          tool: string
          pack: string
          params: Json
          description: string
          severity: string
          reversible: boolean
          requires_approval: boolean
          approval_status: string
          execution_status: string
          idempotency_key: string
          result: Json | null
          error: Json | null
          executed_at: string | null
        }
        Insert: {
          id?: string
          action_plan_id: string
          order: number
          tool: string
          pack: string
          params: Json
          description: string
          severity: string
          reversible?: boolean
          requires_approval?: boolean
          approval_status?: string
          execution_status?: string
          idempotency_key: string
          result?: Json | null
          error?: Json | null
          executed_at?: string | null
        }
        Update: {
          id?: string
          action_plan_id?: string
          order?: number
          tool?: string
          pack?: string
          params?: Json
          description?: string
          severity?: string
          reversible?: boolean
          requires_approval?: boolean
          approval_status?: string
          execution_status?: string
          idempotency_key?: string
          result?: Json | null
          error?: Json | null
          executed_at?: string | null
        }
        Relationships: []
      }
      action_executions: {
        Row: {
          id: string
          action_step_id: string
          run_id: string
          step_id: string
          tool: string
          params: Json
          idempotency_key: string
          status: string
          result: Json | null
          error: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          action_step_id: string
          run_id: string
          step_id: string
          tool: string
          params: Json
          idempotency_key: string
          status?: string
          result?: Json | null
          error?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          action_step_id?: string
          run_id?: string
          step_id?: string
          tool?: string
          params?: Json
          idempotency_key?: string
          status?: string
          result?: Json | null
          error?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      missions: {
        Row: {
          id: string
          user_id: string
          agent_id: string | null
          title: string
          surface: string
          status: string
          actions: Json
          services: string[]
          result: string | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agent_id?: string | null
          title: string
          surface?: string
          status?: string
          actions?: Json
          services?: string[]
          result?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          agent_id?: string | null
          title?: string
          surface?: string
          status?: string
          actions?: Json
          services?: string[]
          result?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mission_runs: {
        Row: {
          id: string
          mission_id: string
          action_id: string
          status: string
          input: Json
          output: Json
          error: string | null
          latency_ms: number | null
          started_at: string | null
          finished_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          action_id: string
          status?: string
          input?: Json
          output?: Json
          error?: string | null
          latency_ms?: number | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          mission_id?: string
          action_id?: string
          status?: string
          input?: Json
          output?: Json
          error?: string | null
          latency_ms?: number | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
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
      run_kind: ["chat", "workflow", "evaluation", "tool_test"],
      run_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "timeout",
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
