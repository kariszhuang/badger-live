import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

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

const transportExtensions = new Set([".html", ".rsc", ".txt", ".json", ".body", ".meta", ".css"]);

// Use Next's precedence and interpolation rules so `.env.local` and the
// selected mode's files are included in the comparison.
loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");
const distDirectory = path.resolve(process.env.BADGER_NEXT_DIST_DIR || ".next");

async function filesUnder(directory: string, includeAllFiles: boolean): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(fullPath, includeAllFiles);
    if (!entry.isFile()) return [];
    return includeAllFiles || transportExtensions.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  }));
  return files.flat();
}

async function main() {
  const configuredSecrets = serverOnlyVariables.flatMap((name) => {
    const value = process.env[name]?.trim();
    return value ? [{ name, value }] : [];
  });
  const outputRoots = [
    { directory: path.join(distDirectory, "static"), includeAllFiles: true },
    { directory: path.join(distDirectory, "server", "app"), includeAllFiles: false },
    { directory: path.join(distDirectory, "server", "pages"), includeAllFiles: false },
    { directory: path.resolve("public"), includeAllFiles: true },
  ];
  const files = (await Promise.all(outputRoots.map(({ directory, includeAllFiles }) => filesUnder(directory, includeAllFiles)))).flat();
  if (files.length === 0) {
    console.error(`No browser-facing build assets found under ${distDirectory}. Build the app first.`);
    process.exitCode = 2;
    return;
  }

  const matches: string[] = [];
  for (const file of files) {
    const contents = await readFile(file);
    for (const secret of configuredSecrets) {
      if (contents.includes(Buffer.from(secret.value))) matches.push(secret.name);
    }
  }
  if (matches.length) {
    console.error(`Client bundle audit failed: configured server-only values found in browser assets (${[...new Set(matches)].join(", ")}).`);
    process.exitCode = 1;
    return;
  }
  const scope = configuredSecrets.length
    ? `checked ${configuredSecrets.length} configured server-only variables`
    : "no server-only environment values were configured for content comparison";
  console.log(`Client bundle audit passed across ${files.length} browser-facing assets; ${scope}.`);
}

await main();
