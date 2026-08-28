import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export interface AuthenticatedSupabase {
  supabase: SupabaseClient;
  user: User;
}

export async function authenticateSupabaseRequest(request: Request): Promise<AuthenticatedSupabase | null> {
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !url || !publicKey) return null;

  const supabase = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export async function isAdmin(auth: AuthenticatedSupabase) {
  const { data, error } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  return !error && data?.role === "admin";
}
