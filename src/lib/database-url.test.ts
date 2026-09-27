import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseConnectionString } from "./database-url";

describe("local Supabase database selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses an explicit database URL in any runtime", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://configured.example/db");
    vi.stubEnv("VERCEL", "1");
    expect(databaseConnectionString()).toBe("postgresql://configured.example/db");
  });

  it("uses local Supabase for standalone production builds outside Vercel", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    expect(databaseConnectionString()).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  });

  it("never silently connects to localhost on Vercel", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "1");
    expect(databaseConnectionString()).toBe("");
  });

  it("never mixes hosted Supabase Auth with an implicit local database", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    expect(databaseConnectionString()).toBe("");
  });

  it("keeps the local database fallback for the local Supabase stack", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(databaseConnectionString()).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  });
});
