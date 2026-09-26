import { cp, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const standaloneDirectory = resolve(".next/standalone");
await mkdir(resolve(standaloneDirectory, ".next"), { recursive: true });
await cp(resolve(".next/static"), resolve(standaloneDirectory, ".next/static"), { recursive: true, force: true });
await cp(resolve("public"), resolve(standaloneDirectory, "public"), { recursive: true, force: true });

const server = spawn(process.execPath, [resolve(standaloneDirectory, "server.js")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOSTNAME: process.env.BADGER_HOSTNAME || "0.0.0.0",
    PORT: process.env.PORT || "3000",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error("Could not start the standalone Next.js server.", error.message);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 0 : 1);
});
