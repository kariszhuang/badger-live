const LOCAL_SUPABASE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function databaseConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.VERCEL === "1") return "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(supabaseUrl)) return "";
  return LOCAL_SUPABASE_DATABASE_URL;
}
