import { runBlogAutomation, type BlogAutomationResult } from "./blog.js";

export type BlogWorkerOptions = {
  intervalMs?: number;
  runImmediately?: boolean;
  unref?: boolean;
  onSuccess?: (result: BlogAutomationResult) => void;
  onError?: (error: unknown) => void;
};

export type BlogWorker = {
  runNow: () => Promise<BlogAutomationResult | null>;
  stop: () => void;
  isRunning: () => boolean;
};

const DEFAULT_INTERVAL_MS = 15 * 60_000;

export function startBlogWorker(options: BlogWorkerOptions = {}): BlogWorker {
  const configuredInterval = options.intervalMs ?? Number(process.env.BLOG_AUTOMATION_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) ? Math.max(60_000, configuredInterval) : DEFAULT_INTERVAL_MS;
  let stopped = false;
  let running = false;

  const runNow = async () => {
    if (stopped || running) return null;
    running = true;
    try {
      const result = await runBlogAutomation();
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      options.onError?.(error);
      if (!options.onError) console.error("Blog automation worker failed after retries.", error);
      return null;
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void runNow();
  }, intervalMs);
  if (options.unref !== false && "unref" in timer) timer.unref();
  if (options.runImmediately !== false) void runNow();

  return {
    runNow,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    isRunning: () => running,
  };
}

export function runBlogWorker(options: BlogWorkerOptions = {}) {
  return startBlogWorker(options);
}
