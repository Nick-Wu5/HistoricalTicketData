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
    PostgrestVersion: "14.1"
  }
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
      event_price_daily: {
        Row: {
          avg_price: number | null
          created_at: string
          date: string
          max_price: number | null
          min_price: number | null
          samples: number | null
          te_event_id: number
        }
        Insert: {
          avg_price?: number | null
          created_at?: string
          date: string
          max_price?: number | null
          min_price?: number | null
          samples?: number | null
          te_event_id: number
        }
        Update: {
          avg_price?: number | null
          created_at?: string
          date?: string
          max_price?: number | null
          min_price?: number | null
          samples?: number | null
          te_event_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_price_daily_te_event_id_fkey"
            columns: ["te_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["te_event_id"]
          },
        ]
      }
      event_price_hourly: {
        Row: {
          avg_price: number | null
          captured_at_hour: string
          created_at: string
          listing_count: number | null
          max_price: number | null
          min_price: number | null
          te_event_id: number
        }
        Insert: {
          avg_price?: number | null
          captured_at_hour: string
          created_at?: string
          listing_count?: number | null
          max_price?: number | null
          min_price?: number | null
          te_event_id: number
        }
        Update: {
          avg_price?: number | null
          captured_at_hour?: string
          created_at?: string
          listing_count?: number | null
          max_price?: number | null
          min_price?: number | null
          te_event_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_price_hourly_te_event_id_fkey"
            columns: ["te_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["te_event_id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          olt_url: string | null
          starts_at: string | null
          te_event_id: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          olt_url?: string | null
          starts_at?: string | null
          te_event_id: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          olt_url?: string | null
          starts_at?: string | null
          te_event_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      poller_run_events: {
        Row: {
          avg_price: number | null
          created_at: string
          error: string | null
          hour_bucket: string
          listing_count: number | null
          max_price: number | null
          min_price: number | null
          status: string
          te_event_id: number
        }
        Insert: {
          avg_price?: number | null
          created_at?: string
          error?: string | null
          hour_bucket: string
          listing_count?: number | null
          max_price?: number | null
          min_price?: number | null
          status: string
          te_event_id: number
        }
        Update: {
          avg_price?: number | null
          created_at?: string
          error?: string | null
          hour_bucket?: string
          listing_count?: number | null
          max_price?: number | null
          min_price?: number | null
          status?: string
          te_event_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "poller_run_events_hour_bucket_fkey"
            columns: ["hour_bucket"]
            isOneToOne: false
            referencedRelation: "poller_runs"
            referencedColumns: ["hour_bucket"]
          },
        ]
      }
      poller_runs: {
        Row: {
          batch_size: number
          debug: Json | null
          error_sample: string | null
          events_failed: number | null
          events_processed: number
          events_succeeded: number | null
          events_total: number | null
          finished_at: string | null
          hour_bucket: string
          started_at: string
          status: string
        }
        Insert: {
          batch_size?: number
          debug?: Json | null
          error_sample?: string | null
          events_failed?: number | null
          events_processed?: number
          events_succeeded?: number | null
          events_total?: number | null
          finished_at?: string | null
          hour_bucket: string
          started_at?: string
          status?: string
        }
        Update: {
          batch_size?: number
          debug?: Json | null
          error_sample?: string | null
          events_failed?: number | null
          events_processed?: number
          events_succeeded?: number | null
          events_total?: number | null
          finished_at?: string | null
          hour_bucket?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_24h_change: { Args: { p_te_event_id: number }; Returns: number }
      get_chart_data_daily: {
        Args: { p_te_event_id: number }
        Returns: {
          avg_price: number
          max_price: number
          min_price: number
          recorded_date: string
        }[]
      }
      get_chart_data_hourly: {
        Args: { p_hours_back?: number; p_te_event_id: number }
        Returns: {
          avg_price: number
          max_price: number
          min_price: number
          recorded_at: string
        }[]
      }
      get_current_prices: {
        Args: { p_te_event_id: number }
        Returns: {
          avg_price: number
          change_24h: number
          last_updated: string
          listing_count: number
          max_price: number
          min_price: number
        }[]
      }
      rollup_hourly_to_daily: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
