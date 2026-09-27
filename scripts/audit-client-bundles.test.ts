import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Keep this list aligned with the CLI's serverOnlyVariables.
const serverOnlyVariables = [
  "DATABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENROUTESERVICE_API_KEY",
  "REPORT_FINGERPRINT_HMAC_KEY",
  "REPORT_CAPABILITY_HMAC_KEY",
  "CRON_SECRET",
  "TURNSTILE_SECRET_KEY",
];

let fixtureDirectory: string | undefined;

async function makeBuildFixture(contents: string) {
  fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "badger-live-bundle-audit-"));
  const staticDirectory = path.join(fixtureDirectory, "static");
  await mkdir(staticDirectory, { recursive: true });
  await writeFile(path.join(staticDirectory, "app.js"), contents);
  return fixtureDirectory;
}

function runAudit(environment: NodeJS.ProcessEnv) {
  return spawnSync("bun", ["run", "scripts/audit-client-bundles.ts"], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
  });
}

afterEach(async () => {
  if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
  fixtureDirectory = undefined;
});

describe("client bundle audit", () => {
  it("detects a configured value without printing the value", async () => {
    const secret = "synthetic-bundle-audit-secret";
    const output = runAudit({
      ...process.env,
      NODE_ENV: "production",
      BADGER_NEXT_DIST_DIR: await makeBuildFixture(`const x = ${JSON.stringify(secret)};`),
      DATABASE_URL: secret,
    });
    const combinedOutput = `${output.stdout}\n${output.stderr}`;

    expect(output.error).toBeUndefined();
    expect(output.status).toBe(1);
    expect(combinedOutput).toContain("DATABASE_URL");
    expect(combinedOutput).not.toContain(secret);
  });

  it("passes when browser assets and the configured values do not match", async () => {
    const output = runAudit({
      ...process.env,
      ...Object.fromEntries(serverOnlyVariables.map((name) => [name, ""])),
      NODE_ENV: "production",
      BADGER_NEXT_DIST_DIR: await makeBuildFixture("const publicAsset = true;"),
    });

    expect(output.error).toBeUndefined();
    expect(output.status).toBe(0);
    expect(output.stdout).toContain("Client bundle audit passed");
  });
});
