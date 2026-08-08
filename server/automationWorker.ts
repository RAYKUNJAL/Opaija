import dotenv from "dotenv";
import { processDueEmails } from "./emailLifecycle.js";
import { runBlogAutomation } from "./blog.js";

dotenv.config();

const intervalMs = Math.max(30_000, Number(process.env.AUTOMATION_INTERVAL_MS ?? 60_000));
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const [blog, email] = await Promise.all([
      runBlogAutomation(),
      processDueEmails({ limit: 40 }),
    ]);
    console.log(JSON.stringify({
      service: "opaija-automation-worker",
      at: new Date().toISOString(),
      blog,
      email,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      service: "opaija-automation-worker",
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Automation tick failed.",
    }));
  } finally {
    running = false;
  }
}

await tick();
setInterval(() => {
  void tick();
}, intervalMs);
