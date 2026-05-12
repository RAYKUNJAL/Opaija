import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBookPacket, type BookPacketInput } from "./bookEngine.js";
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
    provider: getProvider(),
    voiceProvider: getVoiceProvider(),
    keys: {
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
    const job = await createVideoJob(request.body as VideoJobInput);
    response.status(job.status === "dry_run" ? 200 : 202).json(job);
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
