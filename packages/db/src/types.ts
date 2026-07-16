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
          consent_doc_hash: string | null
          consent_signed_at: string | null
          created_at: string
          health_flags: Json
          id: string
          intake: Json
          org_id: string
          profile_id: string | null
          source: Database["public"]["Enums"]["client_source"]
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          consent_doc_hash?: string | null
          consent_signed_at?: string | null
          created_at?: string
          health_flags?: Json
          id?: string
          intake?: Json
          org_id: string
          profile_id?: string | null
          source: Database["public"]["Enums"]["client_source"]
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          consent_doc_hash?: string | null
          consent_signed_at?: string | null
          created_at?: string
          health_flags?: Json
          id?: string
          intake?: Json
          org_id?: string
          profile_id?: string | null
          source?: Database["public"]["Enums"]["client_source"]
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
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
      invites: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          org_id: string
          token: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string
          id?: string
          org_id: string
          token?: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          org_id?: string
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
      onboarding_step:
        | "brand"
        | "style"
        | "tiers"
        | "import"
        | "demo"
        | "invite"
      onboarding_step_status: "todo" | "done" | "skipped"
      org_role: "owner" | "staff" | "client"
      style_domain: "diet" | "training" | "voice"
      style_exemplar_source: "upload" | "edit_capture"
      style_profile_status: "draft" | "confirmed"
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
      onboarding_step: ["brand", "style", "tiers", "import", "demo", "invite"],
      onboarding_step_status: ["todo", "done", "skipped"],
      org_role: ["owner", "staff", "client"],
      style_domain: ["diet", "training", "voice"],
      style_exemplar_source: ["upload", "edit_capture"],
      style_profile_status: ["draft", "confirmed"],
      upload_extraction_status: ["pending", "processing", "done", "failed"],
      upload_kind: ["plan_pdf", "checkin_screenshot", "doc"],
    },
  },
} as const

