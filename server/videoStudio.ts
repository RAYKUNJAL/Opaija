import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";
import ffmpegPath from "ffmpeg-static";
import OpenAI from "openai";
import { getVideoPromptStoryLock, readQueue } from "./episodes.js";

type SceneStatus = "draft" | "preflight_blocked" | "ready_to_render" | "rendering" | "needs_review" | "approved";

export type VideoResolution = "480p" | "720p" | "1080p" | "4k";
export type VideoAspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "9:21" | "adaptive";

export type VideoModelDefinition = {
  id: string;
  name: string;
  provider: "replicate";
  description: string;
  durations: { min: number; max: number; values?: number[] };
  resolutions: VideoResolution[];
  aspectRatios: VideoAspectRatio[];
  nativeAudio: boolean;
  defaultResolution: VideoResolution;
  defaultAspectRatio: VideoAspectRatio;
  defaultAudio: boolean;
  pricing: { unit: "per_second"; nonVideoInputPerSecond: Partial<Record<VideoResolution, number>> };
};

export const DEFAULT_VIDEO_MODEL_ID = "bytedance/seedance-2.0";
export const LTX_VIDEO_MODEL_ID = "lightricks/ltx-2.3-pro";

export const videoModelCatalog: VideoModelDefinition[] = [
  {
    id: DEFAULT_VIDEO_MODEL_ID,
    name: "Seedance 2.0",
    provider: "replicate",
    description: "Default multimodal video engine with first-frame guidance and synchronized native audio.",
    durations: { min: 1, max: 15 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21", "adaptive"],
    nativeAudio: true,
    defaultResolution: "720p",
    defaultAspectRatio: "9:16",
    defaultAudio: true,
    pricing: { unit: "per_second", nonVideoInputPerSecond: { "480p": 0.08, "720p": 0.18, "1080p": 0.45, "4k": 1 } },
  },
  {
    id: LTX_VIDEO_MODEL_ID,
    name: "LTX 2.3 Pro",
    provider: "replicate",
    description: "Fallback video engine retained for the existing six, eight and ten second workflow.",
    durations: { min: 6, max: 10, values: [6, 8, 10] },
    resolutions: ["1080p"],
    aspectRatios: ["16:9", "9:16"],
    nativeAudio: false,
    defaultResolution: "1080p",
    defaultAspectRatio: "9:16",
    defaultAudio: false,
    pricing: { unit: "per_second", nonVideoInputPerSecond: { "1080p": 0.08 } },
  },
];

export function getVideoModelDefinition(modelId: string) {
  const model = videoModelCatalog.find((item) => item.id === modelId);
  if (!model) throw new Error(`Unsupported video model: ${modelId}.`);
  return model;
}

export function validateVideoSelection(input: { modelId: string; durationSec: number; resolution: VideoResolution; aspectRatio: VideoAspectRatio; generateAudio: boolean }) {
  const model = getVideoModelDefinition(input.modelId);
  const errors: string[] = [];
  if (!Number.isInteger(input.durationSec) || input.durationSec < model.durations.min || input.durationSec > model.durations.max) {
    errors.push(`${model.name} duration must be a whole number from ${model.durations.min} to ${model.durations.max} seconds.`);
  }
  if (model.durations.values && !model.durations.values.includes(input.durationSec)) errors.push(`${model.name} duration must be ${model.durations.values.join(", ")} seconds.`);
  if (!model.resolutions.includes(input.resolution)) errors.push(`${model.name} does not support ${input.resolution}.`);
  if (!model.aspectRatios.includes(input.aspectRatio)) errors.push(`${model.name} does not support ${input.aspectRatio}.`);
  if (input.generateAudio && !model.nativeAudio) errors.push(`${model.name} does not support native audio.`);
  return { model, errors };
}

export function quoteVideoGeneration(input: { modelId: string; durationSec: number; resolution: VideoResolution; hasVideoInput?: boolean }) {
  if (input.hasVideoInput) throw new Error("Video-input pricing is not configured for this production path.");
  const model = getVideoModelDefinition(input.modelId);
  const perSecond = model.pricing.nonVideoInputPerSecond[input.resolution];
  if (perSecond === undefined) throw new Error(`${model.name} pricing is not configured for ${input.resolution}.`);
  return { amount: Number((input.durationSec * perSecond).toFixed(2)), perSecond, currency: "USD" as const, pricingClass: "non_video_input" as const };
}

export function buildReplicateVideoInput(input: {
  modelId: string;
  prompt: string;
  durationSec: number;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  generateAudio: boolean;
  image?: string;
}) {
  validateVideoSelection(input).errors.forEach((error) => { throw new Error(error); });
  if (input.modelId === DEFAULT_VIDEO_MODEL_ID) {
    return {
      prompt: input.prompt,
      duration: input.durationSec,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      generate_audio: input.generateAudio,
      ...(input.image ? { image: input.image } : {}),
    };
  }
  if (input.modelId === LTX_VIDEO_MODEL_ID) {
    return {
      prompt: input.prompt,
      duration: input.durationSec,
      task: input.image ? "image_to_video" : "text_to_video",
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      fps: 24,
      generate_audio: false,
      camera_motion: "none",
      ...(input.image ? { image: input.image } : {}),
    };
  }
  throw new Error(`No Replicate input adapter is registered for ${input.modelId}.`);
}

type ScenePreflight = {
  score: number;
  pass: boolean;
  blockers: string[];
  warnings: string[];
  estimatedCost: number;
  modelId: string;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  generateAudio: boolean;
  checkedAt: string;
  policyVersion: string;
};

type SceneRevision = {
  id: string;
  operation: "generate" | "retake" | "variation" | "edit" | "extend";
  prompt: string;
  parentRevisionId?: string;
  assetUrl?: string;
  status: "draft" | "quarantined" | "approved";
  qc?: VisionQcResult;
  createdAt: string;
};

export type VideoRemixSourceProvenance = {
  remixProjectId: string;
  sourceProjectId?: string;
  sourceSceneId?: string;
  sourceBeatId?: string;
  sourceMediaType?: "book" | "video" | "image" | "audio" | "mixed";
  sourceLabel?: string;
  [key: string]: unknown;
};

export type VideoRemixBeatInput = {
  id?: string;
  order?: number;
  title?: string;
  action: string;
  dialogueLines?: Array<{ speaker: string; text: string }>;
  narration?: string;
  soundEffect?: string;
  prompt: string;
  negativePrompt?: string;
  characters?: string[];
  setting?: string;
  shotType?: string;
  camera?: string;
  durationSec?: number;
  sourceProvenance?: VideoRemixSourceProvenance;
  sourceArtworkUrl?: string;
  sourceVideoUrl?: string;
  localBookArtworkPath?: string;
};

export type CreateVideoProjectFromRemixInput = {
  name: string;
  worldId?: string;
  sourceEpisodeId?: string;
  templateId?: string;
  directorBrief?: string;
  sourceProvenance: VideoRemixSourceProvenance;
  beats: VideoRemixBeatInput[];
};

export type VideoScene = {
  id: string;
  order: number;
  title: string;
  storyBeat: string;
  shotType: string;
  camera: string;
  durationSec: number;
  videoModelId: string;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  generateAudio: boolean;
  characters: string[];
  location: string;
  dialogue: Array<{ speaker: string; text: string }>;
  prompt: string;
  negativePrompt: string;
  referenceAssetIds: string[];
  startFrameAssetId?: string;
  startFrameName?: string;
  startFrameQc?: VisionQcResult;
  status: SceneStatus;
  preflight?: ScenePreflight;
  revisions: SceneRevision[];
  selectedRevisionId?: string;
  sourceProvenance?: VideoRemixSourceProvenance;
  sourceArtworkUrl?: string;
  sourceVideoUrl?: string;
};

export type VideoProject = {
  id: string;
  name: string;
  worldId: string;
  sourceEpisodeId: string;
  templateId: string;
  format: string;
  videoModelId: string;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  generateAudio: boolean;
  fps: number;
  styleProfile: string;
  status: "concept" | "storyboarding" | "generating" | "needs_review" | "ready_to_export";
  directorBrief: string;
  canonLock: {
    enabled: boolean;
    worldBibleVersion: string;
    characterBibleVersion: string;
    combatBibleVersion: string;
  };
  budget: { limit: number; reserved: number; spent: number };
  costLedger?: Array<{ requestId: string; amount: number; status: "reserved" | "settled" | "released"; createdAt: string; updatedAt: string }>;
  scenes: VideoScene[];
  createdAt: string;
  updatedAt: string;
  sourceProvenance?: VideoRemixSourceProvenance;
};

type StudioData = { version: number; projects: VideoProject[] };

type VisionQcResult = {
  score: number;
  pass: boolean;
  blockers: string[];
  findings: string[];
  summary: string;
  checkedAt: string;
  policyVersion: string;
};

const studioDir = path.join(process.cwd(), "data", "video-studio");
const studioPath = path.join(studioDir, "projects.json");
const uploadDir = path.join(studioDir, "uploads");
const POLICY_VERSION = "creative-qc-v3-video-model-registry";
const runFfmpeg = promisify(execFile);
const bundledFfmpegPath = typeof ffmpegPath === "string" ? ffmpegPath : (ffmpegPath as unknown as { default?: string }).default;

const templates = [
  { id: "episode", name: "Anime Episode", description: "Canon-led scenes, dialogue, action and continuity.", duration: "60-90 sec", icon: "clapperboard" },
  { id: "trailer", name: "Film Trailer", description: "High-impact hooks, reveals and a final title beat.", duration: "30-60 sec", icon: "sparkles" },
  { id: "micro-drama", name: "Micro Drama", description: "Dialogue-first vertical story with a sharp turn.", duration: "45-90 sec", icon: "message" },
  { id: "music-video", name: "Music Video", description: "Beat-matched scenes, performance and rhythmic effects.", duration: "30-180 sec", icon: "music" },
  { id: "book-trailer", name: "Book Trailer", description: "Turn approved book panels into a moving campaign asset.", duration: "15-45 sec", icon: "book" },
  { id: "product", name: "Brand Film", description: "Reusable brand kit, product shots and clear calls to action.", duration: "15-60 sec", icon: "badge" },
];

const capabilities = {
  planning: { provider: "OpenAI", enabled: Boolean(process.env.OPENAI_API_KEY) },
  artwork: { provider: "Replicate", enabled: Boolean(process.env.REPLICATE_API_TOKEN) },
  video: { provider: "Replicate Seedance 2.0 + LTX 2.3 Pro", enabled: Boolean(process.env.REPLICATE_API_TOKEN) },
  visionQc: { provider: "OpenAI Vision", enabled: Boolean(process.env.OPENAI_API_KEY), minimumScore: 95 },
  rendering: { provider: "Final assembly planned", enabled: false },
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function defaultNegativePrompt() {
  return [
    "duplicate character", "same face", "same outfit", "merged bodies", "extra limbs", "missing fingers",
    "floating weapon", "detached prop", "spare weapon", "wrong weapon owner", "gibberish text", "watermark",
    "split screen", "contact sheet", "generic fantasy armor", "photorealistic skin", "3d render",
  ].join(", ");
}

function buildPrompt(input: {
  episodeId: string;
  title: string;
  storyBeat: string;
  characters: string[];
  location: string;
  shotType: string;
  camera: string;
}) {
  const cast = input.characters.length ? input.characters.join(" and ") : "the approved cast";
  return [
    `CANON LOCK: ${getVideoPromptStoryLock()}`,
    `EPISODE: ${input.episodeId} - ${input.title}.`,
    `SCENE: ${input.storyBeat}`,
    `CAST: Show exactly ${input.characters.length || 1} named hero character(s): ${cast}. Each character must have a unique face, silhouette, hairstyle, skin tone, outfit palette, gear and power effect matching their own reference sheet. Never clone, merge or swap identities.`,
    `ACTION: clear full-body action with readable weight, contact, eye-lines and hand grips. A weapon must be held by its owner or visibly grounded; no floating, spare or duplicated props.`,
    `CAMERA: ${input.shotType}, ${input.camera}. Preserve screen direction and continuity with adjacent shots.`,
    `SETTING: ${input.location}. Trinidad and Tobago visual specificity, cinematic Caribbean anime, clean hand-drawn ink, controlled cel shading, painterly background, rhythmic action effects.`,
    "OUTPUT: one continuous cinematic shot, no panels, no captions, no speech bubbles, no logos, no generated text.",
  ].join(" ");
}

function sceneFromBeat(
  projectId: string,
  episode: Awaited<ReturnType<typeof readQueue>>["episodes"][number],
  beat: string,
  order: number,
  settings = { videoModelId: DEFAULT_VIDEO_MODEL_ID, resolution: "720p" as VideoResolution, aspectRatio: "9:16" as VideoAspectRatio, generateAudio: true },
): VideoScene {
  const shotTypes = ["wide establishing shot", "low medium action shot", "tight reaction close-up", "tracking combat shot"];
  const camera = ["slow push in", "grounded lateral track", "controlled handheld energy", "fast arc with stable horizon"];
  const sceneId = `${projectId}-scene-${String(order).padStart(2, "0")}`;
  const characters = (episode.characters ?? []).slice(0, order === 1 ? 2 : 3);
  const storyBeat = beat || episode.hook || episode.title;
  return {
    id: sceneId,
    order,
    title: `Scene ${order}`,
    storyBeat,
    shotType: shotTypes[(order - 1) % shotTypes.length],
    camera: camera[(order - 1) % camera.length],
    durationSec: 6,
    videoModelId: settings.videoModelId,
    resolution: settings.resolution,
    aspectRatio: settings.aspectRatio,
    generateAudio: settings.generateAudio,
    characters,
    location: episode.location || "Trinidad",
    dialogue: [],
    prompt: buildPrompt({ episodeId: episode.id, title: episode.title, storyBeat, characters, location: episode.location || "Trinidad", shotType: shotTypes[(order - 1) % shotTypes.length], camera: camera[(order - 1) % camera.length] }),
    negativePrompt: defaultNegativePrompt(),
    referenceAssetIds: characters.map((name) => `character:${slug(name)}`),
    status: "draft",
    revisions: [],
  };
}

async function makeProject(input: { name?: string; episodeId?: string; templateId?: string; brief?: string }): Promise<VideoProject> {
  const queue = await readQueue();
  const episode = queue.episodes.find((item) => item.id === input.episodeId) ?? queue.episodes[0];
  if (!episode) throw new Error("No source episode is available.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const beats = [episode.hook, episode.conflict, episode.reveal, episode.escalation, episode.cliffhanger].filter(Boolean);
  return {
    id,
    name: input.name?.trim() || `${episode.id} - ${episode.title}`,
    worldId: "opaija",
    sourceEpisodeId: episode.id,
    templateId: input.templateId ?? "episode",
    format: "vertical-short",
    videoModelId: DEFAULT_VIDEO_MODEL_ID,
    aspectRatio: "9:16",
    resolution: "720p",
    generateAudio: true,
    fps: 24,
    styleProfile: "OPAIJA Caribbean Anime",
    status: "storyboarding",
    directorBrief: input.brief?.trim() || `${episode.hook} ${episode.conflict}`.trim(),
    canonLock: { enabled: true, worldBibleVersion: "opaija-story-v1", characterBibleVersion: "opaija-character-v1", combatBibleVersion: "opaija-calinda-v1" },
    budget: { limit: 10, reserved: 0, spent: 0 },
    costLedger: [],
    scenes: beats.slice(0, 5).map((beat, index) => sceneFromBeat(id, episode, beat, index + 1)),
    createdAt: now,
    updatedAt: now,
  };
}

async function importBookArtworkStartFrame(input: { projectName: string; sceneOrder: number; localPath?: string }) {
  if (!input.localPath?.trim()) return undefined;
  const workspaceRoot = path.resolve(process.cwd());
  const sourcePath = path.resolve(input.localPath);
  if (!sourcePath.toLowerCase().startsWith(`${workspaceRoot.toLowerCase()}${path.sep}`)) throw new Error("Imported book artwork must be inside the OPAIJA workspace.");
  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile()) throw new Error(`Imported book artwork does not exist: ${input.localPath}`);
  const extension = path.extname(sourcePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error("Imported book artwork must be PNG, JPEG or WebP.");
  await mkdir(uploadDir, { recursive: true });
  const assetId = crypto.randomUUID();
  const normalizedExtension = extension === ".jpeg" ? ".jpg" : extension;
  const readableName = `${slug(input.projectName) || "remix"}-scene-${String(input.sceneOrder).padStart(2, "0")}-start-frame${normalizedExtension}`;
  await copyFile(sourcePath, path.join(uploadDir, `${assetId}${normalizedExtension}`));
  return { assetId, name: readableName, url: `/api/video-studio/assets/${assetId}` };
}

export async function createVideoProjectFromRemix(input: CreateVideoProjectFromRemixInput): Promise<VideoProject> {
  if (!input.name?.trim()) throw new Error("Remix video project name is required.");
  if (!input.sourceProvenance?.remixProjectId?.trim()) throw new Error("Remix source provenance is required.");
  if (!Array.isArray(input.beats) || input.beats.length === 0) throw new Error("At least one ordered Remix beat is required.");
  const orderedBeats = input.beats
    .map((beat, index) => ({ beat, index }))
    .sort((left, right) => (left.beat.order ?? left.index + 1) - (right.beat.order ?? right.index + 1) || left.index - right.index);
  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const scenes: VideoScene[] = [];
  for (const { beat } of orderedBeats) {
    const order = scenes.length + 1;
    const durationSec = Math.max(1, Math.min(15, Math.round(beat.durationSec ?? 6)));
    const importedFrame = await importBookArtworkStartFrame({ projectName: input.name, sceneOrder: order, localPath: beat.localBookArtworkPath });
    const characters = (beat.characters ?? []).map((value) => value.trim()).filter(Boolean);
    const sourceProvenance = { ...input.sourceProvenance, ...(beat.sourceProvenance ?? {}), sourceBeatId: beat.sourceProvenance?.sourceBeatId ?? beat.id ?? `beat-${order}` };
    scenes.push({
      id: `${projectId}-scene-${String(order).padStart(2, "0")}`,
      order,
      title: beat.title?.trim() || `Scene ${order}`,
      storyBeat: beat.action.trim(),
      shotType: beat.shotType?.trim() || "cinematic story shot",
      camera: beat.camera?.trim() || "controlled camera movement",
      durationSec,
      videoModelId: DEFAULT_VIDEO_MODEL_ID,
      resolution: "720p",
      aspectRatio: "9:16",
      generateAudio: true,
      characters,
      location: beat.setting?.trim() || "OPAIJA story world",
      dialogue: (beat.dialogueLines ?? []).map((line) => ({ speaker: line.speaker.trim(), text: line.text.trim() })).filter((line) => line.speaker && line.text),
      prompt: beat.prompt.trim(),
      negativePrompt: beat.negativePrompt?.trim() || defaultNegativePrompt(),
      referenceAssetIds: characters.map((name) => `character:${slug(name)}`),
      startFrameAssetId: importedFrame?.assetId,
      startFrameName: importedFrame?.name,
      status: "draft",
      revisions: [],
      sourceProvenance,
      sourceArtworkUrl: beat.sourceArtworkUrl?.trim() || importedFrame?.url,
      sourceVideoUrl: beat.sourceVideoUrl?.trim() || undefined,
    });
  }
  const project: VideoProject = {
    id: projectId,
    name: input.name.trim(),
    worldId: input.worldId?.trim() || "opaija",
    sourceEpisodeId: input.sourceEpisodeId?.trim() || String(input.sourceProvenance.sourceProjectId ?? input.sourceProvenance.remixProjectId),
    templateId: input.templateId?.trim() || "episode",
    format: "vertical-short",
    videoModelId: DEFAULT_VIDEO_MODEL_ID,
    aspectRatio: "9:16",
    resolution: "720p",
    generateAudio: true,
    fps: 24,
    styleProfile: "OPAIJA Caribbean Anime",
    status: "storyboarding",
    directorBrief: input.directorBrief?.trim() || orderedBeats.map(({ beat }) => beat.action.trim()).filter(Boolean).join(" "),
    canonLock: { enabled: true, worldBibleVersion: "opaija-story-v1", characterBibleVersion: "opaija-character-v1", combatBibleVersion: "opaija-calinda-v1" },
    budget: { limit: 10, reserved: 0, spent: 0 },
    costLedger: [],
    scenes,
    createdAt: now,
    updatedAt: now,
    sourceProvenance: input.sourceProvenance,
  };
  const data = await readStudio();
  data.projects.unshift(project);
  await saveStudio(data);
  return project;
}

export async function listVideoProjectsForRemix(): Promise<VideoProject[]> {
  return (await readStudio()).projects;
}

async function readStudio(): Promise<StudioData> {
  await mkdir(studioDir, { recursive: true });
  try {
    const data = JSON.parse(await readFile(studioPath, "utf8")) as StudioData;
    let migrated = false;
    if (data.version !== 2) {
      data.version = 2;
      migrated = true;
    }
    for (const project of data.projects) {
      project.costLedger ??= [];
      let projectModel = videoModelCatalog.find((item) => item.id === project.videoModelId);
      if (!projectModel) {
        project.videoModelId = DEFAULT_VIDEO_MODEL_ID;
        projectModel = getVideoModelDefinition(DEFAULT_VIDEO_MODEL_ID);
        migrated = true;
      }
      if (!projectModel.resolutions.includes(project.resolution)) {
        project.resolution = projectModel.defaultResolution;
        migrated = true;
      }
      if (!projectModel.aspectRatios.includes(project.aspectRatio)) {
        project.aspectRatio = projectModel.defaultAspectRatio;
        migrated = true;
      }
      if (typeof project.generateAudio !== "boolean" || (project.generateAudio && !projectModel.nativeAudio)) {
        project.generateAudio = projectModel.defaultAudio;
        migrated = true;
      }
      for (const scene of project.scenes) {
        let sceneSettingsMigrated = false;
        let sceneModel = videoModelCatalog.find((item) => item.id === scene.videoModelId);
        if (!sceneModel) {
          scene.videoModelId = project.videoModelId;
          sceneModel = getVideoModelDefinition(scene.videoModelId);
          sceneSettingsMigrated = true;
        }
        if (!sceneModel.resolutions.includes(scene.resolution)) {
          scene.resolution = project.videoModelId === scene.videoModelId && sceneModel.resolutions.includes(project.resolution) ? project.resolution : sceneModel.defaultResolution;
          sceneSettingsMigrated = true;
        }
        if (!sceneModel.aspectRatios.includes(scene.aspectRatio)) {
          scene.aspectRatio = project.videoModelId === scene.videoModelId && sceneModel.aspectRatios.includes(project.aspectRatio) ? project.aspectRatio : sceneModel.defaultAspectRatio;
          sceneSettingsMigrated = true;
        }
        if (typeof scene.generateAudio !== "boolean" || (scene.generateAudio && !sceneModel.nativeAudio)) {
          scene.generateAudio = project.videoModelId === scene.videoModelId ? project.generateAudio : sceneModel.defaultAudio;
          sceneSettingsMigrated = true;
        }
        if (scene.preflight && scene.preflight.policyVersion !== POLICY_VERSION) {
          delete scene.preflight;
          if (scene.status === "ready_to_render") scene.status = "draft";
          migrated = true;
        }
        if (validateVideoSelection({ modelId: scene.videoModelId, durationSec: scene.durationSec, resolution: scene.resolution, aspectRatio: scene.aspectRatio, generateAudio: scene.generateAudio }).errors.some((error) => error.includes("duration"))) {
          scene.durationSec = sceneModel.durations.values?.[0] ?? Math.max(sceneModel.durations.min, Math.min(sceneModel.durations.max, 6));
          delete scene.preflight;
          if (scene.status === "ready_to_render") scene.status = "draft";
          sceneSettingsMigrated = true;
        }
        if (sceneSettingsMigrated) {
          delete scene.preflight;
          if (scene.status === "ready_to_render") scene.status = "draft";
          migrated = true;
        }
      }
    }
    if (migrated) await writeFile(studioPath, JSON.stringify(data, null, 2), "utf8");
    return data;
  } catch {
    const data: StudioData = { version: 2, projects: [await makeProject({})] };
    await writeFile(studioPath, JSON.stringify(data, null, 2), "utf8");
    return data;
  }
}

async function saveStudio(data: StudioData) {
  await mkdir(studioDir, { recursive: true });
  await writeFile(studioPath, JSON.stringify(data, null, 2), "utf8");
}

function findProject(data: StudioData, projectId: string) {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Video project not found.");
  return project;
}

function preflightScene(project: VideoProject, scene: VideoScene): ScenePreflight {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!project.canonLock.enabled) blockers.push("Canon lock must be enabled before a paid render.");
  if (!scene.storyBeat.trim()) blockers.push("Scene story beat is missing.");
  if (!scene.prompt.trim()) blockers.push("Scene prompt is missing.");
  if (!scene.characters.length) blockers.push("At least one named character is required.");
  if (scene.referenceAssetIds.length < scene.characters.length) blockers.push("Every named character needs an explicit reference binding.");
  if (!scene.startFrameAssetId) blockers.push("Upload a clean single-shot start frame before paid generation.");
  if (scene.startFrameAssetId && !scene.startFrameQc?.pass) blockers.push("The selected start frame has not passed vision QC.");
  if (new Set(scene.characters.map((item) => item.toLowerCase())).size !== scene.characters.length) blockers.push("The cast contains a duplicated character identity.");
  if (!scene.location.trim()) blockers.push("Scene location is missing.");
  const selection = validateVideoSelection({ modelId: scene.videoModelId, durationSec: scene.durationSec, resolution: scene.resolution, aspectRatio: scene.aspectRatio, generateAudio: scene.generateAudio });
  blockers.push(...selection.errors);
  const promptLower = scene.prompt.toLowerCase();
  for (const required of ["unique face", "no floating", "no generated text", "canon lock"]) {
    if (!promptLower.includes(required)) warnings.push(`Prompt guardrail is implicit or missing: ${required}.`);
  }
  let estimatedCost = 0;
  try {
    estimatedCost = quoteVideoGeneration({ modelId: scene.videoModelId, durationSec: scene.durationSec, resolution: scene.resolution }).amount;
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "A quote is unavailable for this model configuration.");
  }
  if (project.budget.spent + project.budget.reserved + estimatedCost > project.budget.limit) blockers.push("This render would exceed the project budget.");
  const score = Math.max(0, 100 - blockers.length * 25 - warnings.length * 2);
  return { score, pass: blockers.length === 0 && score >= 95, blockers, warnings, estimatedCost, modelId: scene.videoModelId, resolution: scene.resolution, aspectRatio: scene.aspectRatio, generateAudio: scene.generateAudio, checkedAt: new Date().toISOString(), policyVersion: POLICY_VERSION };
}

function mimeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function normalizeImageSource(source: string) {
  if (/^https?:\/\//i.test(source) || /^data:image\//i.test(source)) return source;
  const candidate = path.resolve(process.cwd(), source.replace(/^\/+/, ""));
  const root = path.resolve(process.cwd());
  if (!candidate.toLowerCase().startsWith(root.toLowerCase())) throw new Error("Frame path is outside the workspace.");
  const buffer = await readFile(candidate);
  return `data:${mimeFor(candidate)};base64,${buffer.toString("base64")}`;
}

async function runVisionQc(project: VideoProject, scene: VideoScene, frameSources: string[]): Promise<VisionQcResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for vision QC.");
  if (!frameSources.length || frameSources.length > 6) throw new Error("Provide between 1 and 6 representative frames.");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const images = await Promise.all(frameSources.map(normalizeImageSource));
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `You are the commercial release vision inspector for ${project.worldId}. Review the frames against this shot contract. Named cast: ${scene.characters.join(", ")}. Location: ${scene.location}. Action: ${scene.storyBeat}. Prompt contract: ${scene.prompt}. Detect missing, duplicated, merged, or identity-swapped characters; same faces or outfits; wrong age, skin, hair, costume, props, powers, or location; extra/missing limbs, broken hands/grips, floating or duplicated weapons; face morphing, temporal flicker, repeated frames, unreadable action, random text, logos, split panels, or other AI slop. A weapon must be visibly held by its owner or grounded. Return strict JSON with score 0-100, blockers string[], findings string[], and summary string. Any critical identity, anatomy, prop, continuity, text, or composition defect is a blocker. A commercial pass requires score at least 95 and zero blockers.`,
    },
    ...images.map((imageUrl) => ({ type: "image_url", image_url: { url: imageUrl, detail: "high" } })),
  ];
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [{ role: "user", content: content as never }],
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}") as Partial<VisionQcResult>;
  const blockers = Array.isArray(parsed.blockers) ? parsed.blockers.map(String) : ["Vision inspector returned an invalid blocker list."];
  const findings = Array.isArray(parsed.findings) ? parsed.findings.map(String) : [];
  const score = Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Number(parsed.score))) : 0;
  return {
    score,
    pass: score >= 95 && blockers.length === 0,
    blockers,
    findings,
    summary: String(parsed.summary ?? "Vision QC completed."),
    checkedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
  };
}

async function extractVideoFrames(videoUrl: string, projectId: string, sceneId: string) {
  if (!/^https?:\/\//i.test(videoUrl)) throw new Error("A public provider video URL is required for video QC.");
  if (!bundledFfmpegPath) throw new Error("The bundled FFmpeg runtime is unavailable.");
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Could not download provider video (${response.status}).`);
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > 100 * 1024 * 1024) throw new Error("Video QC input exceeds the 100 MB safety limit.");
  const qcDir = path.join(studioDir, "qc", projectId, sceneId, crypto.randomUUID());
  await mkdir(qcDir, { recursive: true });
  const inputPath = path.join(qcDir, "candidate.mp4");
  await writeFile(inputPath, Buffer.from(await response.arrayBuffer()));
  const framePattern = path.join(qcDir, "frame-%02d.jpg");
  await runFfmpeg(bundledFfmpegPath, ["-y", "-i", inputPath, "-vf", "fps=1,scale=1280:-2:force_original_aspect_ratio=decrease", "-frames:v", "6", framePattern], { maxBuffer: 8 * 1024 * 1024 });
  const frames = (await readdir(qcDir)).filter((name) => /^frame-\d+\.jpg$/i.test(name)).sort().map((name) => path.join(qcDir, name));
  if (!frames.length) throw new Error("FFmpeg could not extract representative video frames.");
  return frames;
}

export const videoStudioRouter = Router();

export async function reserveVideoSpend(episodeId: string | undefined, label: string, requestId: string, amount: number) {
  if (!episodeId || !Number.isFinite(amount) || amount <= 0) return;
  const data = await readStudio();
  const project = data.projects.find((item) => item.sourceEpisodeId === episodeId && label.startsWith(`${item.name} /`));
  if (!project) return;
  project.costLedger ??= [];
  if (project.costLedger.some((entry) => entry.requestId === requestId)) return;
  const now = new Date().toISOString();
  project.costLedger.push({ requestId, amount, status: "reserved", createdAt: now, updatedAt: now });
  project.budget.reserved = Number((project.budget.reserved + amount).toFixed(2));
  project.updatedAt = now;
  await saveStudio(data);
}

export async function settleVideoSpend(episodeId: string | undefined, label: string, requestId: string, outcome: "completed" | "failed") {
  if (!episodeId) return;
  const data = await readStudio();
  const project = data.projects.find((item) => item.sourceEpisodeId === episodeId && label.startsWith(`${item.name} /`));
  const entry = project?.costLedger?.find((item) => item.requestId === requestId);
  if (!project || !entry || entry.status !== "reserved") return;
  project.budget.reserved = Number(Math.max(0, project.budget.reserved - entry.amount).toFixed(2));
  if (outcome === "completed") project.budget.spent = Number((project.budget.spent + entry.amount).toFixed(2));
  entry.status = outcome === "completed" ? "settled" : "released";
  entry.updatedAt = new Date().toISOString();
  project.updatedAt = entry.updatedAt;
  await saveStudio(data);
}

videoStudioRouter.get("/", async (_request, response) => {
  try {
    response.json({ ...(await readStudio()), templates, capabilities, videoModels: videoModelCatalog, defaultVideoModelId: DEFAULT_VIDEO_MODEL_ID, policy: { minimumPreflightScore: 95, minimumVisionScore: 95, maxPaidRetries: 2, budgetWarningPercent: 70, budgetPausePercent: 90 } });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not load Video Studio." });
  }
});

videoStudioRouter.get("/assets/:assetId", async (request, response) => {
  try {
    if (!/^[a-f0-9-]{36}$/i.test(request.params.assetId)) throw new Error("Invalid asset id.");
    await mkdir(uploadDir, { recursive: true });
    const fileName = (await readdir(uploadDir)).find((name) => name.startsWith(`${request.params.assetId}.`));
    if (!fileName) {
      response.status(404).json({ error: "Start-frame asset not found." });
      return;
    }
    response.sendFile(path.join(uploadDir, fileName));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not load start frame." });
  }
});

videoStudioRouter.post("/projects", async (request, response) => {
  try {
    const data = await readStudio();
    const project = await makeProject(request.body as { name?: string; episodeId?: string; templateId?: string; brief?: string });
    data.projects.unshift(project);
    await saveStudio(data);
    response.status(201).json(project);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not create video project." });
  }
});

videoStudioRouter.patch("/projects/:projectId", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const input = request.body as Partial<Pick<VideoProject, "name" | "directorBrief" | "videoModelId" | "aspectRatio" | "resolution" | "generateAudio" | "fps" | "styleProfile" | "status">> & { budgetLimit?: number; canonLockEnabled?: boolean };
    const nextSelection = {
      modelId: input.videoModelId ?? project.videoModelId,
      durationSec: project.scenes[0]?.durationSec ?? 6,
      resolution: input.resolution ?? project.resolution,
      aspectRatio: input.aspectRatio ?? project.aspectRatio,
      generateAudio: input.generateAudio ?? project.generateAudio,
    };
    const selectionErrors = validateVideoSelection(nextSelection).errors;
    if (selectionErrors.length) throw new Error(selectionErrors.join(" "));
    for (const key of ["name", "directorBrief", "videoModelId", "aspectRatio", "resolution", "generateAudio", "fps", "styleProfile", "status"] as const) {
      if (input[key] !== undefined) (project as Record<string, unknown>)[key] = input[key];
    }
    if (Number.isFinite(input.budgetLimit)) project.budget.limit = Math.max(project.budget.spent, Number(input.budgetLimit));
    if (typeof input.canonLockEnabled === "boolean") project.canonLock.enabled = input.canonLockEnabled;
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.json(project);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update video project." });
  }
});

videoStudioRouter.delete("/projects/:projectId", async (request, response) => {
  try {
    const data = await readStudio();
    const index = data.projects.findIndex((item) => item.id === request.params.projectId);
    if (index < 0) throw new Error("Video project not found.");
    const [removed] = data.projects.splice(index, 1);
    await saveStudio(data);
    response.json({ deleted: removed.id });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not delete video project." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const queue = await readQueue();
    const episode = queue.episodes.find((item) => item.id === project.sourceEpisodeId);
    if (!episode) throw new Error("The source episode for this project no longer exists.");
    const order = project.scenes.length + 1;
    const input = request.body as { storyBeat?: string };
    const scene = sceneFromBeat(project.id, episode, input.storyBeat?.trim() || `New story beat ${order}`, order, {
      videoModelId: project.videoModelId,
      resolution: project.resolution,
      aspectRatio: project.aspectRatio,
      generateAudio: project.generateAudio,
    });
    project.scenes.push(scene);
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.status(201).json(scene);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not add scene." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes/:sceneId/start-frame", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    const input = request.body as { name?: string; dataUrl?: string };
    const match = input.dataUrl?.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("Upload a PNG, JPEG or WebP start frame.");
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw new Error("Start frame must be between 1 byte and 15 MB.");
    await mkdir(uploadDir, { recursive: true });
    const assetId = crypto.randomUUID();
    const extension = match[1] === "jpeg" ? "jpg" : match[1];
    const filePath = path.join(uploadDir, `${assetId}.${extension}`);
    await writeFile(filePath, buffer);
    const qc = await runVisionQc(project, scene, [filePath]);
    scene.startFrameAssetId = assetId;
    scene.startFrameName = input.name?.trim() || `start-frame.${extension}`;
    scene.startFrameQc = qc;
    scene.status = qc.pass ? "draft" : "preflight_blocked";
    delete scene.preflight;
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.status(201).json({ assetId, name: scene.startFrameName, qc, url: `/api/video-studio/assets/${assetId}` });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not inspect start frame." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes/:sceneId/start-frame/recheck", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    if (!scene.startFrameAssetId) throw new Error("No imported start-frame asset is attached to this scene.");
    await mkdir(uploadDir, { recursive: true });
    const fileName = (await readdir(uploadDir)).find((name) => name.startsWith(`${scene.startFrameAssetId}.`) || name.startsWith(`${scene.startFrameAssetId}-`));
    if (!fileName) throw new Error("Imported start-frame asset not found.");
    const qc = await runVisionQc(project, scene, [path.join(uploadDir, fileName)]);
    scene.startFrameQc = qc;
    scene.status = qc.pass ? "draft" : "preflight_blocked";
    delete scene.preflight;
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.json({ assetId: scene.startFrameAssetId, name: scene.startFrameName, qc, url: `/api/video-studio/assets/${scene.startFrameAssetId}` });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not recheck imported start frame." });
  }
});

videoStudioRouter.patch("/projects/:projectId/scenes/:sceneId", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    const input = request.body as Partial<Pick<VideoScene, "title" | "storyBeat" | "shotType" | "camera" | "durationSec" | "videoModelId" | "resolution" | "aspectRatio" | "generateAudio" | "characters" | "location" | "dialogue" | "prompt" | "negativePrompt" | "referenceAssetIds">> & { syncProjectDefaults?: boolean };
    const selectionErrors = validateVideoSelection({
      modelId: input.videoModelId ?? scene.videoModelId,
      durationSec: input.durationSec ?? scene.durationSec,
      resolution: input.resolution ?? scene.resolution,
      aspectRatio: input.aspectRatio ?? scene.aspectRatio,
      generateAudio: input.generateAudio ?? scene.generateAudio,
    }).errors;
    if (selectionErrors.length) throw new Error(selectionErrors.join(" "));
    for (const key of ["title", "storyBeat", "shotType", "camera", "durationSec", "videoModelId", "resolution", "aspectRatio", "generateAudio", "characters", "location", "dialogue", "prompt", "negativePrompt", "referenceAssetIds"] as const) {
      if (input[key] !== undefined) (scene as Record<string, unknown>)[key] = input[key];
    }
    if (input.syncProjectDefaults) {
      project.videoModelId = scene.videoModelId;
      project.resolution = scene.resolution;
      project.aspectRatio = scene.aspectRatio;
      project.generateAudio = scene.generateAudio;
    }
    scene.status = "draft";
    delete scene.preflight;
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.json(scene);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update scene." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes/:sceneId/preflight", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    scene.preflight = preflightScene(project, scene);
    scene.status = scene.preflight.pass ? "ready_to_render" : "preflight_blocked";
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.json(scene.preflight);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not run preflight." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes/:sceneId/revisions", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    const input = request.body as { operation?: SceneRevision["operation"]; prompt?: string; assetUrl?: string };
    const revision: SceneRevision = {
      id: crypto.randomUUID(),
      operation: input.operation ?? "variation",
      prompt: input.prompt?.trim() || scene.prompt,
      parentRevisionId: scene.selectedRevisionId,
      assetUrl: input.assetUrl,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    scene.revisions.push(revision);
    scene.status = "draft";
    scene.selectedRevisionId = revision.id;
    project.updatedAt = revision.createdAt;
    await saveStudio(data);
    response.status(201).json(revision);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not create revision." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes/:sceneId/vision-qc", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    const frameSources = (request.body as { frameSources?: string[] }).frameSources ?? [];
    const result = await runVisionQc(project, scene, frameSources);
    const revision = scene.revisions.find((item) => item.id === scene.selectedRevisionId);
    if (revision) {
      revision.qc = result;
      revision.status = result.pass ? "approved" : "quarantined";
    }
    scene.status = result.pass ? "approved" : "needs_review";
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not run vision QC." });
  }
});

videoStudioRouter.post("/projects/:projectId/scenes/:sceneId/vision-qc-video", async (request, response) => {
  try {
    const data = await readStudio();
    const project = findProject(data, request.params.projectId);
    const scene = project.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) throw new Error("Scene not found.");
    const videoUrl = String((request.body as { videoUrl?: string }).videoUrl ?? "");
    const frames = await extractVideoFrames(videoUrl, project.id, scene.id);
    const result = await runVisionQc(project, scene, frames);
    let revision = scene.revisions.find((item) => item.id === scene.selectedRevisionId);
    if (!revision) {
      revision = { id: crypto.randomUUID(), operation: "generate", prompt: scene.prompt, assetUrl: videoUrl, status: "draft", createdAt: new Date().toISOString() };
      scene.revisions.push(revision);
      scene.selectedRevisionId = revision.id;
    }
    revision.assetUrl = videoUrl;
    revision.qc = result;
    revision.status = result.pass ? "approved" : "quarantined";
    scene.status = result.pass ? "approved" : "needs_review";
    project.status = result.pass && project.scenes.every((item) => item.status === "approved") ? "ready_to_export" : result.pass ? "storyboarding" : "needs_review";
    project.updatedAt = new Date().toISOString();
    await saveStudio(data);
    response.json({ ...result, framesInspected: frames.length, revisionId: revision.id });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not inspect video frames." });
  }
});
