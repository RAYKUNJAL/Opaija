/**
 * scripts/check-spend.ts — OPAIJA spend summarizer
 *
 * Reads data/spend-log.jsonl and prints a budget-aware summary.
 *
 * Usage:
 *   npx tsx scripts/check-spend.ts
 *   npx tsx scripts/check-spend.ts --month=2026-05
 *   npx tsx scripts/check-spend.ts --episode=EP001
 *
 * Exit codes:
 *   0  — under budget (or under warn)
 *   1  — month-to-date >= MONTHLY_BUDGET_USD (default $500)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import {
  checkBudget,
  currentMonth,
  monthOf,
  readSpendLog,
  round2,
  type SpendEntry,
} from "../server/spend.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

type Args = { month: string | null; episode: string | null };

function parseArgs(argv: string[]): Args {
  let month: string | null = null;
  let episode: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--month=")) month = a.slice("--month=".length);
    else if (a.startsWith("--episode=")) episode = a.slice("--episode=".length);
  }
  return { month, episode };
}

function sumBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + val(r));
  }
  return m;
}

function table(rows: Array<[string, number, number?]>, headers: string[]): string {
  const cols = headers.length;
  const widths = headers.map((h) => h.length);
  const stringRows = rows.map((r) =>
    r.map((cell, i) => {
      if (i === 0) return String(cell);
      if (typeof cell === "number") {
        if (i === 2) return `${cell}`; // count column
        return `$${cell.toFixed(2)}`;
      }
      return String(cell ?? "");
    }),
  );
  for (const r of stringRows) {
    for (let i = 0; i < cols; i++) widths[i] = Math.max(widths[i], r[i]?.length ?? 0);
  }
  const sep = "  ";
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(sep);
  const ruleLine = widths.map((w) => "-".repeat(w)).join(sep);
  const body = stringRows
    .map((r) =>
      r.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join(sep),
    )
    .join("\n");
  return [headerLine, ruleLine, body].join("\n");
}

function fmt$(n: number): string {
  return `$${n.toFixed(2)}`;
}

function daysAgo(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  return Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const month = args.month ?? currentMonth();

  const all = await readSpendLog();
  const filtered = all.filter((e) => {
    if (args.episode && e.episodeId !== args.episode) return false;
    if (args.month && monthOf(e.ts) !== args.month) return false;
    return true;
  });

  console.log("");
  console.log("=== OPAIJA SPEND SUMMARY ===========================================");
  console.log(`Month        : ${month}${args.episode ? `   Episode: ${args.episode}` : ""}`);
  console.log(`Entries      : ${filtered.length} of ${all.length} in log`);
  console.log("");

  if (!filtered.length) {
    console.log("(no spend entries match the filter)");
  } else {
    // Per-episode rollup (sorted desc by total)
    const perEp = sumBy(filtered, (e) => e.episodeId || "(unknown)", (e) => e.totalCost);
    const countPerEp = sumBy(filtered, (e) => e.episodeId || "(unknown)", () => 1);
    const epRows: Array<[string, number, number]> = Array.from(perEp.entries())
      .map(([id, t]) => [id, round2(t), countPerEp.get(id) ?? 0] as [string, number, number])
      .sort((a, b) => b[1] - a[1]);
    console.log("By episode:");
    console.log(table(epRows, ["episode", "total", "calls"]));
    console.log("");

    // Per-tool rollup
    const perTool = sumBy(filtered, (e) => e.tool, (e) => e.totalCost);
    const countPerTool = sumBy(filtered, (e) => e.tool, () => 1);
    const toolRows: Array<[string, number, number]> = Array.from(perTool.entries())
      .map(([t, v]) => [t, round2(v), countPerTool.get(t) ?? 0] as [string, number, number])
      .sort((a, b) => b[1] - a[1]);
    console.log("By tool:");
    console.log(table(toolRows, ["tool", "total", "calls"]));
    console.log("");
  }

  // Month-to-date for the CURRENT month, regardless of --month filter
  const status = await checkBudget();
  const monthTotal = round2(
    all.filter((e) => monthOf(e.ts) === month).reduce((s, e) => s + e.totalCost, 0),
  );

  // Burn rate: last 7 days of actuals -> projected month
  const last7 = all.filter((e: SpendEntry) => daysAgo(e.ts, now) < 7);
  const last7Total = last7.reduce((s, e) => s + e.totalCost, 0);
  const projectedMonth = round2(last7Total * 4); // simple x4 projection

  console.log(`Month total  : ${fmt$(monthTotal)}    (filter: ${month})`);
  console.log(`MTD (live)   : ${fmt$(status.mtd)}    Budget: ${fmt$(status.budget)}    (${status.pctUsed.toFixed(1)}%)`);
  console.log(`Burn rate    : last-7d ${fmt$(round2(last7Total))} x4 = projected ${fmt$(projectedMonth)}/mo`);
  console.log(`Warn at      : ${fmt$(status.warnThreshold)}`);

  // Write JSON summary for the dashboard
  const summaryPath = path.join(process.cwd(), "data", "spend-summary.json");
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: now.toISOString(),
        month,
        episodeFilter: args.episode ?? null,
        monthTotal,
        mtd: status.mtd,
        budget: status.budget,
        warnThreshold: status.warnThreshold,
        pctUsed: status.pctUsed,
        alarm: status.alarm,
        warn: status.warn,
        last7Total: round2(last7Total),
        projectedMonth,
        byEpisode: Object.fromEntries(
          Array.from(sumBy(filtered, (e) => e.episodeId || "(unknown)", (e) => e.totalCost))
            .map(([k, v]) => [k, round2(v)]),
        ),
        byTool: Object.fromEntries(
          Array.from(sumBy(filtered, (e) => e.tool, (e) => e.totalCost))
            .map(([k, v]) => [k, round2(v)]),
        ),
        entries: filtered.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log(`Wrote ${path.relative(process.cwd(), summaryPath).replace(/\\/g, "/")}`);
  console.log("====================================================================");
  console.log("");

  if (status.alarm) {
    console.error(
      `[check-spend] ALARM: month-to-date ${fmt$(status.mtd)} >= budget ${fmt$(status.budget)}. ` +
        "Pause auto-batches and audit produce.ts invocations.",
    );
    process.exit(1);
  }
  if (status.warn) {
    console.warn(
      `[check-spend] WARNING: month-to-date ${fmt$(status.mtd)} is ${status.pctUsed.toFixed(1)}% of budget ${fmt$(status.budget)}.`,
    );
  }
}

main().catch((err) => {
  console.error("[check-spend] FATAL:", err);
  process.exit(2);
});
