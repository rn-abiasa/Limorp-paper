import { createClient } from "@supabase/supabase-js";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          clerk_id: string;
          tier: string;
          created_at: string;
        };
        Insert: {
          clerk_id: string;
          tier?: string;
          created_at?: string;
        };
        Update: {
          clerk_id?: string;
          tier?: string;
          created_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          clerk_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      drawings: {
        Row: {
          id: string;
          project_id: string;
          data: any;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          data?: any;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          data?: any;
          updated_at?: string;
        };
      };
    };
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// We use a singleton pattern for the client to prevent recreating it on every import
const globalForSupabase = globalThis as unknown as {
  supabase: ReturnType<typeof createClient<Database>> | undefined;
};

export const supabase =
  globalForSupabase.supabase ??
  createClient<Database>(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== "production")
  globalForSupabase.supabase = supabase;
