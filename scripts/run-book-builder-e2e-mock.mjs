import { spawn } from "node:child_process";
import process from "node:process";

const port = String(process.env.E2E_PORT ?? process.env.PORT ?? (18000 + (Date.now() % 10000)));
const healthBase = process.env.E2E_API_BASE ?? `http://127.0.0.1:${port}`;
const healthUrl = `${healthBase}/api/book-builder/health`;
const waitMs = Number(process.env.E2E_WAIT_MS ?? 120000);
const dataDir = process.env.BOOK_BUILDER_DATA_DIR ?? `data/book-builder-e2e-${Date.now()}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcess(child) {
  if (child && !child.killed) {
    child.kill("SIGINT");
  }
}

async function waitForHealth(getServerExit, timeoutMs = waitMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const serverExit = getServerExit();
    if (serverExit) {
      throw new Error(`Spawned API server exited before health check passed: ${serverExit}`);
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return true;
      }
    } catch {
      // keep trying until timeout
    }
    await wait(500);
  }
  return false;
}

async function main() {
  const server = spawn("node", ["dist-server/index.js"], {
    env: {
      ...process.env,
      PORT: port,
      BOOK_BUILDER_DATA_DIR: dataDir,
      BOOK_BUILDER_FORCE_MOCK: "1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let serverExit = "";
  server.once("close", (code, signal) => {
    serverExit = `code=${code ?? "null"} signal=${signal ?? "null"}`;
  });
  server.stdout?.on("data", (chunk) => process.stdout.write(`[server] ${String(chunk)}`));
  server.stderr?.on("data", (chunk) => process.stderr.write(`[server] ${String(chunk)}`));

  let passed = false;

  try {
    const healthy = await waitForHealth(() => serverExit);
    if (!healthy) {
      throw new Error(`Timed out waiting for health: ${healthUrl}`);
    }

    const test = spawn(process.execPath, ["scripts/book-builder-e2e.mjs"], {
      env: {
        ...process.env,
        BOOK_BUILDER_DATA_DIR: dataDir,
        E2E_API_BASE: healthBase,
      },
      stdio: "inherit",
    });

    const code = await new Promise((resolve) => {
      test.on("close", (exitCode) => resolve(exitCode ?? 1));
    });

    if (code !== 0) {
      throw new Error(`builder:e2e failed with code ${code}`);
    }

    passed = true;
  } catch (error) {
    console.error("builder:e2e:mock failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    stopProcess(server);
    await wait(300);
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        server.kill("SIGKILL");
        resolve(undefined);
      }, 1200);
      server.on("close", () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });
  }

  if (passed) {
    console.log(`builder:e2e:mock passed using E2E_API_BASE=${healthBase} BOOK_BUILDER_DATA_DIR=${dataDir}`);
  }
}

await main();
