import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const CLI_ENTRY = require.resolve("@vibeframe/cli");
const CLI_PACKAGE = path.resolve(path.dirname(CLI_ENTRY), "..", "package.json");
const REQUIRED_CLI_VERSION = "0.113.24";
const DATA_ROOT = path.resolve(process.cwd(), "data", "vibeframe");
const AUDIT_ROOT = path.join(DATA_ROOT, ".audit");
const AUDIT_FILE = path.join(AUDIT_ROOT, "jobs.jsonl");
const DEFAULT_MAX_COST_USD = 5;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIT_JOBS = 2_000;

const SCHEMA_COMMANDS = new Set([
  "init",
  "plan",
  "build",
  "render",
  "inspect.project",
  "inspect.render",
  "status.job",
  "status.project",
  "doctor",
  "remix.highlights",
  "remix.auto-shorts",
]);

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SIMPLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type VibeFrameJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type VibeFrameCommand =
  | "doctor"
  | "schema"
  | "init"
  | "plan"
  | "build"
  | "render"
  | "inspect"
  | "remix"
  | "status";

export type VibeFrameJob = {
  id: string;
  command: VibeFrameCommand;
  projectId?: string;
  status: VibeFrameJobStatus;
  dryRun: boolean;
  approved: boolean;
  maxCostUsd?: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  timeoutMs: number;
  pid?: number;
  exitCode?: number | null;
  result?: unknown;
  error?: string;
};

export type PaidOperationResult =
  | { mode: "dry-run"; job: VibeFrameJob }
  | { mode: "submitted"; preflightJobId: string; job: VibeFrameJob };

type JsonObject = Record<string, unknown>;
type TerminationStatus = "cancelled" | "timed_out" | "failed";

type CommandSpec = {
  command: VibeFrameCommand;
  args: string[];
  projectId?: string;
  cwd?: string;
  dryRun?: boolean;
  approved?: boolean;
  maxCostUsd?: number;
  timeoutMs?: number;
};

type ActiveJob = {
  child: ChildProcessWithoutNullStreams;
  cancel: (status: TerminationStatus, reason: string) => Promise<VibeFrameJob>;
};

export class VibeFrameAdapterError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, code = "VIBEFRAME_ERROR", statusCode = 400, details?: unknown) {
    super(message);
    this.name = "VibeFrameAdapterError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const activeJobs = new Map<string, ActiveJob>();
let verifiedCliVersion: string | null = null;

export function getVibeFrameDataRoot(): string {
  return DATA_ROOT;
}

export function getVibeFrameMaxCostUsd(): number {
  const configured = Number(process.env.VIBEFRAME_MAX_COST_USD ?? DEFAULT_MAX_COST_USD);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_COST_USD;
  return Math.min(configured, 100);
}

export async function getVibeFrameAdapterStatus() {
  const version = await verifyPinnedCli();
  return {
    ok: true,
    cli: `@vibeframe/cli@${version}`,
    dataRoot: DATA_ROOT,
    maxCostUsd: getVibeFrameMaxCostUsd(),
    activeJobs: activeJobs.size,
    providerDefaults: {
      video: "seedance",
      music: process.env.REPLICATE_API_TOKEN ? "replicate" : "auto",
    },
    credentials: {
      replicateConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
      seedanceFalConfigured: Boolean(process.env.FAL_API_KEY || process.env.FAL_KEY),
    },
  };
}

export async function runVibeFrameDoctor(input: unknown = {}): Promise<VibeFrameJob> {
  const body = asObject(input, "doctor input");
  assertAllowedKeys(body, ["verbose", "timeoutMs"]);
  const args = ["doctor"];
  addBooleanFlag(args, "--verbose", readBoolean(body, "verbose"));
  return executeCli({
    command: "doctor",
    args,
    timeoutMs: readTimeout(body, 30_000, 120_000),
  });
}

export async function runVibeFrameSchema(command?: string): Promise<VibeFrameJob> {
  const args = ["schema"];
  if (command) {
    if (!SCHEMA_COMMANDS.has(command)) {
      throw new VibeFrameAdapterError("Schema command is not allowlisted.", "COMMAND_NOT_ALLOWED", 400);
    }
    args.push(command);
  } else {
    args.push("--list", "--surface", "public");
  }
  return executeCli({ command: "schema", args, timeoutMs: 30_000 });
}

export async function initVibeFrameProject(projectId: string, input: unknown): Promise<VibeFrameJob> {
  const body = asObject(input, "init input");
  assertAllowedKeys(body, [
    "brief",
    "profile",
    "ratio",
    "duration",
    "visualStyle",
    "kind",
    "dryRun",
    "timeoutMs",
  ]);
  const projectDir = resolveProjectRoot(projectId);
  const args = ["init", projectDir, "--type", "scene"];
  addStringFlag(args, "--from", readString(body, "brief", { maxLength: 10_000 }));
  addEnumFlag(args, "--profile", readEnum(body, "profile", ["minimal", "agent", "full"]));
  addEnumFlag(args, "--ratio", readEnum(body, "ratio", ["16:9", "9:16", "1:1", "4:5"]));
  addNumberFlag(args, "--duration", readNumber(body, "duration", { min: 1, max: 3_600 }));
  addStringFlag(args, "--visual-style", readString(body, "visualStyle", { maxLength: 120 }));
  addEnumFlag(args, "--kind", readEnum(body, "kind", ["cinema", "story", "aivideo", "product", "motion"]));
  args.push("--agent", "codex");

  const dryRun = readBoolean(body, "dryRun") !== false;
  if (dryRun) args.push("--dry-run");
  return executeCli({
    command: "init",
    args,
    projectId,
    cwd: DATA_ROOT,
    dryRun,
    timeoutMs: readTimeout(body, 60_000, 180_000),
  });
}

export async function planVibeFrameProject(projectId: string, input: unknown = {}): Promise<VibeFrameJob> {
  const body = asObject(input, "plan input");
  assertAllowedKeys(body, [
    "stage",
    "beat",
    "mode",
    "skipNarration",
    "skipBackdrop",
    "skipVideo",
    "skipMusic",
    "tts",
    "voice",
    "imageProvider",
    "videoProvider",
    "musicProvider",
    "quality",
    "imageSize",
    "composer",
    "force",
    "maxCostUsd",
    "timeoutMs",
  ]);
  const projectDir = resolveProjectRoot(projectId);
  const maxCostUsd = readMaxCost(body, false);
  const args = buildPlanArgs(projectDir, body, maxCostUsd);
  return executeCli({
    command: "plan",
    args,
    projectId,
    cwd: projectDir,
    dryRun: true,
    maxCostUsd,
    timeoutMs: readTimeout(body, 60_000, 300_000),
  });
}

export async function buildVibeFrameProject(projectId: string, input: unknown): Promise<PaidOperationResult> {
  const body = asObject(input, "build input");
  assertAllowedKeys(body, [
    "approved",
    "dryRun",
    "maxCostUsd",
    "stage",
    "beat",
    "mode",
    "effort",
    "composer",
    "skipNarration",
    "skipBackdrop",
    "skipVideo",
    "skipKeyframe",
    "skipMusic",
    "skipTranscript",
    "skipRender",
    "tts",
    "voice",
    "imageProvider",
    "videoProvider",
    "musicProvider",
    "quality",
    "imageSize",
    "force",
    "timeoutMs",
  ]);
  const projectDir = resolveProjectRoot(projectId);
  const dryRun = readBoolean(body, "dryRun") !== false;
  const approved = readBoolean(body, "approved") === true;
  const maxCostUsd = readMaxCost(body, !dryRun);
  const timeoutMs = readTimeout(body, 30 * 60_000, 60 * 60_000);
  const preflightArgs = buildBuildArgs(projectDir, body, maxCostUsd, true);

  const preflight = await executeCli({
    command: "build",
    args: preflightArgs,
    projectId,
    cwd: projectDir,
    dryRun: true,
    approved: false,
    maxCostUsd,
    timeoutMs: Math.min(timeoutMs, 10 * 60_000),
  });
  assertEstimatedCost(preflight.result, maxCostUsd, false);
  if (dryRun) return { mode: "dry-run", job: preflight };

  assertPaidApproval(approved, maxCostUsd, "build");
  const job = await submitCli({
    command: "build",
    args: buildBuildArgs(projectDir, body, maxCostUsd, false),
    projectId,
    cwd: projectDir,
    dryRun: false,
    approved: true,
    maxCostUsd,
    timeoutMs,
  });
  return { mode: "submitted", preflightJobId: preflight.id, job };
}

export async function renderVibeFrameProject(projectId: string, input: unknown): Promise<PaidOperationResult> {
  const body = asObject(input, "render input");
  assertAllowedKeys(body, [
    "approved",
    "dryRun",
    "maxCostUsd",
    "output",
    "root",
    "beat",
    "fps",
    "quality",
    "format",
    "workers",
    "silent",
    "timeoutMs",
  ]);
  const projectDir = resolveProjectRoot(projectId);
  const dryRun = readBoolean(body, "dryRun") !== false;
  const approved = readBoolean(body, "approved") === true;
  const maxCostUsd = readMaxCost(body, !dryRun);
  const timeoutMs = readTimeout(body, 30 * 60_000, 60 * 60_000);
  const preflight = await executeCli({
    command: "render",
    args: buildRenderArgs(projectDir, body, true),
    projectId,
    cwd: projectDir,
    dryRun: true,
    approved: false,
    maxCostUsd,
    timeoutMs: Math.min(timeoutMs, 5 * 60_000),
  });
  if (dryRun) return { mode: "dry-run", job: preflight };

  assertPaidApproval(approved, maxCostUsd, "render");
  const job = await submitCli({
    command: "render",
    args: buildRenderArgs(projectDir, body, false),
    projectId,
    cwd: projectDir,
    dryRun: false,
    approved: true,
    maxCostUsd,
    timeoutMs,
  });
  return { mode: "submitted", preflightJobId: preflight.id, job };
}

export async function inspectVibeFrameProject(projectId: string, input: unknown = {}): Promise<VibeFrameJob> {
  const body = asObject(input, "inspect input");
  assertAllowedKeys(body, ["mode", "beat", "video", "output", "noReport", "ai", "approved", "maxCostUsd", "model", "dryRun", "timeoutMs"]);
  const projectDir = resolveProjectRoot(projectId);
  const mode = readEnum(body, "mode", ["project", "render"]) ?? "project";
  const args = ["inspect", mode, projectDir];
  addSimpleIdFlag(args, "--beat", readString(body, "beat", { maxLength: 128 }));
  addBooleanFlag(args, "--no-report", readBoolean(body, "noReport"));

  if (mode === "render") {
    addPathFlag(args, "--video", projectDir, readString(body, "video", { maxLength: 512 }));
    addPathFlag(args, "--output", projectDir, readString(body, "output", { maxLength: 512 }));
    const ai = readBoolean(body, "ai") === true;
    if (ai && readBoolean(body, "approved") !== true) {
      throw new VibeFrameAdapterError("AI render inspection requires approved=true.", "APPROVAL_REQUIRED", 403);
    }
    if (ai) readMaxCost(body, true);
    args.push(ai ? "--ai" : "--cheap");
    addStringFlag(args, "--model", readString(body, "model", { maxLength: 80 }));
    if (readBoolean(body, "dryRun") === true) args.push("--dry-run");
  } else {
    addPathFlag(args, "--output", projectDir, readString(body, "output", { maxLength: 512 }));
  }

  return executeCli({
    command: "inspect",
    args,
    projectId,
    cwd: projectDir,
    dryRun: readBoolean(body, "dryRun") === true,
    approved: readBoolean(body, "approved") === true,
    maxCostUsd: body.maxCostUsd === undefined ? undefined : readMaxCost(body, false),
    timeoutMs: readTimeout(body, 5 * 60_000, 20 * 60_000),
  });
}

export async function remixVibeFrameProject(projectId: string, input: unknown): Promise<PaidOperationResult> {
  const body = asObject(input, "remix input");
  assertAllowedKeys(body, [
    "mode",
    "source",
    "output",
    "outputDir",
    "project",
    "duration",
    "count",
    "threshold",
    "criteria",
    "aspect",
    "addCaptions",
    "captionStyle",
    "analyzeOnly",
    "language",
    "useGemini",
    "lowRes",
    "approved",
    "dryRun",
    "maxCostUsd",
    "timeoutMs",
  ]);
  const projectDir = resolveProjectRoot(projectId);
  const dryRun = readBoolean(body, "dryRun") !== false;
  const approved = readBoolean(body, "approved") === true;
  const maxCostUsd = readMaxCost(body, !dryRun);
  const timeoutMs = readTimeout(body, 30 * 60_000, 60 * 60_000);
  const preflightArgs = await buildRemixArgs(projectDir, body, true);
  const preflight = await executeCli({
    command: "remix",
    args: preflightArgs,
    projectId,
    cwd: projectDir,
    dryRun: true,
    approved: false,
    maxCostUsd,
    timeoutMs: Math.min(timeoutMs, 10 * 60_000),
  });
  assertEstimatedCost(preflight.result, maxCostUsd, true);
  if (dryRun) return { mode: "dry-run", job: preflight };

  assertPaidApproval(approved, maxCostUsd, "remix");
  const job = await submitCli({
    command: "remix",
    args: await buildRemixArgs(projectDir, body, false),
    projectId,
    cwd: projectDir,
    dryRun: false,
    approved: true,
    maxCostUsd,
    timeoutMs,
  });
  return { mode: "submitted", preflightJobId: preflight.id, job };
}

export async function statusVibeFrameProject(projectId: string, input: unknown = {}): Promise<VibeFrameJob> {
  const body = asObject(input, "status input");
  assertAllowedKeys(body, ["refresh", "timeoutMs"]);
  const projectDir = resolveProjectRoot(projectId);
  const args = ["status", "project", projectDir];
  addBooleanFlag(args, "--refresh", readBoolean(body, "refresh"));
  return executeCli({
    command: "status",
    args,
    projectId,
    cwd: projectDir,
    timeoutMs: readTimeout(body, 60_000, 5 * 60_000),
  });
}

export async function getVibeFrameJob(jobId: string): Promise<VibeFrameJob> {
  assertJobId(jobId);
  const jobs = await readAuditJobs();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new VibeFrameAdapterError("VibeFrame job not found.", "JOB_NOT_FOUND", 404);
  return job;
}

export async function listVibeFrameJobs(limit = 50): Promise<VibeFrameJob[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const jobs = await readAuditJobs();
  return jobs.slice(-safeLimit).reverse();
}

export async function cancelVibeFrameJob(jobId: string): Promise<VibeFrameJob> {
  assertJobId(jobId);
  const active = activeJobs.get(jobId);
  if (!active) {
    const job = await getVibeFrameJob(jobId);
    if (["completed", "failed", "cancelled", "timed_out"].includes(job.status)) return job;
    throw new VibeFrameAdapterError("Job is not active in this server process.", "JOB_NOT_ACTIVE", 409);
  }
  return active.cancel("cancelled", "Cancelled by API request.");
}

export async function runVibeFrameDryRun(projectId: string, input: unknown): Promise<PaidOperationResult> {
  const body = asObject(input, "dry-run input");
  const operation = readEnum(body, "operation", ["build", "render", "remix"]);
  if (!operation) throw new VibeFrameAdapterError("operation is required.", "VALIDATION_ERROR", 400);
  const forwarded: JsonObject = { ...body, dryRun: true, approved: false };
  delete forwarded.operation;
  if (operation === "build") return buildVibeFrameProject(projectId, forwarded);
  if (operation === "render") return renderVibeFrameProject(projectId, forwarded);
  return remixVibeFrameProject(projectId, forwarded);
}

function buildPlanArgs(projectDir: string, body: JsonObject, maxCostUsd: number): string[] {
  const args = ["plan", projectDir];
  addEnumFlag(args, "--stage", readEnum(body, "stage", ["assets", "transcript", "compose", "sync", "render", "all"]));
  addSimpleIdFlag(args, "--beat", readString(body, "beat", { maxLength: 128 }));
  addEnumFlag(args, "--mode", readEnum(body, "mode", ["agent", "batch", "auto"]));
  addBooleanFlag(args, "--skip-narration", readBoolean(body, "skipNarration"));
  addBooleanFlag(args, "--skip-backdrop", readBoolean(body, "skipBackdrop"));
  addBooleanFlag(args, "--skip-video", readBoolean(body, "skipVideo"));
  addBooleanFlag(args, "--skip-music", readBoolean(body, "skipMusic"));
  addEnumFlag(args, "--tts", readEnum(body, "tts", ["auto", "elevenlabs", "openai", "kokoro"]));
  addStringFlag(args, "--voice", readString(body, "voice", { maxLength: 160 }));
  addEnumFlag(args, "--image-provider", readEnum(body, "imageProvider", ["openai", "gemini", "grok"]));
  addEnumFlag(args, "--video-provider", readEnum(body, "videoProvider", ["seedance", "grok", "kling", "runway", "veo"]) ?? "seedance");
  addEnumFlag(args, "--music-provider", readEnum(body, "musicProvider", ["elevenlabs", "replicate"]) ?? defaultMusicProvider());
  addEnumFlag(args, "--quality", readEnum(body, "quality", ["standard", "hd"]));
  addEnumFlag(args, "--image-size", readEnum(body, "imageSize", ["1024x1024", "1536x1024", "1024x1536"]));
  addEnumFlag(args, "--composer", readEnum(body, "composer", ["claude", "openai", "gemini"]));
  addBooleanFlag(args, "--force", readBoolean(body, "force"));
  addNumberFlag(args, "--max-cost", maxCostUsd);
  return args;
}

function buildBuildArgs(projectDir: string, body: JsonObject, maxCostUsd: number, dryRun: boolean): string[] {
  const args = ["build", projectDir];
  addEnumFlag(args, "--stage", readEnum(body, "stage", ["assets", "transcript", "compose", "sync", "render", "all"]));
  addSimpleIdFlag(args, "--beat", readString(body, "beat", { maxLength: 128 }));
  addEnumFlag(args, "--mode", readEnum(body, "mode", ["agent", "batch", "auto"]));
  addEnumFlag(args, "--effort", readEnum(body, "effort", ["low", "medium", "high"]));
  addEnumFlag(args, "--composer", readEnum(body, "composer", ["template", "claude", "openai", "gemini"]));
  for (const [key, flag] of [
    ["skipNarration", "--skip-narration"],
    ["skipBackdrop", "--skip-backdrop"],
    ["skipVideo", "--skip-video"],
    ["skipKeyframe", "--skip-keyframe"],
    ["skipMusic", "--skip-music"],
    ["skipTranscript", "--skip-transcript"],
    ["skipRender", "--skip-render"],
  ] as const) addBooleanFlag(args, flag, readBoolean(body, key));
  addEnumFlag(args, "--tts", readEnum(body, "tts", ["auto", "elevenlabs", "openai", "kokoro"]));
  addStringFlag(args, "--voice", readString(body, "voice", { maxLength: 160 }));
  addEnumFlag(args, "--image-provider", readEnum(body, "imageProvider", ["openai", "gemini", "grok"]));
  addEnumFlag(args, "--video-provider", readEnum(body, "videoProvider", ["seedance", "grok", "kling", "runway", "veo"]) ?? "seedance");
  addEnumFlag(args, "--music-provider", readEnum(body, "musicProvider", ["elevenlabs", "replicate"]) ?? defaultMusicProvider());
  addEnumFlag(args, "--quality", readEnum(body, "quality", ["standard", "hd"]));
  addEnumFlag(args, "--image-size", readEnum(body, "imageSize", ["1024x1024", "1536x1024", "1024x1536"]));
  addBooleanFlag(args, "--force", readBoolean(body, "force"));
  addNumberFlag(args, "--max-cost", maxCostUsd);
  if (dryRun) args.push("--dry-run");
  return args;
}

function buildRenderArgs(projectDir: string, body: JsonObject, dryRun: boolean): string[] {
  const args = ["render", projectDir];
  addPathFlag(args, "--output", projectDir, readString(body, "output", { maxLength: 512 }));
  addPathFlag(args, "--root", projectDir, readString(body, "root", { maxLength: 512 }));
  addSimpleIdFlag(args, "--beat", readString(body, "beat", { maxLength: 128 }));
  addEnumNumberFlag(args, "--fps", readNumber(body, "fps", { allowed: [24, 30, 60] }));
  addEnumFlag(args, "--quality", readEnum(body, "quality", ["draft", "standard", "high"]));
  addEnumFlag(args, "--format", readEnum(body, "format", ["mp4", "webm", "mov"]));
  addNumberFlag(args, "--workers", readNumber(body, "workers", { integer: true, min: 1, max: 16 }));
  addBooleanFlag(args, "--silent", readBoolean(body, "silent"));
  if (dryRun) args.push("--dry-run");
  return args;
}

async function buildRemixArgs(projectDir: string, body: JsonObject, dryRun: boolean): Promise<string[]> {
  const mode = readEnum(body, "mode", ["highlights", "auto-shorts"]);
  if (!mode) throw new VibeFrameAdapterError("mode is required.", "VALIDATION_ERROR", 400);
  const source = readString(body, "source", { required: true, maxLength: 512 });
  const sourcePath = resolveProjectPath(projectDir, source!);
  await assertRegularFile(sourcePath);
  const args = ["remix", mode, sourcePath];
  addPathFlag(args, "--output", projectDir, readString(body, "output", { maxLength: 512 }));
  addNumberFlag(args, "--duration", readNumber(body, "duration", { min: 1, max: mode === "auto-shorts" ? 60 : 3_600 }));
  addNumberFlag(args, "--count", readNumber(body, "count", { integer: true, min: 1, max: 50 }));
  addStringFlag(args, "--language", readString(body, "language", { maxLength: 16 }));
  addBooleanFlag(args, "--use-gemini", readBoolean(body, "useGemini"));
  addBooleanFlag(args, "--low-res", readBoolean(body, "lowRes"));
  if (mode === "highlights") {
    addPathFlag(args, "--project", projectDir, readString(body, "project", { maxLength: 512 }));
    addNumberFlag(args, "--threshold", readNumber(body, "threshold", { min: 0, max: 1 }));
    addEnumFlag(args, "--criteria", readEnum(body, "criteria", ["emotional", "informative", "funny", "all"]));
  } else {
    addPathFlag(args, "--output-dir", projectDir, readString(body, "outputDir", { maxLength: 512 }));
    addEnumFlag(args, "--aspect", readEnum(body, "aspect", ["9:16", "1:1"]));
    addBooleanFlag(args, "--add-captions", readBoolean(body, "addCaptions"));
    addEnumFlag(args, "--caption-style", readEnum(body, "captionStyle", ["minimal", "bold", "animated"]));
    addBooleanFlag(args, "--analyze-only", readBoolean(body, "analyzeOnly"));
  }
  if (dryRun) args.push("--dry-run");
  return args;
}

async function executeCli(spec: CommandSpec): Promise<VibeFrameJob> {
  const { completion } = await startCli(spec);
  const job = await completion;
  if (job.status !== "completed") {
    throw new VibeFrameAdapterError(job.error ?? "VibeFrame command failed.", "CLI_COMMAND_FAILED", 502, {
      jobId: job.id,
      status: job.status,
      result: job.result,
    });
  }
  return job;
}

async function submitCli(spec: CommandSpec): Promise<VibeFrameJob> {
  const { job, completion } = await startCli(spec);
  void completion.catch(() => undefined);
  return job;
}

async function startCli(spec: CommandSpec): Promise<{ job: VibeFrameJob; completion: Promise<VibeFrameJob> }> {
  await verifyPinnedCli();
  await mkdir(AUDIT_ROOT, { recursive: true });
  if (spec.cwd) ensureWithin(DATA_ROOT, spec.cwd);
  const timeoutMs = Math.min(Math.max(spec.timeoutMs ?? 60_000, 1_000), 60 * 60_000);
  const job: VibeFrameJob = {
    id: randomUUID(),
    command: spec.command,
    projectId: spec.projectId,
    status: "queued",
    dryRun: spec.dryRun === true,
    approved: spec.approved === true,
    maxCostUsd: spec.maxCostUsd,
    createdAt: new Date().toISOString(),
    timeoutMs,
  };
  await writeAudit(job);

  const completion = new Promise<VibeFrameJob>((resolve) => {
    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    let finalized = false;
    let termination: TerminationStatus | null = null;
    let terminationReason = "";
    const childArgs = [...spec.args, "--json"];
    const child = spawn(process.execPath, [CLI_ENTRY, ...childArgs], {
      cwd: spec.cwd ?? DATA_ROOT,
      env: buildChildEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end();
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.pid = child.pid;
    void writeAudit(job).catch(() => undefined);

    const requestTermination = async (status: TerminationStatus, reason: string): Promise<VibeFrameJob> => {
      if (!termination) {
        termination = status;
        terminationReason = reason;
        job.status = status;
        job.error = reason;
        job.finishedAt = new Date().toISOString();
        terminateProcessTree(child);
        await writeAudit(job);
      }
      return sanitizeJob(job);
    };

    activeJobs.set(job.id, { child, cancel: requestTermination });
    const timeout = setTimeout(() => {
      void requestTermination("timed_out", `VibeFrame command exceeded ${timeoutMs}ms timeout.`).catch(() => undefined);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk, () => {
        void requestTermination("failed", "VibeFrame stdout exceeded the 4 MiB safety limit.").catch(() => undefined);
      });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk, () => {
        void requestTermination("failed", "VibeFrame stderr exceeded the 4 MiB safety limit.").catch(() => undefined);
      });
    });

    const finalize = async (exitCode: number | null, spawnError?: Error) => {
      if (finalized) return;
      finalized = true;
      clearTimeout(timeout);
      activeJobs.delete(job.id);
      job.exitCode = exitCode;
      job.finishedAt = job.finishedAt ?? new Date().toISOString();

      const stdoutText = stdout.toString("utf8").trim();
      const stderrText = redactText(stderr.toString("utf8").trim());
      const parsed = parseJson(stdoutText);
      if (termination) {
        job.status = termination;
        job.error = terminationReason;
        if (parsed !== undefined) job.result = sanitizeValue(parsed);
      } else if (spawnError) {
        job.status = "failed";
        job.error = redactText(spawnError.message);
      } else if (exitCode === 0 && parsed !== undefined) {
        job.status = "completed";
        job.result = sanitizeValue(parsed);
      } else {
        job.status = "failed";
        job.result = parsed === undefined ? undefined : sanitizeValue(parsed);
        job.error = stderrText || extractErrorMessage(parsed) || "VibeFrame returned non-JSON output or a non-zero exit code.";
      }
      await writeAudit(job);
      resolve(sanitizeJob(job));
    };

    child.once("error", (error) => void finalize(null, error));
    child.once("close", (code) => void finalize(code));
  });

  return { job: sanitizeJob(job), completion };
}

async function verifyPinnedCli(): Promise<string> {
  if (verifiedCliVersion) return verifiedCliVersion;
  const parsed = JSON.parse(await readFile(CLI_PACKAGE, "utf8")) as { name?: string; version?: string };
  if (parsed.name !== "@vibeframe/cli" || parsed.version !== REQUIRED_CLI_VERSION) {
    throw new VibeFrameAdapterError(
      `Expected @vibeframe/cli@${REQUIRED_CLI_VERSION}; found ${parsed.name ?? "unknown"}@${parsed.version ?? "unknown"}.`,
      "CLI_VERSION_MISMATCH",
      500,
    );
  }
  verifiedCliVersion = parsed.version;
  return verifiedCliVersion;
}

function buildChildEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    NO_COLOR: "1",
    CI: "1",
  };
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "XAI_API_KEY",
    "RUNWAY_API_SECRET",
    "KLING_API_KEY",
    "ELEVENLABS_API_KEY",
    "IMGBB_API_KEY",
    "REPLICATE_API_TOKEN",
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  const falKey = process.env.FAL_API_KEY ?? process.env.FAL_KEY;
  if (falKey) env.FAL_API_KEY = falKey;
  return env;
}

function resolveProjectRoot(projectId: string): string {
  if (
    !PROJECT_ID_PATTERN.test(projectId)
    || projectId === "."
    || projectId === ".."
    || projectId.endsWith(".")
    || isWindowsReservedName(projectId)
  ) {
    throw new VibeFrameAdapterError("Invalid projectId.", "INVALID_PROJECT_ID", 400);
  }
  const resolved = path.resolve(DATA_ROOT, projectId);
  ensureWithin(DATA_ROOT, resolved);
  return resolved;
}

function resolveProjectPath(projectRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.includes("\0") || relativePath.includes(":")) {
    throw new VibeFrameAdapterError("Paths must be relative to the VibeFrame project.", "PATH_NOT_ALLOWED", 400);
  }
  for (const segment of relativePath.split(/[\\/]+/)) {
    if (!segment || segment.endsWith(".") || segment.endsWith(" ") || isWindowsReservedName(segment)) {
      throw new VibeFrameAdapterError("Path contains a Windows-incompatible segment.", "PATH_NOT_ALLOWED", 400);
    }
  }
  const resolved = path.resolve(projectRoot, relativePath);
  ensureWithin(projectRoot, resolved);
  return resolved;
}

function isWindowsReservedName(value: string): boolean {
  const basename = value.split(".", 1)[0];
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(basename);
}

function ensureWithin(root: string, candidate: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative !== "" && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new VibeFrameAdapterError("Path escapes the allowed VibeFrame data root.", "PATH_NOT_ALLOWED", 400);
  }
  rejectExistingLinkTraversal(root, candidate);
}

function rejectExistingLinkTraversal(root: string, candidate: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  const segments = relative ? relative.split(path.sep) : [];
  let current = path.resolve(root);
  for (let index = -1; index < segments.length; index += 1) {
    if (index >= 0) current = path.join(current, segments[index]);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new VibeFrameAdapterError("Symbolic links and junctions are not allowed in VibeFrame project paths.", "PATH_NOT_ALLOWED", 400);
      }
    } catch (error) {
      if (error instanceof VibeFrameAdapterError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new VibeFrameAdapterError("Unable to validate the VibeFrame project path.", "PATH_NOT_ALLOWED", 400);
    }
  }
}

async function assertRegularFile(filePath: string): Promise<void> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new VibeFrameAdapterError("Source media does not exist inside the project.", "SOURCE_NOT_FOUND", 404);
  }
}

function asObject(input: unknown, label: string): JsonObject {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new VibeFrameAdapterError(`${label} must be a JSON object.`, "INVALID_JSON_BODY", 400);
  }
  return input as JsonObject;
}

function assertAllowedKeys(body: JsonObject, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unknown.length) {
    throw new VibeFrameAdapterError(`Unsupported option(s): ${unknown.join(", ")}.`, "ARGUMENT_NOT_ALLOWED", 400);
  }
}

function readString(
  body: JsonObject,
  key: string,
  options: { required?: boolean; maxLength?: number } = {},
): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new VibeFrameAdapterError(`${key} is required.`, "VALIDATION_ERROR", 400);
    return undefined;
  }
  if (typeof value !== "string" || value.length > (options.maxLength ?? 1_000) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new VibeFrameAdapterError(`${key} is invalid.`, "VALIDATION_ERROR", 400);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (options.required) throw new VibeFrameAdapterError(`${key} is required.`, "VALIDATION_ERROR", 400);
    return undefined;
  }
  return trimmed;
}

function readBoolean(body: JsonObject, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new VibeFrameAdapterError(`${key} must be boolean.`, "VALIDATION_ERROR", 400);
  return value;
}

function readEnum<T extends string>(body: JsonObject, key: string, values: readonly T[]): T | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new VibeFrameAdapterError(`${key} must be one of: ${values.join(", ")}.`, "VALIDATION_ERROR", 400);
  }
  return value as T;
}

function readNumber(
  body: JsonObject,
  key: string,
  options: { min?: number; max?: number; integer?: boolean; allowed?: readonly number[] } = {},
): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new VibeFrameAdapterError(`${key} must be a finite number.`, "VALIDATION_ERROR", 400);
  }
  if (options.integer && !Number.isInteger(value)) throw new VibeFrameAdapterError(`${key} must be an integer.`, "VALIDATION_ERROR", 400);
  if (options.allowed && !options.allowed.includes(value)) throw new VibeFrameAdapterError(`${key} is not allowed.`, "VALIDATION_ERROR", 400);
  if (options.min !== undefined && value < options.min) throw new VibeFrameAdapterError(`${key} is below the minimum.`, "VALIDATION_ERROR", 400);
  if (options.max !== undefined && value > options.max) throw new VibeFrameAdapterError(`${key} exceeds the maximum.`, "VALIDATION_ERROR", 400);
  return value;
}

function readTimeout(body: JsonObject, fallback: number, maximum: number): number {
  return readNumber(body, "timeoutMs", { integer: true, min: 1_000, max: maximum }) ?? fallback;
}

function readMaxCost(body: JsonObject, required: boolean): number {
  const value = readNumber(body, "maxCostUsd", { min: 0.01, max: getVibeFrameMaxCostUsd() });
  if (required && value === undefined) {
    throw new VibeFrameAdapterError("maxCostUsd is required for paid execution.", "MAX_COST_REQUIRED", 400);
  }
  return value ?? getVibeFrameMaxCostUsd();
}

function assertPaidApproval(approved: boolean, maxCostUsd: number, operation: string): void {
  if (!approved) {
    throw new VibeFrameAdapterError(`${operation} requires approved=true after reviewing its dry-run.`, "APPROVAL_REQUIRED", 403);
  }
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || maxCostUsd > getVibeFrameMaxCostUsd()) {
    throw new VibeFrameAdapterError("maxCostUsd exceeds the server policy.", "MAX_COST_EXCEEDED", 400);
  }
}

function assertEstimatedCost(result: unknown, maxCostUsd: number, requireEstimate: boolean): void {
  const estimate = findEstimatedCost(result);
  if (estimate === undefined) {
    if (requireEstimate) {
      throw new VibeFrameAdapterError("Dry-run did not return a cost estimate; paid execution is blocked.", "COST_ESTIMATE_MISSING", 409);
    }
    return;
  }
  if (estimate > maxCostUsd) {
    throw new VibeFrameAdapterError(
      `Estimated cost $${estimate.toFixed(2)} exceeds maxCostUsd $${maxCostUsd.toFixed(2)}.`,
      "MAX_COST_EXCEEDED",
      409,
      { estimatedCostUsd: estimate, maxCostUsd },
    );
  }
}

function findEstimatedCost(value: unknown, depth = 0): number | undefined {
  if (depth > 8 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const values = value.map((item) => findEstimatedCost(item, depth + 1)).filter((item): item is number => item !== undefined);
    return values.length ? values.reduce((total, item) => total + item, 0) : undefined;
  }
  if (typeof value !== "object") return undefined;
  const object = value as JsonObject;
  for (const key of ["estimatedCostUsd", "costUsd", "totalCostUsd"]) {
    const candidate = object[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  const nested = Object.values(object)
    .map((item) => findEstimatedCost(item, depth + 1))
    .filter((item): item is number => item !== undefined);
  return nested.length ? nested.reduce((total, item) => total + item, 0) : undefined;
}

function addStringFlag(args: string[], flag: string, value?: string): void {
  if (value !== undefined) args.push(flag, value);
}

function addSimpleIdFlag(args: string[], flag: string, value?: string): void {
  if (value === undefined) return;
  if (!SIMPLE_ID_PATTERN.test(value)) throw new VibeFrameAdapterError(`${flag} value is invalid.`, "VALIDATION_ERROR", 400);
  args.push(flag, value);
}

function addEnumFlag(args: string[], flag: string, value?: string): void {
  if (value !== undefined) args.push(flag, value);
}

function addNumberFlag(args: string[], flag: string, value?: number): void {
  if (value !== undefined) args.push(flag, String(value));
}

function addEnumNumberFlag(args: string[], flag: string, value?: number): void {
  addNumberFlag(args, flag, value);
}

function addBooleanFlag(args: string[], flag: string, value?: boolean): void {
  if (value === true) args.push(flag);
}

function addPathFlag(args: string[], flag: string, projectRoot: string, value?: string): void {
  if (value !== undefined) args.push(flag, resolveProjectPath(projectRoot, value));
}

function defaultMusicProvider(): "replicate" | undefined {
  return process.env.REPLICATE_API_TOKEN ? "replicate" : undefined;
}

function assertJobId(jobId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new VibeFrameAdapterError("Invalid job id.", "INVALID_JOB_ID", 400);
}

function appendBounded(current: Buffer, chunk: Buffer, overflow: () => void): Buffer {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  const remaining = MAX_CAPTURE_BYTES - current.length;
  if (chunk.length > remaining) {
    overflow();
    return Buffer.concat([current, chunk.subarray(0, remaining)]);
  }
  return Buffer.concat([current, chunk]);
}

function parseJson(text: string): unknown | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as JsonObject;
  for (const key of ["message", "error"]) {
    if (typeof object[key] === "string") return redactText(object[key] as string);
  }
  if (object.data && typeof object.data === "object") return extractErrorMessage(object.data);
  return undefined;
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  child.kill("SIGTERM");
  const forceTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  forceTimer.unref();
}

async function writeAudit(job: VibeFrameJob): Promise<void> {
  const serialized = `${JSON.stringify(sanitizeJob(job))}\n`;
  await mkdir(AUDIT_ROOT, { recursive: true });
  await appendFile(AUDIT_FILE, serialized, { encoding: "utf8", mode: 0o600 });
}

async function readAuditJobs(): Promise<VibeFrameJob[]> {
  let raw = "";
  try {
    raw = await readFile(AUDIT_FILE, "utf8");
  } catch {
    return [];
  }
  const latest = new Map<string, VibeFrameJob>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const job = JSON.parse(line) as VibeFrameJob;
      if (job?.id) latest.set(job.id, job);
    } catch {
      // Preserve the valid append-only history even if a crash left one partial line.
    }
  }
  return [...latest.values()].slice(-MAX_AUDIT_JOBS);
}

function sanitizeJob(job: VibeFrameJob): VibeFrameJob {
  return sanitizeValue({ ...job }) as VibeFrameJob;
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (depth > 12) return "[TRUNCATED]";
  if (/^(api[-_]?key|token|secret|authorization|password)$/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject).map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey, depth + 1)]));
  }
  return value;
}

function redactText(value: string): string {
  let redacted = value;
  for (const secret of providerSecrets()) {
    if (secret.length >= 8) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

function providerSecrets(): string[] {
  return [
    process.env.REPLICATE_API_TOKEN,
    process.env.FAL_API_KEY,
    process.env.FAL_KEY,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.XAI_API_KEY,
    process.env.RUNWAY_API_SECRET,
    process.env.KLING_API_KEY,
    process.env.ELEVENLABS_API_KEY,
    process.env.IMGBB_API_KEY,
  ].filter((value): value is string => Boolean(value));
}
