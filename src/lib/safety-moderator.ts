import "server-only";
import { createSupabaseServerClient } from "./supabase/server";
import { supabasePublicKey } from "./supabase/public-key";

export function safetyModerationConfigured() {
  const moderators = process.env.SAFETY_MODERATOR_EMAILS?.split(",").map((email) => email.trim().toLocaleLowerCase()).filter(Boolean) || [];
  return moderators.length > 0 && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabasePublicKey());
}
export async function getSafetyModerator() {
  if (!safetyModerationConfigured()) return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  const allowed = process.env.SAFETY_MODERATOR_EMAILS?.split(",").map((email) => email.trim().toLocaleLowerCase()).filter(Boolean) || [];
  return allowed.includes(data.user.email.toLocaleLowerCase()) ? data.user.email : null;
}
