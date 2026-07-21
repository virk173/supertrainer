export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          org_id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          org_id: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          org_id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          approved_manually: boolean
          consent_doc_hash: string | null
          consent_signed_at: string | null
          created_at: string
          health_flags: Json
          id: string
          import_batch_id: string | null
          intake: Json
          is_demo: boolean
          notification_channel: Database["public"]["Enums"]["notification_channel"]
          org_id: string
          profile_id: string | null
          source: Database["public"]["Enums"]["client_source"]
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          approved_manually?: boolean
          consent_doc_hash?: string | null
          consent_signed_at?: string | null
          created_at?: string
          health_flags?: Json
          id?: string
          import_batch_id?: string | null
          intake?: Json
          is_demo?: boolean
          notification_channel?: Database["public"]["Enums"]["notification_channel"]
          org_id: string
          profile_id?: string | null
          source: Database["public"]["Enums"]["client_source"]
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          approved_manually?: boolean
          consent_doc_hash?: string | null
          consent_signed_at?: string | null
          created_at?: string
          health_flags?: Json
          id?: string
          import_batch_id?: string | null
          intake?: Json
          is_demo?: boolean
          notification_channel?: Database["public"]["Enums"]["notification_channel"]
          org_id?: string
          profile_id?: string | null
          source?: Database["public"]["Enums"]["client_source"]
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          client_id: string
          created_at: string
          doc_sha256: string
          doc_version: string
          id: string
          ip: string | null
          org_id: string
          signed_at: string
          signed_name: string
          user_agent: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          doc_sha256: string
          doc_version: string
          id?: string
          ip?: string | null
          org_id: string
          signed_at?: string
          signed_name: string
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          doc_sha256?: string
          doc_version?: string
          id?: string
          ip?: string | null
          org_id?: string
          signed_at?: string
          signed_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          occurred_at: string
          org_id: string
          payload: Json
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          org_id: string
          payload?: Json
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          org_id?: string
          payload?: Json
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          allergen_tags: string[]
          carbs_per_100g: number
          created_at: string
          cuisine_tags: string[]
          fat_per_100g: number
          fiber_per_100g: number
          id: string
          kcal_per_100g: number
          name: string
          name_normalized: string
          org_id: string | null
          protein_per_100g: number
          serving_units: Json
          source: Database["public"]["Enums"]["food_source"]
          source_ref: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          allergen_tags?: string[]
          carbs_per_100g?: number
          created_at?: string
          cuisine_tags?: string[]
          fat_per_100g?: number
          fiber_per_100g?: number
          id?: string
          kcal_per_100g: number
          name: string
          name_normalized: string
          org_id?: string | null
          protein_per_100g?: number
          serving_units?: Json
          source: Database["public"]["Enums"]["food_source"]
          source_ref?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          allergen_tags?: string[]
          carbs_per_100g?: number
          created_at?: string
          cuisine_tags?: string[]
          fat_per_100g?: number
          fiber_per_100g?: number
          id?: string
          kcal_per_100g?: number
          name?: string
          name_normalized?: string
          org_id?: string | null
          protein_per_100g?: number
          serving_units?: Json
          source?: Database["public"]["Enums"]["food_source"]
          source_ref?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "foods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          id: string
          org_id: string
          row_count: number
          source: string
          undone_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          row_count?: number
          source?: string
          undone_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          row_count?: number
          source?: string
          undone_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_state: {
        Row: {
          answers: Json
          client_id: string
          created_at: string
          last_prompt_at: string | null
          nudges_sent: number
          org_id: string
          section: Database["public"]["Enums"]["interview_section"]
          started_at: string
          status: Database["public"]["Enums"]["interview_status"]
          updated_at: string
        }
        Insert: {
          answers?: Json
          client_id: string
          created_at?: string
          last_prompt_at?: string | null
          nudges_sent?: number
          org_id: string
          section?: Database["public"]["Enums"]["interview_section"]
          started_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Update: {
          answers?: Json
          client_id?: string
          created_at?: string
          last_prompt_at?: string | null
          nudges_sent?: number
          org_id?: string
          section?: Database["public"]["Enums"]["interview_section"]
          started_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          channel: Database["public"]["Enums"]["invite_channel"]
          client_id: string
          created_at: string
          expires_at: string
          id: string
          opened_at: string | null
          org_id: string
          personal_message: string | null
          token: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["invite_channel"]
          client_id: string
          created_at?: string
          expires_at?: string
          id?: string
          opened_at?: string | null
          org_id: string
          personal_message?: string | null
          token?: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["invite_channel"]
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          opened_at?: string | null
          org_id?: string
          personal_message?: string | null
          token?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          allergens: string[]
          answers: Json
          converted_client_id: string | null
          created_at: string
          email: string
          email_normalized: string | null
          id: string
          ip_hash: string | null
          org_id: string
          phone: string | null
          preview: Json | null
          preview_generated_at: string | null
          preview_generating_at: string | null
          status: Database["public"]["Enums"]["lead_status"]
          turnstile_verified: boolean
          updated_at: string
        }
        Insert: {
          allergens?: string[]
          answers?: Json
          converted_client_id?: string | null
          created_at?: string
          email: string
          email_normalized?: string | null
          id?: string
          ip_hash?: string | null
          org_id: string
          phone?: string | null
          preview?: Json | null
          preview_generated_at?: string | null
          preview_generating_at?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          turnstile_verified?: boolean
          updated_at?: string
        }
        Update: {
          allergens?: string[]
          answers?: Json
          converted_client_id?: string | null
          created_at?: string
          email?: string
          email_normalized?: string | null
          id?: string
          ip_hash?: string | null
          org_id?: string
          phone?: string | null
          preview?: Json | null
          preview_generated_at?: string | null
          preview_generating_at?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          turnstile_verified?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          client_id: string
          created_at: string
          id: string
          kind: string
          org_id: string
          payload: Json
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Insert: {
          body?: string | null
          client_id: string
          created_at?: string
          id?: string
          kind?: string
          org_id: string
          payload?: Json
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Update: {
          body?: string | null
          client_id?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          payload?: Json
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_onboarding_state: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["onboarding_step_status"]
          step: Database["public"]["Enums"]["onboarding_step"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["onboarding_step_status"]
          step: Database["public"]["Enums"]["onboarding_step"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["onboarding_step_status"]
          step?: Database["public"]["Enums"]["onboarding_step"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_onboarding_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          brand: Json
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          brand?: Json
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          brand?: Json
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_requests: {
        Row: {
          client_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["plan_kind"]
          org_id: string
          status: Database["public"]["Enums"]["plan_request_status"]
          trigger: Database["public"]["Enums"]["plan_trigger"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["plan_kind"]
          org_id: string
          status?: Database["public"]["Enums"]["plan_request_status"]
          trigger: Database["public"]["Enums"]["plan_trigger"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["plan_kind"]
          org_id?: string
          status?: Database["public"]["Enums"]["plan_request_status"]
          trigger?: Database["public"]["Enums"]["plan_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          client_id: string
          created_at: string
          endpoint: string
          id: string
          keys: Json
          org_id: string
          platform: string | null
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          endpoint: string
          id?: string
          keys?: Json
          org_id: string
          platform?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          org_id?: string
          platform?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      style_exemplars: {
        Row: {
          content: string
          created_at: string
          domain: Database["public"]["Enums"]["style_domain"]
          embedding: string | null
          id: string
          org_id: string
          quality_score: number | null
          source: Database["public"]["Enums"]["style_exemplar_source"]
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          domain: Database["public"]["Enums"]["style_domain"]
          embedding?: string | null
          id?: string
          org_id: string
          quality_score?: number | null
          source: Database["public"]["Enums"]["style_exemplar_source"]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          domain?: Database["public"]["Enums"]["style_domain"]
          embedding?: string | null
          id?: string
          org_id?: string
          quality_score?: number | null
          source?: Database["public"]["Enums"]["style_exemplar_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_exemplars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      style_profiles: {
        Row: {
          confidence: number | null
          confirmed_at: string | null
          created_at: string
          created_from: string[]
          domain: Database["public"]["Enums"]["style_domain"]
          id: string
          org_id: string
          profile: Json
          status: Database["public"]["Enums"]["style_profile_status"]
          updated_at: string
          version: number
        }
        Insert: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          created_from?: string[]
          domain: Database["public"]["Enums"]["style_domain"]
          id?: string
          org_id: string
          profile?: Json
          status?: Database["public"]["Enums"]["style_profile_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          created_from?: string[]
          domain?: Database["public"]["Enums"]["style_domain"]
          id?: string
          org_id?: string
          profile?: Json
          status?: Database["public"]["Enums"]["style_profile_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "style_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      tiers: {
        Row: {
          cadence: Database["public"]["Enums"]["tier_cadence"]
          created_at: string
          currency: string
          features: Json
          id: string
          is_active: boolean
          name: string
          org_id: string
          position: number
          price_cents: number
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["tier_cadence"]
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          position?: number
          price_cents?: number
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          cadence?: Database["public"]["Enums"]["tier_cadence"]
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          position?: number
          price_cents?: number
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          bucket_path: string
          created_at: string
          error: string | null
          extracted_text: string | null
          extraction_status: Database["public"]["Enums"]["upload_extraction_status"]
          id: string
          kind: Database["public"]["Enums"]["upload_kind"]
          org_id: string
          updated_at: string
        }
        Insert: {
          bucket_path: string
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          extraction_status?: Database["public"]["Enums"]["upload_extraction_status"]
          id?: string
          kind: Database["public"]["Enums"]["upload_kind"]
          org_id: string
          updated_at?: string
        }
        Update: {
          bucket_path?: string
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          extraction_status?: Database["public"]["Enums"]["upload_extraction_status"]
          id?: string
          kind?: Database["public"]["Enums"]["upload_kind"]
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_org_staff: { Args: { check_org_id: string }; Returns: boolean }
      jwt_org_id: { Args: never; Returns: string }
      jwt_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["org_role"]
      }
    }
    Enums: {
      client_source: "teaser" | "invite" | "import"
      client_status: "lead" | "onboarding" | "active" | "paused" | "churned"
      food_source: "usda" | "off" | "ifct" | "org_custom" | "seed"
      interview_section:
        | "logistics"
        | "goals"
        | "nutrition"
        | "training"
        | "lifestyle"
        | "health"
      interview_status: "in_progress" | "paused_health" | "complete"
      invite_channel: "copy_link" | "email"
      lead_status: "started" | "preview_shown" | "converted" | "expired"
      message_sender: "client" | "coach" | "system" | "assistant"
      notification_channel: "push" | "email_only"
      onboarding_step:
        | "brand"
        | "style"
        | "tiers"
        | "import"
        | "demo"
        | "invite"
      onboarding_step_status: "todo" | "done" | "skipped"
      org_role: "owner" | "staff" | "client"
      plan_kind: "diet" | "split"
      plan_request_status: "queued" | "running" | "drafted" | "failed"
      plan_trigger: "onboarding" | "monthly" | "manual"
      style_domain: "diet" | "training" | "voice"
      style_exemplar_source: "upload" | "edit_capture"
      style_profile_status: "draft" | "confirmed"
      tier_cadence: "monthly"
      upload_extraction_status: "pending" | "processing" | "done" | "failed"
      upload_kind: "plan_pdf" | "checkin_screenshot" | "doc"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      client_source: ["teaser", "invite", "import"],
      client_status: ["lead", "onboarding", "active", "paused", "churned"],
      food_source: ["usda", "off", "ifct", "org_custom", "seed"],
      interview_section: [
        "logistics",
        "goals",
        "nutrition",
        "training",
        "lifestyle",
        "health",
      ],
      interview_status: ["in_progress", "paused_health", "complete"],
      invite_channel: ["copy_link", "email"],
      lead_status: ["started", "preview_shown", "converted", "expired"],
      message_sender: ["client", "coach", "system", "assistant"],
      notification_channel: ["push", "email_only"],
      onboarding_step: ["brand", "style", "tiers", "import", "demo", "invite"],
      onboarding_step_status: ["todo", "done", "skipped"],
      org_role: ["owner", "staff", "client"],
      plan_kind: ["diet", "split"],
      plan_request_status: ["queued", "running", "drafted", "failed"],
      plan_trigger: ["onboarding", "monthly", "manual"],
      style_domain: ["diet", "training", "voice"],
      style_exemplar_source: ["upload", "edit_capture"],
      style_profile_status: ["draft", "confirmed"],
      tier_cadence: ["monthly"],
      upload_extraction_status: ["pending", "processing", "done", "failed"],
      upload_kind: ["plan_pdf", "checkin_screenshot", "doc"],
    },
  },
} as const

