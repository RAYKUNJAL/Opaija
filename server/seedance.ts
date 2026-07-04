import { readFile } from "node:fs/promises";
import path from "node:path";

import { fal } from "@fal-ai/client";

export type VideoMode = "text-to-video" | "image-to-video" | "reference-to-video";
export type VideoProvider = "mock" | "fal" | "byteplus";

export type VideoJobInput = {
  mode?: VideoMode;
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  endImageUrl?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  duration?: "auto" | `${number}`;
  resolution?: "480p" | "720p" | "1080p";
  aspectRatio?: "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  generateAudio?: boolean;
  fast?: boolean;
  seed?: number;
  endUserId?: string;
  webhookUrl?: string;
};

export type VideoJobResponse = {
  provider: VideoProvider;
  modelId: string;
  requestId: string;
  status: "queued" | "dry_run";
  input: Record<string, unknown>;
};

const DEFAULT_DURATION = "5";
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_ASPECT_RATIO = "9:16";

export function getProvider(): VideoProvider {
  const provider = process.env.VIDEO_PROVIDER?.toLowerCase() ?? "mock";
  if (provider === "fal" || provider === "byteplus" || provider === "mock") return provider;
  return "mock";
}

export async function createVideoJob(input: VideoJobInput): Promise<VideoJobResponse> {
  const provider = getProvider();
  const normalized = normalizeInput(input);

  if (provider === "fal") {
    return createFalJob(normalized);
  }

  if (provider === "byteplus") {
    throw new Error(
      "BytePlus Seedance 2.0 is configured as a future adapter. Use VIDEO_PROVIDER=fal for the current documented US-friendly route, or add your approved BytePlus video endpoint details.",
    );
  }

  return {
    provider: "mock",
    modelId: resolveFalModelId(normalized),
    requestId: `mock-${Date.now()}`,
    status: "dry_run",
    input: toFalInput(normalized),
  };
}

export async function getFalJobStatus(modelId: string, requestId: string) {
  ensureFalConfigured();
  return fal.queue.status(modelId, {
    requestId,
    logs: true,
  });
}

export async function getFalJobResult(modelId: string, requestId: string) {
  ensureFalConfigured();
  return fal.queue.result(modelId, {
    requestId,
  });
}

function normalizeInput(input: VideoJobInput): Required<Pick<VideoJobInput, "prompt">> & VideoJobInput {
  if (!input.prompt?.trim()) {
    throw new Error("A video prompt is required.");
  }

  const mode = input.mode ?? (input.imageUrl ? "image-to-video" : "text-to-video");

  if (mode === "image-to-video" && !input.imageUrl) {
    throw new Error("imageUrl is required for image-to-video jobs.");
  }

  return {
    ...input,
    mode,
    prompt: input.prompt.trim(),
    duration: input.duration ?? DEFAULT_DURATION,
    resolution: input.resolution ?? DEFAULT_RESOLUTION,
    aspectRatio: input.aspectRatio ?? DEFAULT_ASPECT_RATIO,
    generateAudio: input.generateAudio ?? true,
    fast: input.fast ?? true,
  };
}

async function createFalJob(input: Required<Pick<VideoJobInput, "prompt">> & VideoJobInput): Promise<VideoJobResponse> {
  ensureFalConfigured();
  const modelId = resolveFalModelId(input);
  const falInput = toFalInput(input);
  const response = await fal.queue.submit(modelId, {
    input: falInput,
    webhookUrl: input.webhookUrl,
  });

  const requestId = response.request_id;
  if (!requestId) {
    throw new Error("fal did not return a request id.");
  }

  return {
    provider: "fal",
    modelId,
    requestId,
    status: "queued",
    input: falInput,
  };
}

function resolveFalModelId(input: VideoJobInput): string {
  if (process.env.SEEDANCE_DEFAULT_MODEL && !input.mode) {
    return process.env.SEEDANCE_DEFAULT_MODEL;
  }

  const speedSegment = input.fast === false ? "" : "/fast";
  const mode = input.mode ?? "image-to-video";
  return `bytedance/seedance-2.0${speedSegment}/${mode}`;
}

function toFalInput(input: VideoJobInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.duration,
    resolution: input.resolution,
    aspect_ratio: input.aspectRatio,
    generate_audio: input.generateAudio,
  };

  // Forward negative prompt to fal.ai (Seedance 2.0 supports negative_prompt
  // for steering away from artifacts, jitter, distortion, watermarks, etc.).
  // Only include if non-empty to avoid sending null payload fields.
  const negative = input.negativePrompt?.trim();
  if (negative) payload.negative_prompt = negative;

  if (input.imageUrl) payload.image_url = input.imageUrl;
  if (input.endImageUrl) payload.end_image_url = input.endImageUrl;
  if (input.seed) payload.seed = input.seed;
  if (input.endUserId) payload.end_user_id = input.endUserId;

  if (input.mode === "reference-to-video") {
    payload.image_urls = input.referenceImageUrls ?? [];
    payload.video_urls = input.referenceVideoUrls ?? [];
    payload.audio_urls = input.referenceAudioUrls ?? [];
  }

  return payload;
}

function ensureFalConfigured() {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error("FAL_KEY is missing. Set it in .env before creating live Seedance jobs.");
  }
  fal.config({ credentials: key });
}

// === Character-Sheet Wiring === fal.ai's image-to-video endpoint accepts
// either an HTTPS URL or a data URI for `image_url`. The user's locked PNG
// character sheets live on local disk, so we base64-encode them and inline as
// `data:image/png;base64,*`. Exported so the produce.ts orchestrator and any
// future server-side route handlers (e.g. POST /api/video/jobs with a local
// asset path) can share the same helper.
export async function localFileToDataUri(absPath: string): Promise<string> {
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
