import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicKey } from "./public-key";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  if (!url || !key) return null;
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Route Handlers can refresh auth cookies; read-only server renders cannot.
        }
      },
    },
  });
}
