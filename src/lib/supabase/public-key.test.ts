import { afterEach, describe, expect, it, vi } from "vitest";
import { supabasePublicKey } from "./public-key";

describe("Supabase browser key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the current publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy_test");
    expect(supabasePublicKey()).toBe("sb_publishable_test");
  });

  it("accepts the legacy anon key during migration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy_test");
    expect(supabasePublicKey()).toBe("legacy_test");
  });

  it("returns an empty key when no public key is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(supabasePublicKey()).toBe("");
  });
});
