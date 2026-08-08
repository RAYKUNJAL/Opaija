import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = await mkdtemp(path.join(tmpdir(), "opaija-smoke-"));
const port = 8799;
let output = "";
const child = spawn(process.execPath, [path.join(root, "dist-server", "index.js")], {
  cwd,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "development",
    ADMIN_PASSWORD: "smoke-only-password",
    SESSION_SECRET: "smoke-only-session-secret-32-bytes",
    PAYPAL_CLIENT_ID: "",
    PAYPAL_CLIENT_SECRET: "",
    PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function request(route, init) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, init);
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch { payload = body; }
  return { status: response.status, payload };
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}.\n${output}`);
    try {
      const health = await request("/api/health");
      if (health.status === 200) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error(`Server did not become ready.\n${output}`);

  const health = await request("/api/health");
  const catalog = await request("/api/funnel/catalog");
  const cadence = await request("/api/blog/cadence");
  const lead = await request("/api/funnel/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "smoke@example.com", firstName: "Smoke", source: "verification", consent: false }),
  });
  const checkout = await request("/api/paypal/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "tripwire-pass", email: "smoke@example.com" }),
  });
  const schedule = await request("/api/blog/schedule");
  const download = await request("/api/funnel/download/tripwire");
  const vault = catalog.payload.find((product) => product.slug === "tripwire");
  const result = {
    healthOk: health.payload.ok,
    vaultName: vault.name,
    vaultPrice: vault.price,
    vaultStatus: vault.status,
    vaultAsset: vault.assets[0],
    cadenceSlots: cadence.payload.cadence,
    postsPerWeek: cadence.payload.postsPerWeek,
    leadConsent: lead.payload.consent,
    paypalWithoutCredentials: checkout.status,
    privateScheduleWithoutAdmin: schedule.status,
    protectedDownloadWithoutMember: download.status,
  };
  const expected = {
    healthOk: true,
    vaultPrice: 7,
    vaultStatus: "ready",
    vaultAsset: "/api/funnel/download/tripwire",
    postsPerWeek: 14,
    leadConsent: false,
    paypalWithoutCredentials: 503,
    privateScheduleWithoutAdmin: 401,
    protectedDownloadWithoutMember: 401,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(result[key]) !== JSON.stringify(value)) {
      throw new Error(`Smoke assertion failed for ${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(result[key])}`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  await rm(cwd, { recursive: true, force: true });
}
