import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Session = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  expires_at: string;
};

export type Feedback = {
  id: string;
  session_id: string;
  author: string;
  param_name: string | null;
  param_value: number | null;
  comment: string;
  created_at: string;
};
