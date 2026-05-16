import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAssetInventory } from "./assets.js";
import { createBookPacket, type BookPacketInput } from "./bookEngine.js";
import { runClaudeBrainTask, getClaudeBrainProvider, type BrainTaskInput as ClaudeBrainTaskInput } from "./claudeBrain.js";
import {
  readQueue,
  updateEpisodeStatus,
  saveEpisodeScript,
  readContentLog,
  logPublishedContent,
  readCanon,
  type EpisodeStatus,
} from "./episodes.js";
import {
  captureLead,
  createGrowthCampaign,
  getGrowthSummary,
  getLeaderboard,
  listLeads,
  trackReferralClick,
  type FanLeadInput,
  type GrowthCampaignInput,
} from "./growth.js";
import { addJob, listJobs, updateJob, getJob } from "./jobStore.js";
import { createMerchDraft, type MerchProductInput } from "./merch.js";
import { getBrainModel, getBrainProvider, runBrainTask, type BrainTaskInput } from "./openaiBrain.js";
import {
  createVideoJob,
  getFalJobResult,
  getFalJobStatus,
  getProvider,
  type VideoJobInput,
} from "./seedance.js";
import { createVoiceover, getVoiceProvider, type VoiceJobInput } from "./voice.js";

dotenv.config();

// Ensure required data directories exist at startup
await mkdir(path.join(process.cwd(), "data", "shared-memory"), { recursive: true }).catch(() => {});
await mkdir(path.join(process.cwd(), "data"), { recursive: true }).catch(() => {});

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: "30mb" }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "..", "dist");

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    brainProvider: getBrainProvider(),
    brainModel: getBrainModel(),
    claudeProvider: getClaudeBrainProvider(),
    provider: getProvider(),
    voiceProvider: getVoiceProvider(),
    keys: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      fal: Boolean(process.env.FAL_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      resend: Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_SEGMENT_ID || process.env.RESEND_AUDIENCE_ID)),
      printful: Boolean(process.env.PRINTFUL_API_KEY),
      printify: Boolean(process.env.PRINTIFY_API_KEY),
    },
    publicSiteUrl: process.env.PUBLIC_SITE_URL ?? "",
    email: {
      provider: "resend",
      configured: Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_SEGMENT_ID || process.env.RESEND_AUDIENCE_ID)),
      from: process.env.RESEND_FROM_EMAIL ?? "",
    },
    seedance: getProvider() === "mock" ? "dry_run" : "configured",
  });
});

app.post("/api/brain/tasks", async (request, response) => {
  try {
    const result = await runBrainTask(request.body as BrainTaskInput);
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to run OpenAI brain task.",
    });
  }
});

app.post("/api/voice/jobs", async (request, response) => {
  try {
    const result = await createVoiceover(request.body as VoiceJobInput);
    response.status(result.status === "dry_run" ? 200 : 201).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create voiceover.",
    });
  }
});

app.post("/api/books/packets", (request, response) => {
  try {
    const packet = createBookPacket(request.body as BookPacketInput);
    response.json(packet);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create book packet.",
    });
  }
});

app.post("/api/merch/drafts", (request, response) => {
  try {
    const draft = createMerchDraft(request.body as MerchProductInput);
    response.json(draft);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create merch draft.",
    });
  }
});

app.post("/api/growth/leads", async (request, response) => {
  try {
    const lead = await captureLead(request.body as FanLeadInput);
    response.status(201).json(lead);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to capture lead.",
    });
  }
});

app.get("/api/growth/leads", async (_request, response) => {
  try {
    response.json(await listLeads());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to list leads.",
    });
  }
});

app.get("/api/growth/summary", async (_request, response) => {
  try {
    response.json(await getGrowthSummary());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load growth summary.",
    });
  }
});

app.get("/api/growth/leaderboard", async (_request, response) => {
  try {
    response.json(await getLeaderboard());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load leaderboard.",
    });
  }
});

app.post("/api/growth/referrals/:code/click", async (request, response) => {
  try {
    response.json(await trackReferralClick(request.params.code));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to track referral click.",
    });
  }
});

app.post("/api/growth/campaigns", (request, response) => {
  try {
    const campaign = createGrowthCampaign(request.body as GrowthCampaignInput);
    response.json(campaign);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create growth campaign.",
    });
  }
});

app.post("/api/video/jobs", async (request, response) => {
  try {
    const input = request.body as VideoJobInput & { episodeId?: string; label?: string };
    const job = await createVideoJob(input);
    const storedJob = await addJob({
      type: "video",
      label: input.label ?? `Video: ${input.prompt?.slice(0, 60) ?? "untitled"}`,
      status: job.status === "dry_run" ? "dry_run" : "queued",
      provider: job.provider,
      modelId: job.modelId,
      requestId: job.requestId,
      episodeId: input.episodeId,
    });
    // Always return { requestId, status, provider, modelId, jobId } for consistent frontend contract
    response.status(job.status === "dry_run" ? 200 : 202).json({
      requestId: job.requestId,
      status: job.status,
      provider: job.provider,
      modelId: job.modelId,
      jobId: storedJob.id,
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create video job.",
    });
  }
});

app.get("/api/video/jobs/:requestId/status", async (request, response) => {
  try {
    const modelId = requireModelId(request.query.modelId);
    const status = await getFalJobStatus(modelId, request.params.requestId);
    response.json(status);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to fetch video status.",
    });
  }
});

app.get("/api/video/jobs/:requestId/result", async (request, response) => {
  try {
    const modelId = requireModelId(request.query.modelId);
    const result = await getFalJobResult(modelId, request.params.requestId);
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to fetch video result.",
    });
  }
});

// ── CLAUDE BRAIN ROUTES ──────────────────────────────────────────────────────
app.post("/api/claude/tasks", async (request, response) => {
  try {
    const input = request.body as ClaudeBrainTaskInput & { episodeId?: string };
    const result = await runClaudeBrainTask(input);
    await addJob({
      type: result.status === "dry_run" ? "brain" : "script",
      label: `${input.task}: ${input.brief?.slice(0, 60) ?? ""}`,
      status: result.status === "completed" ? "completed" : result.status === "dry_run" ? "dry_run" : "failed",
      provider: result.provider ?? "anthropic",
      episodeId: input.episodeId,
      outputText: result.output?.slice(0, 500),
    });
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to run Claude brain task.",
    });
  }
});

// ── EPISODE PRODUCTION ROUTES ─────────────────────────────────────────────────
app.get("/api/episodes", async (_request, response) => {
  try {
    response.json(await readQueue());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not read episode queue." });
  }
});

app.patch("/api/episodes/:id/status", async (request, response) => {
  try {
    const { status } = request.body as { status: EpisodeStatus };
    if (!status) throw new Error("status is required.");
    response.json(await updateEpisodeStatus(request.params.id, status));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update episode status." });
  }
});

app.post("/api/episodes/:id/generate-script", async (request, response) => {
  try {
    const queue = await readQueue();
    const episode = queue.episodes.find((ep) => ep.id === request.params.id);
    if (!episode) {
      response.status(404).json({ error: `Episode ${request.params.id} not found.` });
      return;
    }

    const result = await runClaudeBrainTask({
      task: "episode-script",
      brief: `Generate full production script for ${episode.id}: ${episode.title}`,
      episodeContext: {
        episodeId: episode.id,
        title: episode.title,
        hook: episode.hook,
        conflict: episode.conflict,
        reveal: episode.reveal,
        escalation: episode.escalation,
        cliffhanger: episode.cliffhanger,
        doublesMoment: episode.doubles_moment,
        characters: episode.characters,
        location: episode.location,
        island: episode.island,
        villainPresence: episode.villain_presence,
        existingNarratorScript: episode.narrator_script,
      },
    });

    // Normalize response shape: always { status, output, episodeId }
    let normalizedStatus: "completed" | "dry_run" | "failed" = "dry_run";
    let normalizedOutput = "";

    if (result.status === "completed" && result.output) {
      normalizedStatus = "completed";
      normalizedOutput = result.output;
      await saveEpisodeScript(episode.id, result.output);
    } else if (result.status === "dry_run") {
      normalizedStatus = "dry_run";
      normalizedOutput = `[DRY RUN] No ANTHROPIC_API_KEY set. Script for ${episode.id}: ${episode.title} would be generated here.`;
    } else {
      normalizedStatus = "failed";
      normalizedOutput = (result as { output?: string }).output ?? "Script generation returned no output.";
    }

    response.json({ status: normalizedStatus, output: normalizedOutput, episodeId: episode.id });
  } catch (error) {
    response.status(400).json({
      status: "failed",
      output: error instanceof Error ? error.message : "Script generation failed.",
      episodeId: request.params.id,
    });
  }
});

app.post("/api/episodes/:id/script", async (request, response) => {
  try {
    const { script, qaPass } = request.body as { script: string; qaPass?: boolean };
    if (!script?.trim()) throw new Error("script is required.");
    response.json(await saveEpisodeScript(request.params.id, script, qaPass));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not save script." });
  }
});

app.get("/api/episodes/:id/jobs", async (request, response) => {
  try {
    const allJobs = await listJobs(200);
    const episodeJobs = allJobs.filter((j) => j.episodeId === request.params.id);
    response.json(episodeJobs);
  } catch (error) {
    response.status(500).json({ error: "Could not get episode jobs." });
  }
});

// ── CANON ROUTES ──────────────────────────────────────────────────────────────
app.get("/api/canon", async (_request, response) => {
  try {
    response.json(await readCanon());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not read canon." });
  }
});

// ── CONTENT LOG ROUTES ────────────────────────────────────────────────────────
app.get("/api/content-log", async (_request, response) => {
  try {
    response.json(await readContentLog());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not read content log." });
  }
});

app.post("/api/content-log", async (request, response) => {
  try {
    const entry = request.body as { episodeId: string; platform: string; url?: string };
    if (!entry.episodeId || !entry.platform) throw new Error("episodeId and platform are required.");
    response.json(await logPublishedContent(entry));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not log content." });
  }
});

// ── ASSET STORAGE ROUTES ──────────────────────────────────────────────────────
// TODO: This scan can be slow on large asset trees. Consider adding an in-memory
// cache with a short TTL (e.g. 30s) keyed by mtime of public/assets/ to avoid
// repeated filesystem walks on rapid dashboard refreshes.
app.get("/api/assets", async (_request, response) => {
  try {
    response.json(await getAssetInventory());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not scan assets." });
  }
});

// ── JOB TRACKING ROUTES ───────────────────────────────────────────────────────
app.get("/api/jobs", async (request, response) => {
  try {
    const limit = Number(request.query.limit ?? 50);
    response.json(await listJobs(limit));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not list jobs." });
  }
});

app.get("/api/jobs/:id", async (request, response) => {
  try {
    const job = await getJob(request.params.id);
    if (!job) { response.status(404).json({ error: "Job not found." }); return; }
    response.json(job);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not get job." });
  }
});

app.post("/api/jobs/:id/poll", async (request, response) => {
  try {
    const job = await getJob(request.params.id);
    if (!job || !job.requestId || !job.modelId) {
      response.status(404).json({ error: "Job not found or not pollable." });
      return;
    }
    const status = await getFalJobStatus(job.modelId, job.requestId);
    const falStatus = (status as { status?: string }).status ?? "IN_QUEUE";
    const mapped = falStatus === "COMPLETED" ? "completed" : falStatus === "FAILED" ? "failed" : "processing";
    const updated = await updateJob(job.id, { status: mapped, completedAt: mapped === "completed" ? new Date().toISOString() : undefined });
    response.json({ falStatus, job: updated });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not poll job." });
  }
});

app.use(express.static(distPath));

app.get("*", (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Opaija API listening on http://localhost:${port}`);
});

function requireModelId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("modelId query parameter is required.");
  }
  return value;
}
