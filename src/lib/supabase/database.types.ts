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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_runs: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          input_fingerprint: string | null
          kind: string
          output: Json | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          input_fingerprint?: string | null
          kind: string
          output?: Json | null
          provider: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          input_fingerprint?: string | null
          kind?: string
          output?: Json | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          application_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: string
          metadata: Json | null
          source: string
          to_status: Database["public"]["Enums"]["application_status"]
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          metadata?: Json | null
          source: string
          to_status: Database["public"]["Enums"]["application_status"]
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          metadata?: Json | null
          source?: string
          to_status?: Database["public"]["Enums"]["application_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_confirmed_at: string | null
          created_at: string
          id: string
          job_id: string
          resume_version_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_confirmed_at?: string | null
          created_at?: string
          id?: string
          job_id: string
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_confirmed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_emails: {
        Row: {
          body_text: string | null
          category: string
          created_at: string
          deleted_at: string | null
          extracted_data: Json | null
          id: string
          provider_id: string
          received_at: string
          sender: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          body_text?: string | null
          category: string
          created_at?: string
          deleted_at?: string | null
          extracted_data?: Json | null
          id?: string
          provider_id: string
          received_at: string
          sender?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          body_text?: string | null
          category?: string
          created_at?: string
          deleted_at?: string | null
          extracted_data?: Json | null
          id?: string
          provider_id?: string
          received_at?: string
          sender?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_preparations: {
        Row: {
          application_id: string | null
          company: string
          created_at: string
          id: string
          inbound_email_id: string | null
          job_description: string
          result: Json
          resume_file_name: string
          resume_storage_path: string
          resume_text: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          company: string
          created_at?: string
          id?: string
          inbound_email_id?: string | null
          job_description: string
          result: Json
          resume_file_name: string
          resume_storage_path: string
          resume_text: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          company?: string
          created_at?: string
          id?: string
          inbound_email_id?: string | null
          job_description?: string
          result?: Json
          resume_file_name?: string
          resume_storage_path?: string
          resume_text?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_preparations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_preparations_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_preparations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_reviews: {
        Row: {
          answer_summary: string | null
          created_at: string
          highlights: string | null
          id: string
          improvements: string | null
          interview_id: string | null
          next_round_prep: string | null
          next_tasks: string | null
          questions: string | null
          resume_version_id: string | null
          score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_summary?: string | null
          created_at?: string
          highlights?: string | null
          id?: string
          improvements?: string | null
          interview_id?: string | null
          next_round_prep?: string | null
          next_tasks?: string | null
          questions?: string | null
          resume_version_id?: string | null
          score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_summary?: string | null
          created_at?: string
          highlights?: string | null
          id?: string
          improvements?: string | null
          interview_id?: string | null
          next_round_prep?: string | null
          next_tasks?: string | null
          questions?: string | null
          resume_version_id?: string | null
          score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_reviews_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_reviews_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string | null
          company: string | null
          created_at: string
          id: string
          interviewer: string | null
          meeting_url: string | null
          role: string | null
          round: string
          scheduled_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          company?: string | null
          created_at?: string
          id?: string
          interviewer?: string | null
          meeting_url?: string | null
          role?: string | null
          round: string
          scheduled_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          company?: string | null
          created_at?: string
          id?: string
          interviewer?: string | null
          meeting_url?: string | null
          role?: string | null
          round?: string
          scheduled_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          last_success_at: string | null
          name: string
          restricted_reason: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          last_success_at?: string | null
          name: string
          restricted_reason?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_success_at?: string | null
          name?: string
          restricted_reason?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          apply_url: string
          company: string
          created_at: string
          description: string
          education: string | null
          experience: string | null
          expires_at: string | null
          external_id: string | null
          fingerprint: string
          id: string
          location: string
          normalized_url: string | null
          published_at: string | null
          raw_data: Json | null
          salary_text: string | null
          source_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          apply_url: string
          company: string
          created_at?: string
          description: string
          education?: string | null
          experience?: string | null
          expires_at?: string | null
          external_id?: string | null
          fingerprint: string
          id?: string
          location: string
          normalized_url?: string | null
          published_at?: string | null
          raw_data?: Json | null
          salary_text?: string | null
          source_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          apply_url?: string
          company?: string
          created_at?: string
          description?: string
          education?: string | null
          experience?: string | null
          expires_at?: string | null
          external_id?: string | null
          fingerprint?: string
          id?: string
          location?: string
          normalized_url?: string | null
          published_at?: string | null
          raw_data?: Json | null
          salary_text?: string | null
          source_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_status: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          read_at: string | null
          scheduled_for: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_status?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          read_at?: string | null
          scheduled_for?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_status?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          read_at?: string | null
          scheduled_for?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_daily_limit: number
          created_at: string
          display_name: string | null
          id: string
          inbound_alias: string
          is_admin: boolean
          updated_at: string
        }
        Insert: {
          ai_daily_limit?: number
          created_at?: string
          display_name?: string | null
          id: string
          inbound_alias?: string
          is_admin?: boolean
          updated_at?: string
        }
        Update: {
          ai_daily_limit?: number
          created_at?: string
          display_name?: string | null
          id?: string
          inbound_alias?: string
          is_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          content: Json
          created_at: string
          id: string
          resume_id: string
          source: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          resume_id: string
          source: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          resume_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mime_type: string
          name: string
          parse_error: string | null
          parse_status: string
          parsed_text: string | null
          size_bytes: number
          storage_path: string
          structured_data: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mime_type: string
          name: string
          parse_error?: string | null
          parse_status?: string
          parsed_text?: string | null
          size_bytes: number
          storage_path: string
          structured_data?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mime_type?: string
          name?: string
          parse_error?: string | null
          parse_status?: string
          parsed_text?: string | null
          size_bytes?: number
          storage_path?: string
          structured_data?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          created_at: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_runs: {
        Row: {
          error_code: string | null
          finished_at: string | null
          id: string
          jobs_added: number
          jobs_seen: number
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          error_code?: string | null
          finished_at?: string | null
          id?: string
          jobs_added?: number
          jobs_seen?: number
          source_id: string
          started_at?: string
          status: string
        }
        Update: {
          error_code?: string | null
          finished_at?: string | null
          id?: string
          jobs_added?: number
          jobs_seen?: number
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_ai_usage: {
        Args: { p_result_run_id: string; p_task_id: string }
        Returns: Json
      }
      confirm_email_status_suggestion: {
        Args: { p_accept: boolean; p_notification_id: string }
        Returns: Database["public"]["Tables"]["notifications"]["Row"]
      }
      prepare_job_application: {
        Args: { p_job_id: string }
        Returns: Database["public"]["Tables"]["applications"]["Row"]
      }
      get_ai_quota: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      release_ai_usage: {
        Args: { p_task_id: string }
        Returns: Json
      }
      reserve_ai_usage: {
        Args: {
          p_force_new?: boolean
          p_input_fingerprint: string
          p_kind: string
          p_operation_key: string
        }
        Returns: Json
      }
      record_application_result: {
        Args: { p_application_id: string; p_outcome: string }
        Returns: Database["public"]["Tables"]["applications"]["Row"]
      }
      transition_application_status: {
        Args: {
          p_application_id: string
          p_target: Database["public"]["Enums"]["application_status"]
        }
        Returns: Database["public"]["Tables"]["applications"]["Row"]
      }
    }
    Enums: {
      application_status:
        | "saved"
        | "preparing"
        | "applied"
        | "assessment"
        | "interview"
        | "offer"
        | "rejected"
        | "closed"
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
      application_status: [
        "saved",
        "preparing",
        "applied",
        "assessment",
        "interview",
        "offer",
        "rejected",
        "closed",
      ],
    },
  },
} as const
