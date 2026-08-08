import Replicate from "replicate";

// ── Replicate adapter for OPAIJA pipeline ───────────────────────────────────
// Uses LTX-Video for video generation (~$0.05/clip vs $1.22 on fal Seedance)
// Uses Flux on Replicate for still-frame generation (~$0.003/image)

type ReplicateModelId = `${string}/${string}` | `${string}/${string}:${string}`;

export type ReplicateImageModel = {
  id: string;
  label: string;
  notes: string;
  isDefault: boolean;
  useCase: "no_reference" | "one_reference" | "multi_reference" | "all";
};

const REPLICATE_IMAGE_MODEL_NO_REFERENCE = normalizeReplicateModel(
  process.env.REPLICATE_IMAGE_MODEL_NO_REFERENCE?.trim()
  || process.env.REPLICATE_IMAGE_MODEL_DEFAULT?.trim()
  || "black-forest-labs/flux-kontext-pro",
);
const REPLICATE_IMAGE_MODEL_ONE_REFERENCE = normalizeReplicateModel(
  process.env.REPLICATE_IMAGE_MODEL_ONE_REFERENCE?.trim()
  || "black-forest-labs/flux-kontext-pro",
);
const REPLICATE_IMAGE_MODEL_MULTI_REFERENCE = normalizeReplicateModel(
  process.env.REPLICATE_IMAGE_MODEL_MULTI_REFERENCE?.trim()
  || "black-forest-labs/flux-2-pro",
);

function defaultModelCatalog(): ReplicateImageModel[] {
  return [
    {
      id: "black-forest-labs/flux-kontext-pro",
      label: "Flux Kontext Pro",
      notes: "Best balance for storyboard quality and stable character retention.",
      isDefault: true,
      useCase: "all",
    },
    {
      id: "black-forest-labs/flux-2-pro",
      label: "Flux 2 Pro",
      notes: "Strong multi-reference composition, best when multiple character references are required.",
      isDefault: false,
      useCase: "multi_reference",
    },
    {
      id: "black-forest-labs/flux-dev",
      label: "Flux Dev",
      notes: "Budget-friendly fallback for rough concepts and quick proofs.",
      isDefault: false,
      useCase: "all",
    },
  ];
}

function normalizeReplicateModel(model?: string): ReplicateModelId {
  const candidate = (model ?? "black-forest-labs/flux-kontext-pro").trim();
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?::[a-zA-Z0-9._-]+)?$/.test(candidate)) {
    return candidate as ReplicateModelId;
  }
  return "black-forest-labs/flux-kontext-pro" as ReplicateModelId;
}

export function getReplicateImageModel(referenceImageCount: number) {
  if (referenceImageCount > 1) return normalizeReplicateModel(REPLICATE_IMAGE_MODEL_MULTI_REFERENCE);
  if (referenceImageCount === 1) return normalizeReplicateModel(REPLICATE_IMAGE_MODEL_ONE_REFERENCE);
  return normalizeReplicateModel(REPLICATE_IMAGE_MODEL_NO_REFERENCE);
}

export function getReplicateImageModelDefaults() {
  return {
    noReference: REPLICATE_IMAGE_MODEL_NO_REFERENCE,
    oneReference: REPLICATE_IMAGE_MODEL_ONE_REFERENCE,
    multiReference: REPLICATE_IMAGE_MODEL_MULTI_REFERENCE,
  };
}

export function getReplicateImageModelCatalog(): ReplicateImageModel[] {
  const catalog = defaultModelCatalog();
  const overrideMap = new Map<string, ReplicateImageModel>();
  for (const model of catalog) {
    if (!model.isDefault) continue;
    overrideMap.set(model.id, { ...model });
  }

  const configured = [
    REPLICATE_IMAGE_MODEL_NO_REFERENCE,
    REPLICATE_IMAGE_MODEL_ONE_REFERENCE,
    REPLICATE_IMAGE_MODEL_MULTI_REFERENCE,
  ];
  for (const configuredModel of configured) {
    const hasCatalogEntry = catalog.some((entry) => entry.id === configuredModel);
    if (!hasCatalogEntry) {
      overrideMap.set(configuredModel, {
        id: configuredModel,
        label: `${configuredModel} (custom)`,
        notes: "Configured through environment override.",
        isDefault: false,
        useCase: "all",
      });
    }
  }

  return [...catalog, ...overrideMap.values()].filter((entry, index, items) => items.findIndex((candidate) => candidate.id === entry.id) === index);
}

function getClient(): Replicate {
  const token = getReplicateToken();
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN not configured on server. Get one at replicate.com/account/api-tokens");
  }
  return new Replicate({ auth: token });
}

function getReplicateToken(): string {
  return process.env.REPLICATE_API_TOKEN?.trim() ?? "";
}

// ── Still-frame generation (replaces fal Flux in Shot Lab) ──────────────────

export async function generateStillFrame(opts: {
  prompt: string;
  count?: number;
}): Promise<{ urls: string[] }> {
  const client = getClient();
  const count = Math.min(Math.max(opts.count ?? 2, 1), 4);
  const urls: string[] = [];
  const model = normalizeReplicateModel(REPLICATE_IMAGE_MODEL_NO_REFERENCE);

  for (let i = 0; i < count; i++) {
  const output = (await client.run(model, {
      input: {
        prompt: opts.prompt,
        aspect_ratio: "16:9",
        output_format: "png",
        output_quality: 90,
        num_outputs: 1,
      },
    })) as unknown;

    // Flux returns a single URL string or array of URLs
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url === "string") {
      urls.push(url);
    } else {
      throw new Error(`Flux returned unexpected output for candidate ${i + 1}`);
    }
  }

  return { urls };
}

export async function generateStillFrameFile(opts: {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  referenceImageBuffer?: Buffer;
  referenceImageBuffers?: Buffer[];
  modelOverride?: string | null;
}): Promise<{ buffer: Buffer; model: string }> {
  const client = getClient();
  const referenceImageBuffers = (opts.referenceImageBuffers?.length
    ? opts.referenceImageBuffers
    : opts.referenceImageBuffer
      ? [opts.referenceImageBuffer]
      : []).slice(0, 8);
  const model = normalizeReplicateModel(opts.modelOverride ?? undefined);
  const input: Record<string, unknown> = referenceImageBuffers.length > 1
    ? {
        prompt: opts.prompt,
        input_images: referenceImageBuffers.map((buffer) => `data:image/png;base64,${buffer.toString("base64")}`),
        aspect_ratio: opts.aspectRatio ?? "2:3",
        resolution: "2 MP",
        output_format: "png",
        safety_tolerance: 2,
        prompt_upsampling: false,
      }
    : referenceImageBuffers.length === 1
      ? {
        prompt: opts.prompt,
        input_image: `data:image/png;base64,${referenceImageBuffers[0].toString("base64")}`,
        aspect_ratio: opts.aspectRatio ?? "2:3",
        output_format: "png",
        safety_tolerance: 2,
        prompt_upsampling: true,
      }
      : {
        prompt: opts.prompt,
        aspect_ratio: opts.aspectRatio ?? "2:3",
        output_format: "png",
        output_quality: 95,
        num_outputs: 1,
      };
  const output = (await client.run(model, {
    input,
  })) as unknown;

  const candidate = Array.isArray(output) ? output[0] : output;
  if (!candidate) throw new Error("Flux returned no artwork file.");

  if (typeof candidate === "string") {
    const response = await fetch(candidate);
    if (!response.ok) throw new Error(`Unable to download generated artwork (${response.status}).`);
    return { buffer: Buffer.from(await response.arrayBuffer()), model };
  }

  if (candidate instanceof Uint8Array) {
    return { buffer: Buffer.from(candidate), model };
  }

  if (typeof candidate === "object" && "blob" in candidate && typeof candidate.blob === "function") {
    const blob = await candidate.blob();
    return { buffer: Buffer.from(await blob.arrayBuffer()), model };
  }

  try {
    const response = new Response(candidate as BodyInit);
    return { buffer: Buffer.from(await response.arrayBuffer()), model };
  } catch {
    throw new Error("Flux returned an unsupported artwork payload.");
  }
}

// ── Video generation (replaces fal Seedance) ────────────────────────────────

export type ReplicateVideoResult = {
  requestId: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  cost: number;
};

export async function generateVideo(opts: {
  prompt: string;
  durationSec?: number;
  aspectRatio?: "9:16" | "16:9";
  referenceImageUrl?: string;
  model?: "ltx-video" | "ltx-2.3-pro";
}): Promise<ReplicateVideoResult> {
  const client = getClient();
  const duration = opts.durationSec ?? 5;
  const aspectRatio = opts.aspectRatio ?? "9:16";
  const model = opts.model ?? "ltx-video";

  const modelId =
    model === "ltx-2.3-pro"
      ? "lightricks/ltx-2.3-pro"
      : "lightricks/ltx-video";

  // Build input based on model
  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    duration,
    aspect_ratio: aspectRatio,
  };

  // LTX-Video (v0.9.x) — older API shape
  if (model === "ltx-video") {
    input.video_duration = duration;
    input.width = aspectRatio === "9:16" ? 576 : 768;
    input.height = aspectRatio === "9:16" ? 1024 : 512;
    input.num_frames = Math.min(257, duration * 24 + 1);
    input.guide_scale = 3.5;
    input.negative_prompt = "3d render, photorealistic, realistic skin, sweat, uncanny valley, blurry, low quality, watermark, text overlay";
  }

  // LTX 2.3 Pro — newer API with task-based interface
  if (model === "ltx-2.3-pro") {
    input.task = opts.referenceImageUrl ? "image_to_video" : "text_to_video";
    input.resolution = "1080p";
    input.fps = 24;
    input.generate_audio = false;
    input.camera_motion = "none";
  }

  // Image-to-video: pass reference image as first frame
  if (opts.referenceImageUrl) {
    if (model === "ltx-2.3-pro") {
      input.image = opts.referenceImageUrl;
    } else {
      input.image = opts.referenceImageUrl;
      input.image_end = opts.referenceImageUrl;
    }
  }

  // Submit to Replicate (async — returns a prediction object)
  const prediction = await client.predictions.create({
    model: modelId,
    input,
  });

  // Estimate cost: LTX-Video ~$0.05/clip, LTX-2.3-Pro $0.08/sec
  const cost = model === "ltx-2.3-pro" ? 0.08 * duration : 0.05;

  return {
    requestId: prediction.id,
    status: "queued",
    cost,
  };
}

// ── Poll video job status ───────────────────────────────────────────────────

export async function getVideoStatus(predictionId: string): Promise<{
  status: string;
  videoUrl?: string;
  error?: string;
}> {
  const client = getClient();
  const prediction = await client.predictions.get(predictionId);

  const status = prediction.status; // "starting" | "processing" | "succeeded" | "failed" | "canceled"

  if (status === "succeeded") {
    const output = prediction.output;
    const videoUrl = Array.isArray(output) ? output[0] : output;
    return { status: "completed", videoUrl: typeof videoUrl === "string" ? videoUrl : undefined };
  }

  if (status === "failed" || status === "canceled") {
    return { status: "failed", error: prediction.error?.toString() ?? "Generation failed" };
  }

  return { status: "processing" };
}

// ── Download helper ─────────────────────────────────────────────────────────

export async function downloadVideoBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video (${res.status}) from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Check if Replicate is configured ────────────────────────────────────────

export function isReplicateConfigured(): boolean {
  return Boolean(getReplicateToken());
}

export function getReplicateProvider(): string {
  return getReplicateToken() ? "replicate" : "not-configured";
}
