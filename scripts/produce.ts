/**
 * scripts/produce.ts — OPAIJA Pipeline Orchestrator
 *
 * Produces a finished episode MP4 end-to-end:
 *   parse -> voice -> prompts -> clips -> manifest -> render -> report
 *
 * Each stage is resumable: if its primary artifact already exists in
 * public/episodes/<EPxxx>/ the stage is skipped, unless --force or --from=<stage>.
 *
 * Usage:
 *   npx tsx scripts/produce.ts EP002
 *   npx tsx scripts/produce.ts EP001 --force
 *   npx tsx scripts/produce.ts EP002 --from=clips --aspect=9:16
 *
 * Missing API keys put the relevant stage into MOCK MODE so downstream
 * stages still have valid inputs to chew on.
 */

import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { fal } from "@fal-ai/client";
import dotenv from "dotenv";

import { checkBudget, recordSpend } from "../server/spend.js";
import {
  cleanSyncData,
  computeBeatTimings,
  totalRuntimeFromTimedBeats,
  type ElevenLabsAlignment,
} from "./compute-timings.js";

// ---------- env bootstrap ----------
dotenv.config({ path: path.join(process.cwd(), ".env") });

// ---------- ffmpeg-static (used only for mock-mode placeholders) ----------
// We import lazily so the orchestrator still runs even if the optional
// dev-dep isn't installed yet.
async function getFfmpegPath(): Promise<string | null> {
  try {
    // @ts-expect-error - ffmpeg-static has no types
    const mod = await import("ffmpeg-static");
    const resolved = (mod.default ?? mod) as string | null;
    return resolved ?? null;
  } catch {
    return null;
  }
}

// ---------- types ----------
type AspectRatio = "9:16" | "16:9";
type StageName = "parse" | "voice" | "prompts" | "clips" | "manifest" | "render" | "report";

export type Beat = {
  idx: number;
  text: string;
  durSec: number;
  startSec: number;
  characters: string[];
};

export type ParsedScript = {
  episodeId: string;
  title: string;
  runtimeSeconds: number;
  location: string;
  island: string;
  characters: string[];
  villainPresence: boolean | string;
  narrationText: string;
  beats: Beat[];
  source: "markdown" | "queue";
  humanApproved: boolean;
};

type PromptedBeat = Beat & {
  prompt: string;
  // === EP002 prompt-rewrite === negative prompt fed to Seedance to suppress
  // photoreal drift, sweat, uncanny faces, watermarks. Stage-4 (Agent D) is
  // responsible for wiring this through to the fal.ai API call.
  negativePrompt?: string;
  referenceImageUrls: string[];
  // === Character-Sheet Wiring === path RELATIVE TO public/ (e.g.
  // "assets/characters/kairo-kai-baptiste.png"), pointing to the canon sheet
  // for the beat's primary character. Used by stage-4 to resolve the on-disk
  // PNG and pass it to Seedance as image_url (base64 data URI).
  referenceImage?: string;
  primaryCharacter?: string;
  mode: "text-to-video" | "reference-to-video" | "image-to-video";
};

type ClippedBeat = PromptedBeat & {
  clipPath: string;
  clipMock: boolean;
};

type Manifest = {
  episodeId: string;
  aspectRatio: AspectRatio;
  runtimeSeconds: number;
  narrationPath: string;
  alignmentPath: string | null;
  beats: Array<{
    idx: number;
    prompt: string;
    clipPath: string;
    startSec: number;
    durSec: number;
    characters: string[];
  }>;
  generatedAt: string;
  schemaVersion?: number;
};

// === Bug-3 === Bump when manifest layout changes (e.g. paths-relative-to-
// public/ instead of paths-relative-to-project-root). Stale manifests force a
// rewrite so Remotion staticFile() lookups don't 404.
const MANIFEST_SCHEMA_VERSION = 2;

type CostMode = "lean" | "balanced" | "quality";

type CliFlags = {
  episodeId: string;
  force: boolean;
  fromStage: StageName | null;
  aspect: AspectRatio;
  costModeOverride: CostMode | null;
  regenRefs: boolean;
  ignoreBudget: boolean;
  keepIntermediates: boolean;
};

// ---------- cost model (kept in lockstep w/ docs/COST_MODEL.xlsx) ----------
const COST = {
  elevenLabsPerKChars: 0.30, // USD per 1k characters (Creator plan ballpark)
  seedancePerClipUsd: 0.40, // USD per 5s 720p seedance/fast clip
  claudePerEpisodeUsd: 0.05, // already incurred by script-gen agents, listed for rollup
};

// === COST CONTROL === per-call unit rates (USD), matches docs/COST_MODEL.xlsx
const RATES = {
  // Seedance: $0.06/sec for Lite, $0.19/sec for Pro. 5s default clip => $0.18 lite / $0.62 pro.
  seedanceLitePerSec: 0.06,
  seedanceProPerSec: 0.19,
  elevenLabsPerChar: 0.0003, // $0.30 per 1k characters
};

// Per-run accumulators so we can print [cost] summary at end.
const sessionSpend = { total: 0, calls: 0, stages: new Set<string>() };

async function logSpend(args: {
  episodeId: string;
  stage: string;
  tool: string;
  units: number;
  unitCost: number;
  notes?: string;
}): Promise<number> {
  const totalCost = +(args.units * args.unitCost).toFixed(4);
  await recordSpend({
    episodeId: args.episodeId,
    stage: args.stage,
    tool: args.tool,
    units: args.units,
    unitCost: args.unitCost,
    totalCost,
    notes: args.notes,
  });
  sessionSpend.total += totalCost;
  sessionSpend.calls += 1;
  sessionSpend.stages.add(args.stage);
  return totalCost;
}

// ---------- paths ----------
const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const SCRIPTS_DIR = path.join(PROJECT_ROOT, "data", "scripts");
const QUEUE_PATH = path.join(PROJECT_ROOT, "data", "shared-memory", "QUEUE.json");
const CHAR_REFS_DIR = path.join(PROJECT_ROOT, "public", "assets", "characters", "refs");
const CHAR_FLAT_DIR = path.join(PROJECT_ROOT, "public", "assets", "characters");

// ---------- canon character sheet map ----------
// === Character-Sheet Wiring === locked mapping from canon keys to the user's
// GPT-Image-1 character sheets on disk. These ARE canon — do NOT regex/guess
// filenames, do NOT modify the PNGs. Every beat uses the FIRST character key
// in its `characters` list as the primary anchor for Seedance image-to-video.
export const CHARACTER_SHEET_MAP: Record<string, string> = {
  kai_baptiste: "kairo-kai-baptiste.png",
  nia_toussaint: "nia-toussaint.png",
  malik_st_hill: "malik-st-hill.png",
  asha_singh_baptiste: "asha-singh-baptiste.png",
  jabari_henry: "jabari-jabs-henry.png",
  tariq_davidson: "tariq-davidson.png",
  mother_lall: "mother-lall.png",
  papa_etienne_roach: "papa-etienne-roach.png",
  marius_vale: "marius-vale.png",
  selah_vale: "selah-vale.png",
};

const STAGE_ORDER: StageName[] = [
  "parse",
  "voice",
  "prompts",
  "clips",
  "manifest",
  "render",
  "report",
];

// ---------- top-level ----------
async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.episodeId) {
    console.error("Usage: tsx scripts/produce.ts <EPxxx> [--force] [--from=stage] [--aspect=9:16|16:9] [--lean|--balanced|--quality] [--regen-refs] [--keep-intermediates]");
    process.exit(1);
  }

  // === Bug-1 fix === track run-start so cleanup can verify that the final
  // output is fresh (i.e. produced by THIS run) before deleting intermediates.
  const runStartMs = Date.now();

  log("start", `episode=${flags.episodeId} aspect=${flags.aspect} force=${flags.force} from=${flags.fromStage ?? "(none)"} runStart=${new Date(runStartMs).toISOString()}`);

  // === COST CONTROL === pre-flight budget check
  const budget = await checkBudget();
  if (budget.alarm) {
    const msg =
      `[produce] ALARM: month-to-date $${budget.mtd.toFixed(2)} >= budget $${budget.budget.toFixed(2)} ` +
      `(${budget.pctUsed.toFixed(1)}%).`;
    if (!flags.ignoreBudget) {
      console.error(msg + " Pass --ignore-budget to proceed anyway, or raise MONTHLY_BUDGET_USD.");
      process.exit(2);
    }
    log("cost", `${msg} --ignore-budget set — continuing.`);
  } else if (budget.warn) {
    log(
      "cost",
      `\x1b[33mWARNING\x1b[0m: MTD $${budget.mtd.toFixed(2)} is ${budget.pctUsed.toFixed(1)}% of $${budget.budget.toFixed(2)} budget (warn at $${budget.warnThreshold.toFixed(2)}).`,
    );
  } else {
    log("cost", `budget OK — MTD $${budget.mtd.toFixed(2)} of $${budget.budget.toFixed(2)} (${budget.pctUsed.toFixed(1)}%).`);
  }

  const epDir = path.join(PROJECT_ROOT, "public", "episodes", flags.episodeId);
  await mkdir(epDir, { recursive: true });
  await mkdir(path.join(epDir, "clips"), { recursive: true });
  await mkdir(path.join(PROJECT_ROOT, "out"), { recursive: true });

  // Stage 1: parse
  const parsedPath = path.join(epDir, "parsed.json");
  let parsed: ParsedScript;
  if (shouldRun("parse", flags, await exists(parsedPath))) {
    parsed = await stageParse(flags.episodeId, flags.aspect);
    await writeJson(parsedPath, parsed);
  } else {
    log("parse", "skipped (artifact exists, use --force to rebuild)");
    parsed = await readJson<ParsedScript>(parsedPath);
  }

  // === COST CONTROL === resolve cost-mode now that we know runtime
  const { mode: costMode, reason: costReason } = resolveCostMode(
    parsed.runtimeSeconds,
    flags.costModeOverride,
  );
  log("cost", `cost-mode=${costMode} (${costReason})`);
  if (parsed.humanApproved) {
    log("cost", "human_approved=true — canon-QA stages will be skipped downstream");
  }

  // Stage 2: voice
  const narrationPath = path.join(epDir, "narration.mp3");
  const alignmentPath = path.join(epDir, "alignment.json");
  // === Bug-2 fix === if narration.mp3 exists but was generated by a different
  // provider than the current env (e.g. mock placeholder + ELEVENLABS_API_KEY
  // now set), force regeneration. We track provider via narration.meta.json.
  const currentVoiceProvider = resolveVoiceProvider();
  const voiceArtifactCurrent =
    (await exists(narrationPath)) && (await voiceMetaMatches(epDir, currentVoiceProvider));
  if (shouldRun("voice", flags, voiceArtifactCurrent)) {
    if ((await exists(narrationPath)) && !voiceArtifactCurrent) {
      const recorded = await readVoiceMeta(epDir);
      log(
        "voice",
        `provider changed (${recorded ?? "unknown"} -> ${currentVoiceProvider}); regenerating.`,
      );
    }
    await stageVoice(parsed, narrationPath, alignmentPath);
    await writeVoiceMeta(epDir, currentVoiceProvider);
  } else {
    log("voice", `skipped (narration.mp3 exists, provider=${currentVoiceProvider})`);
  }

  // Stage 2b: sync — re-time beats from word-level alignment so stage-4 clip
  // durations match the actual narration cadence instead of the parse-time
  // even-split estimate. See scripts/compute-timings.ts (port of Cole's
  // tts_lib.clean_sync_data + compute_timings.compute).
  if (await exists(alignmentPath)) {
    try {
      const alignDoc = await readJson<{
        mock?: boolean;
        alignment?: ElevenLabsAlignment | null;
        normalized_alignment?: ElevenLabsAlignment | null;
      }>(alignmentPath);
      const alignment =
        alignDoc?.normalized_alignment ?? alignDoc?.alignment ?? null;
      if (alignDoc?.mock || !alignment || !alignment.characters?.length) {
        log(
          "sync",
          `alignment is mock/empty — keeping static parsed.json timings (no re-time).`,
        );
      } else {
        const cleaned = cleanSyncData(alignment);
        const timed = computeBeatTimings(parsed.beats, cleaned);
        const totalRuntime = totalRuntimeFromTimedBeats(timed);
        parsed = {
          ...parsed,
          beats: timed,
          runtimeSeconds: totalRuntime || parsed.runtimeSeconds,
        };
        await writeJson(parsedPath, parsed);
        log(
          "sync",
          `re-timed ${timed.length} beats from word-level alignment. total runtime: ${totalRuntime.toFixed(2)}s`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("sync", `WARN failed to re-time from alignment (${msg}); keeping static parsed.json timings.`);
    }
  } else {
    log(
      "sync",
      `WARN no ${path.basename(alignmentPath)} sidecar — falling back to static parsed.json durSec values. Re-run --from=voice once voice.ts emits alignment.`,
    );
  }

  // === COST CONTROL === character refs are reused — verify they exist before any paid call.
  await preflightCharacterRefs(parsed.characters, flags.regenRefs);

  // Stage 3: prompts
  const promptsPath = path.join(epDir, "prompts.json");
  let prompted: PromptedBeat[];
  if (shouldRun("prompts", flags, await exists(promptsPath))) {
    prompted = await stagePrompts(parsed);
    await writeJson(promptsPath, prompted);
  } else {
    log("prompts", "skipped (prompts.json exists)");
    prompted = await readJson<PromptedBeat[]>(promptsPath);
  }

  // Stage 4: clips
  const clipsDir = path.join(epDir, "clips");
  const currentClipProvider = resolveClipProvider();
  const allClipsExist = await everyBeatHasClip(prompted, clipsDir);
  // === Bug-2 fix === per-clip sidecar provider check. If any beat clip's
  // recorded provider != current env provider, force regen of clips stage.
  const clipsProviderMatches = allClipsExist && (await everyClipMetaMatches(prompted, clipsDir, currentClipProvider));
  let clipped: ClippedBeat[];
  if (shouldRun("clips", flags, clipsProviderMatches)) {
    if (allClipsExist && !clipsProviderMatches) {
      log(
        "clips",
        `provider changed for one or more clips -> ${currentClipProvider}; regenerating mismatched beats.`,
      );
    }
    // === Stage-4 regression fix === wrap stage-4 so any throw is surfaced
    // with a clear FATAL tag instead of letting the process exit silently
    // and skip stages 5–7. Previously a swallowed error inside the per-beat
    // worker could leave the run looking healthy in logs while never writing
    // clips-meta.json, manifest, or out/<EP>.mp4.
    try {
      clipped = await stageClips(prompted, clipsDir, flags.aspect, costMode, parsed.episodeId, parsed.runtimeSeconds, currentClipProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[produce] FATAL stage-4: ${msg}`);
    }
    await writeJson(path.join(epDir, "clips-meta.json"), clipped);
  } else {
    log("clips", `skipped (all beat-NN.mp4 exist, provider=${currentClipProvider})`);
    clipped = prompted.map((b) => ({
      ...b,
      clipPath: path.join(clipsDir, `beat-${String(b.idx).padStart(2, "0")}.mp4`),
      clipMock: false,
    }));
  }

  // Stage 5: manifest
  const manifestPath = path.join(epDir, "manifest.json");
  let manifest: Manifest;
  // === Bug-3 === if an existing manifest is stale-schema, force rebuild so
  // paths line up with staticFile() expectations.
  let manifestArtifactCurrent = await exists(manifestPath);
  if (manifestArtifactCurrent) {
    try {
      const existing = await readJson<Manifest>(manifestPath);
      if ((existing.schemaVersion ?? 1) < MANIFEST_SCHEMA_VERSION) {
        log("manifest", `stale schema (v${existing.schemaVersion ?? 1} -> v${MANIFEST_SCHEMA_VERSION}); rewriting.`);
        manifestArtifactCurrent = false;
      }
    } catch {
      manifestArtifactCurrent = false;
    }
  }
  if (shouldRun("manifest", flags, manifestArtifactCurrent)) {
    manifest = await stageManifest(parsed, clipped, narrationPath, alignmentPath, flags.aspect);
    await writeJson(manifestPath, manifest);
  } else {
    log("manifest", "skipped (manifest.json exists, schema current)");
    manifest = await readJson<Manifest>(manifestPath);
  }

  // Stage 6: render
  const outPath = path.join(PROJECT_ROOT, "out", `${flags.episodeId}.mp4`);
  let renderAttempted = false;
  let renderError: Error | null = null;
  // === Bug-1/3 === if out/<EP>.mp4 exists but is older than this run's
  // upstream artifacts (manifest), treat it as stale and re-render. Prevents
  // the case where a leftover mock placeholder from a prior dry-run causes
  // shouldRun() to skip the real render.
  const outFresh = await isOutputFresh(outPath, manifestPath);
  if (shouldRun("render", flags, outFresh)) {
    renderAttempted = true;
    try {
      await stageRender(manifest, manifestPath, outPath, flags.aspect);
    } catch (err) {
      renderError = err instanceof Error ? err : new Error(String(err));
      log("render", `FAILED: ${renderError.message}`);
    }
  } else {
    log("render", `skipped (${outPath} exists)`);
  }

  // Stage 7: report (+ cost-control cleanup of intermediate clips)
  await stageReport(parsed, clipped, outPath, costMode);
  await cleanupIntermediates(epDir, outPath, {
    runStartMs,
    renderAttempted,
    renderFailed: renderError !== null,
    keepIntermediates: flags.keepIntermediates,
  });

  // === COST CONTROL === per-run spend rollup (from logged entries this session)
  console.log(
    `[produce] [cost] this episode: $${sessionSpend.total.toFixed(2)} ` +
      `(${sessionSpend.stages.size} stages, ${sessionSpend.calls} calls)`,
  );
}

// ---------- stage 1: parse ----------
export async function stageParse(episodeId: string, aspect: AspectRatio): Promise<ParsedScript> {
  log("parse", `loading script for ${episodeId}`);

  const mdPath = path.join(SCRIPTS_DIR, `${episodeId}-narrator-script.md`);
  let parsed: ParsedScript;

  if (await exists(mdPath)) {
    parsed = await parseMarkdownScript(mdPath, episodeId);
  } else {
    parsed = await parseFromQueue(episodeId);
  }

  // Allocate per-beat timings. Vertical shorts target 75s, scale otherwise.
  const targetRuntime = parsed.runtimeSeconds || (aspect === "9:16" ? 75 : 90);
  parsed.runtimeSeconds = targetRuntime;

  // Even-ish split, but keep per-beat between 2.5s and 6s.
  const minPerBeat = 2.5;
  const maxPerBeat = 6;
  const evenSplit = targetRuntime / parsed.beats.length;
  const perBeat = Math.max(minPerBeat, Math.min(maxPerBeat, evenSplit));

  let cursor = 0;
  parsed.beats = parsed.beats.map((b) => {
    const dur = +perBeat.toFixed(2);
    const beat = { ...b, durSec: dur, startSec: +cursor.toFixed(2) };
    cursor += dur;
    return beat;
  });

  log("parse", `parsed ${parsed.beats.length} beats, ~${cursor.toFixed(1)}s narration, source=${parsed.source}`);
  return parsed;
}

async function parseMarkdownScript(mdPath: string, episodeId: string): Promise<ParsedScript> {
  const raw = await readFile(mdPath, "utf8");
  const fm = extractFrontmatter(raw);
  const narrationText = extractNarratorBlock(raw);

  const beats = splitIntoBeats(narrationText).map((text, idx) => ({
    idx: idx + 1,
    text,
    durSec: 0,
    startSec: 0,
    characters: (fm.characters as string[] | undefined) ?? [],
  }));

  return {
    episodeId,
    title: (fm.title as string) ?? episodeId,
    runtimeSeconds: Number(fm.runtime_target_seconds) || 0,
    location: (fm.location as string) ?? "",
    island: (fm.island as string) ?? "",
    characters: (fm.characters as string[]) ?? [],
    villainPresence: (fm.villain_presence as boolean | string) ?? false,
    narrationText,
    beats,
    source: "markdown",
    humanApproved: fm.human_approved === true || fm.human_approved === "true",
  };
}

async function parseFromQueue(episodeId: string): Promise<ParsedScript> {
  const raw = await readFile(QUEUE_PATH, "utf8");
  const queue = JSON.parse(raw) as { episodes: Array<Record<string, unknown>> };
  const ep = queue.episodes.find((e) => e.id === episodeId);
  if (!ep) throw new Error(`Episode ${episodeId} not found in QUEUE.json and no markdown at data/scripts/${episodeId}-narrator-script.md`);

  const narrationText = (ep.narrator_script as string) ?? "";
  if (!narrationText.trim()) {
    throw new Error(`Episode ${episodeId} has no narrator_script in QUEUE.json; run the script-gen agent first.`);
  }

  const beats = splitIntoBeats(narrationText).map((text, idx) => ({
    idx: idx + 1,
    text,
    durSec: 0,
    startSec: 0,
    characters: (ep.characters as string[] | undefined) ?? [],
  }));

  return {
    episodeId,
    title: (ep.title as string) ?? episodeId,
    runtimeSeconds: 75,
    location: (ep.location as string) ?? "",
    island: (ep.island as string) ?? "",
    characters: (ep.characters as string[]) ?? [],
    villainPresence: (ep.villain_presence as boolean | string) ?? false,
    narrationText,
    beats,
    source: "queue",
    humanApproved: ep.human_approved === true,
  };
}

function extractFrontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  // Tiny YAML parser — handles the flat keys we use in our scripts:
  // string, number, boolean, inline arrays [a, b, c], and one level of indented map.
  const out: Record<string, unknown> = {};
  const lines = m[1].split(/\r?\n/);
  let currentMapKey: string | null = null;
  let currentMap: Record<string, unknown> | null = null;
  for (const lineRaw of lines) {
    if (!lineRaw.trim() || lineRaw.trim().startsWith("#")) continue;
    const indent = lineRaw.match(/^\s*/)?.[0].length ?? 0;
    const line = lineRaw.trim();

    if (indent === 0) {
      currentMapKey = null;
      currentMap = null;
    }

    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rest] = kv;
    const value = rest.trim();

    if (indent > 0 && currentMap) {
      currentMap[key] = coerceYamlScalar(value);
      continue;
    }

    if (value === "") {
      // Start of a nested map
      currentMapKey = key;
      currentMap = {};
      out[key] = currentMap;
      continue;
    }

    out[key] = coerceYamlScalar(value);
  }
  return out;
}

function coerceYamlScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, "");
}

function extractNarratorBlock(raw: string): string {
  // Body after frontmatter
  const afterFm = raw.replace(/^---[\s\S]*?\n---\n?/, "");

  // Prefer the "Narrator script" section if present, stop at next H1.
  const narratorMatch = afterFm.match(/#\s*Narrator script[^\n]*\n+([\s\S]*?)(?=\n#\s|\n$)/i);
  const body = narratorMatch ? narratorMatch[1] : afterFm;

  // Strip remaining headings and direction-note sections
  return body
    .replace(/^#.*$/gm, "")
    .replace(/^\s*-\s.*$/gm, "")
    .trim();
}

function splitIntoBeats(text: string): string[] {
  // Prefer paragraph splits (blank line). Merge tiny ones (< 30 chars) into neighbor.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const merged: string[] = [];
  for (const p of paragraphs) {
    if (merged.length && (merged[merged.length - 1].length < 30 || p.length < 30)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`;
    } else {
      merged.push(p);
    }
  }

  // Cap at 12 beats — Remotion comp expects a reasonable number.
  if (merged.length > 12) {
    const chunkSize = Math.ceil(merged.length / 12);
    const chunked: string[] = [];
    for (let i = 0; i < merged.length; i += chunkSize) {
      chunked.push(merged.slice(i, i + chunkSize).join(" "));
    }
    return chunked;
  }
  return merged;
}

// ---------- stage 2: voice ----------
export async function stageVoice(
  parsed: ParsedScript,
  narrationPath: string,
  alignmentPath: string,
): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  // === Bug-2 === respect explicit VOICE_PROVIDER=mock so the env-controlled
  // mock-mode dry-run stays in mock mode even with real keys present.
  const explicitMock = (process.env.VOICE_PROVIDER ?? "").toLowerCase() === "mock";

  if (explicitMock || !apiKey || !voiceId) {
    const reason = explicitMock
      ? "VOICE_PROVIDER=mock set"
      : `missing ${!apiKey ? "ELEVENLABS_API_KEY" : "ELEVENLABS_NARRATOR_VOICE_ID"}`;
    log("voice", `MOCK MODE — ${reason}. Emitting placeholder narration.`);
    await writePlaceholderAudio(narrationPath, parsed.runtimeSeconds);
    await writeJson(alignmentPath, {
      mock: true,
      words: [],
      reason,
    });
    return;
  }

  log("voice", `requesting ${parsed.narrationText.length} chars from ElevenLabs (voice=${voiceId})`);

  // Use the with-timestamps endpoint so the Remotion comp can sync captions if desired.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;
  const body = {
    text: parsed.narrationText,
    model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.52,
      similarity_boost: 0.78,
      style: 0.24,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    log("voice", `ElevenLabs error ${resp.status}: ${errText.slice(0, 200)} — falling back to mock`);
    await writePlaceholderAudio(narrationPath, parsed.runtimeSeconds);
    await writeJson(alignmentPath, { mock: true, error: errText.slice(0, 500) });
    return;
  }

  const payload = (await resp.json()) as {
    audio_base64?: string;
    alignment?: unknown;
    normalized_alignment?: unknown;
  };

  if (!payload.audio_base64) {
    // The non-timestamps endpoint returns raw audio; retry that path.
    log("voice", "with-timestamps returned no audio_base64, retrying plain endpoint");
    const plainResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify(body),
      },
    );
    if (!plainResp.ok) throw new Error(`ElevenLabs plain TTS failed: ${plainResp.status}`);
    const buf = Buffer.from(await plainResp.arrayBuffer());
    await writeFile(narrationPath, buf);
    await writeJson(alignmentPath, { mock: false, words: [] });
    await logSpend({
      episodeId: parsed.episodeId,
      stage: "voice",
      tool: "elevenlabs",
      units: parsed.narrationText.length,
      unitCost: RATES.elevenLabsPerChar,
      notes: "plain endpoint fallback",
    });
    return;
  }

  await writeFile(narrationPath, Buffer.from(payload.audio_base64, "base64"));
  await writeJson(alignmentPath, {
    mock: false,
    alignment: payload.alignment ?? null,
    normalized_alignment: payload.normalized_alignment ?? null,
  });
  await logSpend({
    episodeId: parsed.episodeId,
    stage: "voice",
    tool: "elevenlabs",
    units: parsed.narrationText.length,
    unitCost: RATES.elevenLabsPerChar,
    notes: "with-timestamps",
  });
  log("voice", `wrote ${narrationPath}`);
}

async function writePlaceholderAudio(outPath: string, durSec: number): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  if (!ffmpegPath) {
    // Last-resort: write a tiny stub so downstream stages still proceed.
    await writeFile(outPath, Buffer.from([0xff, 0xfb, 0x90, 0x00])); // minimal MP3 frame header bytes
    log("voice", `wrote 4-byte MP3 stub at ${outPath} (ffmpeg-static unavailable)`);
    return;
  }
  const dur = Math.max(1, Math.round(durSec || 1));
  await runProcess(ffmpegPath, [
    "-y",
    "-f", "lavfi",
    "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
    "-t", String(dur),
    "-q:a", "9",
    "-acodec", "libmp3lame",
    outPath,
  ]);
  log("voice", `wrote ${dur}s silent placeholder at ${outPath}`);
}

// ---------- stage 3: prompts ----------
// === EP002 prompt-rewrite === structured 4-block prompt template.
// Every beat's Seedance prompt is built from STYLE / CAMERA / CHARACTER /
// SETTING / TECHNICAL blocks to fix three EP002 bugs:
//   1) photoreal style drift in scene-rich frames
//   2) plain grey backgrounds when scene wasn't anchored
//   3) static shots from feeding narrator lines as "action"
//
// CAMERA_DIRECTIVES maps a beat's position-within-episode (1-indexed) to a
// camera/motion verb. Beats beyond 11 reuse the cliffhanger directive.
const CAMERA_DIRECTIVES: Record<number, string> = {
  1: "low-angle slow zoom-in on character, mythic establishing shot",
  2: "medium shot, slow dolly-in toward subject",
  3: "side-profile tracking shot following the action",
  4: "medium shot, slow dolly-in toward subject",
  5: "close-up push-in on subject's face, slow motion",
  6: "fast whip-pan into action",
  7: "low-angle hero shot, dynamic composition",
  8: "bois-strike close-up with motion blur",
  9: "wide shot pulling back to reveal the full scene",
  10: "overhead crane shot",
  11: "slow tracking shot, hold on final beat, fade to silhouette",
};

const NEGATIVE_PROMPT =
  "3d render, photorealistic, realistic skin, sweat, uncanny valley, blurry, low quality, watermark, text overlay, signature, deformed face, extra limbs";

const STYLE_BLOCK =
  "STYLE: 2D anime cel-shade, flat painterly Caribbean colors, hand-drawn line art, anime cinematography. NOT 3D rendering, NOT photorealistic, NO sweat, NO realistic skin texture, NO uncanny features. Match the reference image aesthetic exactly.";

const TECHNICAL_BLOCK =
  "TECHNICAL: vertical 9:16 framing, no on-screen text, drumbeat-synced motion, 5-second clip.";

// Strong character verbs cycled by beat index so successive beats don't
// reuse the same motion. Picked to be unambiguous to a video model.
const CHARACTER_VERBS = [
  "grips",
  "strikes",
  "leaps",
  "turns sharply",
  "glares",
  "dodges",
  "reaches forward",
  "spins",
  "lunges",
  "kneels",
  "stands tall",
  "walks toward camera",
];

function pickCameraDirective(idx: number): string {
  return CAMERA_DIRECTIVES[idx] ?? CAMERA_DIRECTIVES[11];
}

function pickCharacterVerb(idx: number): string {
  return CHARACTER_VERBS[(idx - 1) % CHARACTER_VERBS.length];
}

// Expand the bare location string from the parsed script into a richer scene
// description so Seedance has something to render instead of a grey void.
function expandSetting(location: string, island: string): string {
  const loc = location.toLowerCase();
  if (loc.includes("gayelle")) {
    return `${location} — sun-bleached gayelle ring of red earth, surrounded by weathered wooden fence posts and tall cane grass swaying in morning breeze, ${island} hills hazy in distance, dust motes catching golden sunlight`;
  }
  if (loc.includes("carnival") || loc.includes("street")) {
    return `${location} — vibrant Caribbean street scene, ${island}, painted wooden houses with bright shutters, hanging carnival flags, golden hour light, crowd silhouettes in soft focus`;
  }
  if (loc.includes("forest") || loc.includes("bush")) {
    return `${location} — dense ${island} bush, broad-leafed trees, dappled green light filtering through canopy, mist rising from damp earth, distant birdsong implied`;
  }
  if (loc.includes("beach") || loc.includes("shore") || loc.includes("sea")) {
    return `${location} — ${island} coastline, dark volcanic sand, foaming surf, palm silhouettes, low tropical sun on water`;
  }
  if (loc.includes("village") || loc.includes("yard")) {
    return `${location} — Caribbean village yard, ${island}, wooden chattel houses with galvanize roofs, breadfruit tree shade, warm afternoon light`;
  }
  // Generic fallback — still richer than the bare location string.
  return `${location}, ${island} — Caribbean setting with painterly anime backgrounds, layered depth, atmospheric lighting, no plain or empty backdrops`;
}

export async function stagePrompts(parsed: ParsedScript): Promise<PromptedBeat[]> {
  log("prompts", `building Seedance prompts for ${parsed.beats.length} beats`);

  const charRefs = await resolveCharacterRefs(parsed.characters);
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

  return parsed.beats.map((b) => {
    // === Character-Sheet Wiring === resolve the primary character (the first
    // canon key in the beat's character list) to the locked on-disk sheet.
    // Fall back to the parsed-episode characters[0] if the beat doesn't carry
    // its own character list (current parser copies characters[] onto each beat,
    // so this is effectively the same).
    const beatCharacters = b.characters.length ? b.characters : parsed.characters;
    const primaryCharacter = beatCharacters[0];
    const sheetFile = primaryCharacter
      ? CHARACTER_SHEET_MAP[primaryCharacter]
      : undefined;

    // referenceImage is RELATIVE TO public/ (no leading "public/" prefix).
    // path.posix.join keeps forward slashes on Windows.
    const referenceImage = sheetFile
      ? path.posix.join("assets", "characters", sheetFile)
      : undefined;

    const imageToVideoMode = !!referenceImage;

    // === EP002 prompt-rewrite === build the four mandatory blocks.
    const cameraDirective = pickCameraDirective(b.idx);
    const verb = pickCharacterVerb(b.idx);

    let characterBlock: string;
    if (beatCharacters.length === 0) {
      characterBlock =
        "CHARACTER: no on-screen character — environmental beat, atmosphere holds the frame.";
    } else {
      const primaryName = primaryCharacter ? humanizeCharKey(primaryCharacter) : "the figure";
      const primaryAction = `${primaryName} ${verb}, body in motion, expression intent`;
      const secondaryActions = beatCharacters
        .slice(1)
        .map((k, i) => {
          // Cycle a different verb for each secondary so they don't mirror primary.
          const secondaryVerb = pickCharacterVerb(b.idx + i + 1);
          return `${humanizeCharKey(k)} ${secondaryVerb} alongside`;
        })
        .join(". ");
      characterBlock = secondaryActions
        ? `CHARACTER: ${primaryAction}. ${secondaryActions}.`
        : `CHARACTER: ${primaryAction}.`;
    }

    const settingBlock = `SETTING: ${expandSetting(parsed.location, parsed.island)}.`;
    const cameraBlock = `CAMERA: ${cameraDirective}.`;

    const villainNote =
      parsed.villainPresence === false
        ? ""
        : `VILLAIN: ${parsed.villainPresence}. Marius Vale stays back-only or silhouette until EP010.`;

    // For text-to-video fallback (no locked sheet) we prepend a tighter canon
    // anatomy line inside the STYLE block so the model still gets anatomy
    // guidance. Image-to-video mode trusts the reference image for anatomy.
    const styleBlock = imageToVideoMode
      ? STYLE_BLOCK
      : `${STYLE_BLOCK} Rounded chins (never V-shaped), full lips, broad African-Caribbean nose, warm brown skin. Jabari's drums are African wooden Kalinda drums with L-shaped sticks — never a modern kit.`;

    const prompt = [
      styleBlock,
      cameraBlock,
      characterBlock,
      settingBlock,
      villainNote,
      TECHNICAL_BLOCK,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // referenceImageUrls is kept for backward compat with reference-to-video
    // manifests, but the new primary path is referenceImage (single sheet,
    // image-to-video mode).
    const refUrls = charRefs
      .filter((c) => beatCharacters.includes(c.key))
      .map((c) => (baseUrl ? `${baseUrl}${c.publicPath}` : c.publicPath));

    const mode: "text-to-video" | "reference-to-video" | "image-to-video" =
      imageToVideoMode ? "image-to-video" : "text-to-video";

    return {
      ...b,
      prompt,
      negativePrompt: NEGATIVE_PROMPT,
      referenceImageUrls: refUrls,
      referenceImage,
      primaryCharacter,
      mode,
    };
  });
}

type ResolvedRef = { key: string; publicPath: string };

async function resolveCharacterRefs(characters: string[]): Promise<ResolvedRef[]> {
  const out: ResolvedRef[] = [];
  for (const key of characters) {
    // Preferred: public/assets/characters/refs/<key>/front.png
    const refsPath = path.join(CHAR_REFS_DIR, key, "front.png");
    if (await exists(refsPath)) {
      out.push({ key, publicPath: `/assets/characters/refs/${key}/front.png` });
      continue;
    }
    // Fallback: flat naming like public/assets/characters/kairo-kai-baptiste.png
    const flat = await findFlatCharacterImage(key);
    if (flat) out.push({ key, publicPath: `/assets/characters/${flat}` });
  }
  return out;
}

async function findFlatCharacterImage(key: string): Promise<string | null> {
  try {
    const files = await readdir(CHAR_FLAT_DIR);
    const needle = key.replace(/_/g, "-").toLowerCase();
    return (
      files.find((f) => f.toLowerCase().includes(needle) && /\.(png|jpg|jpeg|webp)$/i.test(f)) ?? null
    );
  } catch {
    return null;
  }
}

function humanizeCharKey(key: string): string {
  return key
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------- stage 4: clips ----------
export async function stageClips(
  prompted: PromptedBeat[],
  clipsDir: string,
  aspect: AspectRatio,
  costMode: CostMode = "lean",
  episodeId: string = "",
  runtimeSeconds: number = 0,
  provider: ClipProvider = "mock",
): Promise<ClippedBeat[]> {
  const falKey = process.env.FAL_KEY;
  // === Bug-2 === honor explicit VIDEO_PROVIDER=mock even if FAL_KEY is set,
  // so the env-controlled mock-mode dry-run path actually stays in mock mode.
  // === Stage-4 regression fix === if caller asked for fal but FAL_KEY is empty,
  // do NOT silently regenerate sidecars saying "fal" while leaving stale mock
  // mp4s in place. Fall back to mock with LOUD logging so downstream meta is
  // truthful. Callers wanting hard-fail can set VIDEO_PROVIDER_STRICT=1.
  if (provider === "fal" && !falKey) {
    if (process.env.VIDEO_PROVIDER_STRICT === "1") {
      throw new Error("[produce] FATAL stage-4: VIDEO_PROVIDER=fal but FAL_KEY is empty");
    }
    log(
      "clips",
      "WARNING: VIDEO_PROVIDER=fal requested but FAL_KEY is empty — falling back to MOCK MODE. " +
        "Meta sidecars will be written as provider=mock so downstream stages know.",
    );
  }
  const mock = provider === "mock" || !falKey;
  if (mock) {
    log("clips", `MOCK MODE — provider=${provider}${!falKey ? " (FAL_KEY missing)" : ""}. Generating placeholder MP4s.`);
  } else {
    fal.config({ credentials: falKey });
    log("clips", `submitting ${prompted.length} Seedance jobs (concurrency=4, cost-mode=${costMode}, provider=fal)`);
  }
  const effectiveProvider: ClipProvider = mock ? "mock" : "fal";
  // === Stage-4 regression fix === minimum bytes for a "real" Seedance Lite
  // clip. Solid-color ffmpeg mocks are ~14KB; the smallest real Lite output
  // we've seen is >500KB. 50KB is a generous lower bound that still excludes
  // every mock format. If a download returns <50KB while provider=fal, the
  // run will treat it as failed and retry (or fall back to placeholder).
  const REAL_CLIP_MIN_BYTES = 50_000;

  const results: ClippedBeat[] = new Array(prompted.length);
  const CONCURRENCY = 4;
  let cursor = 0;
  const total = prompted.length;

  // === COST CONTROL === per-beat retry counter for aggregate rework cap.
  // Cap is multiplicative on base clip count, picked by format:
  //   vertical (<=90s) -> REWORK_CAP_VERTICAL (1.5x default)
  //   episode  (<=600s) -> REWORK_CAP_EPISODE (1.8x default)
  //   movie    (>600s)  -> REWORK_CAP_MOVIE   (2.0x default)
  const capMultiplier = resolveReworkCap(runtimeSeconds);
  const aggregateCap = Math.max(total, Math.ceil(total * capMultiplier));
  const attemptsPerBeat = new Map<number, number>();
  let totalAttempts = 0;
  const bumpAttempt = (beatIdx: number) => {
    attemptsPerBeat.set(beatIdx, (attemptsPerBeat.get(beatIdx) ?? 0) + 1);
    totalAttempts += 1;
    if (totalAttempts > aggregateCap) {
      throw new Error(
        `[produce] ERROR: rework cap exceeded — ${totalAttempts} attempts vs cap ${aggregateCap}. ` +
          `Fix prompts or raise REWORK_CAP_VERTICAL/EPISODE/MOVIE.`,
      );
    }
  };
  log("clips", `rework cap = ${aggregateCap} attempts (${total} beats x ${capMultiplier})`);

  async function worker() {
    while (cursor < prompted.length) {
      const i = cursor++;
      const beat = prompted[i];
      const clipPath = path.join(clipsDir, `beat-${String(beat.idx).padStart(2, "0")}.mp4`);

      if (await exists(clipPath)) {
        const recorded = await readClipMeta(clipsDir, beat.idx);
        // === Bug-2 === only treat as cached if provider matches (or recorded
        // says "mock" and we're staying in mock mode). Otherwise re-generate.
        const cacheUsable =
          (recorded === null && effectiveProvider === "mock") ||
          recorded === effectiveProvider;
        if (cacheUsable) {
          log("clips", `beat ${beat.idx} cached -> ${path.basename(clipPath)} (provider=${recorded ?? "unknown"})`);
          results[i] = { ...beat, clipPath, clipMock: effectiveProvider === "mock" };
          continue;
        }
        log("clips", `beat ${beat.idx} provider mismatch (${recorded ?? "none"} -> ${effectiveProvider}); regenerating.`);
        // === Stage-4 regression fix === DELETE the stale mp4 + sidecar BEFORE
        // any regeneration. Previously the fal-path call to downloadTo would
        // either (a) skip writing because file existed, or (b) on a silent
        // failure, leave the stale mock in place while writeClipMeta lied
        // and recorded provider="fal". Removing both up-front guarantees that
        // if the regen path silently fails, we end up with NO file at all
        // (which downstream stages will detect) rather than a stale mock
        // masquerading as a real Seedance render.
        try { await unlink(clipPath); } catch { /* already gone */ }
        try { await unlink(clipMetaPath(clipsDir, beat.idx)); } catch { /* already gone */ }
      }

      if (mock) {
        await writePlaceholderClip(clipPath, beat.durSec, aspect, beat.idx);
        // === Stage-4 regression fix === only write the sidecar AFTER mp4 is
        // confirmed on disk with non-zero size. This is the only barrier
        // preventing "lying meta" — applies to mock path too.
        await assertClipWritten(clipPath, 0, beat.idx, "mock");
        await writeClipMeta(clipsDir, beat.idx, "mock", { durSec: beat.durSec });
        results[i] = { ...beat, clipPath, clipMock: true };
        continue;
      }

      // === Character-Sheet Wiring === image-to-video beats MUST have their
      // canon sheet on disk before we burn a Seedance call. Fail loudly here
      // — never silently fall back to text-to-video, that's the regression
      // we're fixing.
      if (beat.mode === "image-to-video") {
        if (!beat.referenceImage) {
          throw new Error(
            `[produce] FATAL stage-4: beat ${beat.idx} has mode=image-to-video but no referenceImage set`,
          );
        }
        const sheetAbs = path.join(PUBLIC_DIR, beat.referenceImage);
        if (!existsSync(sheetAbs)) {
          throw new Error(
            `[produce] FATAL stage-4: character sheet not found at ${sheetAbs} for beat ${beat.idx}`,
          );
        }
      }

      const tier = tierForBeat(costMode, beat.idx, total);
      // Per-beat retry loop with quality check. Each call into Seedance counts as an attempt.
      const PER_BEAT_RETRIES = 3; // upper bound *per beat*; aggregate cap is the real wall.
      let success = false;
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= PER_BEAT_RETRIES; attempt++) {
        bumpAttempt(beat.idx); // throws if aggregate cap exceeded -> fails whole episode
        try {
          // === Stage-4 regression fix === each retry starts from a clean slate
          // — no leftover bytes from a previous attempt could be mistaken for
          // a successful download.
          try { await unlink(clipPath); } catch { /* fresh */ }
          const clipUrl = await submitSeedanceJob(beat, aspect, tier);
          await downloadTo(clipUrl, clipPath);
          // === Stage-4 regression fix === assert mp4 landed on disk AND is
          // bigger than any mock placeholder. If the download silently wrote
          // 0 bytes or fal returned a stub URL, this throws and the retry
          // counter bumps. Lying-meta is now impossible.
          await assertClipWritten(clipPath, REAL_CLIP_MIN_BYTES, beat.idx, "fal");
          // === COST CONTROL === record spend on successful Seedance call only.
          const clipDurSec = beat.durSec > 6 ? 10 : 5;
          const unitCost = tier === "pro" ? RATES.seedanceProPerSec : RATES.seedanceLitePerSec;
          await logSpend({
            episodeId,
            stage: "clips",
            tool: tier === "pro" ? "seedance-pro" : "seedance-lite",
            units: clipDurSec,
            unitCost,
            notes: `beat ${beat.idx} attempt ${attempt}`,
          });
          await writeClipMeta(clipsDir, beat.idx, "fal", {
            tier,
            attempt,
            durSec: beat.durSec,
          });
          log(
            "clips",
            `beat ${beat.idx} done [tier=${tier}, attempt=${attempt}] -> ${path.basename(clipPath)}`,
          );
          results[i] = { ...beat, clipPath, clipMock: false };
          success = true;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          const msg = lastErr.message;
          // === Bug-A defensive: filename/muxer errors are NOT rework, they're code bugs.
          if (
            /Unable to choose an output format/i.test(msg) ||
            /Error opening output file/i.test(msg) ||
            /mock-mode clip generator wrote bad path/i.test(msg) ||
            /mock-mode clip generator got bad beatIdx/i.test(msg)
          ) {
            throw new Error(
              `[produce] FATAL: mock-mode clip generator wrote bad path — this is a code bug, not a rework (beat ${beat.idx}, attempt ${attempt}): ${msg}`,
            );
          }
          log(
            "clips",
            `beat ${beat.idx} attempt ${attempt} FAILED (${msg}).`,
          );
          // === Stage-4 regression fix === scrub any partial/stale bytes that
          // may have landed before the throw, so the next attempt or the
          // fallback path can't be fooled by them.
          try { await unlink(clipPath); } catch { /* fine */ }
        }
      }
      if (!success) {
        const lastMsg = lastErr ? lastErr.message : "unknown error";
        log(
          "clips",
          `beat ${beat.idx} exhausted per-beat retries (last error: ${lastMsg}) — placeholder fallback.`,
        );
        try { await unlink(clipPath); } catch { /* fine */ }
        await writePlaceholderClip(clipPath, beat.durSec, aspect, beat.idx);
        await assertClipWritten(clipPath, 0, beat.idx, "mock");
        await writeClipMeta(clipsDir, beat.idx, "mock", { fallback: "after-retries", lastError: lastMsg });
        results[i] = { ...beat, clipPath, clipMock: true };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, prompted.length) }, worker));
  log("clips", `used ${totalAttempts}/${aggregateCap} rework budget across ${total} beats.`);
  return results;
}

// === COST CONTROL === A "usable" clip is non-empty. Real quality checks (frame parity,
// black-frame detection, etc.) can plug in here without changing the retry contract.
async function isClipUsable(clipPath: string): Promise<boolean> {
  try {
    const st = await stat(clipPath);
    return st.size > 1024; // any real Seedance clip will be > 1 KB
  } catch {
    return false;
  }
}

// === Stage-4 regression fix === enforce that the mp4 actually landed on disk
// with at least `minBytes` bytes BEFORE any meta sidecar is written. If we
// only check existence, a 0-byte or stub file (the symptom that produced the
// "lying meta sidecar" regression) sails through. Throwing here is what makes
// the retry loop count it as a failed attempt.
async function assertClipWritten(
  clipPath: string,
  minBytes: number,
  beatIdx: number,
  provider: ClipProvider,
): Promise<void> {
  let size = 0;
  try {
    size = (await stat(clipPath)).size;
  } catch {
    throw new Error(
      `beat ${beatIdx} ${provider}-path produced no file at ${path.basename(clipPath)}`,
    );
  }
  if (size <= minBytes) {
    throw new Error(
      `beat ${beatIdx} ${provider}-path wrote ${size} bytes (<= ${minBytes}); not a usable clip`,
    );
  }
}

function resolveReworkCap(runtimeSeconds: number): number {
  const fallback =
    runtimeSeconds <= 90 ? 1.5 : runtimeSeconds <= 600 ? 1.8 : 2.0;
  const envName =
    runtimeSeconds <= 90 ? "REWORK_CAP_VERTICAL" : runtimeSeconds <= 600 ? "REWORK_CAP_EPISODE" : "REWORK_CAP_MOVIE";
  const v = parseFloat(process.env[envName] ?? "");
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// === Character-Sheet Wiring === fal.ai's image-to-video endpoint accepts
// either an HTTPS URL or a data URI for `image_url`. Since the user's locked
// PNG sheets live on local disk (public/assets/characters/*.png), the simplest
// path is to base64-encode the PNG and inline it as a `data:image/png;base64,*`
// data URI. ~2.5MB raw -> ~3.4MB base64 — well inside fal's submit-payload
// limits for image-to-video.
async function localFileToDataUri(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  const ext = path.extname(absPath).toLowerCase().replace(".", "");
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function submitSeedanceJob(
  beat: PromptedBeat,
  aspect: AspectRatio,
  tier: "lite" | "pro" = "lite",
): Promise<string> {
  // 5s is the default seedance/fast unit. We pick 5 unless beat is much shorter.
  const duration: "5" | "10" = beat.durSec > 6 ? "10" : "5";

  // === Character-Sheet Wiring === image-to-video is now the primary path.
  // Resolve the beat's referenceImage (relative to public/) to an absolute
  // path, fail loudly if it's missing (the produce-loop also pre-checks, but
  // a second guard here keeps this function honest if called standalone).
  const useImageToVideo = beat.mode === "image-to-video" && !!beat.referenceImage;
  const useReference = beat.mode === "reference-to-video" && beat.referenceImageUrls.length > 0;

  // === COST CONTROL === Lite (`/fast`) is the cost-default; Pro skips the `/fast` segment.
  const speedSegment = tier === "pro" ? "" : "/fast";
  const modeSegment = useImageToVideo
    ? "image-to-video"
    : useReference
      ? "reference-to-video"
      : "text-to-video";
  const modelId = `bytedance/seedance-2.0${speedSegment}/${modeSegment}`;

  const input: Record<string, unknown> = {
    prompt: beat.prompt,
    duration,
    resolution: "720p",
    aspect_ratio: aspect,
    generate_audio: false, // we mux narration ourselves
  };
  if (useImageToVideo) {
    const sheetAbs = path.join(PUBLIC_DIR, beat.referenceImage!);
    if (!existsSync(sheetAbs)) {
      throw new Error(
        `[produce] FATAL stage-4: character sheet not found at ${sheetAbs} for beat ${beat.idx}`,
      );
    }
    input.image_url = await localFileToDataUri(sheetAbs);
  } else if (useReference) {
    input.image_urls = beat.referenceImageUrls;
  }

  const submission = await fal.queue.submit(modelId, { input });
  const requestId = submission.request_id;
  if (!requestId) throw new Error("fal returned no request_id");

  // Poll until done. Seedance/fast is typically ~30-60s per clip.
  const start = Date.now();
  const timeoutMs = 6 * 60 * 1000;
  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${timeoutMs / 1000}s`);
    const status = await fal.queue.status(modelId, { requestId, logs: false });
    const s = (status as { status?: string }).status;
    if (s === "COMPLETED") break;
    if (s === "FAILED" || s === "ERROR") throw new Error(`fal job ${s}`);
    await sleep(4000);
  }

  const result = (await fal.queue.result(modelId, { requestId })) as {
    data?: { video?: { url?: string } };
  };
  const url = result?.data?.video?.url;
  if (!url) throw new Error("fal result had no video URL");
  return url;
}

async function writePlaceholderClip(
  outPath: string,
  durSec: number,
  aspect: AspectRatio,
  beatIdx: number,
): Promise<void> {
  // === Bug-A guard === outPath MUST resolve to a real ".mp4" path. If a closure
  // capture ever loses the per-beat index this guard fails the run loudly
  // instead of letting ffmpeg try to mux to a bare token like "beat".
  if (!outPath || !outPath.toLowerCase().endsWith(".mp4")) {
    throw new Error(
      `[produce] FATAL: mock-mode clip generator wrote bad path "${outPath}" — this is a code bug, not a rework`,
    );
  }
  if (!Number.isFinite(beatIdx) || beatIdx <= 0) {
    throw new Error(
      `[produce] FATAL: mock-mode clip generator got bad beatIdx=${beatIdx} for ${outPath} — this is a code bug, not a rework`,
    );
  }

  const ffmpegPath = await getFfmpegPath();
  const [w, h] = aspect === "16:9" ? [1280, 720] : [720, 1280];
  const dur = Math.max(2, Math.min(10, Math.round(durSec || 5)));

  if (!ffmpegPath) {
    // Emit a 0-byte placeholder so manifest still has a path; Remotion will skip empties.
    await writeFile(outPath, Buffer.alloc(0));
    log("clips", `wrote 0-byte placeholder at ${outPath} (ffmpeg-static unavailable)`);
    return;
  }

  // Solid color gradient with the beat index as a label.
  const colors = ["#7a1f1f", "#1f4a7a", "#1f7a4a", "#7a6a1f", "#5a1f7a", "#1f7a7a"];
  const color = colors[(beatIdx - 1) % colors.length];

  // Gate every mock-mode ffmpeg invocation through the local-ffmpeg limiter
  // (Bug B). Real Seedance traffic uses its own concurrency cap upstream.
  await withMockFfmpegSlot(async () => {
    await runProcess(ffmpegPath, [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=${color}:s=${w}x${h}:d=${dur}`,
      "-vf", `drawtext=text='OPAIJA beat ${beatIdx}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-t", String(dur),
      outPath,
    ]).catch(async () => {
      // drawtext may fail if no fontconfig — retry without it.
      await runProcess(ffmpegPath, [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=${color}:s=${w}x${h}:d=${dur}`,
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-t", String(dur),
        outPath,
      ]);
    });
  });
}

// ---------- Bug-B: local-ffmpeg concurrency limiter ----------
// Real Seedance has its own CONCURRENCY=4 cap (it's network-bound and cheap).
// Mock-mode spawns ffmpeg subprocesses locally; on Windows x264 will malloc-fail
// when too many run in parallel. Hard-cap at 2 simultaneous ffmpegs.
const MOCK_FFMPEG_CONCURRENCY = 2;
let mockFfmpegInFlight = 0;
const mockFfmpegWaiters: Array<() => void> = [];
async function withMockFfmpegSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (mockFfmpegInFlight >= MOCK_FFMPEG_CONCURRENCY) {
    await new Promise<void>((res) => mockFfmpegWaiters.push(res));
  }
  mockFfmpegInFlight++;
  try {
    return await fn();
  } finally {
    mockFfmpegInFlight--;
    const next = mockFfmpegWaiters.shift();
    if (next) next();
  }
}

// ---------- stage 5: manifest ----------
// === Bug-3 fix === manifest paths are stored RELATIVE TO public/ so Remotion's
// staticFile() resolves them correctly. The previous version included the
// "public/" prefix which made staticFile() look up public/public/... and 404
// every clip and the narration. The ffmpeg fallback now resolves them against
// PROJECT_ROOT/public/ explicitly. (PUBLIC_DIR is declared at the top of the
// file alongside the other path constants.)

export async function stageManifest(
  parsed: ParsedScript,
  clipped: ClippedBeat[],
  narrationPath: string,
  alignmentPath: string,
  aspect: AspectRatio,
): Promise<Manifest> {
  const relToPublic = (p: string) => {
    const r = path.relative(PUBLIC_DIR, p).replace(/\\/g, "/");
    // Strip any leading "../" that would punch outside public/ — shouldn't
    // happen for episode artifacts, but guard anyway.
    return r.startsWith("../") ? path.relative(PROJECT_ROOT, p).replace(/\\/g, "/") : r;
  };
  log("manifest", "writing manifest.json (paths relative to public/ for staticFile compatibility)");
  return {
    episodeId: parsed.episodeId,
    aspectRatio: aspect,
    runtimeSeconds: parsed.runtimeSeconds,
    narrationPath: relToPublic(narrationPath),
    alignmentPath: (await exists(alignmentPath)) ? relToPublic(alignmentPath) : null,
    beats: clipped.map((b) => ({
      idx: b.idx,
      prompt: b.prompt,
      clipPath: relToPublic(b.clipPath),
      startSec: b.startSec,
      durSec: b.durSec,
      characters: b.characters,
    })),
    generatedAt: new Date().toISOString(),
    schemaVersion: MANIFEST_SCHEMA_VERSION,
  };
}

// ---------- stage 6: render ----------
export async function stageRender(
  manifest: Manifest,
  manifestPath: string,
  outPath: string,
  aspect: AspectRatio,
): Promise<void> {
  const composition = aspect === "16:9" ? "EpisodeHorizontal" : "EpisodeVertical";
  log("render", `remotion render ${composition} -> ${outPath}`);

  // Pass the manifest path so the composition can read everything it needs.
  // Inline JSON props can blow up on Windows shells, so we pass a path instead.
  // === Bug-3 === manifestPath is given relative to public/ so staticFile()
  // and Root.tsx's filesystem read both resolve correctly.
  const manifestRelPublic = path
    .relative(path.join(PROJECT_ROOT, "public"), manifestPath)
    .replace(/\\/g, "/");
  const propsJson = JSON.stringify({ manifestPath: manifestRelPublic });

  const args = [
    "remotion",
    "render",
    "video/index.ts",
    composition,
    outPath,
    `--props=${propsJson}`,
  ];

  try {
    await runProcess("npx", args);
    // === Bug-4 fix === verify remotion actually wrote a non-empty file.
    try {
      const st = await stat(outPath);
      if (st.size <= 0) throw new Error(`remotion produced a 0-byte file at ${outPath}`);
    } catch (e) {
      throw new Error(`remotion render did not produce a usable output: ${(e as Error).message}`);
    }
    log("render", `rendered ${outPath}`);
  } catch (err) {
    log("render", `Remotion render failed — ${(err as Error).message}`);
    log("render", "Falling back to concat-only ffmpeg muxdown of clips + narration.");
    await fallbackConcatRender(manifest, outPath);
  }
}

async function fallbackConcatRender(manifest: Manifest, outPath: string): Promise<void> {
  // === Bug-4 fix === manifest paths are relative to public/. Resolve them
  // against PUBLIC_DIR (not cwd) and log every ffmpeg invocation explicitly.
  // The previous version silently swallowed ffmpeg failures and wrote a 0-byte
  // placeholder, which is why `out/EP002.mp4` never updated on render failure.
  const ffmpegPath = await getFfmpegPath();
  if (!ffmpegPath) {
    throw new Error("[fallback-render] ffmpeg-static unavailable; cannot mux clips into final MP4.");
  }

  // Ensure out dir exists.
  await mkdir(path.dirname(outPath), { recursive: true });

  const resolveAsset = (p: string) => {
    // manifest paths are RELATIVE TO public/ (post-fix). Tolerate the legacy
    // "public/..." prefix for backward compat with old manifests on disk.
    const cleaned = p.replace(/^public[\\/]/, "");
    return path.resolve(PUBLIC_DIR, cleaned);
  };

  const narrationAbs = resolveAsset(manifest.narrationPath);
  const epDir = path.dirname(narrationAbs);

  // Filter to clips that actually exist and are non-empty.
  const usableBeats: Array<{ idx: number; abs: string }> = [];
  for (const b of manifest.beats) {
    const abs = resolveAsset(b.clipPath);
    try {
      const st = await stat(abs);
      if (st.size > 0) {
        usableBeats.push({ idx: b.idx, abs });
      } else {
        log("render", `[fallback] beat ${b.idx} skipped (0 bytes): ${abs}`);
      }
    } catch {
      log("render", `[fallback] beat ${b.idx} skipped (missing): ${abs}`);
    }
  }

  if (usableBeats.length === 0) {
    throw new Error("[fallback-render] no usable clip files found — cannot mux output.");
  }

  const concatListPath = path.join(epDir, "concat.txt");
  const lines = usableBeats
    .map((b) => `file '${b.abs.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(concatListPath, lines, "utf8");
  log("render", `[fallback] concat list: ${concatListPath} (${usableBeats.length} clips)`);

  let narrationOk = false;
  try {
    const st = await stat(narrationAbs);
    narrationOk = st.size > 64; // anything bigger than the 4-byte stub
  } catch {
    /* narration missing */
  }
  if (!narrationOk) {
    log("render", `[fallback] WARNING narration missing or stub at ${narrationAbs}; muxing video-only.`);
  }

  const args = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    ...(narrationOk ? ["-i", narrationAbs] : []),
    "-c:v", "libx264",
    ...(narrationOk ? ["-c:a", "aac"] : []),
    "-pix_fmt", "yuv420p",
    "-shortest",
    outPath,
  ];

  log("render", `[fallback] ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);

  try {
    await runProcess(ffmpegPath, args);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    log("render", `[fallback] ffmpeg FAILED exit=${msg}`);
    // Retry video-only if audio was the suspect.
    if (narrationOk) {
      log("render", `[fallback] retrying without audio track...`);
      const videoOnlyArgs = [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        outPath,
      ];
      log("render", `[fallback] ffmpeg ${videoOnlyArgs.join(" ")}`);
      try {
        await runProcess(ffmpegPath, videoOnlyArgs);
      } catch (err2) {
        throw new Error(`[fallback-render] ffmpeg concat failed twice: ${(err2 as Error).message}`);
      }
    } else {
      throw new Error(`[fallback-render] ffmpeg concat failed: ${msg}`);
    }
  }

  // Verify the output actually got written.
  try {
    const st = await stat(outPath);
    if (st.size <= 0) {
      throw new Error(`[fallback-render] ffmpeg produced a 0-byte file at ${outPath}`);
    }
    log("render", `[fallback] wrote ${outPath} (${(st.size / 1_048_576).toFixed(2)} MB)`);
  } catch (err) {
    throw new Error(`[fallback-render] output verification failed: ${(err as Error).message}`);
  }
}

// ---------- stage 7: report ----------
async function stageReport(
  parsed: ParsedScript,
  clipped: ClippedBeat[],
  outPath: string,
  costMode: CostMode = "lean",
): Promise<void> {
  const realClips = clipped.filter((c) => !c.clipMock).length;
  const mockClips = clipped.length - realClips;

  const voiceCost = (parsed.narrationText.length / 1000) * COST.elevenLabsPerKChars;
  const clipsCost = realClips * COST.seedancePerClipUsd;
  const totalCost = voiceCost + clipsCost + COST.claudePerEpisodeUsd;

  let outSize = 0;
  try {
    outSize = (await stat(outPath)).size;
  } catch {
    /* file may not exist if render failed */
  }

  console.log("");
  console.log("=== OPAIJA PRODUCE REPORT ===========================================");
  console.log(`Episode      : ${parsed.episodeId} — ${parsed.title}`);
  console.log(`Beats        : ${clipped.length} (real=${realClips}, mock=${mockClips})`);
  console.log(`Runtime      : ${parsed.runtimeSeconds}s`);
  console.log(`Cost mode    : ${costMode}`);
  console.log(`Narration    : ${parsed.narrationText.length} chars`);
  console.log(`Output       : ${outPath} (${outSize ? `${(outSize / 1_048_576).toFixed(2)} MB` : "MISSING"})`);
  console.log(`Estimated $  : voice $${voiceCost.toFixed(3)} + clips $${clipsCost.toFixed(2)} + claude $${COST.claudePerEpisodeUsd.toFixed(2)} = $${totalCost.toFixed(2)}`);
  console.log("=====================================================================");
  console.log("");
}

// === COST CONTROL === see memory/cost-rules.md
// Pre-flight: refuse to run paid stages until every required character ref is on disk.
async function preflightCharacterRefs(characters: string[], regenAllowed: boolean): Promise<void> {
  if (!characters.length) return;
  const missing: string[] = [];
  for (const key of characters) {
    const refsPath = path.join(CHAR_REFS_DIR, key, "front.png");
    if (await exists(refsPath)) continue;
    const flat = await findFlatCharacterImage(key);
    if (!flat) missing.push(key);
  }
  if (!missing.length) return;
  if (regenAllowed) {
    log(
      "cost",
      `WARN: missing refs for ${missing.join(", ")} — --regen-refs set, downstream stages will proceed (text-to-video fallback).`,
    );
    return;
  }
  throw new Error(
    `[cost-control] Missing character refs for: ${missing.join(", ")}. ` +
      `Run \`npm run refs -- --char=${missing[0]}\` to seed them, ` +
      `or rerun with --regen-refs to skip the check (text-to-video fallback).`,
  );
}

// === COST CONTROL === see memory/cost-rules.md
// After a successful final render, intermediate clips are dead weight (5–60 MB each).
// Honors KEEP_INTERMEDIATES=1 for iteration sessions.
// === Bug-1 fix === Cleanup MUST NOT fire when render did not produce a fresh
// output. Preserves intermediates so the next run can re-render without
// re-paying Seedance / ElevenLabs.
async function cleanupIntermediates(
  epDir: string,
  outPath: string,
  ctx: {
    runStartMs: number;
    renderAttempted: boolean;
    renderFailed: boolean;
    keepIntermediates: boolean;
  },
): Promise<void> {
  if (ctx.keepIntermediates || process.env.KEEP_INTERMEDIATES === "1") {
    log("cost", "KEEP_INTERMEDIATES set — leaving public/episodes/<EP>/clips/ in place");
    return;
  }
  if (ctx.renderFailed) {
    log(
      "cost",
      `[cleanup] SKIPPED — render did not produce a fresh output. Intermediates preserved in ${path.relative(PROJECT_ROOT, epDir).replace(/\\/g, "/")}/.`,
    );
    return;
  }
  let outSize = 0;
  let outMtimeMs = 0;
  try {
    const st = await stat(outPath);
    outSize = st.size;
    outMtimeMs = st.mtimeMs;
  } catch {
    log(
      "cost",
      `[cleanup] SKIPPED — render did not produce a fresh output (missing ${path.basename(outPath)}). Intermediates preserved in ${path.relative(PROJECT_ROOT, epDir).replace(/\\/g, "/")}/.`,
    );
    return;
  }
  if (outSize <= 0) {
    log(
      "cost",
      `[cleanup] SKIPPED — render produced a 0-byte output. Intermediates preserved in ${path.relative(PROJECT_ROOT, epDir).replace(/\\/g, "/")}/.`,
    );
    return;
  }
  // Mtime must be >= run start (allow 2s clock-skew slack).
  if (outMtimeMs + 2000 < ctx.runStartMs) {
    log(
      "cost",
      `[cleanup] SKIPPED — ${path.basename(outPath)} mtime ${new Date(outMtimeMs).toISOString()} is older than run start ${new Date(ctx.runStartMs).toISOString()}; render did not refresh it this run. Intermediates preserved in ${path.relative(PROJECT_ROOT, epDir).replace(/\\/g, "/")}/.`,
    );
    return;
  }
  if (!ctx.renderAttempted) {
    log(
      "cost",
      `[cleanup] SKIPPED — render stage was skipped this run; not deleting intermediates. Use --force to rebuild and cleanup.`,
    );
    return;
  }
  const clipsDir = path.join(epDir, "clips");
  try {
    const entries = await readdir(clipsDir);
    let removed = 0;
    let bytesFreed = 0;
    for (const entry of entries) {
      if (!/^beat-\d+\.mp4$/.test(entry)) continue;
      const p = path.join(clipsDir, entry);
      try {
        const st = await stat(p);
        bytesFreed += st.size;
        const { unlink } = await import("node:fs/promises");
        await unlink(p);
        removed++;
      } catch {
        /* ignore individual failures */
      }
    }
    if (removed) {
      log(
        "cost",
        `cleaned ${removed} intermediate clip(s) — freed ${(bytesFreed / 1_048_576).toFixed(2)} MB. Set KEEP_INTERMEDIATES=1 or pass --keep-intermediates to disable.`,
      );
    }
  } catch {
    /* clips dir may not exist */
  }
}

// ---------- Bug-2: provider sidecar metadata ----------
type VoiceProvider = "elevenlabs" | "mock";
type ClipProvider = "fal" | "mock";

function resolveVoiceProvider(): VoiceProvider {
  const env = (process.env.VOICE_PROVIDER ?? "").toLowerCase();
  if (env === "mock") return "mock";
  if (env === "elevenlabs") return "elevenlabs";
  // No explicit env -> infer from key presence.
  return process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_NARRATOR_VOICE_ID
    ? "elevenlabs"
    : "mock";
}

function resolveClipProvider(): ClipProvider {
  const env = (process.env.VIDEO_PROVIDER ?? "").toLowerCase();
  if (env === "mock") return "mock";
  if (env === "fal" || env === "seedance") return "fal";
  return process.env.FAL_KEY ? "fal" : "mock";
}

async function readVoiceMeta(epDir: string): Promise<VoiceProvider | null> {
  try {
    const raw = await readFile(path.join(epDir, "narration.meta.json"), "utf8");
    const j = JSON.parse(raw) as { provider?: string };
    if (j.provider === "elevenlabs" || j.provider === "mock") return j.provider;
    return null;
  } catch {
    return null;
  }
}

async function voiceMetaMatches(epDir: string, current: VoiceProvider): Promise<boolean> {
  const recorded = await readVoiceMeta(epDir);
  if (recorded === null) {
    // No sidecar yet — assume match if current is "mock" so we don't churn old
    // mock-mode dry-runs. If current is "elevenlabs" and we have no sidecar,
    // treat as mismatch so we rebuild a real version.
    return current === "mock";
  }
  return recorded === current;
}

async function writeVoiceMeta(epDir: string, provider: VoiceProvider): Promise<void> {
  const meta = {
    provider,
    generatedAt: new Date().toISOString(),
    voiceId: provider === "elevenlabs" ? process.env.ELEVENLABS_NARRATOR_VOICE_ID ?? null : null,
  };
  await writeJson(path.join(epDir, "narration.meta.json"), meta);
}

function clipMetaPath(clipsDir: string, beatIdx: number): string {
  return path.join(clipsDir, `beat-${String(beatIdx).padStart(2, "0")}.meta.json`);
}

async function readClipMeta(clipsDir: string, beatIdx: number): Promise<ClipProvider | null> {
  try {
    const raw = await readFile(clipMetaPath(clipsDir, beatIdx), "utf8");
    const j = JSON.parse(raw) as { provider?: string };
    if (j.provider === "fal" || j.provider === "mock") return j.provider;
    return null;
  } catch {
    return null;
  }
}

async function writeClipMeta(
  clipsDir: string,
  beatIdx: number,
  provider: ClipProvider,
  extra?: Record<string, unknown>,
): Promise<void> {
  const meta = {
    provider,
    generatedAt: new Date().toISOString(),
    beatIdx,
    ...(extra ?? {}),
  };
  await writeJson(clipMetaPath(clipsDir, beatIdx), meta);
}

async function everyClipMetaMatches(
  prompted: PromptedBeat[],
  clipsDir: string,
  current: ClipProvider,
): Promise<boolean> {
  for (const b of prompted) {
    const recorded = await readClipMeta(clipsDir, b.idx);
    if (recorded === null) {
      // No sidecar — only consider it OK if current is "mock"
      if (current !== "mock") return false;
      continue;
    }
    if (recorded !== current) return false;
  }
  return true;
}

// ---------- helpers ----------
function parseArgs(argv: string[]): CliFlags {
  let episodeId = "";
  let force = false;
  let fromStage: StageName | null = null;
  let aspect: AspectRatio = "9:16";
  let costModeOverride: CostMode | null = null;
  let regenRefs = false;
  let ignoreBudget = false;
  let keepIntermediates = false;

  for (const arg of argv) {
    if (arg.startsWith("--from=")) {
      const v = arg.slice("--from=".length) as StageName;
      if (STAGE_ORDER.includes(v)) fromStage = v;
      else throw new Error(`Unknown stage: ${v}. Valid: ${STAGE_ORDER.join(", ")}`);
    } else if (arg.startsWith("--aspect=")) {
      const v = arg.slice("--aspect=".length);
      if (v === "9:16" || v === "16:9") aspect = v;
      else throw new Error(`Unknown aspect: ${v}`);
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "--quality") {
      costModeOverride = "quality";
    } else if (arg === "--lean") {
      costModeOverride = "lean";
    } else if (arg === "--balanced") {
      costModeOverride = "balanced";
    } else if (arg === "--regen-refs") {
      regenRefs = true;
    } else if (arg === "--ignore-budget") {
      ignoreBudget = true;
    } else if (arg === "--keep-intermediates" || arg === "--keep") {
      keepIntermediates = true;
    } else if (/^EP\d{3}$/i.test(arg)) {
      episodeId = arg.toUpperCase();
    }
  }

  return { episodeId, force, fromStage, aspect, costModeOverride, regenRefs, ignoreBudget, keepIntermediates };
}

// === COST CONTROL === see memory/cost-rules.md
// Resolves the cost-mode for this run: CLI flag > env > runtime-based default.
function resolveCostMode(runtimeSeconds: number, override: CostMode | null): {
  mode: CostMode;
  reason: string;
} {
  if (override) {
    return { mode: override, reason: "CLI override" };
  }
  const envMode = (process.env.COST_MODE ?? "").toLowerCase();
  if (envMode === "lean" || envMode === "balanced" || envMode === "quality") {
    return { mode: envMode, reason: "COST_MODE env" };
  }
  if (runtimeSeconds <= 90) return { mode: "lean", reason: "default for runtime≤90s" };
  if (runtimeSeconds <= 600) return { mode: "balanced", reason: "default for runtime 90-600s" };
  return { mode: "quality", reason: "default for runtime>600s" };
}

// Decides the Seedance tier for a given beat under the resolved cost mode.
// lean -> always Lite. balanced -> Pro on first/last beat, Lite middle. quality -> always Pro.
function tierForBeat(mode: CostMode, beatIdx: number, totalBeats: number): "lite" | "pro" {
  if (mode === "lean") return "lite";
  if (mode === "quality") return "pro";
  // balanced
  if (beatIdx === 1 || beatIdx === totalBeats) return "pro";
  return "lite";
}

function shouldRun(stage: StageName, flags: CliFlags, artifactExists: boolean): boolean {
  if (flags.force) return true;
  if (flags.fromStage) {
    const fromIdx = STAGE_ORDER.indexOf(flags.fromStage);
    const thisIdx = STAGE_ORDER.indexOf(stage);
    if (thisIdx >= fromIdx) return true;
  }
  return !artifactExists;
}

// === Bug-1/3 === out/<EP>.mp4 is "fresh" only if it exists AND its mtime is
// at least as new as the manifest. Otherwise upstream changes have invalidated
// it and we need to re-render.
async function isOutputFresh(outPath: string, manifestPath: string): Promise<boolean> {
  try {
    const outSt = await stat(outPath);
    if (outSt.size <= 0) return false;
    const manSt = await stat(manifestPath);
    return outSt.mtimeMs + 1 >= manSt.mtimeMs;
  } catch {
    return false;
  }
}

async function everyBeatHasClip(prompted: PromptedBeat[], clipsDir: string): Promise<boolean> {
  for (const b of prompted) {
    const p = path.join(clipsDir, `beat-${String(b.idx).padStart(2, "0")}.mp4`);
    if (!(await exists(p))) return false;
    const st = await stat(p);
    if (st.size === 0) return false;
  }
  return prompted.length > 0;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

async function writeJson(p: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(value, null, 2), "utf8");
}

async function downloadTo(url: string, outPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`download ${url} -> ${resp.status}`);
  await mkdir(path.dirname(outPath), { recursive: true });
  const stream = Readable.fromWeb(resp.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(stream, createWriteStream(outPath));
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function log(stage: string, msg: string) {
  // The `sync` stage sits between voice (stage-2) and prompts (stage-3) and
  // doesn't have its own slot in STAGE_ORDER (which drives the resumability
  // checks). Tag it as `stage-2b` for log readability.
  if (stage === "sync") {
    console.log(`[produce] [stage-2b sync] ${msg}`);
    return;
  }
  const stageIdx = STAGE_ORDER.indexOf(stage as StageName);
  const tag = stageIdx >= 0 ? `[stage-${stageIdx + 1} ${stage}]` : `[${stage}]`;
  console.log(`[produce] ${tag} ${msg}`);
}

// ---------- entry ----------
const isCli =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");

if (isCli) {
  main().catch((err) => {
    console.error("[produce] FATAL:", err);
    process.exit(1);
  });
}
