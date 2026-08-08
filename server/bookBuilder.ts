import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import {
  generateStillFrameFile,
  getReplicateImageModelCatalog,
  isReplicateConfigured,
  getReplicateImageModel,
  type ReplicateImageModel,
} from "./replicate.js";
import { getUniverseArtworkPath, listUniverseCharacters } from "./characterUniverse.js";

export type BuildProvider = "openai" | "mock";

export type BookBuilderHealth = {
  ok: true;
  provider: BuildProvider;
  model: string;
  configured: boolean;
  storyProviderStatus: "ready" | "billing_required" | "fallback";
  storyProviderMessage: string;
  storyProviderCheckedAt?: string;
  artworkProvider: "replicate" | "unconfigured";
  storagePath: string;
  projectCount: number;
  jobs: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
};

type StoryProviderHealthState = Pick<
  BookBuilderHealth,
  "storyProviderStatus" | "storyProviderMessage" | "storyProviderCheckedAt"
>;

export type ArtworkModelProfile = {
  id: string;
  label: string;
  notes: string;
  isDefault: boolean;
  useCase: ReplicateImageModel["useCase"];
};

export type ProjectCleanupResult = {
  deleted: number;
  deletedProjectIds: string[];
};

export type ProjectSetupInput = {
  title: string;
  description?: string;
  targetPagesPerChapter?: number;
  defaultPanelsPerPage?: number;
  targetTrim?: string;
  styleNotes?: string;
  artworkModelPreference?: string;
  kdpBookType?: "coloring_book" | "comic_book" | "art_book" | "journal" | "graphic_novel" | "other";
  fontFamily?: string;
  fontSizePx?: number;
};

export type CharacterBible = {
  characterId: string;
  name: string;
  aliases?: string[];
  role?: string;
  visualStyle?: string;
  personality?: string;
  powers?: string;
  referencePrompt?: string;
  referenceImages?: CharacterReferenceAsset[];
};

export type CharacterReferenceAsset = {
  fileName: string;
  assetPath: string;
  artworkApiPath: string;
  createdAt: string;
  model: string;
  source?: "canonical" | "generated" | "universe";
};

export type StyleBibleInput = {
  styleName: string;
  stylePrompt: string;
  palette?: string[];
  lineQuality?: "soft" | "bold" | "scratch" | "clean";
  moodLevel?: number;
};

export type ChapterGenerationInput = {
  chapterTitle: string;
  chapterPrompt: string;
  targetPages: number;
  panelsPerPage?: number;
  includeDialogue?: boolean;
  includeSoundEffects?: boolean;
  startPage?: number;
  appendToChapterId?: string;
};

export type ContinuityEntry = {
  chapterId: string;
  pageNumber: number;
  panelNumber: number;
  location: string;
  timeOfDay: string;
  mood: string;
  presentCharacters: string[];
  notes: string;
  createdAt: string;
};

export type DialogueLine = {
  speaker: string;
  text: string;
  delivery?: string;
  bubbleStyle?: "speech" | "thought" | "shout" | "whisper";
  balloonAnchor?: "top-left" | "top-right" | "mid-left" | "mid-right" | "bottom-left" | "bottom-right";
};

export type BookRemixSourceProvenance = {
  remixProjectId: string;
  sourceProjectId?: string;
  sourceSceneId?: string;
  sourceBeatId?: string;
  sourceMediaType?: "book" | "video" | "image" | "audio" | "mixed";
  sourceLabel?: string;
  [key: string]: unknown;
};

export type BookRemixBeatInput = {
  id?: string;
  order?: number;
  title?: string;
  action: string;
  dialogueLines?: DialogueLine[];
  narration?: string;
  soundEffect?: string;
  prompt: string;
  negativePrompt?: string;
  characters?: string[];
  setting?: string;
  cameraAngle?: string;
  shotType?: string;
  timeOfDay?: string;
  mood?: string;
  sourceProvenance?: BookRemixSourceProvenance;
  stillAssetUrl?: string;
  videoAssetUrl?: string;
};

export type CreateBookProjectFromRemixInput = {
  title: string;
  description?: string;
  chapterTitle?: string;
  chapterPrompt?: string;
  chapterSummary?: string;
  styleNotes?: string;
  targetTrim?: string;
  sourceProvenance: BookRemixSourceProvenance;
  beats: BookRemixBeatInput[];
};

export type CreateBookProjectFromRemixResult = {
  project: ProjectRecord;
  chapter: ChapterRecord;
};

export type PanelRecord = {
  panelId: string;
  panelNumber: number;
  cameraAngle: string;
  shotType: string;
  characters: string[];
  setting: string;
  timeOfDay: string;
  mood: string;
  action: string;
  dialogueLines: DialogueLine[];
  /** Legacy text-only view retained for older clients and manifests. */
  dialogue: string;
  narration: string;
  soundEffect: string;
  continuityNotes: string;
  prompt: string;
  negativePrompt: string;
  assetFiles: string[];
  sourceProvenance?: BookRemixSourceProvenance;
  sourceArtworkUrl?: string;
  sourceVideoUrl?: string;
};

export const OPAIJA_COMBAT_VISUAL_LOCK = [
  "TRINIDAD KALINDA ACTION LOCK: Treat Kalinda/Calinda as a Trinidadian martial, musical, ritual, and community practice, never as a generic samurai, ninja, kung-fu, bo-staff, or medieval duel.",
  "In a gayelle scene, integrate the spectator circle, bois fighters, shantwelle or lavway call-and-response, chorus, and cutter/foolay drums as story participants.",
  "Use a straight hardwood bois with believable scale and two-ended handling. Show rhythmic side-to-side footwork, forward-inclined balance, karay defense, feint, parry, counter, and readable above-waist attack lines.",
  "BOIS GEOMETRY LOCK: every ordinary fighting bois is a slender round cylindrical hardwood cane about four feet long and about one inch thick, visibly narrower than a fighter's wrist. It has a circular cross-section and tapered round ends. Never draw a flat plank, paddle, board, bat, oversized beam, broad blade, sword, spear, or rectangular weapon.",
  "For multiple characters, separate silhouettes in depth, preserve each face and costume, assign every action and power effect to one clear owner, show both hands and weapon grips, and use crossing weapon arcs without merged bodies.",
  "Anime-comic energy comes from foreshortening, speed lines, impact bursts, dust, wood flex, rhythm waves, strong expressions, and cinematic panel staging while the cultural mechanics remain Trinidadian.",
  "Special powers must use each character bible's exact power description and palette, remain attached to the correct character or bois, reveal a readable cause and effect, and never hide faces, hands, grips, or weapon contact.",
  "POWER EFFECT LOCK: do not substitute one generic impact glow for every power. Give each active character a separate bible-accurate source point, color, shape language, directional effect, and target/environment reaction; keep inactive powers fully absent.",
  "FORBIDDEN: rectangular boards, bamboo staffs, swords, katanas, spears, floating weapons, duplicated fighters, fused faces, extra limbs, impossible grips, generic dojo scenery, fantasy armor, faux Patois, and culturally empty fighting poses.",
].join(" ");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripSpeakerPrefix(text: string, speaker: string, knownSpeakers: string[]) {
  let clean = text.trim().replace(/^[\s\"'“”]+|[\s\"'“”]+$/g, "");
  const names = Array.from(new Set([speaker, ...knownSpeakers].map((value) => value.trim()).filter(Boolean)))
    .sort((left, right) => right.length - left.length);
  for (const name of names) {
    clean = clean.replace(new RegExp(`^${escapeRegExp(name)}\\s*:\\s*`, "i"), "").trim();
  }
  return clean;
}

export function normalizeDialogueLines(
  value: unknown,
  legacyDialogue: unknown = "",
  knownSpeakers: string[] = [],
): DialogueLine[] {
  const source = Array.isArray(value)
    ? value
    : String(legacyDialogue ?? "")
        .split(/\r?\n/)
        .map((entry) => {
          const match = entry.trim().match(/^([^:]{1,60}):\s*(.+)$/);
          return match ? { speaker: match[1], text: match[2] } : { speaker: knownSpeakers[0] ?? "Speaker", text: entry };
        });
  return source.flatMap((entry, index) => {
    const row = typeof entry === "string" ? { speaker: knownSpeakers[index] ?? knownSpeakers[0] ?? "Speaker", text: entry } : entry as Record<string, unknown>;
    const speaker = String(row.speaker ?? row.speakerId ?? knownSpeakers[index] ?? knownSpeakers[0] ?? "Speaker").trim();
    const text = stripSpeakerPrefix(String(row.text ?? ""), speaker, knownSpeakers);
    if (!text) return [];
    const bubbleStyle = ["speech", "thought", "shout", "whisper"].includes(String(row.bubbleStyle))
      ? String(row.bubbleStyle) as DialogueLine["bubbleStyle"]
      : "speech";
    const balloonAnchor = ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"].includes(String(row.balloonAnchor))
      ? String(row.balloonAnchor) as DialogueLine["balloonAnchor"]
      : undefined;
    return [{ speaker, text, delivery: String(row.delivery ?? "").trim() || undefined, bubbleStyle, balloonAnchor }];
  }).slice(0, 6);
}

function dialogueText(lines: DialogueLine[]) {
  return lines.map((line) => line.text).join("\n");
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrapWords(value: string, maximumCharacters: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maximumCharacters) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 6);
}

export function buildLetteringSvg(input: {
  width: number;
  height: number;
  dialogueLines: DialogueLine[];
  narration?: string;
  soundEffect?: string;
  fontFamily?: string;
}) {
  const width = Math.max(600, Math.round(input.width));
  const height = Math.max(900, Math.round(input.height));
  const fontSize = Math.max(24, Math.round(width * 0.032));
  const bubbleWidth = Math.round(width * 0.42);
  const anchors = ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"] as const;
  const positions: Record<(typeof anchors)[number], [number, number]> = {
    "top-left": [Math.round(width * 0.04), Math.round(height * 0.045)],
    "top-right": [Math.round(width * 0.54), Math.round(height * 0.045)],
    "mid-left": [Math.round(width * 0.04), Math.round(height * 0.36)],
    "mid-right": [Math.round(width * 0.54), Math.round(height * 0.36)],
    "bottom-left": [Math.round(width * 0.04), Math.round(height * 0.70)],
    "bottom-right": [Math.round(width * 0.54), Math.round(height * 0.70)],
  };
  const bubbles = input.dialogueLines.map((line, index) => {
    const wrapped = wrapWords(line.text, 24);
    const bubbleHeight = Math.max(Math.round(height * 0.095), Math.round((wrapped.length + 1.5) * fontSize * 1.18));
    const anchor = line.balloonAnchor ?? anchors[index % anchors.length];
    const [x, y] = positions[anchor];
    const textY = y + Math.round((bubbleHeight - wrapped.length * fontSize * 1.12) / 2) + fontSize;
    const text = wrapped.map((row, rowIndex) => `<tspan x="${x + bubbleWidth / 2}" dy="${rowIndex === 0 ? 0 : Math.round(fontSize * 1.12)}">${escapeXml(row)}</tspan>`).join("");
    const dash = line.bubbleStyle === "whisper" ? ` stroke-dasharray="${Math.round(fontSize * 0.25)} ${Math.round(fontSize * 0.2)}"` : "";
    const strokeWidth = line.bubbleStyle === "shout" ? Math.max(6, Math.round(width * 0.006)) : Math.max(4, Math.round(width * 0.004));
    return `<g data-speaker="${escapeXml(line.speaker)}"><rect x="${x}" y="${y}" width="${bubbleWidth}" height="${bubbleHeight}" rx="${Math.round(bubbleHeight / 2)}" fill="#fff" fill-opacity="0.96" stroke="#111" stroke-width="${strokeWidth}"${dash}/><path d="M ${x + bubbleWidth * 0.52} ${y + bubbleHeight - 3} L ${x + bubbleWidth * 0.44} ${y + bubbleHeight + fontSize * 0.75} L ${x + bubbleWidth * 0.64} ${y + bubbleHeight - 5}" fill="#fff" stroke="#111" stroke-width="${strokeWidth}"/><text x="${x + bubbleWidth / 2}" y="${textY}" text-anchor="middle" font-family="${escapeXml(input.fontFamily || "Noto Sans")}" font-size="${fontSize}" font-weight="700" fill="#111">${text}</text></g>`;
  }).join("");
  const narration = input.narration?.trim()
    ? `<g><rect x="${Math.round(width * 0.05)}" y="${Math.round(height * 0.9)}" width="${Math.round(width * 0.9)}" height="${Math.round(height * 0.075)}" fill="#f5e6bd" stroke="#111" stroke-width="${Math.max(3, Math.round(width * 0.003))}"/><text x="${width / 2}" y="${Math.round(height * 0.945)}" text-anchor="middle" font-family="${escapeXml(input.fontFamily || "Noto Sans")}" font-size="${Math.round(fontSize * 0.8)}" font-weight="700" fill="#111">${escapeXml(input.narration.trim())}</text></g>`
    : "";
  const soundEffect = input.soundEffect?.trim()
    ? `<text x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.62)}" text-anchor="middle" font-family="Impact, ${escapeXml(input.fontFamily || "Noto Sans")}" font-size="${Math.round(fontSize * 2.2)}" font-weight="900" font-style="italic" fill="#f7b733" stroke="#111" stroke-width="${Math.max(3, Math.round(width * 0.004))}" paint-order="stroke">${escapeXml(input.soundEffect.trim())}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bubbles}${narration}${soundEffect}</svg>`;
}

export type PageRecord = {
  pageId: string;
  pageNumber: number;
  summary: string;
  panels: PanelRecord[];
};

export type ChapterRecord = {
  chapterId: string;
  chapterTitle: string;
  chapterPrompt: string;
  summary: string;
  pages: PageRecord[];
  status: "completed" | "partial";
  createdAt: string;
  sourceProvenance?: BookRemixSourceProvenance;
};

export type ChapterSummary = Omit<ChapterRecord, "pages">;

export type ProjectRecord = {
  projectId: string;
  projectSlug: string;
  createdAt: string;
  updatedAt: string;
  setup: {
    title: string;
    description: string;
    targetPagesPerChapter: number;
    defaultPanelsPerPage: number;
    targetTrim: string;
    styleNotes: string;
    artworkModelPreference: string;
    kdpBookType: "coloring_book" | "comic_book" | "art_book" | "journal" | "graphic_novel" | "other";
    fontFamily: string;
    fontSizePx: number;
  };
  styleBible: StyleBibleInput | null;
  characterBibles: CharacterBible[];
  chapters: ChapterSummary[];
  continuityLog: ContinuityEntry[];
  sourceProvenance?: BookRemixSourceProvenance;
  cover: {
    front: {
      side: "front";
      title: string;
      subtitle: string;
      tagline: string;
      author: string;
      seriesName: string;
      blurb: string;
      customPrompt: string;
      lastArtworkFileName?: string;
      lastGeneratedAt?: string;
      lastGeneratedModel?: string;
    };
    back: {
      side: "back";
      title: string;
      subtitle: string;
      tagline: string;
      author: string;
      seriesName: string;
      blurb: string;
      customPrompt: string;
      lastArtworkFileName?: string;
      lastGeneratedAt?: string;
      lastGeneratedModel?: string;
    };
  };
};

export type KdpEstimateRequest = {
  bookType: "coloring_book" | "comic_book" | "art_book" | "journal" | "graphic_novel" | "other";
  trimSize: string;
  isColor: boolean;
  targetRetail?: number;
  totalPages?: number;
};

export type KdpEstimateResult = {
  bookType: KdpEstimateRequest["bookType"];
  totalPages: number;
  trimSize: string;
  printCostEstimate: number;
  suggestedRetail: { min: number; max: number };
  estimatedRoyalty: { min: number; max: number };
  setupLine: string;
  recommendedFont: string;
};

export type ProjectArtworkBuildRequest = {
  skipExisting?: boolean;
  chapterId?: string;
  fromPage?: number;
  toPage?: number;
};

export type ProjectArtworkBuildResult = {
  projectId: string;
  totalPanels: number;
  generated: number;
  skipped: number;
  errors: string[];
};

export type ProjectExportFile = {
  path: string;
  fileName: string;
  category:
    | "style-bible"
    | "character-bible"
    | "character-reference"
    | "chapter-prompt"
    | "panel-prompt"
    | "panel-artwork"
    | "front-cover"
    | "back-cover"
    | "export-manifest"
    | "continuity-log";
  bytes: number;
  updatedAt: string;
};

export type ProjectExportManifest = {
  projectId: string;
  projectTitle: string;
  projectSlug: string;
  packageName: string;
  exportedAt: string;
  manifestPath: string;
  bookType: "coloring_book" | "comic_book" | "art_book" | "journal" | "graphic_novel" | "other";
  totalChapters: number;
  totalPages: number;
  totalPanels: number;
  totalAssets: number;
  totalArtworkFiles: number;
  targetTrim: string;
  pagesPerPage: number;
  recommendedFont: string;
  files: ProjectExportFile[];
};

export type CoverSide = "front" | "back";

export type ProjectCoverUpdate = {
  front?: Partial<{
    title: string;
    subtitle: string;
    tagline: string;
    author: string;
    seriesName: string;
    blurb: string;
    customPrompt: string;
  }>;
  back?: Partial<{
    title: string;
    subtitle: string;
    tagline: string;
    author: string;
    seriesName: string;
    blurb: string;
    customPrompt: string;
  }>;
};

export type BookJobStatus = "queued" | "running" | "completed" | "failed";

export type BookJob = {
  jobId: string;
  projectId: string;
  status: BookJobStatus;
  step: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  attempt: number;
  sourceJobId?: string;
  request: ChapterGenerationInput;
  resultChapterId?: string;
  warnings?: string[];
  error?: string;
  errorCode?: string;
  elapsedMs?: number;
};

export type ProjectListItem = {
  projectId: string;
  projectSlug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  kdpBookType: "coloring_book" | "comic_book" | "art_book" | "journal" | "graphic_novel" | "other";
  chapterCount: number;
  styleBibleSet: boolean;
  characterCount: number;
};

export type ProjectAsset = {
  path: string;
  fileName: string;
  category:
    | "style-bible"
    | "character-bible"
    | "character-reference"
    | "chapter-prompt"
    | "panel-prompt"
    | "panel-artwork"
    | "front-cover"
    | "back-cover"
    | "export-manifest"
    | "continuity-log";
  bytes: number;
  updatedAt: string;
};

export type HermesImportRequest = {
  sourcePath: string;
  title?: string;
  description?: string;
  targetTrim?: string;
  targetPagesPerChapter?: number;
  defaultPanelsPerPage?: number;
  styleNotes?: string;
};

export type HermesImportResult = {
  project: ProjectRecord;
  sourcePath: string;
  imported: {
    chapters: number;
    panels: number;
  };
};

type StoragePaths = {
  root: string;
  projects: string;
  jobs: string;
};

const storage: StoragePaths = (() => {
  const root = path.resolve(process.cwd(), process.env.BOOK_BUILDER_DATA_DIR ?? "data/book-builder");
  return {
    root,
    projects: path.join(root, "projects"),
    jobs: path.join(root, "jobs"),
  };
})();

const OPENAI_RETRY_COUNT = 2;
const DEFAULT_ARTWORK_MODEL = "black-forest-labs/flux-kontext-pro";
const AUTO_ARTWORK_MODEL = "__auto__";
const CHAPTER_PROMPT_TIMEOUT_MS = 45_000;
const CHAPTER_GENERATION_TIMEOUT_MS = 300_000;
const CHAPTER_JOB_TIMEOUT_MS = 720_000;
const CHAPTER_JOB_STALE_TIMEOUT_MS = 900_000;
const JOB_HEARTBEAT_INTERVAL_MS = 5_000;
const CHAPTER_GENERATION_FALLBACK_TO_MOCK = process.env.BOOK_BUILDER_STORY_FALLBACK !== "0";

function resolveOpenAIApiKey() {
  return (
    process.env.OPENAI_API_KEY
    || process.env.BOOK_BUILDER_OPENAI_KEY
    || process.env.BOOK_BUILDER_OPENAI_API_KEY
    || process.env.BOOK_BUILDER_OPENAI_TOKEN
    || process.env.OPENAI_STORY_API_KEY
  );
}

function resolveOpenAIModel() {
  return (
    process.env.BOOK_BUILDER_OPENAI_MODEL
    || process.env.OPENAI_STORY_MODEL
    || process.env.OPENAI_MODEL
    || "gpt-4o-mini"
  );
}

function normalizeReplicateModel(model?: string): string {
  const candidate = (model ?? DEFAULT_ARTWORK_MODEL).trim();
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?::[a-zA-Z0-9._-]+)?$/.test(candidate)) {
    return candidate;
  }
  return DEFAULT_ARTWORK_MODEL;
}

function getAvailableArtworkModels(): ArtworkModelProfile[] {
  const seen = new Set<string>();
  const autoProfile: ArtworkModelProfile = {
    id: AUTO_ARTWORK_MODEL,
    label: "Auto (reference-aware)",
    notes: "Choose flux-kontext-pro, flux-2-pro, or default model automatically based on character reference count.",
    isDefault: false,
    useCase: "all",
  };

  return [autoProfile, ...getReplicateImageModelCatalog()].reduce((acc, current) => {
    if (seen.has(current.id)) return acc;
    seen.add(current.id);
    acc.push({
      id: current.id,
      label: current.label,
      notes: current.notes,
      isDefault: current.isDefault,
      useCase: current.useCase,
    });
    return acc;
  }, [] as ArtworkModelProfile[]);
}

function resolveArtworkModelPreference(value?: string) {
  const normalized = (value || DEFAULT_ARTWORK_MODEL).trim();
  return normalized === AUTO_ARTWORK_MODEL ? AUTO_ARTWORK_MODEL : normalizeReplicateModel(normalized);
}

function resolveArtworkModel(preference: string, referenceImageCount: number) {
  if (preference === AUTO_ARTWORK_MODEL) {
    return getReplicateImageModel(referenceImageCount);
  }
  return normalizeReplicateModel(preference);
}

function buildFallbackStyleBible(project: ProjectRecord): StyleBibleInput {
  return {
    styleName: "OPAIJA Baseline",
    stylePrompt: [
      OPAIJA_STYLE_LOCK,
      project.setup.styleNotes || "OPAIJA visual style lock",
      "Keep 2.5D manga composition, strong readability, stable character silhouettes, and print-safe contrast.",
    ].join(" "),
    palette: ["indigo", "ruby", "amber", "sea blue", "ivory", "gold"],
    lineQuality: "bold",
    moodLevel: 3,
  };
}

const OPAIJA_STYLE_LOCK = "Locked OPAIJA 2.5D Caribbean anime hybrid: clean confident black ink linework, textured cel shading, readable animated-series silhouettes, rounded chins, full lips, broader African and Caribbean nose structures, distinct warm eyes and facial features, African and island-flavored locs, braids, wraps, beads and shells, bright Caribbean energy, modern streetwear fused with Kalenda/Calinda, Carnival and island textiles, controlled gold, orange, red, teal, sea blue and cream accents, culturally specific bois, lavway, drums, gayelle, maps, food and coded sigils. Never use pointed generic anime chins, flattened generic anime noses or lips, medieval fantasy armor, washed-out palettes, generic symbols, or culturally empty clothing.";

const CANONICAL_CAST = [
  { id: "kairo-kai-baptiste", name: "Kairo \"Kai\" Baptiste", aliases: ["Kai", "Kairo", "Kairo Baptiste"], role: "Main hero / first Opaija Seed wielder", fileName: "kairo-kai-baptiste.png", visualStyle: "Authoritative model sheet: Trinidadian teenage hero, rounded Afro-Caribbean facial structure, short decorated locs, athletic build, black sleeveless hooded Kalenda streetwear, red patterned waist sash, amber and gold details, Listening Bois staff." },
  { id: "nia-toussaint", name: "Nia Toussaint", aliases: ["Nia"], role: "Chantwell / lavway voice specialist", fileName: "nia-toussaint.png", visualStyle: "Authoritative model sheet: Trinidadian Chantwell, deep brown skin, rounded Afro-Caribbean face, long shell-and-gold-beaded braids, indigo and gold layered lavway attire, rhythm bell and scarf." },
  { id: "malik-st-hill", name: "Malik St. Hill", aliases: ["Malik", "Malik St Hill"], role: "Rival boishman / disciplined fighter", fileName: "malik-st-hill.png", visualStyle: "Use the exact face, hair, proportions, clothing, colors, props and silhouette in the authoritative uploaded model sheet." },
  { id: "asha-singh-baptiste", name: "Asha Singh-Baptiste", aliases: ["Asha", "Asha Baptiste"], role: "Matador / medic / historian", fileName: "asha-singh-baptiste.png", visualStyle: "Authoritative model sheet: Trinidadian Matador and memory keeper, warm brown skin, long decorated braids, teal, saffron and copper layered field attire, bandage cords, archive satchel, map sigils and Matador baton." },
  { id: "jabari-jabs-henry", name: "Jabari \"Jabs\" Henry", aliases: ["Jabari", "Jabs", "Jabari Henry"], role: "Drummer / comic relief / content creator", fileName: "jabari-jabs-henry.png", visualStyle: "Use the authoritative uploaded sheet. African-style wooden Kalinda drums and curved L-shaped sticks only, never a modern drum kit." },
  { id: "tariq-davidson", name: "Tariq Davidson", aliases: ["Tariq"], role: "Tobago scout / island expansion bridge", fileName: "tariq-davidson.png", visualStyle: "Use the exact face, hair, proportions, clothing, colors, props and silhouette in the authoritative uploaded model sheet." },
  { id: "mother-lall", name: "Mother Lall", aliases: ["Lall"], role: "Doubles vendor / secret Guardian messenger", fileName: "mother-lall.png", visualStyle: "Use the exact face, hair, proportions, clothing, colors, food-vendor objects, props and silhouette in the authoritative uploaded model sheet." },
  { id: "papa-etienne-roach", name: "Papa Etienne Roach", aliases: ["Papa Etienne", "Etienne", "Papa Roach"], role: "Elder batonier / mentor / former Guardian", fileName: "papa-etienne-roach.png", visualStyle: "Use the exact face, hair, proportions, clothing, bois, colors, props and silhouette in the authoritative uploaded model sheet." },
  { id: "marius-vale", name: "Marius Vale", aliases: ["Marius"], role: "Main villain / False One Drum", fileName: "marius-vale.png", visualStyle: "Use the exact back-only identity, proportions, clothing, colors and silence-crack visual language in the authoritative sheet. Do not reveal his face before canon permits." },
  { id: "selah-vale", name: "Selah Vale", aliases: ["Selah"], role: "Villain heir / possible future ally", fileName: "selah-vale.png", visualStyle: "Use the exact face, hair, proportions, clothing, colors, props and silhouette in the authoritative uploaded model sheet." },
] as const;

function canonicalReference(character: (typeof CANONICAL_CAST)[number]): CharacterReferenceAsset {
  return {
    fileName: character.fileName,
    assetPath: `canonical/characters/${character.fileName}`,
    artworkApiPath: `/api/book-builder/canon/characters/${character.id}/artwork`,
    createdAt: "2026-07-19T00:00:00.000Z",
    model: "OPAIJA approved production bible",
    source: "canonical",
  };
}

function canonicalBible(character: (typeof CANONICAL_CAST)[number]): CharacterBible {
  return {
    characterId: character.id,
    name: character.name,
    aliases: [...character.aliases],
    role: character.role,
    visualStyle: character.visualStyle,
    personality: "Follow the character profile and expressions shown in the authoritative model sheet.",
    powers: "Follow the power, weapon and action-pose callouts shown in the authoritative model sheet.",
    referencePrompt: "Preserve the exact authoritative face, hair, skin tone, proportions, clothing construction, palette, accessories, props, cultural details and silhouette.",
    referenceImages: [canonicalReference(character)],
  };
}

function mergeCanonicalCast(project: ProjectRecord): ProjectRecord {
  for (const canon of CANONICAL_CAST) {
    const canonAliases = [canon.id, canon.name, ...canon.aliases].map(slugify);
    const existing = project.characterBibles.find((character) => [character.characterId, character.name, ...(character.aliases ?? [])].map(slugify).some((alias) => canonAliases.includes(alias)));
    const reference = canonicalReference(canon);
    if (existing) {
      existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...canon.aliases]));
      existing.name = canon.name;
      existing.role = canon.role;
      existing.visualStyle = canon.visualStyle;
      existing.referencePrompt = canonicalBible(canon).referencePrompt;
      existing.referenceImages = [...(existing.referenceImages ?? []).filter((item) => item.source !== "canonical"), reference];
    } else {
      project.characterBibles.push(canonicalBible(canon));
    }
  }
  project.characterBibles.sort((left, right) => left.name.localeCompare(right.name));
  return project;
}

async function resolveCanonicalCharacterFile(fileName: string): Promise<string> {
  if (!/^[a-z0-9-]+\.png$/.test(fileName)) throw new Error("Invalid canonical character file.");
  const candidates = [
    path.resolve(process.cwd(), "public", "assets", "characters", fileName),
    path.resolve(process.cwd(), "dist", "assets", "characters", fileName),
  ];
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  throw new Error("Canonical character artwork is missing from the application assets.");
}

export async function listCanonicalCharacters() {
  return Promise.all(CANONICAL_CAST.map(async (character) => {
    const filePath = await resolveCanonicalCharacterFile(character.fileName);
    const stat = await fs.stat(filePath);
    return { ...canonicalBible(character), artworkApiPath: canonicalReference(character).artworkApiPath, bytes: stat.size };
  }));
}

export async function getCanonicalCharacterArtworkPath(characterId: string) {
  const character = CANONICAL_CAST.find((entry) => entry.id === slugify(characterId));
  if (!character) throw new Error("Canonical character not found.");
  return resolveCanonicalCharacterFile(character.fileName);
}

export async function getBookBuilderHealth(): Promise<BookBuilderHealth> {
  const projects = await listProjects();
  const jobs = await listAllJobs();
  const openAiConfigured = hasOpenAIKey();
  const persistedProviderHealth = await readJsonFile<StoryProviderHealthState | null>(
    path.join(storage.root, "story-provider-health.json"),
    null,
  );
  const latestSettledJob = jobs
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const latestProviderMessage = [latestSettledJob?.error, ...(latestSettledJob?.warnings ?? [])]
    .filter(Boolean)
    .join(" ");
  const billingRequired = Boolean(
    openAiConfigured
    && latestSettledJob
    && (
      latestSettledJob.errorCode === "quota_or_rate_limit"
      || /(?:\b429\b|quota|billing|insufficient_quota|rate limit)/i.test(latestProviderMessage)
    )
  );
  const inferredProviderHealth: StoryProviderHealthState = {
    storyProviderStatus: !openAiConfigured ? "fallback" : billingRequired ? "billing_required" : "ready",
    storyProviderMessage: !openAiConfigured
      ? "No OpenAI API key is active. Chapters use the local story fallback."
      : billingRequired
        ? "OpenAI API billing is unavailable. New chapters use the local story fallback until API credits are restored."
        : "OpenAI story generation is configured and the latest chapter job did not report a provider failure.",
  };
  const providerHealth = openAiConfigured && persistedProviderHealth
    ? persistedProviderHealth
    : inferredProviderHealth;
  return {
    ok: true,
    provider: openAiConfigured ? "openai" : "mock",
    model: getModel(),
    configured: openAiConfigured,
    ...providerHealth,
    artworkProvider: isReplicateConfigured() ? "replicate" : "unconfigured",
    storagePath: storage.root,
    projectCount: projects.length,
    jobs: {
      total: jobs.length,
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      failed: jobs.filter((job) => job.status === "failed").length,
    },
  };
}

export async function checkBookBuilderStoryProvider(): Promise<StoryProviderHealthState> {
  if (!hasOpenAIKey()) {
    return recordStoryProviderHealth(
      "fallback",
      "No OpenAI API key is active. Chapters use the local story fallback.",
    );
  }

  try {
    const client = new OpenAI({ apiKey: resolveOpenAIApiKey()! });
    await withTimeout(
      () => client.chat.completions.create({
        model: getModel(),
        messages: [
          { role: "system", content: "Return exactly OK." },
          { role: "user", content: "OPAIJA Book Builder provider health check." },
        ],
        max_tokens: 3,
        temperature: 0,
      }),
      30_000,
      "checking OpenAI story provider",
    );
    return recordStoryProviderHealth(
      "ready",
      `OpenAI story generation is live on ${getModel()}.`,
    );
  } catch (error) {
    if (isQuotaOrRateLimitError(error)) {
      return recordStoryProviderHealth(
        "billing_required",
        "OpenAI API billing is unavailable. New chapters use the local story fallback until API credits are restored.",
      );
    }
    return recordStoryProviderHealth(
      "fallback",
      "OpenAI could not complete the provider check. Chapters use the local story fallback until the connection is restored.",
    );
  }
}

async function recordStoryProviderHealth(
  storyProviderStatus: StoryProviderHealthState["storyProviderStatus"],
  storyProviderMessage: string,
): Promise<StoryProviderHealthState> {
  const state: StoryProviderHealthState = {
    storyProviderStatus,
    storyProviderMessage,
    storyProviderCheckedAt: new Date().toISOString(),
  };
  await writeJson(path.join(storage.root, "story-provider-health.json"), state);
  return state;
}

async function recordStoryProviderHealthBestEffort(
  storyProviderStatus: StoryProviderHealthState["storyProviderStatus"],
  storyProviderMessage: string,
): Promise<void> {
  try {
    await recordStoryProviderHealth(storyProviderStatus, storyProviderMessage);
  } catch {
    // Provider-health persistence must never invalidate a completed chapter generation.
  }
}

export function getConfiguredArtworkModels(): ArtworkModelProfile[] {
  return getAvailableArtworkModels();
}

export async function listProjects(): Promise<ProjectListItem[]> {
  await ensureDir(storage.projects);
  const directories = await fs.readdir(storage.projects, { withFileTypes: true });
  const resolved = await Promise.all(
    directories.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        return { ok: true, value: await readProject(entry.name) };
      } catch {
        return { ok: false as const };
      }
    }),
  );
  const projects = resolved
    .filter((entry): entry is { ok: true; value: ProjectRecord } => entry.ok)
    .map((entry) => entry.value);
  return projects
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((project) => ({
      projectId: project.projectId,
      projectSlug: project.projectSlug,
      title: project.setup.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      kdpBookType: project.setup.kdpBookType,
      chapterCount: project.chapters.length,
      styleBibleSet: Boolean(project.styleBible),
      characterCount: project.characterBibles.length,
    }));
}

function buildPanelArtifactStem(project: ProjectRecord, chapter: ChapterRecord, pageNumber: number, panelNumber: number) {
  const safeProjectSlug = safeFileToken(project.projectSlug, project.projectId);
  const chapterSlug = safeFileToken(chapter.chapterTitle, chapter.chapterId);
  const pageToken = String(pageNumber).padStart(2, "0");
  const panelToken = String(panelNumber).padStart(2, "0");
  return `art-${safeProjectSlug}-${chapterSlug}-p${pageToken}-panel-${panelToken}`;
}

function buildCoverArtifactStem(project: ProjectRecord, side: CoverSide) {
  const safeProjectSlug = safeFileToken(project.projectSlug, project.projectId);
  return `cover-${side}-${safeProjectSlug}`;
}

function buildCoverFileName(project: ProjectRecord, side: CoverSide, prefix: string) {
  return `${prefix}-${Date.now()}.png`;
}

function isCoverSide(value: string): value is CoverSide {
  return value === "front" || value === "back";
}

function normalizeCoverText(value: string, fallback: string) {
  const clean = value.trim();
  return clean.length ? clean : fallback;
}

function makeDefaultCover<TSide extends CoverSide>(
  side: TSide,
  title: string,
  bookType: ProjectRecord["setup"]["kdpBookType"],
): ProjectRecord["cover"][TSide] {
  const safeTitle = normalizeCoverText(title, "OPAIJA Story");
  return {
    side,
    title: safeTitle,
    subtitle: side === "front" ? `Volume 0: ${safeTitle}` : "The OPAIJA Universe",
    tagline: side === "front" ? "A Caribbean fantasy manga adventure." : "Includes cast notes and publishing-ready art direction.",
    author: "OPAIJA Creative Studio",
    seriesName: "OPAIJA",
    blurb: side === "back"
      ? "A premium visual journey with consistent characters and high-contrast comic styling for print."
      : "",
    customPrompt:
      side === "front"
        ? `Create a bold ${bookType.replace(/_/g, " ")} front cover with readable title treatment and cinematic character presence.`
        : "Create a clear back cover style layout with print-safe hierarchy and clean copy blocks.",
  } as ProjectRecord["cover"][TSide];
}

function buildCoverPrompt(project: ProjectRecord, side: CoverSide) {
  const cover = project.cover[side];
  return [
    project.styleBible?.stylePrompt,
    OPAIJA_STYLE_LOCK,
    `Create a ${project.setup.kdpBookType.replace(/_/g, " ")} ${side} cover for a book titled "${cover.title}".`,
    `Front and back artwork must match the same visual rules as existing panel artwork.`,
    `Cover title: ${cover.title}. Subtitle: ${cover.subtitle}.`,
    `Tagline: ${cover.tagline}.`,
    `Author: ${cover.author}. Series: ${cover.seriesName}.`,
    `Additional copy: ${cover.blurb || "No additional back copy provided."}`,
    cover.customPrompt,
    `Palette: ${(project.styleBible?.palette ?? []).join(", ") || "high contrast ink, deep ink shadows, clean color."}.`,
    "Keep title hierarchy readable at print size, no watermark, no contact details, no URLs, no frame labels.",
    "Do not add any extra UI, no logos, and no mockup mockups.",
    "Use print-safe text regions with strong contrast between copy and background.",
  ].filter(Boolean).join(" ");
}

function mergeCoverConfig(project: ProjectRecord) {
  const projectTitle = normalizeCoverText(project.setup.title, "OPAIJA Story");
  const safeFront = makeDefaultCover("front", projectTitle, project.setup.kdpBookType);
  const safeBack = makeDefaultCover("back", projectTitle, project.setup.kdpBookType);
  project.cover = {
    front: { ...safeFront, ...(project.cover?.front ?? {}) },
    back: { ...safeBack, ...(project.cover?.back ?? {}) },
  };
  project.cover.front.side = "front";
  project.cover.back.side = "back";
  return project;
}

function buildPanelPromptFileName(project: ProjectRecord, chapter: ChapterRecord, pageNumber: number, panelNumber: number) {
  return `${buildPanelArtifactStem(project, chapter, pageNumber, panelNumber)}-prompt.txt`;
}

function buildPanelContextFileName(
  project: ProjectRecord,
  chapter: ChapterRecord,
  pageNumber: number,
  panelNumber: number,
  generationId: number,
) {
  return `${buildPanelArtifactStem(project, chapter, pageNumber, panelNumber)}-${generationId}-context.json`;
}

export async function deleteEmptyProjects(): Promise<ProjectCleanupResult> {
  await ensureDir(storage.projects);
  const directories = await fs.readdir(storage.projects, { withFileTypes: true });
  const allJobs = await listAllJobs();
  const blockedProjects = new Set(allJobs.filter((job) => job.status === "queued" || job.status === "running").map((job) => job.projectId));
  const deletedProjectIds: string[] = [];

  for (const entry of directories.filter((candidate) => candidate.isDirectory())) {
    try {
      const project = await readProject(entry.name);
      if (project.chapters.length > 0) continue;
      if (blockedProjects.has(project.projectId)) continue;
      await deleteProject(entry.name);
      deletedProjectIds.push(project.projectId);
    } catch {
      continue;
    }
  }

  return {
    deleted: deletedProjectIds.length,
    deletedProjectIds,
  };
}

async function clearProjectJobs(projectId: string) {
  const allJobs = await listAllJobs();
  for (const job of allJobs) {
    if (job.projectId !== projectId) continue;
    try {
      await fs.rm(path.join(storage.jobs, `${job.jobId}.json`), { force: true });
    } catch {
      // ignore best-effort cleanup failures
    }
  }
}

function markStaleJobsInPlace(jobs: BookJob[], now = Date.now()) {
  return Promise.all(
    jobs
      .filter((job) => {
        if (job.status !== "running" && job.status !== "queued") return false;
        const startedAt = Date.parse(job.startedAt);
        if (!Number.isFinite(startedAt)) return false;
        return now - startedAt > CHAPTER_JOB_STALE_TIMEOUT_MS;
      })
      .map(async (job) => {
        const elapsedMs = now - Date.parse(job.startedAt);
        try {
          await updateJob(job.jobId, {
            status: "failed",
            step: "failed: stale",
            progress: 100,
            error: "The chapter generation job exceeded allowed runtime without updates.",
            errorCode: "timeout",
            elapsedMs,
          });
          job.status = "failed";
          job.step = "failed: stale";
          job.progress = 100;
          job.error = "The chapter generation job exceeded allowed runtime without updates.";
          job.errorCode = "timeout";
          job.elapsedMs = elapsedMs;
          job.updatedAt = new Date(now).toISOString();
        } catch {
          // ignore: stale marking is best-effort and should not block reads
        }
      }),
  );
}

export async function createProject(input: ProjectSetupInput): Promise<ProjectRecord> {
  if (!input.title?.trim()) {
    throw new Error("Project title is required.");
  }

  const now = new Date().toISOString();
  const projectId = randomUUID();
  const projectSlug = slugify(input.title);
  const projectPath = path.join(storage.projects, projectId);

  const record: ProjectRecord = {
    projectId,
    projectSlug,
    createdAt: now,
    updatedAt: now,
    setup: {
      title: input.title.trim(),
      description: input.description?.trim() || "No description yet.",
      targetPagesPerChapter: coerceRange(input.targetPagesPerChapter, 12, 2, 120),
      defaultPanelsPerPage: coerceRange(input.defaultPanelsPerPage, 4, 1, 12),
      targetTrim: input.targetTrim?.trim() || "6.625x10.25",
      styleNotes: input.styleNotes?.trim() || "OPAIJA style bible first pass.",
      artworkModelPreference: resolveArtworkModelPreference(input.artworkModelPreference),
      kdpBookType: input.kdpBookType || "graphic_novel",
      fontFamily: input.fontFamily?.trim() || "Noto Sans",
      fontSizePx: coerceRange(input.fontSizePx, 18, 12, 32),
    },
    styleBible: null,
    characterBibles: CANONICAL_CAST.map(canonicalBible),
    chapters: [],
    continuityLog: [],
    cover: {
      front: makeDefaultCover("front", input.title.trim(), input.kdpBookType || "graphic_novel"),
      back: makeDefaultCover("back", input.title.trim(), input.kdpBookType || "graphic_novel"),
    },
  };

  await ensureDir(projectPath);
  await ensureDir(path.join(projectPath, "chapters"));
  await ensureDir(path.join(projectPath, "character-bibles"));
  await ensureDir(path.join(projectPath, "prompts"));
  await ensureDir(path.join(projectPath, "covers"));
  await writeJson(path.join(projectPath, "project.json"), record);
  await writeJson(path.join(projectPath, "character-bibles.json"), record.characterBibles);
  await writeJson(path.join(projectPath, "chapters.json"), record.chapters);
  await writeJson(path.join(projectPath, "continuity.json"), record.continuityLog);
  await writeJson(path.join(projectPath, "style-bible.json"), record.styleBible);
  await ensureDir(storage.jobs);

  return record;
}

export async function createBookProjectFromRemix(
  input: CreateBookProjectFromRemixInput,
): Promise<CreateBookProjectFromRemixResult> {
  if (!input.title?.trim()) throw new Error("Remix book title is required.");
  if (!input.sourceProvenance?.remixProjectId?.trim()) throw new Error("Remix source provenance is required.");
  if (!Array.isArray(input.beats) || input.beats.length === 0) throw new Error("At least one ordered Remix beat is required.");

  const orderedBeats = input.beats
    .map((beat, index) => ({ beat, index }))
    .sort((left, right) => (left.beat.order ?? left.index + 1) - (right.beat.order ?? right.index + 1) || left.index - right.index);
  const project = await createProject({
    title: input.title.trim(),
    description: input.description?.trim() || `Materialized from Remix project ${input.sourceProvenance.remixProjectId}.`,
    targetPagesPerChapter: Math.max(2, orderedBeats.length),
    defaultPanelsPerPage: 1,
    targetTrim: input.targetTrim?.trim() || "6.625x10.25",
    styleNotes: input.styleNotes?.trim() || "OPAIJA cross-media Remix materialization.",
    kdpBookType: "graphic_novel",
  });

  const chapterTitle = input.chapterTitle?.trim() || "Remix Story Sequence";
  const chapterPrompt = input.chapterPrompt?.trim() || orderedBeats.map(({ beat }) => beat.prompt.trim()).filter(Boolean).join("\n\n");
  const chapterSource: Omit<ChapterRecord, "createdAt"> = {
    chapterId: `remix-${safeFileToken(chapterTitle, "chapter")}-${createHash("sha1").update(`${input.sourceProvenance.remixProjectId}:${chapterTitle}`).digest("hex").slice(0, 8)}`,
    chapterTitle,
    chapterPrompt,
    summary: input.chapterSummary?.trim() || `Ordered cross-media sequence with ${orderedBeats.length} beat${orderedBeats.length === 1 ? "" : "s"}.`,
    status: "completed",
    sourceProvenance: input.sourceProvenance,
    pages: orderedBeats.map(({ beat }, index) => {
      const pageNumber = index + 1;
      const beatToken = safeFileToken(beat.id || beat.title || `beat-${pageNumber}`, `beat-${pageNumber}`);
      const characters = (beat.characters ?? []).map((value) => value.trim()).filter(Boolean);
      const dialogueLines = normalizeDialogueLines(beat.dialogueLines ?? [], "", characters);
      const provenance = { ...input.sourceProvenance, ...(beat.sourceProvenance ?? {}), sourceBeatId: beat.sourceProvenance?.sourceBeatId ?? beat.id ?? `beat-${pageNumber}` };
      const panel: PanelRecord = {
        panelId: `remix-${beatToken}-${createHash("sha1").update(`${input.sourceProvenance.remixProjectId}:${beat.id ?? pageNumber}`).digest("hex").slice(0, 8)}`,
        panelNumber: 1,
        cameraAngle: beat.cameraAngle?.trim() || "cinematic",
        shotType: beat.shotType?.trim() || "story beat",
        characters,
        setting: beat.setting?.trim() || "OPAIJA story world",
        timeOfDay: beat.timeOfDay?.trim() || "unspecified",
        mood: beat.mood?.trim() || "story-driven",
        action: beat.action.trim(),
        dialogueLines,
        dialogue: dialogueText(dialogueLines),
        narration: beat.narration?.trim() || "",
        soundEffect: beat.soundEffect?.trim() || "",
        continuityNotes: `Remix order ${pageNumber}; preserve source identities, setting, action and asset provenance.`,
        prompt: beat.prompt.trim(),
        negativePrompt: beat.negativePrompt?.trim() || "No identity drift, broken anatomy, duplicated characters, incorrect props, random text, logos or watermarks.",
        assetFiles: [],
        sourceProvenance: provenance,
        sourceArtworkUrl: beat.stillAssetUrl?.trim() || undefined,
        sourceVideoUrl: beat.videoAssetUrl?.trim() || undefined,
      };
      return {
        pageId: `remix-page-${String(pageNumber).padStart(3, "0")}-${beatToken}`,
        pageNumber,
        summary: beat.title?.trim() || beat.action.trim().slice(0, 160) || `Remix beat ${pageNumber}`,
        panels: [panel],
      };
    }),
  };

  const chapter = await persistChapter(project.projectId, chapterSource);
  const chapterSummary: ChapterSummary = {
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    chapterPrompt: chapter.chapterPrompt,
    summary: chapter.summary,
    status: chapter.status,
    createdAt: chapter.createdAt,
    sourceProvenance: chapter.sourceProvenance,
  };
  project.sourceProvenance = input.sourceProvenance;
  project.chapters = [chapterSummary];
  project.continuityLog = extractContinuityEntries(chapter);
  project.updatedAt = new Date().toISOString();
  const projectPath = getProjectPath(project.projectId);
  await writeProject(project);
  await writeJson(path.join(projectPath, "chapters.json"), project.chapters);
  await writeJson(path.join(projectPath, "continuity.json"), project.continuityLog);
  return { project, chapter };
}

export async function importHermesPackage(input: HermesImportRequest): Promise<HermesImportResult> {
  const sourcePath = path.resolve(input.sourcePath);
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat) throw new Error("Hermes source path does not exist.");
  if (!sourceStat.isDirectory()) {
    throw new Error("Hermes import requires an extracted folder path (zip support is not enabled in the API). Please extract the package first.");
  }

  const normalizedSourceName = path.basename(sourcePath).replace(/\.[a-z0-9]+$/i, "");
  const hermesChapters = await parseHermesSource(sourcePath);
  if (hermesChapters.length === 0) {
    throw new Error("No readable Hermes chapter manifests were found in this source.");
  }

  const project = await createProject({
    title: input.title?.trim() || `OPAIJA ${normalizedSourceName}`,
    description: input.description?.trim() || `Imported from ${normalizedSourceName}`,
    targetPagesPerChapter: input.targetPagesPerChapter ?? Math.max(...hermesChapters.map((entry) => entry.pages.length), 60),
    defaultPanelsPerPage: input.defaultPanelsPerPage ?? Math.max(...hermesChapters.flatMap((entry) => entry.pages).map((page) => page.panels.length), 4),
    targetTrim: input.targetTrim?.trim() || "6.625x10.25",
    styleNotes: input.styleNotes?.trim() || "Hermes source imported production-ready chapter prompts.",
  });

  let totalPanelCount = 0;
  const importedSummaries: ChapterSummary[] = [];
  const importedSourceMap = new Map<string, PageRecord[]>();
  for (const hermesChapter of hermesChapters) {
    const chapter = await persistChapter(project.projectId, hermesChapter);
    importedSummaries.push({
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      chapterPrompt: chapter.chapterPrompt,
      summary: chapter.summary,
      status: chapter.status,
      createdAt: chapter.createdAt,
    });
    importedSourceMap.set(chapter.chapterId, chapter.pages);
    totalPanelCount += chapter.pages.reduce((sum, page) => sum + page.panels.length, 0);
  }

  const updatedProject = await getProject(project.projectId);
  updatedProject.chapters = importedSummaries;
  updatedProject.continuityLog = importedSummaries.flatMap((chapterSummary) =>
    extractContinuityEntries({
      chapterId: chapterSummary.chapterId,
      chapterTitle: chapterSummary.chapterTitle,
      chapterPrompt: chapterSummary.chapterPrompt,
      summary: chapterSummary.summary,
      pages: importedSourceMap.get(chapterSummary.chapterId) ?? [],
      status: chapterSummary.status,
      createdAt: chapterSummary.createdAt,
    }),
  );
  updatedProject.updatedAt = new Date().toISOString();

  const projectPath = getProjectPath(project.projectId);
  await writeProject(updatedProject);
  await writeJson(path.join(projectPath, "chapters.json"), updatedProject.chapters);
  await writeJson(path.join(projectPath, "continuity.json"), updatedProject.continuityLog);

  return {
    project: updatedProject,
    sourcePath,
    imported: {
      chapters: hermesChapters.length,
      panels: totalPanelCount,
    },
  };
}

export async function getProject(projectId: string): Promise<ProjectRecord> {
  return readProject(projectId);
}

async function parseHermesSource(sourcePath: string): Promise<Omit<ChapterRecord, "createdAt">[]> {
  const files = await collectFiles(sourcePath);
  const findFile = (candidate: string) =>
    files.find((entry) => path.basename(entry.absolutePath).toLowerCase() === candidate.toLowerCase())?.absolutePath;

  const chapterOneFile = findFile("chapter1_manifest.json") || findFile("chapter_01_manifest.json");
  const chapterThreeFile = findFile("chapter_03_manifest.json") || findFile("chapter03_manifest.json") || findFile("chapter_3_manifest.json");
  const chapterTwoManifest = findFile("CHAPTER_2_PANEL_INDEX.tsv") || findFile("chapter_2_panel_index.tsv");
  const chapterTwoExact = findFile("CHAPTER_2_EXACT_MANIFEST.txt") || findFile("chapter_2_exact_manifest.txt");

  const result: Omit<ChapterRecord, "createdAt">[] = [];
  if (chapterOneFile) result.push(await parseHermesJsonManifest(chapterOneFile, "Chapter 1"));
  if (chapterTwoManifest) {
    const exactPromptMap = await parseHermesExactManifestText(chapterTwoExact);
    const parsed = await parseHermesChapterTwoFromPanelIndex(chapterTwoManifest, exactPromptMap);
    if (parsed) result.push(parsed);
  }
  if (chapterThreeFile) result.push(await parseHermesJsonManifest(chapterThreeFile, "Chapter 3"));

  return result.sort((left, right) => left.chapterTitle.localeCompare(right.chapterTitle));
}

async function parseHermesJsonManifest(
  filePath: string,
  fallbackTitle: string,
): Promise<Omit<ChapterRecord, "createdAt">> {
  const manifest = await readJsonFile<Record<string, unknown>>(filePath);
  const chapterTitle = getHermesString(manifest.chapterTitle, manifest.title, fallbackTitle);
  const chapterPrompt = getHermesString(
    manifest.chapterPrompt,
    manifest.summary,
    `Imported from ${chapterTitle}`,
  );
  const chapterSummary = getHermesString(manifest.summary, manifest.description, `${chapterTitle} from Hermes source.`);
  const rawPages = getHermesPages(manifest);

  const pages = rawPages.map((rawPage, pageIndex) => {
    const pageNumber = coercePositiveInt(rawPage.pageNumber, rawPage.page, pageIndex + 1);
    const summary = getHermesString(rawPage.summary, rawPage.title, rawPage.heading, `Page ${pageNumber}`);
    const rawPanels = asPanelArray(rawPage.panels);

    const panels = rawPanels.map((rawPanel, panelIndex) => {
      const panelNumber = coercePositiveInt(rawPanel.panelNumber, rawPanel.panel, rawPanel.id, panelIndex + 1);
      const artworkPrompt = getHermesString(
        rawPanel.artwork_prompt,
        rawPanel.artworkPrompt,
        rawPanel.prompt,
        `Import panel ${pageNumber}.${panelNumber}`,
      );
      const scriptText = getHermesString(rawPanel.text, rawPanel.script, rawPanel.dialogue, "");
      const continuityNotes = getHermesString(rawPanel.continuityNotes, rawPanel.continuity, rawPanel.notes, "Imported continuity note.");
      const action = [artworkPrompt, scriptText].filter(Boolean).join(" ").trim() || "Imported panel action from Hermes source.";
      const characters = normalizeCharacterList(rawPanel.characters, scriptText);

      const dialogue = coerceHermesDialogue(scriptText);
      const dialogueLines = normalizeDialogueLines(undefined, dialogue, characters);
      return {
        panelId: `import-${createHash("sha1").update(`${filePath}-${pageNumber}-${panelIndex}`).digest("hex").slice(0, 10)}`,
        panelNumber,
        cameraAngle: getHermesString(rawPanel.cameraAngle, rawPanel.angle, "wide"),
        shotType: getHermesString(rawPanel.shotType, rawPanel.shot, "wide"),
        characters,
        setting: getHermesString(rawPanel.location, rawPanel.setting, "open location"),
        timeOfDay: getHermesString(rawPanel.timeOfDay, rawPanel.time, "day"),
        mood: getHermesString(rawPanel.mood, "tense"),
        action,
        dialogueLines,
        dialogue: dialogueText(dialogueLines),
        narration: getHermesString(rawPanel.narration, ""),
        soundEffect: getHermesString(rawPanel.soundEffect, rawPanel.sound, ""),
        continuityNotes,
        prompt: artworkPrompt || action,
        negativePrompt: "No off-model anatomy, no broken limbs, no inconsistent costumes, no duplicated character faces.",
        assetFiles: [],
      };
    });

    return {
      pageId: `imported-${createHash("sha1").update(`${filePath}-${pageNumber}`).digest("hex").slice(0, 10)}`,
      pageNumber,
      summary,
      panels,
    };
  });

  return {
    chapterId: `import-${createHash("sha1").update(filePath).digest("hex").slice(0, 10)}`,
    chapterTitle,
    chapterPrompt,
    summary: chapterSummary,
    status: "completed",
    pages,
  };
}

async function parseHermesChapterTwoFromPanelIndex(
  tsvPath: string,
  exactPromptMap: Record<string, string>,
): Promise<Omit<ChapterRecord, "createdAt"> | null> {
  const content = await fs.readFile(tsvPath, "utf8");
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].split("\t").map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const idx = (patterns: string[]) => header.findIndex((value) => patterns.includes(value));
  const pageIdx = idx(["page", "pagenumber", "pageno", "panelpage"]);
  const panelIdx = idx(["panel", "panelid", "id", "panelnumber"]);
  const textIdx = idx(["text", "script", "artworkprompt", "prompt", "dialogue"]);
  const locationIdx = idx(["location", "setting", "scene", "place"]);
  const charactersIdx = idx(["characters", "char", "character", "who"]);
  const soundIdx = idx(["sound", "soundeffect", "sfx"]);

  const rows = lines.slice(1).map((line) => {
    const columns = line.split("\t");
    const row: Record<string, string> = {};
    header.forEach((headerName, headerIndex) => {
      if (columns[headerIndex] !== undefined) row[headerName] = columns[headerIndex].trim();
    });
    return row;
  });

  const pagesMap = new Map<number, Omit<PageRecord, "pageId">>();
  for (const row of rows) {
    const pageNumber = coercePositiveInt(row[header[pageIdx] || "page"]);
    if (!pageNumber) continue;

    const panelToken = getHermesString(row[header[panelIdx] || "panel"], row.panel, "");
    const parsedPanel = parsePanelIdentifier(panelToken);
    const text = getHermesString(
      row[header[textIdx] || "text"],
      exactPromptMap[panelToken],
      exactPromptMap[`${pageNumber}.${parsedPanel.panelNumber}`],
      "",
    );
    const setting = getHermesString(row[header[locationIdx] || "location"], "open location");
    const characters = normalizeCharacterList(row[header[charactersIdx] || "characters"]);
    const soundEffect = getHermesString(row[header[soundIdx] || "sound"], "");

    const dialogueLines = normalizeDialogueLines(undefined, coerceHermesDialogue(text), characters);
    const panel: PanelRecord = {
      panelId: `ch2-${createHash("sha1").update(`${panelToken}-${pageNumber}`).digest("hex").slice(0, 10)}`,
      panelNumber: parsedPanel.panelNumber || 1,
      cameraAngle: "wide",
      shotType: "wide",
      characters,
      setting,
      timeOfDay: "day",
      mood: "tense",
      action: text || `Imported panel ${pageNumber}.${parsedPanel.panelNumber}.`,
      dialogueLines,
      dialogue: dialogueText(dialogueLines),
      narration: text,
      soundEffect,
      continuityNotes: `Imported continuity for page ${pageNumber}, panel ${parsedPanel.panelNumber}.`,
      prompt: text || `Import panel ${pageNumber}.${parsedPanel.panelNumber}.`,
      negativePrompt: "No off-model anatomy, no broken limbs, no inconsistent costumes, no duplicated character faces.",
      assetFiles: [],
    };

    const existing = pagesMap.get(pageNumber) ?? { pageNumber, summary: `Imported page ${pageNumber}`, panels: [] };
    existing.panels.push(panel);
    pagesMap.set(pageNumber, existing);
  }

  if (!pagesMap.size) return null;
  const pages: PageRecord[] = Array.from(pagesMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, page]) => ({
      pageId: `imported-ch2-${createHash("sha1").update(`${tsvPath}-${pageNumber}`).digest("hex").slice(0, 10)}`,
      pageNumber,
      summary: page.summary,
      panels: page.panels.sort((left, right) => left.panelNumber - right.panelNumber),
    }));

  return {
    chapterId: `import-${createHash("sha1").update(`ch2-${tsvPath}`).digest("hex").slice(0, 10)}`,
    chapterTitle: "Chapter 2",
    chapterPrompt: "Imported Chapter 2 from Hermes panel index.",
    summary: "Imported content for chapter 2 from Hermes TSV manifest.",
    status: "completed",
    pages,
  };
}

async function parseHermesExactManifestText(manifestPath?: string | null): Promise<Record<string, string>> {
  if (!manifestPath) return {};
  const content = await fs.readFile(manifestPath, "utf8");
  const map: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const pipeMatch = line.match(/^([0-9]+\.[0-9]+)\s*\|\s*(.+)$/);
    if (pipeMatch) {
      map[pipeMatch[1].trim()] = pipeMatch[2].trim();
      continue;
    }
    const tabMatch = line.match(/^([0-9]+\.[0-9]+)\t(.+)$/);
    if (tabMatch) {
      map[tabMatch[1].trim()] = tabMatch[2].trim();
      continue;
    }
    const spaceMatch = line.match(/^([0-9]+\.[0-9]+)\s+(.+)$/);
    if (spaceMatch) {
      map[spaceMatch[1].trim()] = spaceMatch[2].trim();
    }
  }
  return map;
}

function getHermesString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

function coercePositiveInt(...values: unknown[]): number {
  for (const value of values) {
    const numeric = typeof value === "string" ? Number(value.split(/[ \t_-]/)[0]) : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return Math.max(1, Math.round(numeric));
  }
  return 0;
}

function coerceStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

type HermesPanel = { [key: string]: unknown };
type HermesPage = { [key: string]: unknown };

function getHermesPages(manifest: { [key: string]: unknown }): HermesPage[] {
  if (Array.isArray((manifest as { pages?: unknown[] }).pages)) {
    return (manifest as { pages: unknown[] }).pages.filter((page) => page !== null && typeof page === "object") as HermesPage[];
  }
  if (Array.isArray((manifest as { page_manifest?: unknown[] }).page_manifest)) {
    return (manifest as { page_manifest: unknown[] }).page_manifest.filter((page) => page !== null && typeof page === "object") as HermesPage[];
  }
  return [];
}

function asPanelArray(value: unknown): HermesPanel[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is HermesPanel => entry !== null && typeof entry === "object");
}

function parsePanelIdentifier(input: string): { pageNumber: number; panelNumber: number } {
  const match = /^([0-9]+)\.([0-9]+)/.exec(input);
  if (!match) return { pageNumber: 0, panelNumber: 1 };
  return { pageNumber: coercePositiveInt(match[1]), panelNumber: coercePositiveInt(match[2]) };
}

function normalizeCharacterList(...values: unknown[]): string[] {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const list = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (list.length) return list;
    }
    if (typeof value === "string") {
      const split = value
        .split(/[;,|]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (split.length) return split;
      const derived = Array.from(value.matchAll(/^([A-Za-z][^:]+):/gm)).map((entry) => entry[1].trim()).filter(Boolean);
      if (derived.length) return derived;
    }
  }
  return [];
}

function coerceHermesDialogue(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.includes(":") ? line : `OPAIJA: ${line}`))
    .join("\n");
}

export async function upsertProjectSetup(projectId: string, setup: Partial<ProjectSetupInput>): Promise<ProjectRecord> {
  const project = await readProject(projectId);
  const next: ProjectRecord["setup"] = {
    ...project.setup,
    title: setup.title?.trim() || project.setup.title,
    description: setup.description?.trim() || project.setup.description,
    targetTrim: setup.targetTrim?.trim() || project.setup.targetTrim,
    styleNotes: setup.styleNotes?.trim() || project.setup.styleNotes,
    artworkModelPreference: resolveArtworkModelPreference(setup.artworkModelPreference ?? project.setup.artworkModelPreference),
    kdpBookType: setup.kdpBookType || project.setup.kdpBookType || "graphic_novel",
    fontFamily: setup.fontFamily?.trim() || project.setup.fontFamily || "Noto Sans",
  };
  if (setup.targetPagesPerChapter !== undefined) {
    next.targetPagesPerChapter = coerceRange(setup.targetPagesPerChapter, project.setup.targetPagesPerChapter, 2, 120);
  }
  if (setup.defaultPanelsPerPage !== undefined) {
    next.defaultPanelsPerPage = coerceRange(setup.defaultPanelsPerPage, project.setup.defaultPanelsPerPage, 1, 12);
  }
  if (setup.fontSizePx !== undefined) {
    next.fontSizePx = coerceRange(setup.fontSizePx, project.setup.fontSizePx, 12, 32);
  }
  project.setup = next;
  project.updatedAt = new Date().toISOString();
  await writeProject(project);
  return project;
}

export async function upsertProjectCover(projectId: string, coverInput: ProjectCoverUpdate): Promise<ProjectRecord> {
  const project = await readProject(projectId);
  const next: ProjectRecord["cover"] = {
    front: {
      ...project.cover.front,
      ...coverInput.front,
      title: normalizeCoverText(coverInput.front?.title ?? project.cover.front.title, project.setup.title),
      subtitle: normalizeCoverText(coverInput.front?.subtitle ?? project.cover.front.subtitle, project.setup.title),
      tagline: normalizeCoverText(coverInput.front?.tagline ?? project.cover.front.tagline, "A printed adventure."),
      author: normalizeCoverText(coverInput.front?.author ?? project.cover.front.author, "OPAIJA Creative Studio"),
      seriesName: normalizeCoverText(coverInput.front?.seriesName ?? project.cover.front.seriesName, "OPAIJA"),
      blurb: normalizeCoverText(coverInput.front?.blurb ?? project.cover.front.blurb, ""),
      customPrompt: normalizeCoverText(coverInput.front?.customPrompt ?? project.cover.front.customPrompt, ""),
      side: "front" as const,
    },
    back: {
      ...project.cover.back,
      ...coverInput.back,
      title: normalizeCoverText(coverInput.back?.title ?? project.cover.back.title, project.setup.title),
      subtitle: normalizeCoverText(coverInput.back?.subtitle ?? project.cover.back.subtitle, "The OPAIJA Universe"),
      tagline: normalizeCoverText(coverInput.back?.tagline ?? project.cover.back.tagline, "Includes cast and production notes."),
      author: normalizeCoverText(coverInput.back?.author ?? project.cover.back.author, "OPAIJA Creative Studio"),
      seriesName: normalizeCoverText(coverInput.back?.seriesName ?? project.cover.back.seriesName, "OPAIJA"),
      blurb: normalizeCoverText(coverInput.back?.blurb ?? project.cover.back.blurb, ""),
      customPrompt: normalizeCoverText(coverInput.back?.customPrompt ?? project.cover.back.customPrompt, ""),
      side: "back" as const,
    },
  };
  project.cover = next;
  project.updatedAt = new Date().toISOString();
  mergeCoverConfig(project);
  await writeProject(project);
  return project;
}

export async function setStyleBible(projectId: string, styleBible: StyleBibleInput): Promise<ProjectRecord> {
  if (!styleBible.styleName?.trim()) throw new Error("styleName is required.");
  if (!styleBible.stylePrompt?.trim()) throw new Error("stylePrompt is required.");

  const project = await readProject(projectId);
  project.styleBible = {
    styleName: styleBible.styleName.trim(),
    stylePrompt: styleBible.stylePrompt.trim(),
    palette: styleBible.palette?.map((value) => value.trim()).filter(Boolean) || [],
    lineQuality: normalizeLineQuality(styleBible.lineQuality),
    moodLevel: normalizeMoodLevel(styleBible.moodLevel),
  };
  project.updatedAt = new Date().toISOString();
  await writeProject(project);
  await writeJson(
    path.join(getProjectPath(projectId), "style-bible.json"),
    project.styleBible,
  );
  await writeJson(
    path.join(getProjectPath(projectId), "prompts", `style-bible-${Date.now()}.json`),
    {
      updatedAt: new Date().toISOString(),
      signature: createHash("sha1").update(JSON.stringify(project.styleBible)).digest("hex"),
    },
  );
  return project;
}

export async function upsertCharacterBible(projectId: string, bible: CharacterBible): Promise<ProjectRecord> {
  if (!bible.characterId?.trim() || !bible.name?.trim()) {
    throw new Error("characterId and name are required.");
  }

  const project = await readProject(projectId);
  const normalizedId = slugify(bible.characterId);
  const entryIndex = project.characterBibles.findIndex((item) => item.characterId === normalizedId);
  const existing = entryIndex >= 0 ? project.characterBibles[entryIndex] : undefined;
  const entry: CharacterBible = {
    characterId: normalizedId,
    name: bible.name.trim(),
    aliases: bible.aliases ?? existing?.aliases ?? [],
    role: bible.role?.trim(),
    visualStyle: bible.visualStyle?.trim(),
    personality: bible.personality?.trim(),
    powers: bible.powers?.trim(),
    referencePrompt: bible.referencePrompt?.trim() || existing?.referencePrompt,
    referenceImages: existing?.referenceImages ?? bible.referenceImages ?? [],
  };

  if (entryIndex >= 0) project.characterBibles[entryIndex] = entry;
  else project.characterBibles.push(entry);
  project.characterBibles.sort((left, right) => left.characterId.localeCompare(right.characterId));
  project.updatedAt = new Date().toISOString();
  await writeProject(project);
  await writeJson(path.join(getProjectPath(projectId), "character-bibles.json"), project.characterBibles);
  return project;
}

export async function updatePanelContent(
  projectId: string,
  chapterId: string,
  pageNumber: number,
  panelNumber: number,
  patch: Partial<Pick<PanelRecord, "action" | "prompt" | "dialogue" | "dialogueLines" | "narration" | "soundEffect" | "continuityNotes" | "timeOfDay" | "mood" | "setting" | "cameraAngle" | "shotType" | "characters">>,
): Promise<ChapterRecord> {
  if (!Number.isFinite(pageNumber) || !Number.isFinite(panelNumber)) {
    throw new Error("Page and panel numbers are required.");
  }

  const project = await readProject(projectId);
  const chapterPath = path.join(getProjectPath(projectId), "chapters", chapterId, "chapter-manifest.json");
  const chapter = await readJsonFile<ChapterRecord>(chapterPath);
  const page = chapter.pages.find((entry) => entry.pageNumber === pageNumber);
  if (!page) throw new Error("Page not found.");
  const panel = page.panels.find((entry) => entry.panelNumber === panelNumber);
  if (!panel) throw new Error("Panel not found.");

  panel.action = patch.action?.trim() ?? panel.action;
  panel.prompt = patch.prompt?.trim() || panel.prompt;
  panel.dialogueLines = normalizeDialogueLines(patch.dialogueLines, patch.dialogue ?? panel.dialogue, patch.characters ?? panel.characters);
  panel.dialogue = dialogueText(panel.dialogueLines);
  panel.narration = patch.narration?.trim() ?? panel.narration;
  panel.soundEffect = patch.soundEffect?.trim() ?? panel.soundEffect;
  panel.continuityNotes = patch.continuityNotes?.trim() ?? panel.continuityNotes;
  panel.timeOfDay = patch.timeOfDay?.trim() || panel.timeOfDay;
  panel.mood = patch.mood?.trim() || panel.mood;
  panel.setting = patch.setting?.trim() || panel.setting;
  panel.cameraAngle = patch.cameraAngle?.trim() || panel.cameraAngle;
  panel.shotType = patch.shotType?.trim() || panel.shotType;
  if (patch.characters) {
    const normalizedCharacters = patch.characters
      .map((character) => String(character ?? "").trim())
      .filter(Boolean);
    if (normalizedCharacters.length > 0) {
      panel.characters = normalizedCharacters;
    }
  }

  const panelDir = path.join(
    getProjectPath(projectId),
    "chapters",
    chapterId,
    "pages",
    String(pageNumber),
    `panel-${String(panelNumber).padStart(2, "0")}`,
  );
  await ensureDir(panelDir);
  const promptFile = path.join(panelDir, buildPanelPromptFileName(project, chapter, pageNumber, panel.panelNumber));
  const negativePromptFile = path.join(panelDir, "negative-prompt.txt");
  const manifestFile = path.join(panelDir, "panel-manifest.json");
  await writeText(promptFile, buildPanelPrompt(chapter, page, panel));
  const negativePrompt = panel.negativePrompt || "No negative prompt provided.";
  await writeText(negativePromptFile, negativePrompt);
  await writeJson(manifestFile, panel);

  page.panels = page.panels.map((entry) => (entry.panelNumber === panel.panelNumber ? panel : entry));
  chapter.pages = chapter.pages.map((entry) => (entry.pageNumber === pageNumber ? page : entry));
  chapter.createdAt = chapter.createdAt || new Date().toISOString();
  await writeJson(path.join(getProjectPath(projectId), "chapters", chapterId, "chapter-manifest.json"), chapter);

  const projectChapters = project.chapters.find((entry) => entry.chapterId === chapterId);
  if (projectChapters) {
    projectChapters.summary = chapter.summary;
  }
  project.updatedAt = new Date().toISOString();
  await writeProject(project);

  return chapter;
}

export async function updatePageContent(
  projectId: string,
  chapterId: string,
  pageNumber: number,
  patch: Partial<Pick<PageRecord, "summary">>,
): Promise<ChapterRecord> {
  if (!Number.isFinite(pageNumber)) throw new Error("Page number is required.");

  const project = await readProject(projectId);
  const chapter = await getChapterPayload(projectId, chapterId);
  const page = chapter.pages.find((entry) => entry.pageNumber === pageNumber);
  if (!page) throw new Error("Page not found.");

  if (typeof patch.summary === "string") {
    page.summary = patch.summary.trim();
  }

  const chapterSummary = project.chapters.find((entry) => entry.chapterId === chapter.chapterId);
  if (chapterSummary) {
    chapterSummary.summary = chapter.summary;
  }

  page.panels = page.panels.map((panel) => panel);
  chapter.pages = chapter.pages.map((entry) => entry.pageNumber === pageNumber ? page : entry);
  await writeJson(path.join(getProjectPath(projectId), "chapters", chapterId, "chapter-manifest.json"), chapter);

  project.updatedAt = new Date().toISOString();
  await writeProject(project);

  return chapter;
}

export async function deleteProject(projectId: string): Promise<void> {
  await clearProjectJobs(projectId);
  const projectPath = getProjectPath(projectId);
  await fs.rm(projectPath, { recursive: true, force: true });
}

export async function getProjectJobs(projectId: string): Promise<BookJob[]> {
  const jobs = await listAllJobs();
  await markStaleJobsInPlace(jobs);
  return jobs.filter((job) => job.projectId === projectId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getBookJob(jobId: string): Promise<BookJob> {
  const job = await readJob(jobId);
  await markStaleJobsInPlace([job]);
  return job;
}

export async function listProjectAssets(projectId: string): Promise<ProjectAsset[]> {
  const projectPath = getProjectPath(projectId);
  const files = await collectFiles(projectPath);
  const root = path.join(storage.root, "projects", projectId);
  const results: ProjectAsset[] = [];

  for (const file of files) {
    const rel = path.relative(root, file.absolutePath).split(path.sep).join("/");
    if (rel === "project.json") continue;

    let category: ProjectAsset["category"] = "chapter-prompt";
    if (/^exports\/[^/]+\.json$/i.test(rel)) category = "export-manifest";
    else if (rel === "style-bible.json") category = "style-bible";
    else if (rel === "character-bibles.json") category = "character-bible";
    else if (/^character-bibles\/[^/]+\/(?:[a-z0-9-]+-)?reference-[^/]+\.png$/i.test(rel)) category = "character-reference";
    else if (/^covers\/cover-front-[^/]+\.png$/i.test(rel)) category = "front-cover";
    else if (/^covers\/cover-back-[^/]+\.png$/i.test(rel)) category = "back-cover";
    else if (rel === "continuity.json" || /\/continuity[^/]*\.(?:json|txt)$/i.test(rel)) category = "continuity-log";
    else if (rel.endsWith("negative-prompt.txt") || rel.includes("-prompt.txt")) category = "panel-prompt";
    else if (/^chapters\/[^/]+\/pages\/[^/]+\/panel-\d+\/(?:art|clean-art|lettering)-[^/]+\.(?:png|svg)$/i.test(rel)) category = "panel-artwork";
    else if (rel.endsWith("chapter-manifest.json")) category = "chapter-prompt";

    results.push({
      path: rel,
      fileName: rel.split(/[\\\/]/).at(-1) ?? rel,
      category,
      bytes: file.size,
      updatedAt: file.updatedAt,
    });
  }

  return results.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function buildProjectExportManifest(projectId: string): Promise<ProjectExportManifest> {
  const project = await readProject(projectId);
  const chapterPayloads = await Promise.all(
    project.chapters.map(async (chapterSummary) => {
      try {
        return await getChapterPayload(projectId, chapterSummary.chapterId);
      } catch {
        return null;
      }
    }),
  );

  let totalPages = 0;
  let totalPanels = 0;
  for (const chapter of chapterPayloads) {
    if (!chapter) continue;
    totalPages += chapter.pages.length;
    for (const page of chapter.pages) {
      totalPanels += page.panels.length;
    }
  }

  const sourceAssets = (await listProjectAssets(projectId)).filter((asset) => asset.category !== "export-manifest");
  const sortedAssets = [...sourceAssets].sort((left, right) => left.path.localeCompare(right.path));
  const exportDir = path.join(getProjectPath(projectId), "exports");
  await ensureDir(exportDir);

  const packageName = `opaija-${safeFileToken(project.projectSlug, project.projectId)}-${project.setup.kdpBookType}-${project.chapters.length || 0}ch-${totalPages || 0}p-${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}`;
  const manifestFileName = `${packageName}.json`;
  const manifestRelativePath = `exports/${manifestFileName}`;

  const exportedAt = new Date().toISOString();
  const manifestAsset: ProjectExportFile = {
    path: manifestRelativePath,
    fileName: manifestFileName,
    category: "export-manifest",
    bytes: 0,
    updatedAt: exportedAt,
  };

  const payload: ProjectExportManifest = {
    projectId: project.projectId,
    projectTitle: project.setup.title,
    projectSlug: project.projectSlug,
    packageName,
    exportedAt,
    manifestPath: manifestRelativePath,
    bookType: project.setup.kdpBookType,
    totalChapters: project.chapters.length,
    totalPages,
    totalPanels,
    totalAssets: sortedAssets.length + 1,
    totalArtworkFiles: sortedAssets.filter((asset) => asset.category === "panel-artwork" || asset.category === "front-cover" || asset.category === "back-cover").length,
    targetTrim: project.setup.targetTrim,
    pagesPerPage: project.setup.defaultPanelsPerPage,
    recommendedFont: project.setup.fontFamily || "Noto Sans",
    files: sortedAssets.map((asset) => ({
      path: asset.path,
      fileName: asset.fileName,
      category: asset.category,
      bytes: asset.bytes,
      updatedAt: asset.updatedAt,
    })),
  };
  payload.files.push(manifestAsset);

  for (let attempt = 0; attempt < 6; attempt++) {
    const nextBytes = Buffer.byteLength(`${JSON.stringify(payload, null, 2)}\n`);
    if (nextBytes === manifestAsset.bytes) break;
    manifestAsset.bytes = nextBytes;
  }

  await writeJson(path.join(exportDir, manifestFileName), payload);
  return payload;
}

type ChapterGenerationOptions = {
  sourceJobId?: string;
  attempt?: number;
};

export async function startChapterGeneration(
  projectId: string,
  input: ChapterGenerationInput,
  options: ChapterGenerationOptions = {},
): Promise<{ jobId: string; status: string }> {
  const project = await readProject(projectId);
  if (!project.styleBible) {
    project.styleBible = buildFallbackStyleBible(project);
    const projectPath = getProjectPath(projectId);
    await writeJson(path.join(projectPath, "style-bible.json"), project.styleBible);
    await writeJson(path.join(projectPath, "prompts", `style-bible-${Date.now()}.json`), {
      updatedAt: new Date().toISOString(),
      signature: createHash("sha1").update(JSON.stringify(project.styleBible)).digest("hex"),
    });
    await writeProject(project);
  }
  if (!input.chapterTitle?.trim()) throw new Error("chapterTitle is required.");
  if (!input.chapterPrompt?.trim()) throw new Error("chapterPrompt is required.");
  const raw = input as unknown as Record<string, unknown>;
  const incomingAppendToChapterId = coerceStringValue(
    raw.appendToChapterId,
    raw.continueToChapterId,
    raw.continueChapterId,
    raw.sourceChapterId,
  );
  const incomingStartPage = coercePositiveInt(
    raw.startPage,
    raw.startPageNumber,
    raw.start_page,
    raw.pageStart,
    raw.startFromPage,
  );

  const request: ChapterGenerationInput = {
    chapterTitle: input.chapterTitle.trim(),
    chapterPrompt: input.chapterPrompt.trim(),
    targetPages: coerceRange(input.targetPages, project.setup.targetPagesPerChapter, 2, 120),
    panelsPerPage: coerceRange(input.panelsPerPage, project.setup.defaultPanelsPerPage, 1, 12),
    includeDialogue: input.includeDialogue ?? true,
    includeSoundEffects: input.includeSoundEffects ?? true,
    startPage: coercePositiveInt(incomingStartPage, 1),
    appendToChapterId: incomingAppendToChapterId || input.appendToChapterId?.trim() || undefined,
  };
  if (request.appendToChapterId) {
    const summary = project.chapters.find((entry) => entry.chapterId === request.appendToChapterId);
    if (!summary) {
      throw new Error("The selected chapter for continuation no longer exists in this project.");
    }
    const chapter = await getChapterPayload(projectId, request.appendToChapterId);
    const lastPage = chapter.pages.at(-1)?.pageNumber ?? 0;
    if (coercePositiveInt(input.startPage)) {
      const requestedStartPage = coercePositiveInt(input.startPage);
      if (requestedStartPage <= lastPage) {
        throw new Error(`Invalid start page. Continued chapter must start after page ${lastPage}.`);
      }
      request.startPage = requestedStartPage;
    } else {
      request.startPage = lastPage + 1;
    }
    request.chapterTitle = summary.chapterTitle;
  }

  const jobId = randomUUID();
  const job: BookJob = {
    jobId,
    projectId,
    status: "queued",
    step: "queued",
    progress: 5,
    startedAt: new Date().toISOString(),
    attempt: options.attempt ?? 1,
    sourceJobId: options.sourceJobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request,
  };
  await writeJson(path.join(storage.jobs, `${jobId}.json`), job);
  void runChapterGenerationJob(projectId, jobId).catch(() => undefined);
  return { jobId, status: "queued" };
}

export async function regenerateJob(jobId: string): Promise<{ jobId: string; status: string }> {
  const sourceJob = await readJob(jobId);
  return startChapterGeneration(sourceJob.projectId, sourceJob.request, {
    sourceJobId: sourceJob.jobId,
    attempt: (sourceJob.attempt ?? 1) + 1,
  });
}

export async function buildAllPanelArtwork(
  projectId: string,
  request: ProjectArtworkBuildRequest = {},
): Promise<ProjectArtworkBuildResult> {
  const project = await readProject(projectId);
  if (!project.chapters.length) {
    throw new Error("Project has no chapters to build artwork for.");
  }

  const skipExisting = request.skipExisting ?? true;
  const chapterId = request.chapterId?.trim();
  const hasRangeFilter = request.fromPage !== undefined || request.toPage !== undefined;
  const requestedFromPage = request.fromPage !== undefined ? coercePositiveInt(request.fromPage) : 1;
  const requestedToPage = request.toPage !== undefined ? coercePositiveInt(request.toPage) : Number.POSITIVE_INFINITY;
  const resolvedFromPage = Math.max(1, requestedFromPage || 1);
  const resolvedToPage = Math.max(resolvedFromPage, Number.isFinite(requestedToPage) ? requestedToPage : Number.POSITIVE_INFINITY);
  const chapterSummaries = chapterId
    ? project.chapters.filter((candidate) => candidate.chapterId === chapterId)
    : project.chapters;

  if (hasRangeFilter && request.fromPage !== undefined && request.toPage !== undefined && resolvedToPage < resolvedFromPage) {
    throw new Error("fromPage cannot be greater than toPage.");
  }

  if (chapterId && chapterSummaries.length === 0) {
    throw new Error(`Chapter ${chapterId} was not found in this project.`);
  }

  let totalPanels = 0;
  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const chapterSummary of chapterSummaries) {
    const chapter = await getChapterPayload(projectId, chapterSummary.chapterId);
    const pageEntries = hasRangeFilter
      ? chapter.pages.filter((page) => page.pageNumber >= resolvedFromPage && page.pageNumber <= resolvedToPage)
      : chapter.pages;
    for (const page of pageEntries) {
      for (const panel of page.panels) {
        totalPanels += 1;
        const panelHasArtwork = (panel.assetFiles ?? []).some((assetPath) => /(?:^|\/)art-[a-z0-9-]+-p\d+-panel-\d+-\d+\.png$/i.test(assetPath));
        if (skipExisting && panelHasArtwork) {
          skipped += 1;
          continue;
        }
        try {
          await generatePanelArtwork(projectId, chapter.chapterId, page.pageNumber, panel.panelNumber);
          generated += 1;
        } catch (error) {
          errors.push(
            `p${page.pageNumber}-panel${panel.panelNumber} (${chapter.chapterTitle}): ${error instanceof Error ? error.message : "Unable to generate panel."}`,
          );
        }
      }
    }
  }

  return {
    projectId,
    totalPanels,
    generated,
    skipped,
    errors,
  };
}

export async function getProjectContinuity(projectId: string): Promise<ContinuityEntry[]> {
  return readJsonFile<ContinuityEntry[]>(path.join(getProjectPath(projectId), "continuity.json"), []);
}

export async function getKdpEstimate(
  projectId: string,
  request: KdpEstimateRequest,
): Promise<KdpEstimateResult> {
  const project = await readProject(projectId);
  const pages = request.totalPages ? coercePositiveInt(request.totalPages) : await countProjectPages(project);
  const totalPages = Math.max(1, pages);
  const trimSize = request.trimSize?.trim() || project.setup.targetTrim;
  const isColor = request.isColor;
  const baseRates: Record<KdpEstimateRequest["bookType"], { base: number; perPage: number; printOverhead: number; font: string }> = {
    coloring_book: { base: 1.65, perPage: 0.12, printOverhead: 0.42, font: "Arial" },
    comic_book: { base: 1.15, perPage: 0.09, printOverhead: 0.33, font: "Noto Sans" },
    art_book: { base: 1.9, perPage: 0.08, printOverhead: 0.54, font: "IBM Plex Sans" },
    journal: { base: 0.85, perPage: 0.06, printOverhead: 0.2, font: "Merriweather" },
    graphic_novel: { base: 1.35, perPage: 0.07, printOverhead: 0.38, font: "Georgia" },
    other: { base: 1.1, perPage: 0.07, printOverhead: 0.3, font: "Noto Sans" },
  };
  const profile = baseRates[request.bookType];
  const colorMultiplier = isColor ? 1.35 : 1;
  const trimFactor = trimSize.includes("6.625") ? 1 : 1.06;
  const printCostEstimate = Number(((profile.base + totalPages * profile.perPage * colorMultiplier + profile.printOverhead) * trimFactor).toFixed(2));

  const suggestedMin = Math.max(4.99, roundMoney(printCostEstimate + 3.5));
  const suggestedMax = Math.max(suggestedMin + 1.5, printCostEstimate + 7.5);
  const baseRoyalty = 0.6;
  const estimatedRoyalty = {
    min: roundMoney((suggestedMin * baseRoyalty) - printCostEstimate),
    max: roundMoney((suggestedMax * baseRoyalty) - printCostEstimate),
  };

  return {
    bookType: request.bookType,
    totalPages,
    trimSize,
    printCostEstimate,
    suggestedRetail: {
      min: suggestedMin,
      max: suggestedMax,
    },
    estimatedRoyalty: {
      min: Math.max(0, estimatedRoyalty.min),
      max: Math.max(0, estimatedRoyalty.max),
    },
    setupLine: `${request.bookType.replace(/_/g, " ")} layout, ${isColor ? "full color" : "grayscale"}, ${trimSize}, ${project.setup.fontFamily} ${project.setup.fontSizePx}pt`,
    recommendedFont: project.setup.fontFamily,
  };
}

export async function getChapterPayload(projectId: string, chapterId: string): Promise<ChapterRecord> {
  const chapterPath = path.join(getProjectPath(projectId), "chapters", chapterId, "chapter-manifest.json");
  return readJsonFile<ChapterRecord>(chapterPath);
}

export type PanelArtworkResult = {
  provider: "replicate";
  model: string;
  projectId: string;
  chapterId: string;
  pageNumber: number;
  panelNumber: number;
  fileName: string;
  assetPath: string;
  artworkApiPath: string;
  bytes: number;
  characterBiblesUsed: string[];
  characterReferencesUsed: string[];
  imageConditionedReferences: string[];
};

export type CharacterArtworkResult = {
  provider: "replicate";
  model: string;
  projectId: string;
  characterId: string;
  fileName: string;
  assetPath: string;
  artworkApiPath: string;
  bytes: number;
};

export type ProjectCoverArtworkResult = {
  provider: "replicate";
  model: string;
  projectId: string;
  side: CoverSide;
  fileName: string;
  assetPath: string;
  artworkApiPath: string;
  bytes: number;
};

export async function generateProjectCover(projectId: string, side: CoverSide): Promise<ProjectCoverArtworkResult> {
  if (!isReplicateConfigured()) throw new Error("REPLICATE_API_TOKEN is not configured.");
  if (side !== "front" && side !== "back") throw new Error("Invalid cover side.");

  const project = await readProject(projectId);
  const prompt = buildCoverPrompt(project, side);
  const generated = await generateStillFrameFile({
    prompt,
    aspectRatio: "2:3",
    modelOverride: resolveArtworkModel(project.setup.artworkModelPreference, 0),
  });
  const coverDir = path.join(getProjectPath(projectId), "covers");
  await ensureDir(coverDir);
  const fileName = buildCoverFileName(project, side, buildCoverArtifactStem(project, side));
  const filePath = path.join(coverDir, fileName);
  await fs.writeFile(filePath, generated.buffer);

  const now = new Date().toISOString();
  const assetPath = path.relative(getProjectPath(projectId), filePath).split(path.sep).join("/");
  if (side === "front") {
    project.cover.front = {
      ...project.cover.front,
      lastArtworkFileName: fileName,
      lastGeneratedAt: now,
      lastGeneratedModel: generated.model,
    };
  } else {
    project.cover.back = {
      ...project.cover.back,
      lastArtworkFileName: fileName,
      lastGeneratedAt: now,
      lastGeneratedModel: generated.model,
    };
  }
  project.updatedAt = now;
  await writeProject(project);

  await writeJson(path.join(coverDir, `${buildCoverArtifactStem(project, side)}-${Date.now()}-prompt.json`), {
    side,
    model: generated.model,
    generatedAt: now,
    prompt,
    fileName,
  });

  return {
    provider: "replicate",
    model: generated.model,
    projectId,
    side,
    fileName,
    assetPath,
    artworkApiPath: `/api/book-builder/projects/${projectId}/cover/${side}/artwork/${fileName}`,
    bytes: generated.buffer.length,
  };
}

export async function getProjectCoverArtworkPath(projectId: string, side: CoverSide, fileName: string): Promise<string> {
  if (!isCoverSide(side)) {
    throw new Error("Invalid cover side.");
  }
  if (!/^(?:cover-(?:front|back)-[a-z0-9-]+-[0-9]+\.png)$/.test(fileName)) {
    throw new Error("Invalid cover artwork file name.");
  }
  if (!fileName.startsWith(`cover-${side}-`)) {
    throw new Error("Cover artwork side mismatch.");
  }
  const project = await readProject(projectId);
  const config = project.cover[side];
  if (!config) throw new Error("Cover configuration not found.");
  if (config.lastArtworkFileName && config.lastArtworkFileName !== fileName) {
    const fallback = await fs.stat(path.join(getProjectPath(projectId), "covers", fileName)).catch(() => null);
    if (!fallback) throw new Error("Cover artwork not found.");
  }
  const filePath = path.join(getProjectPath(projectId), "covers", fileName);
  const fileStat = await fs.stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) throw new Error("Cover artwork not found.");
  return filePath;
}

export async function generateCharacterArtwork(projectId: string, characterId: string): Promise<CharacterArtworkResult> {
  if (!isReplicateConfigured()) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const project = await readProject(projectId);
  const normalizedId = slugify(characterId);
  const character = project.characterBibles.find((entry) => entry.characterId === normalizedId);
  if (!character) throw new Error("Character bible not found.");

  const prompt = [
    project.styleBible?.stylePrompt,
    OPAIJA_STYLE_LOCK,
    `Official character bible reference sheet for ${character.name}.`,
    `Role: ${character.role || "story character"}.`,
    `Appearance lock: ${character.visualStyle || "follow the saved character description"}.`,
    `Personality visible in expression and posture: ${character.personality || "neutral and readable"}.`,
    character.powers ? `Powers and signature visual motifs: ${character.powers}.` : "",
    character.referencePrompt ? `Additional identity lock: ${character.referencePrompt}.` : "",
    `Palette: ${(project.styleBible?.palette ?? []).join(", ") || "high contrast manga tones"}.`,
    "Single character only. Full-body front view, three-quarter view, profile, and clear facial close-up on one clean professional model sheet. Consistent face, hair, skin tone, body proportions, clothing, accessories, and silhouette. Plain unobtrusive background. No labels, no lettering, no watermark.",
  ].filter(Boolean).join(" ");

  const generated = await generateStillFrameFile({ prompt, aspectRatio: "3:4" });
  const characterDir = path.join(getProjectPath(projectId), "character-bibles", normalizedId);
  await ensureDir(characterDir);
  const createdAt = new Date().toISOString();
  const generationId = Date.now();
  const fileName = `character-${safeFileToken(project.projectSlug, project.projectId)}-${normalizedId}-reference-${generationId}.png`;
  const filePath = path.join(characterDir, fileName);
  await fs.writeFile(filePath, generated.buffer);
  const assetPath = path.relative(getProjectPath(projectId), filePath).split(path.sep).join("/");
  const artworkApiPath = `/api/book-builder/projects/${projectId}/character-bibles/${normalizedId}/artwork/${fileName}`;
  const reference: CharacterReferenceAsset = { fileName, assetPath, artworkApiPath, createdAt, model: generated.model };
  character.referenceImages = [...(character.referenceImages ?? []), reference];
  project.updatedAt = createdAt;
  await writeProject(project);
  await writeJson(path.join(getProjectPath(projectId), "character-bibles.json"), project.characterBibles);
  await writeJson(path.join(characterDir, "reference-manifest.json"), { characterId: normalizedId, references: character.referenceImages });
  await writeText(path.join(characterDir, `reference-prompt-${generationId}.txt`), prompt);

  return { provider: "replicate", model: generated.model, projectId, characterId: normalizedId, fileName, assetPath, artworkApiPath, bytes: generated.buffer.length };
}

export async function getCharacterArtworkPath(projectId: string, characterId: string, fileName: string): Promise<string> {
  if (!/^(?:reference-[0-9]+\.png|[a-z0-9-]+-reference-[0-9]+\.png)$/.test(fileName)) {
    throw new Error("Invalid character artwork file name.");
  }
  const project = await readProject(projectId);
  const normalizedId = slugify(characterId);
  const character = project.characterBibles.find((entry) => entry.characterId === normalizedId);
  if (!character?.referenceImages?.some((reference) => reference.fileName === fileName)) throw new Error("Character artwork not found.");
  const filePath = path.join(getProjectPath(projectId), "character-bibles", normalizedId, fileName);
  const fileStat = await fs.stat(filePath);
  if (!fileStat.isFile()) throw new Error("Character artwork not found.");
  return filePath;
}

type ArtworkGateResult = {
  approved: boolean;
  score: number;
  blockingErrors: string[];
  warnings: string[];
  correctedVisualPrompt?: string;
  failedCharacterIds?: string[];
};

async function requestArtworkGateJson(input: {
  stage: "preflight" | "postflight";
  instruction: string;
  images: Buffer[];
}): Promise<ArtworkGateResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error(`Artwork ${input.stage} blocked: OPENAI_API_KEY is required for the commercial QC gate.`);
  const client = new OpenAI({ apiKey });
  try {
    const content = [
      { type: "text", text: input.instruction },
      ...input.images.map((buffer, index) => ({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${buffer.toString("base64")}`, detail: index === 0 && input.stage === "postflight" ? "high" : "low" },
      })),
    ];
    const completion = await client.chat.completions.create({
      model: process.env.BOOK_BUILDER_PREFLIGHT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are OPAIJA's commercial comic visual director and canon gate. Be strict. Reject ambiguity rather than guessing. Return JSON only.",
        },
        { role: "user", content: content as never },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
    return {
      approved: parsed.approved === true,
      score: Number(parsed.score ?? 0),
      blockingErrors: normalizeStringList(parsed.blockingErrors),
      warnings: normalizeStringList(parsed.warnings),
      correctedVisualPrompt: String(parsed.correctedVisualPrompt ?? "").trim() || undefined,
      failedCharacterIds: normalizeStringList(parsed.failedCharacterIds),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Artwork ${input.stage} unavailable; paid generation blocked. ${detail}`);
  }
}

async function runArtworkPreflight(input: {
  prompt: string;
  panel: PanelRecord;
  characters: CharacterBible[];
  referenceImageBuffers: Buffer[];
}) {
  const uniqueCharacters = new Set(input.characters.map((character) => character.characterId));
  if (!input.characters.length) throw new Error("Artwork preflight blocked: no resolved character bible is attached to this panel.");
  if (uniqueCharacters.size !== input.characters.length) throw new Error("Artwork preflight blocked: duplicate character identities are attached to this panel.");
  if (input.referenceImageBuffers.length !== input.characters.length) throw new Error("Artwork preflight blocked: every named character needs exactly one focused identity reference.");
  const characterContract = input.characters.map((character, index) => ({
    referenceImage: index + 1,
    characterId: character.characterId,
    name: character.name,
    role: character.role,
    appearance: character.visualStyle,
    powers: character.powers,
    identityLock: character.referencePrompt,
    requiredPosition: index === 0 ? "left" : index === 1 ? "right" : `depth position ${index + 1}`,
  }));
  let result = await requestArtworkGateJson({
    stage: "preflight",
    images: input.referenceImageBuffers,
    instruction: [
      "This is a BEFORE-SPEND gate. The attached images are official character references in the same order as characterContract.",
      `characterContract=${JSON.stringify(characterContract)}`,
      `visualPrompt=${JSON.stringify(input.prompt)}`,
      `action=${JSON.stringify(input.panel.action)}`,
      `setting=${JSON.stringify(input.panel.setting)}`,
      `continuity=${JSON.stringify(input.panel.continuityNotes)}`,
      `hardBible=${JSON.stringify(OPAIJA_COMBAT_VISUAL_LOCK)}`,
      "Check that every person is visibly distinct by face, age, hair, body, outfit, palette, emblem, gear, weapon and power; positions and action ownership are unambiguous; each required character appears exactly once; combat has exactly one connected hand-held weapon per focal fighter; no floating/spare/duplicate weapon is requested; powers have separate owners and effects; the shot is one frame; and no dialogue or lettering is sent to the image model.",
      "First rewrite every resolvable defect using characterContract, hardBible, action, setting and continuity. correctedVisualPrompt must be a complete standalone production-ready visual-only prompt, not notes or a critique. It must explicitly state each character's unique face/hair/outfit/position/weapon/power effect, exact weapon ownership and count, action cause-and-effect, and integrated environment/crowd/drums while excluding all dialogue and lettering.",
      "Grade the correctedVisualPrompt, not the flawed original. Return {approved, score 0-100, blockingErrors[], warnings[], correctedVisualPrompt}. If your rewrite fully resolves an issue, do not keep that issue in blockingErrors. Approve the corrected prompt only at score 95 or above with zero remaining canon gaps or contradictions; block only defects that cannot be resolved from the supplied bibles.",
    ].join("\n"),
  });
  if (!result.approved || result.score < 95 || result.blockingErrors.length) {
    const firstRewrite = result.correctedVisualPrompt || input.prompt;
    result = await requestArtworkGateJson({
      stage: "preflight",
      images: input.referenceImageBuffers,
      instruction: [
        "This is the final no-spend rewrite gate. The attached images are official character references in characterContract order.",
        `characterContract=${JSON.stringify(characterContract)}`,
        `firstRewrite=${JSON.stringify(firstRewrite)}`,
        `previousBlockingErrors=${JSON.stringify(result.blockingErrors)}`,
        `setting=${JSON.stringify(input.panel.setting)}`,
        `continuity=${JSON.stringify(input.panel.continuityNotes)}`,
        `hardBible=${JSON.stringify(OPAIJA_COMBAT_VISUAL_LOCK)}`,
        "Rewrite the complete visual prompt again and explicitly resolve every previousBlockingError. Name each character's unique face, hair, outfit and left/right position; name each distinct canonical power and its separate visible source/effect; declare exactly one hand-connected weapon per fighter; integrate gayelle, shantwelle, chorus, drums, spectators and their reactions; require one frame and zero text.",
        "Return {approved, score, blockingErrors, warnings, correctedVisualPrompt}. Grade your final correctedVisualPrompt. If supplied bible facts resolve all defects, blockingErrors must be empty and approved must be true at score 95 or above. Block only genuinely absent or contradictory canon facts.",
      ].join("\n"),
    });
  }
  const correctedPromptBase = result.correctedVisualPrompt || input.prompt;
  const deterministicIdentityLock = input.characters.map((character, index) => [
    `MANDATORY CHARACTER ${index + 1}: ${character.name} [${character.characterId}]`,
    `position=${index === 0 ? "LEFT" : index === 1 ? "RIGHT" : `DEPTH-${index + 1}`}`,
    `reference=Image ${index + 1}`,
    `appearance=${character.visualStyle || "match reference exactly"}`,
    `identity-and-gear=${character.referencePrompt || "match reference exactly"}`,
    `power=${character.powers || "none"}`,
    "appears exactly once and may not share face, hair, outfit, gear, weapon, or power with another character",
  ].join(" | ")).join(" || ");
  const correctedPrompt = `${correctedPromptBase} ${deterministicIdentityLock}`.trim();
  const leakedDialogue = normalizeDialogueLines(input.panel.dialogueLines, input.panel.dialogue, input.panel.characters)
    .some((line) => correctedPrompt.toLowerCase().includes(line.text.toLowerCase()));
  if (leakedDialogue) result.blockingErrors.push("Dialogue leaked into the image-generation prompt.");
  result.approved = result.approved && result.score >= 95 && result.blockingErrors.length === 0;
  if (!result.approved) throw new Error(`Artwork preflight rejected before Replicate spend: ${result.blockingErrors.join(" | ") || `score ${result.score}/100`}`);
  return { ...result, correctedVisualPrompt: correctedPrompt };
}

async function runArtworkPostflight(input: {
  generatedBuffer: Buffer;
  characters: CharacterBible[];
  referenceImageBuffers: Buffer[];
}) {
  const characterContract = input.characters.map((character, index) => ({
    referenceImage: index + 2,
    characterId: character.characterId,
    name: character.name,
    appearance: character.visualStyle,
    powers: character.powers,
    identityLock: character.referencePrompt,
  }));
  const result = await requestArtworkGateJson({
    stage: "postflight",
    images: [input.generatedBuffer, ...input.referenceImageBuffers],
    instruction: [
      "Image 1 is a paid candidate panel. Images 2 onward are official character references described by characterContract.",
      `characterContract=${JSON.stringify(characterContract)}`,
      "Reject if any named character is missing, duplicated, merged, has another character's face/hair/outfit/colors/gear, appears the wrong age or gender presentation, or is not recognizably faithful to the matching reference. Reject shared hero outfits unless the references truly match.",
      "Reject any floating, detached, spare, duplicated, body-crossing, oversized, plank-like or impossible weapon; disconnected hands; extra limbs; repeated scene; blank banner; generated text; generic power substituted for distinct canonical powers; or background extra copying a hero.",
      "Return {approved, score 0-100, blockingErrors[], warnings[], failedCharacterIds[]}. Approve only at score 95 or above with zero blockingErrors. Do not be generous.",
    ].join("\n"),
  });
  result.approved = result.approved && result.score >= 95 && result.blockingErrors.length === 0;
  return result;
}

function splitCharacterWords(value: string) {
  return slugify(value).split("-").filter(Boolean);
}

function characterIdentifierMatches(requested: string, candidate: string) {
  const requestedSlug = slugify(requested);
  const candidateSlug = slugify(candidate);

  if (!requestedSlug || !candidateSlug) return false;
  if (requestedSlug === candidateSlug) return true;
  if (requestedSlug.length <= 2) return false;

  const candidateTokens = new Set(splitCharacterWords(candidateSlug));
  const requestedTokens = new Set(splitCharacterWords(requestedSlug));
  const requestedTokenString = requestedTokens.values().next().value ? [...requestedTokens].join("|") : "";

  if (requestedTokenString) {
    const boundaryRegex = new RegExp(`(^|-)${escapeRegExp(requestedTokenString)}(-|$)`);
    if (boundaryRegex.test(candidateSlug)) return true;
  }

  for (const token of requestedTokens) {
    if (candidateTokens.has(token)) return true;
    if (token.length > 3 && candidateSlug.includes(token)) return true;
    for (const candidateToken of candidateTokens) {
      if (candidateToken.length > 3 && candidateToken.includes(token)) return true;
    }
  }

  return false;
}

export async function generatePanelArtwork(
  projectId: string,
  chapterId: string,
  pageNumber: number,
  panelNumber: number,
): Promise<PanelArtworkResult> {
  if (!isReplicateConfigured()) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const project = await readProject(projectId);
  const chapter = await getChapterPayload(projectId, chapterId);
  const page = chapter.pages.find((entry) => entry.pageNumber === pageNumber);
  const panel = page?.panels.find((entry) => entry.panelNumber === panelNumber);
  if (!page || !panel) throw new Error("Panel not found.");

  const requestedCharacters = panel.characters.map((value) => slugify(value)).filter(Boolean);
  const matchedCharacters = project.characterBibles.filter((character) => {
    const aliases = [character.name, character.characterId, ...(character.aliases ?? [])].map(slugify);
    return requestedCharacters.some((requested) => aliases.some((alias) => characterIdentifierMatches(requested, alias)));
  });
  const unresolvedCharacters = panel.characters.filter((value) => {
    const requested = slugify(value);
    return !project.characterBibles.some((character) => {
      const aliases = [character.name, character.characterId, ...(character.aliases ?? [])].map(slugify);
      return aliases.some((alias) => characterIdentifierMatches(requested, alias));
    });
  });
  if (unresolvedCharacters.length) {
    throw new Error(`Create character bibles before artwork for: ${unresolvedCharacters.join(", ")}.`);
  }
  const missingReferences = matchedCharacters.filter((character) => !character.referenceImages?.length);
  if (missingReferences.length) {
    throw new Error(`Generate character reference artwork first for: ${missingReferences.map((character) => character.name).join(", ")}.`);
  }
  const characterDetails = matchedCharacters.map((character) => [
    `${character.name} [${character.characterId}]`,
    `role: ${character.role || "unspecified"}`,
    `appearance: ${character.visualStyle || "unspecified"}`,
    `personality: ${character.personality || "unspecified"}`,
    `powers: ${character.powers || "none specified"}`,
    character.referencePrompt ? `identity lock: ${character.referencePrompt}` : "",
  ].filter(Boolean).join(", ")).join("; ");
  const characterReferencePairs = matchedCharacters.flatMap((character) => {
    const reference = character.referenceImages?.at(-1);
    return reference ? [{ character, reference }] : [];
  });
  const characterReferences = characterReferencePairs.map(({ reference }) => reference);
  const referenceImageBuffers = await Promise.all(characterReferencePairs.map(async ({ character, reference }) => {
    const sourceBuffer = reference.source === "canonical"
      ? await fs.readFile(await resolveCanonicalCharacterFile(reference.fileName))
      : reference.source === "universe"
        ? await fs.readFile(await getUniverseArtworkPath(character.characterId, reference.fileName))
        : await fs.readFile(path.join(getProjectPath(projectId), reference.assetPath));
    if (reference.source !== "canonical") return sourceBuffer;
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height || metadata.width / metadata.height < 1.2) return sourceBuffer;
    const left = Math.round(metadata.width * 0.015);
    const top = Math.round(metadata.height * 0.075);
    const width = Math.max(256, Math.round(metadata.width * 0.17));
    const height = Math.max(512, Math.round(metadata.height * 0.49));
    return sharp(sourceBuffer)
      .extract({ left, top, width: Math.min(width, metadata.width - left), height: Math.min(height, metadata.height - top) })
      .resize({ height: 1200, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
  }));
  const indexedReferenceRules = characterReferencePairs.map(({ character }, index) =>
    `Image ${index + 1} is the official character sheet for ${character.name}. Preserve that person's exact face, skin tone, hair, body proportions, clothing, cultural details, colors, and signature gear.`
  ).join(" ");
  const distinctCharacterRule = `Show exactly ${matchedCharacters.length} distinct named ${matchedCharacters.length === 1 ? "character" : "characters"}, each exactly once. LEFT-TO-RIGHT CHARACTER ORDER: ${matchedCharacters.map((character, index) => `${index + 1}. ${character.name} from Image ${index + 1}`).join("; ")}. Keep identities separate. Never swap positions, blend faces, share clothing, transfer hair, or copy gear between reference images.`;
  const identityContrastRule = `IDENTITY CONTRAST MATRIX: ${matchedCharacters.map((character, index) => `${character.name} is person ${index + 1} from Image ${index + 1}; unique appearance: ${character.visualStyle || "match the reference exactly"}; unique powers: ${character.powers || "none"}; unique gear: ${character.referencePrompt || "match the reference exactly"}`).join(" || ")}. Both focal characters must show readable three-quarter faces. They must look like two different people at first glance.`;
  const kaiMalikRule = matchedCharacters.some((character) => character.characterId === "kairo-kai-baptiste") && matchedCharacters.some((character) => character.characterId === "malik-st-hill")
    ? "KAI/MALIK NON-NEGOTIABLE CONTRAST: Kai is the shorter 5-foot-9 hero with loose shoulder-length twists, amber and red beads, softer youthful face, amber-orange accents, OPAIJA seed pendant, and the carved hooked Listening Bois with amber Tempo/Echo Pulse. Malik is the taller 6-foot-1 rival with tight scalp cornrows gathered into a compact beaded bun, sharper mature face, black-red-white Rootbreaker uniform, white wrist wraps, crimson vibration-shatter energy, and Rootbreaker gear. Never give Kai Malik's cornrows, white trim, uniform, face, or crimson power. Never give Malik Kai's loose twists, amber accents, pendant, hooked Listening Bois, face, or amber power. Do not duplicate either person." 
    : "";
  const combatWeaponRule = /\b(?:bois|stick|staff|weapon|fight|strike|parry|block|counter|clash)\b/i.test(`${panel.action} ${panel.prompt}`)
    ? `EXACT FOCAL WEAPON COUNT: exactly ${matchedCharacters.length} hero-held fighting ${matchedCharacters.length === 1 ? "weapon" : "weapons"} total, one owned by each named fighter. Every weapon must be visibly gripped by connected hands from its owner from end to end. No spare stick, third stick, crossed duplicate, detached handle, floating weapon, weapon emerging from a body, dropped foreground weapon, or background stick crossing a hero silhouette. Background spectators hold no sticks or weapons in this panel.`
    : "";
  const dialogueLines = normalizeDialogueLines(panel.dialogueLines, panel.dialogue, panel.characters);
  panel.dialogueLines = dialogueLines;
  panel.dialogue = dialogueText(dialogueLines);
  const visualPanelPrompt = dialogueLines.reduce((value, line) => value.replace(new RegExp(escapeRegExp(line.text), "gi"), ""), panel.prompt)
    .replace(/(?:dialogue|caption|speech bubble|word bubble)\s*:[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/(?:negative|empty|clean|blank|reserved)\s+(?:visual\s+)?space[^,.]*/gi, "")
    .replace(/(?:space|area)\s+(?:at\s+\w+\s+)?for\s+(?:production\s+)?lettering[^,.]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const prompt = [
    project.styleBible?.stylePrompt,
    OPAIJA_STYLE_LOCK,
    `Manga panel artwork for ${chapter.chapterTitle}, page ${pageNumber}, panel ${panelNumber}.`,
    visualPanelPrompt,
    `${panel.cameraAngle} camera, ${panel.shotType} shot.`,
    `Setting: ${panel.setting}. Time: ${panel.timeOfDay}. Mood: ${panel.mood}.`,
    `Action: ${panel.action}.`,
    OPAIJA_COMBAT_VISUAL_LOCK,
    matchedCharacters.length > 1 ? "MULTI-CHARACTER ACTION: Stage a single cinematic action beat with foreground, midground, and background separation; preserve distinct silhouettes, eye lines, plausible anatomy, visible hands, correct weapon ownership, readable attack and defense arcs, and clear cause-and-effect between fighters." : "Stage one readable cinematic action or reaction beat with correct anatomy and prop ownership.",
    "BACKGROUND EXTRA LOCK: Spectators must have varied ordinary clothing, faces, ages, hairstyles, and silhouettes. They must not copy a named character's uniform, color blocking, emblem, sash, hair, weapon, jewelry, power effect, or face. Named heroes appear exactly once each.",
    characterDetails ? `MANDATORY CHARACTER BIBLE LOCK: ${characterDetails}. Preserve these exact identities.` : `Characters without a matching saved bible: ${panel.characters.join(", ")}.`,
    characterReferences.length ? `Saved character reference assets in use: ${characterReferences.map((reference) => reference.assetPath).join(", ")}.` : "No saved character reference image is available for this panel.",
    indexedReferenceRules,
    distinctCharacterRule,
    identityContrastRule,
    kaiMalikRule,
    combatWeaponRule,
    characterReferences.length ? "Create one new cinematic scene matching the panel action and setting. Use the reference sheets only for identity. Do not reproduce their turnaround poses, grids, captions, white backgrounds, borders, or reference-sheet layout." : "",
    `Palette: ${(project.styleBible?.palette ?? []).join(", ") || "high contrast black, white, and screen tones"}.`,
    "Professional OPAIJA anime graphic-novel panel, textured 2.5D cel shading, crisp hand-inked lines, Afro-Caribbean facial specificity, readable silhouettes, dynamic foreshortening, visual speed lines, impact bursts, dust and energy effects, no generic anime face drift.",
    "ONE FULL-BLEED FRAME ONLY: one camera, one uninterrupted scene, one moment in time. No split panels, repeated scenes, before-and-after views, insets, grids, borders, frames, gutters, banners, blank boxes, white rectangles, or reserved text areas.",
    "CLEAN ART ONLY: fill the entire canvas naturally. Render no words, letters, names, captions, labels, speech balloons, thought balloons, logos, watermarks, or sound-effect typography anywhere in the image. Production lettering is composited later and must not affect the clean art composition.",
    panel.negativePrompt ? `Avoid: ${panel.negativePrompt}, text, letters, speech bubbles, captions, labels, logos, watermarks.` : "Avoid text, letters, speech bubbles, captions, labels, logos, watermarks.",
  ]
    .filter(Boolean)
    .join(" ");

  const preflight = await runArtworkPreflight({ prompt, panel, characters: matchedCharacters, referenceImageBuffers });
  const postflightTestFile = process.env.BOOK_BUILDER_POSTFLIGHT_TEST_FILE?.trim();
  if (postflightTestFile) {
    const testBuffer = await fs.readFile(path.resolve(postflightTestFile));
    const testResult = await runArtworkPostflight({ generatedBuffer: testBuffer, characters: matchedCharacters, referenceImageBuffers });
    throw new Error(`ARTWORK_POSTFLIGHT_TEST_${testResult.approved ? "PASS" : "REJECT"} ${testResult.score}/100: ${testResult.blockingErrors.join(" | ") || "no blocking errors"}`);
  }
  if (process.env.BOOK_BUILDER_PREFLIGHT_ONLY === "1") {
    throw new Error(`ARTWORK_PREFLIGHT_PASS ${preflight.score}/100: paid Replicate generation intentionally skipped.`);
  }
  const generated = await generateStillFrameFile({
    prompt: preflight.correctedVisualPrompt,
    aspectRatio: "2:3",
    referenceImageBuffers,
    modelOverride: resolveArtworkModel(project.setup.artworkModelPreference, characterReferences.length),
  });
  const panelDir = path.join(
    getProjectPath(projectId),
    "chapters",
    chapterId,
    "pages",
    String(pageNumber),
    `panel-${String(panelNumber).padStart(2, "0")}`,
  );
  await ensureDir(panelDir);
  const generationId = Date.now();
  const postflight = await runArtworkPostflight({ generatedBuffer: generated.buffer, characters: matchedCharacters, referenceImageBuffers });
  if (!postflight.approved) {
    const rejectedFileName = `rejected-${buildPanelArtifactStem(project, chapter, pageNumber, panel.panelNumber)}-${generationId}.png`;
    const rejectedFilePath = path.join(panelDir, rejectedFileName);
    const rejectedReportPath = path.join(panelDir, `rejected-qc-${generationId}.json`);
    await fs.writeFile(rejectedFilePath, generated.buffer);
    await writeJson(rejectedReportPath, { createdAt: new Date().toISOString(), status: "REJECTED", preflight, postflight });
    panel.assetFiles = Array.from(new Set([...(panel.assetFiles ?? []), path.relative(getProjectPath(projectId), rejectedFilePath).split(path.sep).join("/"), path.relative(getProjectPath(projectId), rejectedReportPath).split(path.sep).join("/")]));
    await writeJson(path.join(panelDir, "panel-manifest.json"), panel);
    await writeJson(path.join(getProjectPath(projectId), "chapters", chapterId, "chapter-manifest.json"), chapter);
    throw new Error(`Artwork rejected by visual QC and quarantined: ${postflight.blockingErrors.join(" | ") || `score ${postflight.score}/100`}`);
  }
  const fileName = `${buildPanelArtifactStem(project, chapter, pageNumber, panel.panelNumber)}-${generationId}.png`;
  const filePath = path.join(panelDir, fileName);
  const cleanFileName = `clean-${fileName}`;
  const cleanFilePath = path.join(panelDir, cleanFileName);
  await fs.writeFile(cleanFilePath, generated.buffer);
  const metadata = await sharp(generated.buffer).metadata();
  const letteringSvg = buildLetteringSvg({
    width: metadata.width ?? 1024,
    height: metadata.height ?? 1536,
    dialogueLines,
    narration: panel.narration,
    soundEffect: panel.soundEffect,
    fontFamily: project.setup.fontFamily,
  });
  const letteredBuffer = await sharp(generated.buffer).composite([{ input: Buffer.from(letteringSvg) }]).png().toBuffer();
  await fs.writeFile(filePath, letteredBuffer);
  const letteringFileName = `lettering-${fileName.replace(/\.png$/i, ".svg")}`;
  const letteringFilePath = path.join(panelDir, letteringFileName);
  await fs.writeFile(letteringFilePath, letteringSvg, "utf8");
  const assetPath = path.relative(getProjectPath(projectId), filePath).split(path.sep).join("/");
  const cleanAssetPath = path.relative(getProjectPath(projectId), cleanFilePath).split(path.sep).join("/");
  const letteringAssetPath = path.relative(getProjectPath(projectId), letteringFilePath).split(path.sep).join("/");
  const contextFile = path.join(
    panelDir,
    buildPanelContextFileName(project, chapter, pageNumber, panel.panelNumber, generationId),
  );
  await writeJson(contextFile, { createdAt: new Date().toISOString(), characterBiblesUsed: matchedCharacters, characterReferencesUsed: characterReferences, imageConditionedWith: characterReferences.map((reference) => reference.assetPath), originalPrompt: prompt, effectivePrompt: preflight.correctedVisualPrompt, preflight, postflight });
  const contextAssetPath = path.relative(getProjectPath(projectId), contextFile).split(path.sep).join("/");
  panel.assetFiles = Array.from(new Set([...(panel.assetFiles ?? []), cleanAssetPath, letteringAssetPath, assetPath, contextAssetPath]));
  await writeJson(path.join(panelDir, "panel-manifest.json"), panel);
  await writeJson(path.join(getProjectPath(projectId), "chapters", chapterId, "chapter-manifest.json"), chapter);

  return {
    provider: "replicate",
    model: generated.model,
    projectId,
    chapterId,
    pageNumber,
    panelNumber,
    fileName,
    assetPath,
    artworkApiPath: `/api/book-builder/projects/${projectId}/chapters/${chapterId}/pages/${pageNumber}/panels/${panelNumber}/artwork/${fileName}`,
    bytes: letteredBuffer.length,
    characterBiblesUsed: matchedCharacters.map((character) => character.characterId),
    characterReferencesUsed: characterReferences.map((reference) => reference.assetPath),
    imageConditionedReferences: characterReferences.map((reference) => reference.assetPath),
  };
}

export async function getPanelArtworkPath(
  projectId: string,
  chapterId: string,
  pageNumber: number,
  panelNumber: number,
  fileName: string,
): Promise<string> {
  if (!/^(?:artwork-[0-9]+\.png|art-[a-z0-9-]+-p\d+-panel-\d+-\d+\.png)$/.test(fileName)) {
    throw new Error("Invalid artwork file name.");
  }
  const chapter = await getChapterPayload(projectId, chapterId);
  const page = chapter.pages.find((entry) => entry.pageNumber === pageNumber);
  const panel = page?.panels.find((entry) => entry.panelNumber === panelNumber);
  if (!page || !panel) throw new Error("Panel not found.");
  const filePath = path.join(
    getProjectPath(projectId),
    "chapters",
    chapterId,
    "pages",
    String(pageNumber),
    `panel-${String(panelNumber).padStart(2, "0")}`,
    fileName,
  );
  const fileStat = await fs.stat(filePath);
  if (!fileStat.isFile()) throw new Error("Artwork not found.");
  return filePath;
}

async function runChapterGenerationJob(projectId: string, jobId: string) {
  const startTimestamp = Date.now();
  let stage = "initializing";
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatProgress = 10;
  const setHeartbeat = async () => {
    try {
      await updateJob(jobId, {
        status: "running",
        step: `working: ${stage}`,
        progress: heartbeatProgress,
        elapsedMs: Date.now() - startTimestamp,
      });
    } catch {
      // Keep heartbeat best-effort; status persistence may be temporarily unavailable.
    }
  };
  try {
    const project = await readProject(projectId);
    const job = await readJob(jobId);
    await updateJob(jobId, {
      status: "running",
      step: "preparing request",
      progress: 10,
      error: undefined,
      errorCode: undefined,
      warnings: [],
      resultChapterId: undefined,
    });
    heartbeat = setInterval(() => {
      heartbeatProgress = Math.min(85, heartbeatProgress + 3);
      void setHeartbeat();
    }, JOB_HEARTBEAT_INTERVAL_MS);

    stage = "composing prompt";
    const prompt = await withTimeout(
      () => composePrompt(project, job.request),
      CHAPTER_PROMPT_TIMEOUT_MS,
      "compose chapter prompt",
    );
    heartbeatProgress = Math.max(heartbeatProgress, 20);
    await updateJob(jobId, { status: "running", step: "building prompt", progress: 25 });

    stage = "building chapter";
    const chapterWarnings: string[] = [];
    const chapterPayload = await withTimeout(
      () => generateChapter(projectId, job.request, prompt, chapterWarnings),
      CHAPTER_GENERATION_TIMEOUT_MS,
      "OpenAI chapter generation",
    );
    heartbeatProgress = Math.max(heartbeatProgress, 60);
    await setHeartbeat();
    const summary = chapterPayload.summary;

    stage = "saving chapter";
    await updateJob(jobId, { status: "running", step: "saving chapter", progress: 75 });

    const existingChapter = job.request.appendToChapterId ? await getChapterPayload(projectId, job.request.appendToChapterId) : undefined;
    const chapter = await persistChapter(projectId, chapterPayload, existingChapter ? { existingChapter } : undefined);
    const chapterSummary: ChapterSummary = {
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      chapterPrompt: chapter.chapterPrompt,
      summary: chapter.summary,
      status: chapter.status,
      createdAt: chapter.createdAt,
    };
    if (existingChapter) {
      project.chapters = project.chapters.map((entry) => entry.chapterId === existingChapter.chapterId
        ? {
          ...entry,
          summary: [entry.summary.trim(), chapterPayload.summary.trim()].filter(Boolean).join(" | "),
        }
        : entry);
    } else {
      project.chapters = [chapterSummary, ...project.chapters];
    }
    const continuity = await readJsonFile<ContinuityEntry[]>(path.join(getProjectPath(projectId), "continuity.json"), []);
    const generatedContinuity = extractContinuityEntries(chapter);
    project.continuityLog = [...continuity, ...generatedContinuity];
    project.updatedAt = new Date().toISOString();

    await writeJson(path.join(getProjectPath(projectId), "chapters.json"), project.chapters);
    await writeJson(path.join(getProjectPath(projectId), "continuity.json"), project.continuityLog);
    await writeProject(project);
    await updateJob(jobId, { status: "running", step: "finalizing", progress: 95 });
    const continuityWarnings = buildContinuityWarnings(generatedContinuity);
    const mergedWarnings = [...chapterWarnings, ...continuityWarnings].slice(0, 20);
    await updateJob(jobId, {
      status: "completed",
      step: `completed: ${summary.slice(0, 48)}`,
      progress: 100,
      resultChapterId: chapter.chapterId,
      warnings: mergedWarnings,
      elapsedMs: Date.now() - startTimestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown build error.";
    const code = inferJobErrorCode(error);
    const stepLabel = stage === "initializing" ? "initializing" : stage;
    try {
      await updateJob(jobId, {
        status: "failed",
        progress: 100,
        step: `failed: ${stepLabel}`,
        error: `${stepLabel} failed: ${message}`,
        errorCode: code,
      });
    } catch {
      // Intentionally swallow secondary failures while writing job status.
      // The primary error is captured above for upstream debugging.
    }
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    if (Date.now() - startTimestamp >= CHAPTER_JOB_TIMEOUT_MS) {
      try {
        const current = await readJob(jobId);
        if (current.status !== "completed") {
          await updateJob(jobId, {
            status: "failed",
            progress: 100,
            step: "failed: timeout",
            error: "The chapter generation job exceeded the time limit.",
            errorCode: "timeout",
            elapsedMs: Date.now() - startTimestamp,
          });
        }
      } catch {
        // keep non-fatal
      }
    }
  }
}

async function composePrompt(project: ProjectRecord, input: ChapterGenerationInput): Promise<string> {
  const continuity = project.continuityLog.at(-1);
  const startPage = coercePositiveInt(input.startPage, 1);
  const finalPage = startPage + input.targetPages - 1;
  const includeDialogue = input.includeDialogue !== false;
  const includeSoundEffects = input.includeSoundEffects !== false;
  const projectBible = [project.setup.description, project.setup.styleNotes].filter(Boolean).join(" | ");
  const chars = project.characterBibles.map((entry) => [
    `${entry.characterId} (${entry.name})`,
    `role=${entry.role || "unspecified"}`,
    `appearance=${entry.visualStyle || "unspecified"}`,
    `personality=${entry.personality || "unspecified"}`,
    `powers=${entry.powers || "unspecified"}`,
    entry.referencePrompt ? `identity-lock=${entry.referencePrompt}` : "",
    entry.referenceImages?.length ? `saved-reference=${entry.referenceImages.at(-1)?.assetPath}` : "saved-reference=none",
  ].filter(Boolean).join(" | ")).join("\n");
  const style = project.styleBible;
  return [
    "You are the OPAIJA Book Builder chapter planner.",
    "Return JSON only, no markdown.",
    "Build panel-by-panel continuity and never break character continuity.",
    "Plan dynamic multi-character scenes with clear action ownership, spatial separation, eyelines, weapon arcs, reactions, and continuity from anticipation through impact and recovery.",
    `Title: ${project.setup.title}`,
    `Chapter title: ${input.chapterTitle}`,
    `Chapter prompt: ${input.chapterPrompt}`,
    input.appendToChapterId ? `Continuation: append to chapter ${input.appendToChapterId}.` : "Continuation: new chapter.",
    `Page numbering starts at ${startPage} and should continue through ${finalPage}.`,
    `Target pages: ${input.targetPages}`,
    `Panels per page: ${input.panelsPerPage}`,
    projectBible ? `Project bible: ${projectBible}` : "",
    `Dialogue enabled: ${includeDialogue ? "yes" : "no"}`,
    `Sound effects enabled: ${includeSoundEffects ? "yes" : "no"}`,
    `MANDATORY CHARACTER BIBLES (use exact names and preserve every listed trait):\n${chars || "none"}`,
    `Style lock: ${style?.stylePrompt || "No style bible provided."}`,
    `Permanent OPAIJA style lock: ${OPAIJA_STYLE_LOCK}`,
    `Permanent Trinidad Kalinda combat and visual lock: ${OPAIJA_COMBAT_VISUAL_LOCK}`,
    `Palette: ${(style?.palette ?? []).join(", ")}`,
    `Line quality: ${style?.lineQuality || "bold"}`,
    `Last continuity: ${continuity ? `${continuity.location} / ${continuity.timeOfDay} / ${continuity.mood}` : "start of series"}`,
    `Dialogue rule: ${includeDialogue ? "Use dialogueLines objects for every speaker. speaker is metadata only. text contains only the exact spoken words and MUST NEVER begin with a speaker name, character name, or Name: prefix. Use 1-3 short lines per panel and keep each speaker separate." : "Leave dialogueLines empty for all panels."}`,
    "Panel prompt rule: describe visuals only. Never put dialogue, quoted words, captions, bubble text, or speaker labels in prompt.",
    "Combat sequence rule: when Kalinda action is requested, use gayelle establishment, drum/lavway rhythm, challenge, jig and footwork, karay defense, feint/parry/counter, impact, reaction, and community response as appropriate. Do not imitate samurai, kendo, generic bo-staff, or fantasy sword combat.",
    "Power rule: state which character owns each special power, its exact bible colors and source point, the visible effect, the target reaction, and the continuity state before and after activation.",
    `Sound effect rule: ${includeSoundEffects ? "Include 1 short soundEffect cue where action lands." : "Leave soundEffect empty for all panels."}`,
    "Expected JSON shape:",
    JSON.stringify(
      {
        chapterTitle: "Your chapter title",
        summary: "Chapter summary",
        pages: [
          {
            pageNumber: startPage,
            summary: "Page summary",
            panels: [
              {
                panelNumber: 1,
                cameraAngle: "wide",
                shotType: "wide",
                characters: ["Kai", "Nia"],
                setting: "location",
                timeOfDay: "day",
                mood: "tense",
                action: "Action and choreography.",
                dialogueLines: includeDialogue ? [{ speaker: "Kai", text: "Keep the rhythm steady.", bubbleStyle: "speech", balloonAnchor: "top-left" }] : [],
                narration: "Optional narration.",
                soundEffect: includeSoundEffects ? "WOOD-CREAK" : "",
                continuityNotes: "continuity lock notes",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

function inferJobErrorCode(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message) return "unknown";
  if (/timeout/.test(message)) return "timeout";
  if (isQuotaOrRateLimitError(error)) return "quota_or_rate_limit";
  if (message.includes("json") || message.includes("parse")) return "invalid_json";
  if (message.includes("storage") || message.includes("enoent") || message.includes("eacces")) return "storage";
  if (message.includes("style bible") || message.includes("style") || message.includes("stylelock")) return "setup_missing";
  return "generation_failed";
}

function isRecoverableGenerationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return (
    message.includes("json")
    || message.includes("parse")
    || message.includes("invalid chapter")
    || message.includes("validation")
    || message.includes("no pages")
  );
}

async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout while ${context}.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateChapter(
  projectId: string,
  input: ChapterGenerationInput,
  prompt: string,
  warnings: string[] = [],
): Promise<Omit<ChapterRecord, "createdAt">> {
  if (!hasOpenAIKey()) {
    warnings.push("OpenAI API key not set; using deterministic fallback chapter script.");
    await recordStoryProviderHealthBestEffort("fallback", "No OpenAI API key is active. Chapters use the local story fallback.");
    return buildMockChapter(projectId, input, warnings);
  }

  const model = getModel();
  const client = new OpenAI({ apiKey: resolveOpenAIApiKey()! });
  let latestError: Error | undefined;

  for (let attempt = 0; attempt <= OPENAI_RETRY_COUNT; attempt++) {
    try {
      const response = await withTimeout(
        () =>
          client.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are a deterministic manga production planner. Return strict JSON in the requested structure.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.4,
          }),
        CHAPTER_GENERATION_TIMEOUT_MS,
        "OpenAI chapter completion",
      );
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty text.");
      const chapter = parseAiChapterJson(content, input);
      await recordStoryProviderHealthBestEffort("ready", `OpenAI story generation is live on ${model}.`);
      return chapter;
    } catch (error) {
      if (isQuotaOrRateLimitError(error)) {
        warnings.push("OpenAI quota/rate limit reached; using fallback chapter script.");
        await recordStoryProviderHealthBestEffort(
          "billing_required",
          "OpenAI API billing is unavailable. New chapters use the local story fallback until API credits are restored.",
        );
        return buildMockChapter(projectId, input, warnings);
      }
      latestError = error instanceof Error ? error : new Error("OpenAI chapter generation failed.");
      if (isRecoverableGenerationError(error) && attempt >= OPENAI_RETRY_COUNT) {
        warnings.push(`OpenAI output invalid after ${OPENAI_RETRY_COUNT + 1} attempts; using fallback chapter script. ${summarizeGenerationError(latestError)}`);
        return buildMockChapter(projectId, input, warnings);
      }
      if (attempt >= OPENAI_RETRY_COUNT) {
        if (CHAPTER_GENERATION_FALLBACK_TO_MOCK) {
          warnings.push(`OpenAI generation failed after ${OPENAI_RETRY_COUNT + 1} attempts; using fallback chapter script. ${summarizeGenerationError(latestError)}`);
          return buildMockChapter(projectId, input, warnings);
        }
        break;
      }
      await sleep(attempt < OPENAI_RETRY_COUNT ? 500 : 0);
    }
  }

  throw latestError ?? new Error("OpenAI chapter generation failed.");
}

function summarizeGenerationError(error: Error): string {
  const message = error.message.replace(/\s+/g, " ").trim().slice(0, 300);
  return message ? `Provider detail: ${message}` : "";
}

function buildMockChapter(
  projectId: string,
  input: ChapterGenerationInput,
  fallbackWarnings: string[] = [],
): Omit<ChapterRecord, "createdAt"> {
  const warningSuffix = fallbackWarnings.length ? ` [fallback: ${fallbackWarnings[0]}]` : "";
  const pages: PageRecord[] = [];
  const startPage = coercePositiveInt(input.startPage, 1);
  const endPage = startPage + input.targetPages - 1;
  for (let page = startPage; page <= endPage; page++) {
    const panels: PanelRecord[] = [];
    for (let panel = 1; panel <= (input.panelsPerPage ?? 4); panel++) {
      const location = "Training yards - OPAIJA district";
      const timeOfDay = page % 2 === 0 ? "afternoon" : "late afternoon";
      const mood = panel % 2 === 0 ? "focused" : "tense";
      const dialogueLines = input.includeDialogue === false ? [] : panel % 2 === 0
        ? [{ speaker: "Kai", text: "Stay locked on rhythm.", bubbleStyle: "speech" as const, balloonAnchor: "top-left" as const }]
        : [{ speaker: "Nia", text: "Keep your stance.", bubbleStyle: "speech" as const, balloonAnchor: "top-right" as const }];
      const continuityNotes = `Continuity seed ${page}-${panel}. Keep frame lock and character continuity.`;
      const prompt = [
        "OPAIJA 2.5D style, bright island palette, expressive anatomy.",
        `Scene in ${location} during ${timeOfDay}`,
        `Shot: ${panel % 2 === 0 ? "low wide" : "close tracking"}`,
        `Characters: Kai, Nia`,
      ].join(" | ");
      panels.push({
        panelId: `mock-${createHash("sha1").update(`${projectId}-${page}-${panel}`).digest("hex").slice(0, 8)}`,
        panelNumber: panel,
        cameraAngle: panel % 2 === 0 ? "wide" : "over-shoulder",
        shotType: panel % 2 === 0 ? "action" : "reaction",
        characters: ["Kai", "Nia"],
        setting: location,
        timeOfDay,
        mood,
        action: `Panel-${page}-${panel} pushes the story forward with controlled motion and readable body language.`,
        dialogueLines,
        dialogue: dialogueText(dialogueLines),
        narration: `Panel ${panel} of page ${page} keeps continuity with previous beats.`,
        soundEffect: input.includeSoundEffects === false ? "" : panel % 2 === 0 ? "WOOD-CREAK" : "DRUM-HIT",
        continuityNotes,
        prompt,
        negativePrompt: "No off-model anatomy, no repeated faces, no bad props placement.",
        assetFiles: [],
      });
    }

    pages.push({
      pageId: `mock-page-${projectId.slice(0, 5)}-${String(page).padStart(2, "0")}`,
      pageNumber: page,
      summary: `Action progression page ${page} (mock).`,
      panels,
    });
  }

  return {
    chapterId: `mock-${createHash("sha1").update(`${projectId}-${Date.now()}`).digest("hex").slice(0, 14)}`,
    chapterTitle: input.chapterTitle,
    chapterPrompt: input.chapterPrompt,
    summary: `Mock chapter for "${input.chapterTitle}".${warningSuffix}`,
    pages,
    status: "completed",
  };
}

function parseAiChapterJson(raw: string, input: ChapterGenerationInput): Omit<ChapterRecord, "createdAt"> {
  const parsed = safeParseJson(raw) as {
    chapterTitle?: string;
    chapterPrompt?: string;
    summary?: string;
    pages?: unknown[];
  };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OpenAI did not return chapter JSON.");
  }
  const startPage = coercePositiveInt(input.startPage, 1);
  const expectedPages = new Array(input.targetPages).fill(0).map((_, index) => startPage + index);
  const pages = (Array.isArray(parsed.pages) ? parsed.pages : [])
    .slice(0, input.targetPages)
    .map((pageValue, pageIndex) => {
      const page = pageValue as {
        pageNumber?: number;
        summary?: string;
        panels?: unknown[];
      };
      const rowPanels = Array.isArray(page.panels) ? page.panels : [];
      const requestedPageNumber = Number(page.pageNumber);
      const fallbackPageNumber = startPage + pageIndex;
      const pageNumber = Number.isFinite(requestedPageNumber) && requestedPageNumber > 0 ? requestedPageNumber : fallbackPageNumber;
      return {
        pageId: `ai-${randomUUID()}`,
        pageNumber,
        summary: String(page.summary ?? `Page ${pageNumber} panel breakdown.`),
        panels: rowPanels
          .slice(0, input.panelsPerPage ?? 4)
          .map((panelValue, panelIndex) => {
            const panel = panelValue as Record<string, unknown>;
            const characters = normalizeStringList(panel.characters);
            const dialogueLines = input.includeDialogue === false ? [] : normalizeDialogueLines(panel.dialogueLines, panel.dialogue, characters);
            return {
              panelId: randomUUID(),
              panelNumber: Number(panel.panelNumber ?? panelIndex + 1),
              cameraAngle: String(panel.cameraAngle ?? "wide"),
              shotType: String(panel.shotType ?? "wide"),
              characters,
              setting: String(panel.setting ?? "open location"),
              timeOfDay: String(panel.timeOfDay ?? "daylight"),
              mood: String(panel.mood ?? "resolved"),
              action: String(panel.action ?? ""),
              dialogueLines,
              dialogue: dialogueText(dialogueLines),
              narration: String(panel.narration ?? ""),
              soundEffect: String(input.includeSoundEffects === false ? "" : panel.soundEffect ?? ""),
              continuityNotes: String(panel.continuityNotes ?? "continuity preserved"),
              prompt: String(panel.prompt ?? `Auto panel ${panelIndex + 1} from chapter plan.`),
              negativePrompt: String(
                panel.negativePrompt ??
                  "No off-model anatomy, no broken limb geometry, no inconsistent costumes, no duplicated faces.",
              ),
              assetFiles: [],
            };
          }),
      };
    })
    .sort((left, right) => left.pageNumber - right.pageNumber);

  if (!pages.length) {
    throw new Error("OpenAI returned no usable pages.");
  }
  if (pages.length !== input.targetPages) {
    throw new Error(`Invalid chapter layout: expected ${input.targetPages} pages, received ${pages.length}.`);
  }

  const expectedSet = new Set(expectedPages);
  const receivedPages = new Set(pages.map((page) => page.pageNumber));
  const missingPages = expectedPages.filter((pageNumber) => !receivedPages.has(pageNumber));
  const extraPages = Array.from(receivedPages).filter((pageNumber) => !expectedSet.has(pageNumber));
  if (missingPages.length || extraPages.length) {
    const missingText = missingPages.length ? ` missing pages: ${missingPages.join(", ")}` : "";
    const extraText = extraPages.length ? ` extra/invalid pages: ${extraPages.join(", ")}` : "";
    throw new Error(`Invalid chapter layout: expected pages ${expectedPages.join(", ")}.${missingText}${extraText}`);
  }

  const expectedPanelsPerPage = input.panelsPerPage ?? 4;
  pages.forEach((page, pageIndex) => {
    if (page.panels.length !== expectedPanelsPerPage) {
      throw new Error(`Invalid chapter layout: page ${pageIndex + 1} expected ${expectedPanelsPerPage} panels, received ${page.panels.length}.`);
    }
    page.pageNumber = expectedPages[pageIndex];
    page.panels.forEach((panel, panelIndex) => {
      panel.panelNumber = panelIndex + 1;
    });
  });

  return {
    chapterId: `ai-${createHash("sha1").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 14)}`,
    chapterTitle: String(parsed.chapterTitle ?? input.chapterTitle),
    chapterPrompt: String(parsed.chapterPrompt ?? input.chapterPrompt),
    summary: String(parsed.summary ?? `Auto summary for ${input.chapterTitle}.`),
    pages,
    status: "completed",
  };
}

function safeParseJson(raw: string) {
  const value = raw.trim();
  const fenced = value.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? value;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Unable to locate JSON body.");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

function extractContinuityEntries(chapter: ChapterRecord): ContinuityEntry[] {
  const entries: ContinuityEntry[] = [];
  for (const page of chapter.pages) {
    for (const panel of page.panels) {
      const prev = entries.at(-1);
      entries.push({
        chapterId: chapter.chapterId,
        pageNumber: page.pageNumber,
        panelNumber: panel.panelNumber,
        location: panel.setting || prev?.location || "unknown",
        timeOfDay: panel.timeOfDay || prev?.timeOfDay || "day",
        mood: panel.mood || prev?.mood || "neutral",
        presentCharacters: panel.characters.length ? panel.characters : prev?.presentCharacters || ["Kai"],
        notes: panel.continuityNotes || "continuity lock maintained",
        createdAt: new Date().toISOString(),
      });
    }
  }
  return entries;
}

function buildContinuityWarnings(entries: ContinuityEntry[]) {
  const warnings: string[] = [];
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (!current.presentCharacters.length) {
      warnings.push(`No visible cast at page ${current.pageNumber}, panel ${current.panelNumber}.`);
      continue;
    }
    if (!current.location || current.location === previous.location) continue;
    if (!current.timeOfDay && previous?.timeOfDay) {
      warnings.push(`Time skipped between p${current.pageNumber}.${current.panelNumber}.`);
    }
  }
  return warnings.slice(0, 20);
}

type PersistChapterOptions = {
  existingChapter?: ChapterRecord;
};

async function persistChapter(
  projectId: string,
  source: Omit<ChapterRecord, "createdAt">,
  options: PersistChapterOptions = {},
): Promise<ChapterRecord> {
  const chapterId = options.existingChapter?.chapterId ?? `chapter-${createHash("sha1").update(`${projectId}-${Date.now()}`).digest("hex").slice(0, 10)}`;
  const existingChapter = options.existingChapter;
  const existingPages = existingChapter?.pages ?? [];
  const mergedPages = [...existingPages];
  const byPageNumber = new Map<number, PageRecord>(existingPages.map((page) => [page.pageNumber, page]));
  for (const page of source.pages) {
    if (byPageNumber.has(page.pageNumber)) {
      throw new Error(`Cannot append page ${page.pageNumber}; that page already exists in chapter ${chapterId}.`);
    }
    byPageNumber.set(page.pageNumber, page);
    mergedPages.push(page);
  }
  mergedPages.sort((left, right) => left.pageNumber - right.pageNumber);
  const chapter: ChapterRecord = {
    chapterId,
    chapterTitle: source.chapterTitle,
    chapterPrompt: source.chapterPrompt,
    summary: source.summary,
    pages: mergedPages,
    status: "completed",
    createdAt: existingChapter?.createdAt ?? new Date().toISOString(),
    sourceProvenance: source.sourceProvenance ?? existingChapter?.sourceProvenance,
  };

  const chapterDir = path.join(getProjectPath(projectId), "chapters", chapterId);
  const pagesDir = path.join(chapterDir, "pages");
  const project = await readProject(projectId);
  await ensureDir(pagesDir);

  for (const page of chapter.pages) {
    const pageDir = path.join(pagesDir, String(page.pageNumber));
    for (const panel of page.panels) {
      const panelDir = path.join(pageDir, `panel-${String(panel.panelNumber).padStart(2, "0")}`);
      await ensureDir(panelDir);
      const promptFile = path.join(panelDir, buildPanelPromptFileName(project, chapter, page.pageNumber, panel.panelNumber));
      const negativePromptFile = path.join(panelDir, "negative-prompt.txt");
      const manifestFile = path.join(panelDir, "panel-manifest.json");
      const panelPrompt = buildPanelPrompt(chapter, page, panel);
      const negativePrompt = panel.negativePrompt || "No negative prompt provided.";
      await writeText(promptFile, panelPrompt);
      await writeText(negativePromptFile, negativePrompt);
      await writeJson(manifestFile, { ...panel });
      panel.assetFiles = [
        path.relative(getProjectPath(projectId), promptFile).split(path.sep).join("/"),
        path.relative(getProjectPath(projectId), negativePromptFile).split(path.sep).join("/"),
        path.relative(getProjectPath(projectId), manifestFile).split(path.sep).join("/"),
      ];
      await writeJson(manifestFile, panel);
    }
  }

  await writeJson(path.join(chapterDir, "chapter-manifest.json"), chapter);

  return chapter;
}

function buildPanelPrompt(chapter: ChapterRecord, page: PageRecord, panel: PanelRecord) {
  return [
    `Chapter: ${chapter.chapterTitle}`,
    `Page ${page.pageNumber} | Panel ${panel.panelNumber}`,
    `Prompt: ${panel.prompt}`,
    `Shot: ${panel.cameraAngle}, ${panel.shotType}`,
    `Setting: ${panel.setting}`,
    `Moods: ${panel.mood}`,
    `Lettering metadata: ${normalizeDialogueLines(panel.dialogueLines, panel.dialogue, panel.characters).map((line) => `${line.speaker} says ${JSON.stringify(line.text)}`).join(" | ") || "none"}`,
    `Sound effect: ${panel.soundEffect || "none"}`,
    `Characters: ${panel.characters.join(", ")}`,
    `Continuity: ${panel.continuityNotes}`,
  ].join("\n");
}

async function writeProject(project: ProjectRecord) {
  const projectPath = getProjectPath(project.projectId);
  await writeJson(path.join(projectPath, "project.json"), project);
}

async function readProject(projectId: string): Promise<ProjectRecord> {
  const projectPath = getProjectPath(projectId);
  const record = await readJsonFile<ProjectRecord | null>(path.join(projectPath, "project.json"), null);
  if (!record) throw new Error("Project not found.");
  const merged = mergeCanonicalCast(record);
  mergeCoverConfig(merged);
  const universeCharacters = await listUniverseCharacters();
  for (const universeCharacter of universeCharacters) {
    if (merged.characterBibles.some((character) => character.characterId === universeCharacter.characterId || character.name === universeCharacter.name)) continue;
    merged.characterBibles.push({
      characterId: universeCharacter.characterId,
      name: universeCharacter.name,
      aliases: universeCharacter.aliases,
      role: universeCharacter.role,
      visualStyle: universeCharacter.visualStyle,
      personality: universeCharacter.personality,
      powers: universeCharacter.powers,
      referencePrompt: universeCharacter.referencePrompt,
      referenceImages: universeCharacter.artwork.slice(-1).map((artwork) => ({
        fileName: artwork.fileName,
        assetPath: `universe/characters/${universeCharacter.characterId}/artwork/${artwork.fileName}`,
        artworkApiPath: artwork.artworkApiPath,
        createdAt: artwork.createdAt,
        model: artwork.source === "canonical" ? "official-model-sheet" : "uploaded-reference",
        source: "universe",
      })),
    });
  }
  return merged;
}

async function listAllJobs(): Promise<BookJob[]> {
  await ensureDir(storage.jobs);
  const entries = await fs.readdir(storage.jobs, { withFileTypes: true });
  const jobs: BookJob[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const job = await readJob(entry.name.replace(".json", ""));
      jobs.push(job);
    } catch {
      continue;
    }
  }
  return jobs;
}

async function readJob(jobId: string): Promise<BookJob> {
  return readJsonFile<BookJob>(path.join(storage.jobs, `${jobId}.json`));
}

async function updateJob(jobId: string, patch: Partial<BookJob>) {
  const job = await readJob(jobId);
  job.status = patch.status ?? job.status;
  job.step = patch.step ?? job.step;
  job.progress = patch.progress ?? job.progress;
  if (patch.startedAt) job.startedAt = patch.startedAt;
  if (patch.attempt !== undefined) job.attempt = patch.attempt;
  if (patch.sourceJobId) job.sourceJobId = patch.sourceJobId;
  if (patch.errorCode !== undefined) job.errorCode = patch.errorCode;
  if (patch.elapsedMs !== undefined) job.elapsedMs = patch.elapsedMs;
  if (patch.resultChapterId !== undefined) job.resultChapterId = patch.resultChapterId;
  job.updatedAt = new Date().toISOString();
  if (patch.warnings !== undefined) job.warnings = patch.warnings;
  if (patch.error !== undefined) job.error = patch.error;
  if (patch.error === undefined && patch.status && patch.status !== "failed") {
    job.error = undefined;
    job.errorCode = undefined;
  }
  await writeJson(path.join(storage.jobs, `${jobId}.json`), job);
}

async function collectFiles(base: string) {
  const entries = await fs.readdir(base, { withFileTypes: true });
  const files: Array<{ absolutePath: string; size: number; updatedAt: string }> = [];

  for (const entry of entries) {
    const absolutePath = path.join(base, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) continue;
    files.push({ absolutePath, size: stat.size, updatedAt: stat.mtime.toISOString() });
  }

  return files;
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`);
  try {
    await renameWithRetry(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function renameWithRetry(sourcePath: string, targetPath: string) {
  const retryableCodes = new Set(["EBUSY", "EACCES", "EPERM"]);
  let latestError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await fs.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      latestError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !retryableCodes.has(code)) break;
      await sleep(75 * (attempt + 1));
    }
  }
  throw latestError instanceof Error ? latestError : new Error("Unable to persist JSON file.");
}

async function writeText(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

async function readJsonFile<T>(filePath: string, fallback?: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error instanceof Error ? error : new Error("Unable to read JSON.");
  }
}

async function ensureDir(candidate: string) {
  await fs.mkdir(candidate, { recursive: true });
}

function getProjectPath(projectId: string) {
  return path.join(storage.projects, projectId);
}

async function countProjectPages(project: ProjectRecord) {
  let pageCount = 0;
  for (const chapterSummary of project.chapters) {
    try {
      const chapter = await readJsonFile<ChapterRecord>(path.join(getProjectPath(project.projectId), "chapters", chapterSummary.chapterId, "chapter-manifest.json"));
      pageCount += chapter.pages.length;
    } catch {
      pageCount += 1;
    }
  }
  return pageCount || project.setup.targetPagesPerChapter;
}

function hasOpenAIKey() {
  if (process.env.BOOK_BUILDER_FORCE_MOCK === "1" || process.env.BOOK_BUILDER_FORCE_MOCK?.toLowerCase() === "true") {
    return false;
  }
  return Boolean(resolveOpenAIApiKey());
}

function getModel() {
  return resolveOpenAIModel();
}

function normalizeLineQuality(value: StyleBibleInput["lineQuality"]) {
  return value === "soft" || value === "scratch" || value === "clean" || value === "bold" ? value : "bold";
}

function normalizeMoodLevel(value: StyleBibleInput["moodLevel"]) {
  const numeric = Number(value ?? NaN);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const candidate = error as {
    status?: number;
    code?: number | string;
    message?: string;
  } | null;
  if (!candidate) return false;
  if (typeof candidate.status === "number" && (candidate.status === 429 || candidate.status === 503)) return true;
  if (candidate.code === 429 || candidate.code === "rate_limit_exceeded" || candidate.code === "insufficient_quota") return true;
  const message = candidate.message?.toLowerCase() ?? "";
  return message.includes("rate limit") || message.includes("quota");
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function coerceRange(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? NaN);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < min || numeric > max) return fallback;
  return Math.round(numeric);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeFileToken(value: string, fallback: string) {
  return slugify(value).slice(0, 24) || slugify(fallback).slice(0, 24) || "asset";
}

function isCanonicalCharacter(characterId: string) {
  return CANONICAL_CAST.some((entry) => entry.id === slugify(characterId));
}

function hasUserConfiguredContent(project: ProjectRecord) {
  const hasCustomCharacter = project.characterBibles.some((character) => {
    if (isCanonicalCharacter(character.characterId)) return false;
    return Boolean(
      character.referenceImages?.some((reference) => reference.source !== "canonical")
        || character.visualStyle?.trim()
        || character.personality?.trim()
        || character.powers?.trim()
        || character.referencePrompt?.trim()
        || character.role?.trim(),
    );
  });

  const hasNonDefaultSetup = project.setup.styleNotes !== "OPAIJA style bible first pass."
    || project.setup.artworkModelPreference !== DEFAULT_ARTWORK_MODEL
    || project.setup.fontFamily !== "Noto Sans"
    || project.setup.fontSizePx !== 18;

  return hasCustomCharacter || hasNonDefaultSetup;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundMoney(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number(rounded.toFixed(2));
}
