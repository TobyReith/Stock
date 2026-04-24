// Auto-generated from Supabase schema.
// Regenerate via `pnpm supabase:types` (see package.json).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      inventory_events: {
        Row: {
          actor_id: string | null
          category: string | null
          custom_name: string | null
          happened_at: string
          household_id: string
          id: string
          item_id: string | null
          location: string | null
          product_name: string
          quantity: number | null
          reason: string | null
          type: string
          unit: string | null
        }
        Insert: {
          actor_id?: string | null
          category?: string | null
          custom_name?: string | null
          happened_at?: string
          household_id: string
          id?: string
          item_id?: string | null
          location?: string | null
          product_name: string
          quantity?: number | null
          reason?: string | null
          type: string
          unit?: string | null
        }
        Update: {
          actor_id?: string | null
          category?: string | null
          custom_name?: string | null
          happened_at?: string
          household_id?: string
          id?: string
          item_id?: string | null
          location?: string | null
          product_name?: string
          quantity?: number | null
          reason?: string | null
          type?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          household_id: string
          icon: string
          id: string
          is_system: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color: string
          created_at?: string
          household_id: string
          icon: string
          id?: string
          is_system?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          household_id?: string
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_attempts: {
        Row: {
          attempted_at: string
          code: string
          id: string
          success: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          code: string
          id?: string
          success: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          code?: string
          id?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at: string
          household_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          added_at: string
          added_by: string | null
          best_before: string
          consumed_at: string | null
          custom_brand: string | null
          custom_category: string | null
          custom_name: string | null
          discarded_at: string | null
          household_id: string
          id: string
          location: string
          note: string | null
          product_id: string | null
          quantity: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          added_at?: string
          added_by: string | null
          best_before: string
          consumed_at?: string | null
          custom_brand?: string | null
          custom_category?: string | null
          custom_name?: string | null
          discarded_at?: string | null
          household_id: string
          id?: string
          location: string
          note?: string | null
          product_id?: string | null
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          best_before?: string
          consumed_at?: string | null
          custom_brand?: string | null
          custom_category?: string | null
          custom_name?: string | null
          discarded_at?: string | null
          household_id?: string
          id?: string
          location?: string
          note?: string | null
          product_id?: string | null
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string
          off_data: Json | null
          source: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          off_data?: Json | null
          source: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          off_data?: Json | null
          source?: string
        }
        Relationships: []
      }
      cooked_meals: {
        Row: {
          cooked_at: string
          consumed_item_ids: string[]
          household_id: string
          id: string
          recipe_data: Json
          recipe_title: string
          user_id: string
        }
        Insert: {
          cooked_at?: string
          consumed_item_ids?: string[]
          household_id: string
          id?: string
          recipe_data: Json
          recipe_title: string
          user_id: string
        }
        Update: {
          cooked_at?: string
          consumed_item_ids?: string[]
          household_id?: string
          id?: string
          recipe_data?: Json
          recipe_title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooked_meals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: []
      }
      recipe_suggestions: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          household_id: string
          id: string
          input_item_ids: string[]
          recipes: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          household_id: string
          id?: string
          input_item_ids: string[]
          recipes: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          household_id?: string
          id?: string
          input_item_ids?: string[]
          recipes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "recipe_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          added_at: string
          added_by: string | null
          bought_at: string | null
          custom_name: string | null
          household_id: string
          id: string
          note: string | null
          product_id: string | null
          quantity: number | null
          unit: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          bought_at?: string | null
          custom_name?: string | null
          household_id: string
          id?: string
          note?: string | null
          product_id?: string | null
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          bought_at?: string | null
          custom_name?: string | null
          household_id?: string
          id?: string
          note?: string | null
          product_id?: string | null
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          dietary_preferences: string[]
          disliked_ingredients: string[]
          expiry_threshold_days: number
          recipe_notifications_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          dietary_preferences?: string[]
          disliked_ingredients?: string[]
          expiry_threshold_days?: number
          recipe_notifications_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          dietary_preferences?: string[]
          disliked_ingredients?: string[]
          expiry_threshold_days?: number
          recipe_notifications_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      storage_locations: {
        Row: {
          created_at: string
          household_id: string
          icon: string
          id: string
          is_system: boolean
          name: string
          slug: string
          sort_order: number
          temperature_hint: string
        }
        Insert: {
          created_at?: string
          household_id: string
          icon?: string
          id?: string
          is_system?: boolean
          name: string
          slug: string
          sort_order?: number
          temperature_hint?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          sort_order?: number
          temperature_hint?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_household_member: { Args: { h_id: string }; Returns: boolean }
      is_household_owner: { Args: { h_id: string }; Returns: boolean }
      seed_household_categories: { Args: { p_household_id: string }; Returns: undefined }
      seed_household_storage_locations: { Args: { p_household_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
