/**
 * server/spend.ts — OPAIJA persistent spend tracker
 *
 * Append-only JSONL store at data/spend-log.jsonl (one JSON object per line)
 * for crash-safe accounting. Currency is always USD.
 *
 * Read patterns match server/jobStore.ts: JSON file, node:fs/promises only,
 * no new deps.
 *
 * Stages 'parse' and 'manifest' are free and never logged here.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const SPEND_LOG_PATH = path.join(process.cwd(), "data", "spend-log.jsonl");

export type SpendStage = "voice" | "prompts" | "clips" | "music" | "render" | "qa";

export type SpendEntry = {
  ts: string;
  episodeId: string;
  stage: SpendStage | string;
  tool: string;        // 'claude-haiku' | 'claude-sonnet' | 'elevenlabs' | 'seedance-lite' | 'seedance-pro' | 'flux' | 'suno' | 'r2'
  units: number;       // chars, clips, seconds, MB, etc.
  unitCost: number;    // USD per unit
  totalCost: number;   // USD (units * unitCost, but caller computes so rounding stays consistent)
  notes?: string;
};

/**
 * Append a spend entry to the JSONL log.
 * Append-only on purpose: crash mid-write loses at most one line.
 */
export async function recordSpend(entry: Omit<SpendEntry, "ts"> & { ts?: string }): Promise<void> {
  const record: SpendEntry = {
    ts: entry.ts ?? new Date().toISOString(),
    episodeId: entry.episodeId,
    stage: entry.stage,
    tool: entry.tool,
    units: entry.units,
    unitCost: entry.unitCost,
    totalCost: entry.totalCost,
    notes: entry.notes,
  };
  await mkdir(path.dirname(SPEND_LOG_PATH), { recursive: true });
  await appendFile(SPEND_LOG_PATH, JSON.stringify(record) + "\n", "utf8");
}

/**
 * Stream all entries from the JSONL log. Tolerant of empty lines & partial last lines.
 */
export async function readSpendLog(): Promise<SpendEntry[]> {
  let raw: string;
  try {
    raw = await readFile(SPEND_LOG_PATH, "utf8");
  } catch {
    return [];
  }
  const out: SpendEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as SpendEntry);
    } catch {
      // skip corrupt line (the trade-off of append-only crash safety)
    }
  }
  return out;
}

/**
 * Returns total USD spend for the given month (YYYY-MM). Defaults to current month.
 */
export async function getMonthSpend(month?: string): Promise<number> {
  const target = month ?? currentMonth();
  const entries = await readSpendLog();
  let total = 0;
  for (const e of entries) {
    if (monthOf(e.ts) === target) total += e.totalCost;
  }
  return round2(total);
}

export type BudgetStatus = {
  alarm: boolean;
  warn: boolean;
  mtd: number;
  budget: number;
  warnThreshold: number;
  pctUsed: number;
};

/**
 * Read MONTHLY_BUDGET_USD (default 500) and BUDGET_WARN_PCT (default 75)
 * and report whether month-to-date spend has crossed warn or alarm.
 */
export async function checkBudget(): Promise<BudgetStatus> {
  const budget = parseFloat(process.env.MONTHLY_BUDGET_USD ?? "500") || 500;
  const warnPct = parseFloat(process.env.BUDGET_WARN_PCT ?? "75") || 75;
  const warnThreshold = round2((warnPct / 100) * budget);
  const mtd = await getMonthSpend();
  return {
    alarm: mtd >= budget,
    warn: mtd >= warnThreshold && mtd < budget,
    mtd,
    budget,
    warnThreshold,
    pctUsed: budget > 0 ? round2((mtd / budget) * 100) : 0,
  };
}

// ---------- helpers ----------
export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7); // 'YYYY-MM'
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const SPEND_LOG_FILE = SPEND_LOG_PATH;
