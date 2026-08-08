import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiCwd = await mkdtemp(path.join(tmpdir(), "opaija-browser-"));
const outputDir = path.join(root, "output", "playwright");
await mkdir(outputDir, { recursive: true });
const apiPort = 8800;
const webPort = 4174;
const processes = [];
let processOutput = "";

function start(command, args, options) {
  const child = spawn(command, args, { ...options, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { processOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { processOutput += chunk.toString(); });
  processes.push(child);
  return child;
}

const api = start(process.execPath, [path.join(root, "dist-server", "index.js")], {
  cwd: apiCwd,
  env: {
    ...process.env,
    PORT: String(apiPort),
    NODE_ENV: "development",
    ADMIN_PASSWORD: "browser-only-password",
    SESSION_SECRET: "browser-only-session-secret-32",
    PAYPAL_CLIENT_ID: "",
    PAYPAL_CLIENT_SECRET: "",
    PUBLIC_SITE_URL: `http://127.0.0.1:${webPort}`,
    ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`,
  },
});
const web = start(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(webPort)], {
  cwd: root,
  env: { ...process.env, VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}` },
});

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api.exitCode !== null || web.exitCode !== null) throw new Error(`Browser service exited.\n${processOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${processOutput}`);
}

let browser;
try {
  await Promise.all([
    waitFor(`http://127.0.0.1:${apiPort}/api/health`),
    waitFor(`http://127.0.0.1:${webPort}/`),
  ]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(90_000);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const checks = [];
  async function checkRoute(route, expectedHeading) {
    const response = await page.goto(`http://127.0.0.1:${webPort}${route}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`${route} returned ${response?.status()}`);
    await page.locator("h1").first().waitFor({ state: "visible" });
    const heading = (await page.locator("h1").first().textContent())?.trim() ?? "";
    if (!heading.includes(expectedHeading)) throw new Error(`${route} heading mismatch: ${heading}`);
    checks.push({ route, heading });
  }

  await checkRoute("/", "Caribbean finally gets its anime legend");
  await page.screenshot({ path: path.join(outputDir, "opaija-home-desktop.png"), fullPage: true });
  await checkRoute("/read-free", "Founder Preview");
  const previewAssets = await page.locator(".reader-page-viewer img, .reader-page img").count();
  await checkRoute("/checkout?product=tripwire-pass", "Checkout");
  await page.getByText("Pay USD 7 with PayPal", { exact: false }).waitFor();
  await checkRoute("/blog", "Lore, characters, craft");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".public-hero h1").waitFor({ state: "visible" });
  const navBox = await page.locator(".site-nav").boundingBox();
  const heroHeadingBox = await page.locator(".public-hero h1").boundingBox();
  if (!navBox || navBox.height > 110) throw new Error(`Mobile nav is too tall: ${navBox?.height}`);
  if (!heroHeadingBox || heroHeadingBox.y > 420) throw new Error(`Mobile hero is pushed below the first screen: ${heroHeadingBox?.y}`);
  await page.screenshot({ path: path.join(outputDir, "opaija-home-mobile.png"), fullPage: true });

  if (consoleErrors.length) throw new Error(`Browser console errors:\n${consoleErrors.join("\n")}`);
  console.log(JSON.stringify({
    checks,
    previewAssets,
    mobileNavHeight: navBox.height,
    mobileHeroHeadingY: heroHeadingBox.y,
    screenshots: [
      path.join(outputDir, "opaija-home-desktop.png"),
      path.join(outputDir, "opaija-home-mobile.png"),
    ],
  }, null, 2));
} finally {
  if (browser) await browser.close();
  for (const child of processes) {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
  await rm(apiCwd, { recursive: true, force: true });
}
