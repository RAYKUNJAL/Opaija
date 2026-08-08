import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileImage,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  Library,
  LoaderCircle,
  AlertTriangle,
  Printer,
  ShieldCheck,
  Wallet,
  Palette,
  Plus,
  RefreshCw,
  Pencil,
  Save,
  Sparkles,
  Text,
  Upload,
  WandSparkles,
  Users,
  Trash2,
  X,
} from "lucide-react";
import { apiUrl } from "../lib/api";
import BookPageEditor, {
  DEFAULT_BOOK_PANEL_TEMPLATES,
  type BookEditorLayer,
  type BookEditorPage,
  type BookPageEditorAutosavePayload,
  type BookPageEditorSize,
  type BookPanelFrame,
} from "./BookPageEditor";
import "./BookBuilderView.css";

type HealthResponse = {
  ok: true;
  provider: "openai" | "mock";
  model: string;
  configured: boolean;
  storyProviderStatus: "ready" | "billing_required" | "fallback";
  storyProviderMessage: string;
  storyProviderCheckedAt?: string;
  artworkProvider: "replicate" | "unconfigured";
  storagePath: string;
  projectCount: number;
  jobs: { total: number; queued: number; running: number; completed: number; failed: number };
};

type ArtworkModelProfile = {
  id: string;
  label: string;
  notes: string;
  isDefault: boolean;
  useCase: "no_reference" | "one_reference" | "multi_reference" | "all";
};

type ProjectListItem = {
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

type ProjectCleanupResponse = {
  deleted: number;
  deletedProjectIds: string[];
};

type CharacterBible = {
  characterId: string;
  name: string;
  aliases?: string[];
  role?: string;
  visualStyle?: string;
  personality?: string;
  powers?: string;
  referencePrompt?: string;
  referenceImages?: Array<{ fileName: string; assetPath: string; artworkApiPath: string; createdAt: string; model: string; source?: "canonical" | "generated" }>;
};

type KdpBookType = "coloring_book" | "comic_book" | "art_book" | "journal" | "graphic_novel" | "other";

type CoverSide = "front" | "back";

type CoverMetadata = {
  side: CoverSide;
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

type CoverMetadataDraft = Omit<CoverMetadata, "lastArtworkFileName" | "lastGeneratedAt" | "lastGeneratedModel">;

type KdpEstimate = {
  bookType: KdpBookType;
  totalPages: number;
  trimSize: string;
  printCostEstimate: number;
  suggestedRetail: { min: number; max: number };
  estimatedRoyalty: { min: number; max: number };
  setupLine: string;
  recommendedFont: string;
};

type StyleBible = {
  styleName: string;
  stylePrompt: string;
  palette?: string[];
  lineQuality?: "soft" | "bold" | "scratch" | "clean";
  moodLevel?: number;
};

type ContinuityEntry = {
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

type ProjectRecord = {
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
    kdpBookType: KdpBookType;
    fontFamily: string;
    fontSizePx: number;
  };
  styleBible: StyleBible | null;
  characterBibles: CharacterBible[];
  chapters: Array<{
    chapterId: string;
    chapterTitle: string;
    chapterPrompt: string;
    summary: string;
    status: "completed" | "partial";
    createdAt: string;
  }>;
  continuityLog: ContinuityEntry[];
  cover: {
    front: CoverMetadata;
    back: CoverMetadata;
  };
};

type StylePreset = {
  name: string;
  label: string;
  prompt: string;
  palette: string;
  tone: string;
  preview: string;
  imagePreview?: string;
};

type Job = {
  jobId: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  step: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  attempt: number;
  sourceJobId?: string;
  request: {
    chapterTitle: string;
    chapterPrompt: string;
    targetPages: number;
    panelsPerPage?: number;
    includeDialogue?: boolean;
    includeSoundEffects?: boolean;
    appendToChapterId?: string;
    startPage?: number;
  };
  resultChapterId?: string;
  warnings?: string[];
  error?: string;
  errorCode?: string;
  elapsedMs?: number;
};

type Asset = {
  path: string;
  fileName: string;
  category: "style-bible" | "character-bible" | "character-reference" | "chapter-prompt" | "panel-prompt" | "panel-artwork" | "front-cover" | "back-cover" | "continuity-log";
  bytes: number;
  updatedAt: string;
};

type ProjectExportManifest = {
  projectId: string;
  projectTitle: string;
  projectSlug: string;
  packageName: string;
  exportedAt: string;
  manifestPath: string;
  bookType: KdpBookType;
  totalChapters: number;
  totalPages: number;
  totalPanels: number;
  totalAssets: number;
  totalArtworkFiles: number;
  targetTrim: string;
  pagesPerPage: number;
  recommendedFont: string;
  files: Array<{
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
      | "continuity-log";
    bytes: number;
    updatedAt: string;
  }>;
};

type HermesImportResponse = {
  project: ProjectRecord;
  sourcePath: string;
  imported: { chapters: number; panels: number };
};

type DialogueLine = { speaker: string; text: string; delivery?: string; bubbleStyle?: "speech" | "thought" | "shout" | "whisper"; balloonAnchor?: "top-left" | "top-right" | "mid-left" | "mid-right" | "bottom-left" | "bottom-right" };
type Panel = { panelNumber: number; action: string; prompt: string; assetFiles: string[]; dialogue?: string; dialogueLines?: DialogueLine[]; narration?: string; soundEffect?: string; continuityNotes?: string; cameraAngle?: string; shotType?: string; setting?: string; mood?: string; timeOfDay?: string; characters?: string[] };
type EditablePanel = {
  chapterId: string;
  pageNumber: number;
  panelNumber: number;
  action: string;
  prompt: string;
  dialogueLines: DialogueLine[];
  narration: string;
  soundEffect: string;
  continuityNotes: string;
  cameraAngle: string;
  shotType: string;
  setting: string;
  mood: string;
  timeOfDay: string;
  characters: string;
};
type EditablePage = {
  chapterId: string;
  pageNumber: number;
  summary: string;
};
type Page = { pageNumber: number; summary: string; panels: Panel[] };
type ChapterPayload = { chapterId?: string; chapterTitle: string; summary: string; pages: Page[] };
type BuilderScreen = "library" | "studio" | "assets" | "jobs";
type StudioStep = "setup" | "style" | "characters" | "chapter" | "pages" | "artwork" | "cover" | "layout" | "review";

type BookPrintTrimPreset = {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
};

type BookPrintIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  location?: string;
  actual?: number | string;
  expected?: number | string;
};

type BookPrintPreflight = {
  passed: boolean;
  checkedAt: string;
  errors: BookPrintIssue[];
  warnings: BookPrintIssue[];
  checks: {
    chapters: number;
    storyPages: number;
    printablePages: number;
    panels: number;
    images: number;
    fonts: number;
    minimumImageDpi: number;
    lowestEffectiveDpi?: number;
  };
};

type BookPrintJob = {
  jobId: string;
  projectId: string;
  status: "preparing" | "blocked" | "queued" | "running" | "completed" | "failed";
  step: string;
  progress: number;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  request: {
    trimPreset?: string;
    bleed: boolean;
    ink: "black_white" | "standard_color" | "premium_color";
    paper: "white" | "cream";
    readingDirection: "ltr" | "rtl";
    bodyFontPt: number;
    minimumImageDpi: number;
    maximumImageDpi: number;
    includeSpineText: boolean;
    padToMinimumPages: boolean;
  };
  geometry?: {
    trim: BookPrintTrimPreset;
    bleed: boolean;
    bleedIn: number;
    interiorPage: { widthIn: number; heightIn: number };
    safeMargins: { topIn: number; bottomIn: number; outsideIn: number; gutterIn: number };
  };
  preflight?: BookPrintPreflight;
  error?: string;
};

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const adminToken = typeof window !== "undefined" ? window.localStorage.getItem("opaija_admin_token") : null;
  const response = await fetch(apiUrl(url), {
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "x-admin-session": adminToken } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const payload = (await response.json().catch(() => ({ error: "Invalid response." }))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? "Request failed"));
  return payload as T;
}

async function requestPrintJson<T>(url: string, options: RequestInit = {}, acceptedStatuses: number[] = []): Promise<T> {
  const adminToken = typeof window !== "undefined" ? window.localStorage.getItem("opaija_admin_token") : null;
  const response = await fetch(apiUrl(url), {
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "x-admin-session": adminToken } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const payload = (await response.json().catch(() => ({ error: "Invalid print service response." }))) as Record<string, unknown>;
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new Error(String(payload.error ?? "Print service request failed."));
  }
  return payload as T;
}

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms?: number) {
  if (!Number.isFinite(ms) || !ms) return "";
  const total = Math.max(0, Math.round(ms));
  const seconds = Math.floor(total / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function formatDate(input?: string) {
  if (!input) return "";
  return new Date(input).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const workflowSteps: Array<{ id: StudioStep; label: string; hint: string }> = [
  { id: "setup", label: "Book setup", hint: "Title and print size" },
  { id: "style", label: "Art direction", hint: "Lock the visual language" },
  { id: "characters", label: "Characters", hint: "Build the cast bible" },
  { id: "chapter", label: "Write chapter", hint: "Generate story and panels" },
  { id: "pages", label: "Page storyboard", hint: "Review every page" },
  { id: "artwork", label: "Create artwork", hint: "Render panel by panel" },
  { id: "cover", label: "Design cover", hint: "Create front and back cover art" },
  { id: "layout", label: "Layout & Print", hint: "Letter pages and run KDP checks" },
  { id: "review", label: "Review book", hint: "Continuity and assets" },
];

const stylePresets: StylePreset[] = [
  {
    name: "OPAIJA Baseline",
    label: "Balanced print-ready manga with richer color",
    tone: "Balanced",
  prompt:
    "2.5D OPAIJA comic style with clean inked manga linework, cinematic island fantasy, expressive character acting, controlled dynamic lighting, high-contrast shadows, glossy highlights, and clean anatomy. Keep colors saturated and vibrant for clear print translation.",
  palette: "electric cyan, sunlit gold, hot pink, royal blue, ivory",
  preview: "linear-gradient(140deg, #1b3b4d 0%, #f6df90 35%, #ff8cbf 55%, #6bc5de 90%)",
  imagePreview: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='240'><rect width='420' height='240' fill='%231b3b4d'/><rect x='0' y='150' width='420' height='90' fill='%23f6df90'/><text x='40' y='120' font-size='34' fill='%23ff8cbf' font-family='Arial' font-weight='700'>OPAIJA</text><text x='40' y='165' font-size='18' fill='%230f172a' font-family='Arial'>Baseline Storyboard</text></svg>",
  },
  {
    name: "Vibrant Daylight",
    label: "Bright tropical action style",
    tone: "High-energy",
  prompt:
    "2.5D manga panel composition with bold ink lines and high-energy tropical lighting, saturated city-sky colors, crisp highlights, cinematic camera angles, vibrant skin tones, dynamic motion, and dramatic readability for text overlays.",
  palette: "turquoise, neon lime, tangerine, bright white, violet blue, magenta",
  preview: "linear-gradient(130deg, #0e1d2f 0%, #1dd7ff 40%, #c9f17d 55%, #ff8a34 90%)",
  imagePreview: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='240'><rect width='420' height='240' fill='%230e1d2f'/><circle cx='85' cy='120' r='70' fill='%231dd7ff'/><circle cx='320' cy='120' r='70' fill='%23ff8a34'/><text x='55' y='128' font-size='24' fill='%23ffffff' font-family='Arial' font-weight='700'>Vibrant</text></svg>",
  },
  {
    name: "Neon Carnival",
    label: "Club/nightlife atmosphere",
    tone: "Neon",
  prompt:
    "Luminous comic style inspired by nightlife and stage lighting, dramatic rim lights, clean expressive faces, crisp contrast lines, saturated neon accents, glossy reflections, and punchy color blocking for high visual drama.",
  palette: "hot pink, cyan, electric purple, amber, black ink, white",
  preview: "linear-gradient(130deg, #0f0c1f 0%, #ff3d8d 35%, #1ce6ec 55%, #ffbf47 90%)",
  imagePreview: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='240'><rect width='420' height='240' fill='%230f0c1f'/><rect x='10' y='30' width='400' height='180' fill='none' stroke='%23ff3d8d' stroke-width='8' rx='14'/><rect x='40' y='60' width='340' height='120' fill='rgba(28,230,236,0.2)'/><text x='85' y='135' font-size='30' fill='%23ffbf47' font-family='Arial' font-weight='700'>Neon Carnival</text></svg>",
  },
  {
    name: "Print Clean",
    label: "Reduced color drift for print",
    tone: "Stable",
  prompt:
    "High-contrast manga linework with clean ink strokes, cinematic storytelling, stable vibrant colors that remain print-safe, strong edge definition, smooth transitions, and bold color hierarchy for consistent output across export formats.",
  palette: "indigo, ruby, amber, mint green, ivory",
  preview: "linear-gradient(135deg, #0e1b2f 0%, #3a6f79 35%, #f2ca77 67%, #5fbda3 100%)",
  imagePreview: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='240'><rect width='420' height='240' fill='%230e1b2f'/><rect x='20' y='36' width='380' height='170' fill='%23f2ca77'/><rect x='20' y='36' width='380' height='170' fill='none' stroke='%235fbda3' stroke-width='8'/><text x='38' y='128' font-size='28' fill='%230e1b2f' font-family='Arial' font-weight='700'>Print Clean</text></svg>",
  },
  {
    name: "Sunset Heat",
    label: "Warm cinematic atmosphere",
    tone: "Warm",
  prompt:
    "Brightly saturated OPAIJA comic illustration with sunset glow, warm backlight, rich oranges and magentas, clean ink structure, lively crowd motion, high contrast and sharp readable faces, and crisp composition for dramatic emotion.",
  palette: "sunset orange, coral pink, cobalt violet, royal blue, bright white, amber",
  preview: "linear-gradient(140deg, #2d1327 0%, #ff7b2f 35%, #ff4676 55%, #5f4ddf 100%)",
  imagePreview: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='240'><defs><linearGradient id='sun' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stop-color='%23ff7b2f'/><stop offset='100%' stop-color='%235f4ddf'/></linearGradient></defs><rect width='420' height='240' fill='url(%23sun)'/><circle cx='320' cy='75' r='55' fill='%23ff4676'/><text x='35' y='135' font-size='30' fill='%23ffffff' font-family='Arial' font-weight='700'>Sunset Heat</text></svg>",
  },
];

const kdpBookTypes: Array<{ id: KdpBookType; label: string; description: string }> = [
  { id: "coloring_book", label: "Coloring Book", description: "Best for activity pages and high color appeal." },
  { id: "comic_book", label: "Comic Book", description: "Speech-driven story flow and balanced chapter counts." },
  { id: "art_book", label: "Art Book", description: "Higher quality color plates and premium layouts." },
  { id: "journal", label: "Journal", description: "Narrative with notes, prompts, and writing space." },
  { id: "graphic_novel", label: "Graphic Novel", description: "Traditional page-heavy sequential storytelling." },
  { id: "other", label: "Other", description: "Custom print format and planning." },
];

const FALLBACK_ARTWORK_MODELS: ArtworkModelProfile[] = [
  {
    id: "black-forest-labs/flux-kontext-pro",
    label: "Flux Kontext Pro",
    notes: "Balanced quality for consistent anime-style production with references.",
    isDefault: true,
    useCase: "all",
  },
  {
    id: "__auto__",
    label: "Auto (reference-aware)",
    notes: "Automatically uses flux-kontext-pro, flux-2-pro, or the default model based on how many references are attached.",
    isDefault: false,
    useCase: "all",
  },
  {
    id: "black-forest-labs/flux-2-pro",
    label: "Flux 2 Pro",
    notes: "Best when multiple references are required.",
    isDefault: false,
    useCase: "multi_reference",
  },
  {
    id: "black-forest-labs/flux-dev",
    label: "Flux Dev",
    notes: "Fast drafts and early concepting.",
    isDefault: false,
    useCase: "all",
  },
];

const READER_FRIENDLY_FONTS = [
  "Noto Sans",
  "Inter",
  "Merriweather",
  "Georgia",
  "Source Serif Pro",
  "IBM Plex Sans",
  "Lora",
  "Source Sans 3",
  "Roboto",
  "Alegreya Sans",
  "Nunito",
];

const fontOptions = READER_FRIENDLY_FONTS;

const recommendedFontByBookType: Record<KdpBookType, string[]> = {
  coloring_book: ["Arial", "Comic Sans MS", "Noto Sans", "Roboto"],
  comic_book: ["Noto Sans", "Inter", "Source Sans 3", "IBM Plex Sans"],
  art_book: ["Merriweather", "Georgia", "Lora", "Source Serif Pro"],
  journal: ["Georgia", "Merriweather", "Charter", "IBM Plex Sans"],
  graphic_novel: ["Inter", "Noto Sans", "Source Sans 3", "Roboto"],
  other: ["Noto Sans", "Inter", "Georgia", "Source Serif Pro"],
};

const recommendedFontSizeByBookType: Record<KdpBookType, number> = {
  coloring_book: 14,
  comic_book: 18,
  art_book: 19,
  journal: 14,
  graphic_novel: 18,
  other: 18,
};

function recommendedReadabilityFont(bookType: KdpBookType) {
  return recommendedFontByBookType[bookType]?.[0] || "Noto Sans";
}

function recommendedReadabilityFontSize(bookType: KdpBookType) {
  return recommendedFontSizeByBookType[bookType] ?? 18;
}

const styleMoods = [
  { level: 1, label: "Muted", description: "Reduce saturation and keep contrast softer." },
  { level: 2, label: "Calm", description: "Balanced saturation for gentle scenes." },
  { level: 3, label: "Bright", description: "Standard saturated OPAIJA comic colors." },
  { level: 4, label: "Hyper", description: "Strong color punch and punchier highlights." },
  { level: 5, label: "Neon", description: "Maximum saturation for maximum visual impact." },
];

function applyMoodToPrompt(prompt: string, mood: number): string {
  const tone = styleMoods.find((entry) => entry.level === mood)?.label.toLowerCase() ?? "bright";
  const guidance = `Mood adjustment: ${tone}. Increase the overall palette energy with ${tone} saturation, stronger highlights, cleaner color separation, and print-safe chroma control.`;
  if (!prompt?.trim()) return guidance;
  if (prompt.toLowerCase().includes("mood adjustment:")) return `${prompt.split("Mood adjustment:")[0].trim()}\n${guidance}`;
  return `${prompt}\n${guidance}`;
}

function applyMoodToPalette(palette: string, mood: number): string {
  const base = palette
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const low = ["soft cream", "dusty blue", "muted olive", "warm gray", "slate"];
  const normal = ["turquoise", "royal blue", "amber", "magenta", "ivory"];
  const high = ["electric cyan", "hot pink", "neon lime", "sunset orange", "violet"];
  const hyper = ["vivid yellow", "aqua", "scarlet", "magenta", "lime", "royal purple"];
  const neon = ["neon cyan", "electric purple", "hot pink", "acid lime", "chartreuse", "cyan"];

  const moodMap: Record<number, string[]> = {
    1: low,
    2: normal,
    3: [...normal, "royal blue"],
    4: high,
    5: neon,
  };
  const target = moodMap[mood] ?? normal;
  const existing = new Set(base.map((color) => color.toLowerCase()));
  const merged = [...base];
  target.forEach((color) => {
    if (!existing.has(color.toLowerCase())) merged.push(color);
  });
  if (mood >= 4) return merged.filter((color) => color).join(", ");
  if (mood <= 2) return merged.slice(0, Math.min(merged.length, 5)).join(", ");
  return merged.slice(0, Math.min(merged.length, 7)).join(", ");
}

const DEFAULT_STYLE_NAME = stylePresets[0].name;
const DEFAULT_STYLE_PROMPT = stylePresets[0].prompt;
const DEFAULT_STYLE_PALETTE = stylePresets[0].palette;

function panelFramesForCount(count: number): { templateId: string; frames: BookPanelFrame[] } {
  const matchingTemplate = DEFAULT_BOOK_PANEL_TEMPLATES.find((template) => template.panels.length === count);
  if (matchingTemplate) return { templateId: matchingTemplate.id, frames: matchingTemplate.panels.map((panel) => ({ ...panel })) };
  const columns = Math.ceil(Math.sqrt(Math.max(1, count)));
  const rows = Math.ceil(Math.max(1, count) / columns);
  const gutter = 0.025;
  const inset = 0.035;
  const width = (1 - inset * 2 - gutter * (columns - 1)) / columns;
  const height = (1 - inset * 2 - gutter * (rows - 1)) / rows;
  return {
    templateId: `source-grid-${count}`,
    frames: Array.from({ length: Math.max(1, count) }, (_, index) => ({
      id: `panel-${index + 1}`,
      x: inset + (index % columns) * (width + gutter),
      y: inset + Math.floor(index / columns) * (height + gutter),
      width,
      height,
    })),
  };
}

function resolvedDialogueLines(panel: Panel): DialogueLine[] {
  if (panel.dialogueLines?.length) return panel.dialogueLines;
  return (panel.dialogue || "").split(/\r?\n/).filter(Boolean).map((entry, index) => {
    const match = entry.match(/^([^:]{1,60}):\s*(.+)$/);
    return {
      speaker: match?.[1]?.trim() || panel.characters?.[index] || panel.characters?.[0] || "Speaker",
      text: (match?.[2] || entry).trim(),
      bubbleStyle: "speech",
    };
  });
}

function bubbleTail(anchor?: DialogueLine["balloonAnchor"]): "left" | "center" | "right" {
  if (anchor?.endsWith("left")) return "left";
  if (anchor?.endsWith("right")) return "right";
  return "center";
}

function mapChaptersToEditorPages(
  projectId: string,
  project: ProjectRecord,
  chapterData: Record<string, ChapterPayload>,
  artworkUrls: Record<string, string>,
  pageSize: BookPageEditorSize,
): BookEditorPage[] {
  return project.chapters.flatMap((chapterSummary) => {
    const chapter = chapterData[chapterSummary.chapterId];
    if (!chapter) return [];
    return chapter.pages.map((page) => {
      const pageId = `${chapterSummary.chapterId}:page:${page.pageNumber}`;
      const { templateId, frames } = panelFramesForCount(page.panels.length);
      const layers: BookEditorLayer[] = [];
      page.panels.forEach((panel, panelIndex) => {
        const panelFrame = frames[panelIndex] ?? frames[0];
        const box = {
          x: panelFrame.x * pageSize.width,
          y: panelFrame.y * pageSize.height,
          width: panelFrame.width * pageSize.width,
          height: panelFrame.height * pageSize.height,
        };
        const artworkKey = `${chapterSummary.chapterId}-${page.pageNumber}-${panel.panelNumber}`;
        const artworkFileName = panel.assetFiles.filter((file) => file.toLowerCase().endsWith(".png")).at(-1)?.split(/[\\/]/).at(-1);
        layers.push({
          id: `${pageId}:panel:${panel.panelNumber}:artwork`,
          name: `Panel ${panel.panelNumber} artwork`,
          type: "image",
          src: artworkUrls[artworkKey] ?? "",
          alt: panel.action || panel.prompt,
          fit: "cover",
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          source: {
            chapterId: chapterSummary.chapterId,
            pageNumber: page.pageNumber,
            panelNumber: panel.panelNumber,
            field: "artwork",
            artworkFileName,
          },
        });

        const dialogueLines = resolvedDialogueLines(panel);
        dialogueLines.forEach((line, dialogueIndex) => {
          const anchor = line.balloonAnchor ?? (dialogueIndex % 2 ? "top-right" : "top-left");
          const isBottom = anchor.startsWith("bottom");
          const isMiddle = anchor.startsWith("mid");
          const bubbleWidth = Math.min(box.width * 0.74, pageSize.width * 0.28);
          const bubbleHeight = Math.min(Math.max(86, box.height * 0.22), 190);
          const rightAligned = anchor.endsWith("right");
          layers.push({
            id: `${pageId}:panel:${panel.panelNumber}:dialogue:${dialogueIndex}`,
            name: `${line.speaker || "Speaker"} balloon`,
            type: "speechBubble",
            text: line.text,
            bubbleStyle: line.bubbleStyle === "thought" || line.bubbleStyle === "shout" ? line.bubbleStyle : "speech",
            tail: bubbleTail(anchor),
            fontFamily: project.setup.fontFamily || "Noto Sans",
            fontSize: Math.max(22, Math.round(project.setup.fontSizePx * 1.55)),
            fontWeight: "700",
            fill: "#fffaf0",
            stroke: "#171917",
            textColor: "#131513",
            align: "center",
            x: rightAligned ? box.x + box.width - bubbleWidth - 22 : box.x + 22,
            y: isBottom ? box.y + box.height - bubbleHeight - 24 : isMiddle ? box.y + (box.height - bubbleHeight) / 2 : box.y + 24 + dialogueIndex * 14,
            width: bubbleWidth,
            height: bubbleHeight,
            source: {
              chapterId: chapterSummary.chapterId,
              pageNumber: page.pageNumber,
              panelNumber: panel.panelNumber,
              field: "dialogue",
              dialogueIndex,
              canonicalText: line.text,
              speaker: line.speaker,
              delivery: line.delivery,
              canonicalBubbleStyle: line.bubbleStyle,
              canonicalBalloonAnchor: line.balloonAnchor,
            },
          });
        });

        if (panel.narration?.trim()) {
          layers.push({
            id: `${pageId}:panel:${panel.panelNumber}:narration`,
            name: `Panel ${panel.panelNumber} narration`,
            type: "text",
            text: panel.narration,
            fontFamily: project.setup.fontFamily || "Noto Sans",
            fontSize: Math.max(20, Math.round(project.setup.fontSizePx * 1.35)),
            fontWeight: "700",
            fill: "#171917",
            stroke: "#f5e6bd",
            strokeWidth: 10,
            align: "center",
            lineHeight: 1.12,
            x: box.x + box.width * 0.08,
            y: box.y + box.height * 0.79,
            width: box.width * 0.84,
            height: Math.max(62, box.height * 0.14),
            source: {
              chapterId: chapterSummary.chapterId,
              pageNumber: page.pageNumber,
              panelNumber: panel.panelNumber,
              field: "narration",
              canonicalText: panel.narration,
            },
          });
        }

        if (panel.soundEffect?.trim()) {
          layers.push({
            id: `${pageId}:panel:${panel.panelNumber}:sfx`,
            name: `Panel ${panel.panelNumber} SFX`,
            type: "sfx",
            text: panel.soundEffect,
            fontFamily: "Impact",
            fontSize: Math.max(46, Math.round(box.width * 0.13)),
            fill: "#f7b733",
            stroke: "#171917",
            strokeWidth: 4,
            skew: -8,
            rotation: -8,
            x: box.x + box.width * 0.22,
            y: box.y + box.height * 0.46,
            width: box.width * 0.56,
            height: Math.max(72, box.height * 0.17),
            source: {
              chapterId: chapterSummary.chapterId,
              pageNumber: page.pageNumber,
              panelNumber: panel.panelNumber,
              field: "soundEffect",
              canonicalText: panel.soundEffect,
            },
          });
        }
      });
      return {
        id: pageId,
        source: {
          projectId,
          chapterId: chapterSummary.chapterId,
          pageNumber: page.pageNumber,
          canonicalSummary: page.summary,
        },
        metadata: {
          title: page.summary || `Page ${page.pageNumber}`,
          chapterTitle: chapter.chapterTitle || chapterSummary.chapterTitle,
          pageNumber: page.pageNumber,
          status: "draft" as const,
          slug: `${chapterSummary.chapterId}-page-${String(page.pageNumber).padStart(2, "0")}`,
          notes: "",
        },
        panelTemplateId: templateId,
        panels: frames,
        layers,
        background: "#f5efe4",
      };
    });
  });
}

function mergeMappedEditorPages(current: BookEditorPage[], mapped: BookEditorPage[]): BookEditorPage[] {
  const currentById = new Map(current.map((page) => [page.id, page]));
  return mapped.map((mappedPage) => {
    const existing = currentById.get(mappedPage.id);
    if (!existing) return mappedPage;
    const mappedLayers = new Map(mappedPage.layers.map((layer) => [layer.id, layer]));
    const retainedLayers = existing.layers.map((layer) => {
      const refreshed = mappedLayers.get(layer.id);
      if (!refreshed) return layer;
      mappedLayers.delete(layer.id);
      return layer.type === "image" && refreshed.type === "image" ? { ...layer, src: refreshed.src, alt: refreshed.alt, source: refreshed.source } : layer;
    });
    return { ...mappedPage, ...existing, source: mappedPage.source, layers: [...retainedLayers, ...mappedLayers.values()] };
  });
}

function editorPageForApi(page: BookEditorPage) {
  return {
    ...page,
    layers: page.layers.map((layer) => layer.type === "image" ? { ...layer, src: undefined } : layer),
  };
}

export function BookBuilderView() {
  const [screen, setScreen] = useState<BuilderScreen>("library");
  const [studioStep, setStudioStep] = useState<StudioStep>("pages");
  const [showNewBook, setShowNewBook] = useState(false);
  const [showImportProject, setShowImportProject] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingPanel, setEditingPanel] = useState<EditablePanel | null>(null);
  const [editingPage, setEditingPage] = useState<EditablePage | null>(null);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [hermesSourcePath, setHermesSourcePath] = useState("C:\\Users\\Banjo\\Downloads\\OPAIJA_Hermes_Core");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checkingStoryProvider, setCheckingStoryProvider] = useState(false);
  const [availableModels, setAvailableModels] = useState<ArtworkModelProfile[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [continuity, setContinuity] = useState<ContinuityEntry[]>([]);
  const [chapterData, setChapterData] = useState<Record<string, ChapterPayload>>({});
  const [activeChapterId, setActiveChapterId] = useState("");
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatingArtwork, setGeneratingArtwork] = useState("");
  const [generatingCharacter, setGeneratingCharacter] = useState("");
  const [artworkUrls, setArtworkUrls] = useState<Record<string, string>>({});
  const [characterArtworkUrls, setCharacterArtworkUrls] = useState<Record<string, string>>({});
  const [coverDraft, setCoverDraft] = useState<{ front: CoverMetadataDraft; back: CoverMetadataDraft }>({
    front: {
      side: "front",
      title: "OPAIJA Volume 0",
      subtitle: "",
      tagline: "",
      author: "",
      seriesName: "",
      blurb: "",
      customPrompt: "",
    },
    back: {
      side: "back",
      title: "OPAIJA Volume 0",
      subtitle: "",
      tagline: "",
      author: "",
      seriesName: "",
      blurb: "",
      customPrompt: "",
    },
  });
  const [coverArtworkUrls, setCoverArtworkUrls] = useState<Record<CoverSide, string>>({ front: "", back: "" });
  const [generatingCoverSide, setGeneratingCoverSide] = useState<CoverSide | "">("");
  const [previewCharacter, setPreviewCharacter] = useState<CharacterBible | null>(null);
  const [projectExportManifest, setProjectExportManifest] = useState<ProjectExportManifest | null>(null);
  const [layoutPages, setLayoutPages] = useState<BookEditorPage[]>([]);
  const [layoutActivePageId, setLayoutActivePageId] = useState("");
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState("Canonical source ready");
  const [trimPresets, setTrimPresets] = useState<BookPrintTrimPreset[]>([]);
  const [printTrimPresetId, setPrintTrimPresetId] = useState("kdp-6x9");
  const [printInk, setPrintInk] = useState<BookPrintJob["request"]["ink"]>("premium_color");
  const [printPaper, setPrintPaper] = useState<BookPrintJob["request"]["paper"]>("white");
  const [printDirection, setPrintDirection] = useState<BookPrintJob["request"]["readingDirection"]>("ltr");
  const [printBleed, setPrintBleed] = useState(true);
  const [printMinimumDpi, setPrintMinimumDpi] = useState(300);
  const [printIncludeSpine, setPrintIncludeSpine] = useState(true);
  const [printPadPages, setPrintPadPages] = useState(true);
  const [printJobs, setPrintJobs] = useState<BookPrintJob[]>([]);
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pollFailureCountRef = useRef(0);
  const layoutProjectIdRef = useRef("");
  const layoutSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [newProjectTitle, setNewProjectTitle] = useState("OPAIJA Volume 0 - The Stick Chose Him");
  const [newProjectDescription, setNewProjectDescription] = useState("A Caribbean fantasy manga origin story.");
  const [targetPages, setTargetPages] = useState(6);
  const [targetPanels, setTargetPanels] = useState(4);
  const [targetTrim, setTargetTrim] = useState("6.625x10.25");
  const [styleNotes, setStyleNotes] = useState("High contrast manga, cinematic island fantasy, expressive motion.");
  const [artworkModelPreference, setArtworkModelPreference] = useState("black-forest-labs/flux-kontext-pro");
  const [kdpBookType, setKdpBookType] = useState<KdpBookType>("graphic_novel");
  const [fontFamily, setFontFamily] = useState("Noto Sans");
  const [fontSizePx, setFontSizePx] = useState(18);
  const [kdpEstimate, setKdpEstimate] = useState<KdpEstimate | null>(null);
  const [estimatedRetailMin, setEstimatedRetailMin] = useState(6.99);
  const [estimatedRetailMax, setEstimatedRetailMax] = useState(11.99);
  const [kdpEstimatePages, setKdpEstimatePages] = useState(60);
  const [kdpEstimateColor, setKdpEstimateColor] = useState(true);
  const [kdpTargetRetail, setKdpTargetRetail] = useState(9.99);
  const [styleName, setStyleName] = useState(DEFAULT_STYLE_NAME);
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE_PROMPT);
  const [palette, setPalette] = useState(DEFAULT_STYLE_PALETTE);
  const [styleMood, setStyleMood] = useState(3);
  const [characterId, setCharacterId] = useState("kai");
  const [characterName, setCharacterName] = useState("Kai");
  const [characterRole, setCharacterRole] = useState("protagonist");
  const [visualStyle, setVisualStyle] = useState("lean frame, streetwear");
  const [personality, setPersonality] = useState("disciplined, intuitive");
  const [powers, setPowers] = useState("speed burst, rhythm sensing");
  const [referencePrompt, setReferencePrompt] = useState("Keep the same face, hair, skin tone, body proportions, signature clothing, and accessories in every scene.");
  const [chapterTitle, setChapterTitle] = useState("Chapter 1: Night Drum");
  const [chapterPrompt, setChapterPrompt] = useState("Create a training and reveal sequence with emotional escalation.");
  const [chapterPages, setChapterPages] = useState(6);
  const [chapterPanels, setChapterPanels] = useState(4);
  const [includeDialogue, setIncludeDialogue] = useState(true);
  const [includeSoundEffects, setIncludeSoundEffects] = useState(true);
  const [appendToChapterId, setAppendToChapterId] = useState("");
  const [startPage, setStartPage] = useState("");
  const [buildChapterId, setBuildChapterId] = useState("");
  const [buildFromPage, setBuildFromPage] = useState("");
  const [buildToPage, setBuildToPage] = useState("");
  const [buildSkipExisting, setBuildSkipExisting] = useState(true);
  const [importProjectTitle, setImportProjectTitle] = useState("OPAIJA Volume 0 - The Stick Chose Him");
  const [importProjectDescription, setImportProjectDescription] = useState("Hermes source imported production-ready chapter manifests.");

  const activeChapter = activeChapterId ? chapterData[activeChapterId] : undefined;
  const activePage = activeChapter?.pages.find((page) => page.pageNumber === activePageNumber) ?? activeChapter?.pages[0];
  const artworkAssets = useMemo(() => assets.filter((asset) => asset.category === "panel-artwork"), [assets]);
  const coverAssets = useMemo(() => assets.filter((asset) => asset.category === "front-cover" || asset.category === "back-cover"), [assets]);
  const runningJob = jobs.find((job) => job.status === "queued" || job.status === "running");
  const selectedPrintTrim = trimPresets.find((preset) => preset.id === printTrimPresetId) ?? trimPresets[0] ?? { id: "kdp-6x9", label: "6 × 9 in", widthIn: 6, heightIn: 9 };
  const layoutCanvasSize = useMemo<BookPageEditorSize>(() => {
    const width = 1200;
    const height = Math.round(width * (selectedPrintTrim.heightIn / selectedPrintTrim.widthIn));
    const bleed = printBleed ? Math.round(width * (0.125 / selectedPrintTrim.widthIn)) : 0;
    const safeMargin = Math.round(width * (0.375 / selectedPrintTrim.widthIn));
    return { width, height, bleed, safeMargin };
  }, [printBleed, selectedPrintTrim.heightIn, selectedPrintTrim.widthIn]);
  const previousLayoutSizeRef = useRef(layoutCanvasSize);
  const latestPrintJob = printJobs[0];

  async function refreshHealth() {
    const data = await requestJson<HealthResponse>("/api/book-builder/health");
    setHealth(data);
  }

  async function recheckStoryProvider() {
    setCheckingStoryProvider(true);
    setError("");
    try {
      const data = await requestJson<HealthResponse>("/api/book-builder/provider-check", { method: "POST" });
      setHealth(data);
      setMessage(data.storyProviderStatus === "ready"
        ? `OpenAI script generation is live on ${data.model}.`
        : data.storyProviderMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to recheck OpenAI script generation.");
    } finally {
      setCheckingStoryProvider(false);
    }
  }

  async function refreshProjects() {
    setProjects(await requestJson<ProjectListItem[]>("/api/book-builder/projects"));
  }

  async function refreshArtworkModels() {
    try {
      const models = await requestJson<ArtworkModelProfile[]>("/api/book-builder/artwork-models");
      setAvailableModels(models.length ? models : FALLBACK_ARTWORK_MODELS);
    } catch {
      setAvailableModels(FALLBACK_ARTWORK_MODELS);
    }
  }

  function hydrateProjectForm(project: ProjectRecord) {
    setNewProjectTitle(project.setup.title);
    setNewProjectDescription(project.setup.description);
    setTargetPages(project.setup.targetPagesPerChapter);
    setTargetPanels(project.setup.defaultPanelsPerPage);
    setTargetTrim(project.setup.targetTrim);
    setStyleNotes(project.setup.styleNotes);
    setArtworkModelPreference(project.setup.artworkModelPreference);
    if (!availableModels.some((model) => model.id === project.setup.artworkModelPreference)) {
      setArtworkModelPreference(FALLBACK_ARTWORK_MODELS[0].id);
    }
    setKdpBookType(project.setup.kdpBookType || "graphic_novel");
    setFontFamily(project.setup.fontFamily || "Noto Sans");
    setFontSizePx(project.setup.fontSizePx || 18);
    if (project.styleBible) {
      setStyleName(project.styleBible.styleName || DEFAULT_STYLE_NAME);
      setStylePrompt(project.styleBible.stylePrompt || DEFAULT_STYLE_PROMPT);
      setPalette((project.styleBible.palette ?? []).join(", "));
      setStyleMood(project.styleBible.moodLevel ? Math.min(5, Math.max(1, Math.round(project.styleBible.moodLevel))) : 3);
    } else {
      setStyleName(DEFAULT_STYLE_NAME);
      setStylePrompt(DEFAULT_STYLE_PROMPT);
      setPalette(DEFAULT_STYLE_PALETTE);
      setStyleMood(3);
    }
    setAppendToChapterId("");
    setStartPage("");
    setBuildChapterId("");
    setBuildFromPage("");
    setBuildToPage("");
    setBuildSkipExisting(true);
    setCoverDraft({
      front: {
        side: "front",
        title: project.cover.front.title || "OPAIJA Volume 0",
        subtitle: project.cover.front.subtitle || "",
        tagline: project.cover.front.tagline || "",
        author: project.cover.front.author || "",
        seriesName: project.cover.front.seriesName || "",
        blurb: project.cover.front.blurb || "",
        customPrompt: project.cover.front.customPrompt || "",
      },
      back: {
        side: "back",
        title: project.cover.back.title || "OPAIJA Volume 0",
        subtitle: project.cover.back.subtitle || "",
        tagline: project.cover.back.tagline || "",
        author: project.cover.back.author || "",
        seriesName: project.cover.back.seriesName || "",
        blurb: project.cover.back.blurb || "",
        customPrompt: project.cover.back.customPrompt || "",
      },
    });
  }

  function resolveModelLabel(modelId: string) {
    return availableModels.find((model) => model.id === modelId)?.label || modelId;
  }

  function onBookTypeChange(nextBookType: KdpBookType) {
    setKdpBookType(nextBookType);
    const recommendedFont = recommendedReadabilityFont(nextBookType);
    const recommendedFontSize = recommendedReadabilityFontSize(nextBookType);
    setFontFamily((current) => (recommendedFontByBookType[nextBookType]?.includes(current) ? current : recommendedFont));
    setFontSizePx(recommendedFontSize);
  }

  async function loadProject(projectId: string) {
    if (!projectId) return;
    setProjectExportManifest(null);
    const [projectResult, jobsResult, assetsResult, continuityResult] = await Promise.allSettled([
      requestJson<ProjectRecord>(`/api/book-builder/projects/${projectId}`),
      requestJson<Job[]>(`/api/book-builder/projects/${projectId}/jobs`),
      requestJson<Asset[]>(`/api/book-builder/projects/${projectId}/assets`),
      requestJson<ContinuityEntry[]>(`/api/book-builder/projects/${projectId}/continuity`),
    ]);

    if (projectResult.status !== "fulfilled") {
      throw projectResult.reason instanceof Error ? projectResult.reason : new Error("Unable to load book data.");
    }
    const project = projectResult.value;
    const projectJobs = jobsResult.status === "fulfilled" ? jobsResult.value : jobs.filter((job) => job.projectId === projectId);
    const projectAssets = assetsResult.status === "fulfilled" ? assetsResult.value : [];
    const continuityData = continuityResult.status === "fulfilled" ? continuityResult.value : [];

    setSelectedProject(project);
    hydrateProjectForm(project);
    setJobs(projectJobs);
    setAssets(projectAssets);
    setContinuity(continuityData);
    setCoverArtworkUrls({ front: "", back: "" });
    const projectPages = Math.max(1, project.chapters.length * project.setup.targetPagesPerChapter);
    setKdpEstimatePages(projectPages);
    setKdpEstimateColor(project.setup.kdpBookType !== "journal");
    await loadCharacterReferences(projectId, project.characterBibles);
    await loadCoverArtwork(projectId, project.cover);
    if (!activeChapterId && project.chapters.length > 0) setActiveChapterId(project.chapters[0].chapterId);
    await refreshKdpEstimate(projectId, {
      bookType: project.setup.kdpBookType || "graphic_novel",
      trimSize: project.setup.targetTrim,
      isColor: project.setup.kdpBookType !== "journal",
      targetRetail: kdpTargetRetail,
      totalPages: projectPages,
    });
  }

  async function refreshKdpEstimate(
    projectId: string,
    options?: { bookType?: KdpBookType; trimSize?: string; isColor?: boolean; targetRetail?: number; totalPages?: number },
  ) {
    const target = await requestJson<KdpEstimate>(`/api/book-builder/projects/${projectId}/kdp-estimate`, {
      method: "POST",
      body: JSON.stringify({
        bookType: options?.bookType || "graphic_novel",
        trimSize: options?.trimSize || "6.625x10.25",
        isColor: options?.isColor ?? true,
        targetRetail: options?.targetRetail,
        totalPages: options?.totalPages ?? kdpEstimatePages,
      }),
    });
    setKdpEstimate(target);
    setEstimatedRetailMin(target.suggestedRetail.min);
    setEstimatedRetailMax(target.suggestedRetail.max);
  }

  async function loadCharacterReferences(projectId: string, characters: CharacterBible[]) {
    const adminToken = window.localStorage.getItem("opaija_admin_token");
    await Promise.all(characters.map(async (character) => {
      const reference = character.referenceImages?.at(-1);
      if (!reference) return;
      const response = await fetch(apiUrl(reference.artworkApiPath), { headers: adminToken ? { "x-admin-session": adminToken } : {} });
      if (!response.ok) return;
      const objectUrl = URL.createObjectURL(await response.blob());
      setCharacterArtworkUrls((current) => ({ ...current, [character.characterId]: objectUrl }));
    }));
  }

  async function loadCoverArtwork(projectId: string, cover: ProjectRecord["cover"]) {
    const adminToken = window.localStorage.getItem("opaija_admin_token");
    const entries: Array<{ side: CoverSide; fileName?: string }> = [
      { side: "front", fileName: cover.front.lastArtworkFileName },
      { side: "back", fileName: cover.back.lastArtworkFileName },
    ];
    await Promise.all(entries.map(async ({ side, fileName }) => {
      if (!fileName) return;
      const response = await fetch(
        apiUrl(`/api/book-builder/projects/${projectId}/cover/${side}/artwork/${encodeURIComponent(fileName)}`),
        { headers: adminToken ? { "x-admin-session": adminToken } : {} },
      );
      if (!response.ok) return;
      const objectUrl = URL.createObjectURL(await response.blob());
      setCoverArtworkUrls((current) => ({ ...current, [side]: objectUrl }));
    }));
  }

  async function loadSavedArtwork(projectId: string, chapterId: string, pages: Page[]) {
    const adminToken = window.localStorage.getItem("opaija_admin_token");
    const entries = pages.flatMap((page) =>
      page.panels.map((panel) => ({ page, panel, fileName: panel.assetFiles.filter((file) => file.toLowerCase().endsWith(".png")).at(-1) })),
    );
    await Promise.all(entries.map(async ({ page, panel, fileName }) => {
      if (!fileName) return;
      const name = fileName.split(/[\\/]/).at(-1);
      if (!name) return;
      const key = `${chapterId}-${page.pageNumber}-${panel.panelNumber}`;
      const response = await fetch(apiUrl(`/api/book-builder/projects/${projectId}/chapters/${chapterId}/pages/${page.pageNumber}/panels/${panel.panelNumber}/artwork/${encodeURIComponent(name)}`), {
        headers: adminToken ? { "x-admin-session": adminToken } : {},
      });
      if (!response.ok) return;
      const objectUrl = URL.createObjectURL(await response.blob());
      setArtworkUrls((current) => ({ ...current, [key]: objectUrl }));
    }));
  }

  async function loadChapterPayload(projectId: string, chapterId: string) {
    const payload = await requestJson<ChapterPayload>(`/api/book-builder/projects/${projectId}/chapters/${chapterId}`);
    setChapterData((current) => ({ ...current, [chapterId]: payload }));
    setActiveChapterId(chapterId);
    setActivePageNumber(payload.pages[0]?.pageNumber ?? 1);
    await loadSavedArtwork(projectId, chapterId, payload.pages);
  }

  async function prepareLayoutWorkspace() {
    if (!selectedProjectId || !selectedProject) return;
    setLayoutLoading(true);
    setPrintError("");
    try {
      const chapterEntries = await Promise.all(selectedProject.chapters.map(async (chapter) => {
        const payload = chapterData[chapter.chapterId] ?? await requestJson<ChapterPayload>(`/api/book-builder/projects/${selectedProjectId}/chapters/${chapter.chapterId}`);
        return [chapter.chapterId, payload] as const;
      }));
      const completeChapterData = { ...chapterData, ...Object.fromEntries(chapterEntries) };
      setChapterData(completeChapterData);
      await Promise.all(chapterEntries.map(([chapterId, payload]) => loadSavedArtwork(selectedProjectId, chapterId, payload.pages)));

      const [presetResult, printJobResult] = await Promise.allSettled([
        requestPrintJson<BookPrintTrimPreset[]>("/api/book-print/trim-presets"),
        requestPrintJson<BookPrintJob[]>(`/api/book-print/projects/${selectedProjectId}/jobs`),
      ]);
      if (presetResult.status === "fulfilled") {
        setTrimPresets(presetResult.value);
        setPrintTrimPresetId((current) => {
          if (!presetResult.value.length) return current;
          if (presetResult.value.some((preset) => preset.id === current)) return current;
          const trimMatch = selectedProject.setup.targetTrim.match(/([0-9.]+)\s*x\s*([0-9.]+)/i);
          if (!trimMatch) return presetResult.value[0]?.id ?? current;
          const targetWidth = Number(trimMatch[1]);
          const targetHeight = Number(trimMatch[2]);
          return presetResult.value.reduce((best, candidate) => {
            const bestDistance = Math.abs(best.widthIn - targetWidth) + Math.abs(best.heightIn - targetHeight);
            const candidateDistance = Math.abs(candidate.widthIn - targetWidth) + Math.abs(candidate.heightIn - targetHeight);
            return candidateDistance < bestDistance ? candidate : best;
          }, presetResult.value[0]).id;
        });
      } else {
        setPrintError(presetResult.reason instanceof Error ? presetResult.reason.message : "KDP trim presets are unavailable.");
      }
      if (printJobResult.status === "fulfilled") setPrintJobs(printJobResult.value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare the layout workspace.");
    } finally {
      setLayoutLoading(false);
    }
  }

  function openLayoutWorkspace(chapterId?: string, pageNumber?: number) {
    if (chapterId && pageNumber) setLayoutActivePageId(`${chapterId}:page:${pageNumber}`);
    setStudioStep("layout");
  }

  function balloonAnchorFromLayer(layer: BookEditorLayer, frame: BookPanelFrame): DialogueLine["balloonAnchor"] {
    const centerX = (layer.x + layer.width / 2) / layoutCanvasSize.width;
    const centerY = (layer.y + layer.height / 2) / layoutCanvasSize.height;
    const relativeX = (centerX - frame.x) / frame.width;
    const relativeY = (centerY - frame.y) / frame.height;
    const vertical = relativeY < 0.34 ? "top" : relativeY > 0.68 ? "bottom" : "mid";
    return `${vertical}-${relativeX < 0.5 ? "left" : "right"}` as DialogueLine["balloonAnchor"];
  }

  async function persistLayoutPayload(payload: BookPageEditorAutosavePayload) {
    if (!selectedProjectId) return;
    const editorPage = payload.pages.find((page) => page.id === payload.activePageId);
    const source = editorPage?.source;
    if (!editorPage || !source) return;
    const canonicalChapter = chapterData[source.chapterId];
    const canonicalPage = canonicalChapter?.pages.find((page) => page.pageNumber === source.pageNumber);
    if (!canonicalChapter || !canonicalPage) throw new Error("The canonical page source is not loaded.");

    setLayoutSaveStatus("Saving canonical copy and layout…");
    const promotedLayers = new Map<string, BookEditorLayer>();
    let latestChapter = canonicalChapter;

    for (const panel of canonicalPage.panels) {
      const panelFrame = editorPage.panels?.[panel.panelNumber - 1];
      if (!panelFrame) continue;
      const isInsidePanel = (layer: BookEditorLayer) => {
        const centerX = (layer.x + layer.width / 2) / layoutCanvasSize.width;
        const centerY = (layer.y + layer.height / 2) / layoutCanvasSize.height;
        return centerX >= panelFrame.x && centerX <= panelFrame.x + panelFrame.width && centerY >= panelFrame.y && centerY <= panelFrame.y + panelFrame.height;
      };
      const panelLayers = editorPage.layers.filter((layer) => layer.source?.panelNumber === panel.panelNumber || (!layer.source && isInsidePanel(layer)));
      const canonicalDialogue = resolvedDialogueLines(panel);
      const dialogueLines = canonicalDialogue.map((line, index) => {
        const layer = panelLayers.find((candidate) => candidate.type === "speechBubble" && candidate.source?.field === "dialogue" && candidate.source.dialogueIndex === index);
        if (!layer || layer.type !== "speechBubble") return line;
        return {
          ...line,
          speaker: layer.source?.speaker || line.speaker,
          text: layer.text,
          delivery: layer.source?.delivery || line.delivery,
          bubbleStyle: layer.source?.canonicalBubbleStyle === "whisper" ? "whisper" : layer.bubbleStyle,
          balloonAnchor: balloonAnchorFromLayer(layer, panelFrame),
        };
      });
      panelLayers.filter((layer) => layer.type === "speechBubble" && !layer.source).forEach((layer) => {
        if (layer.type !== "speechBubble" || !layer.text.trim()) return;
        const dialogueIndex = dialogueLines.length;
        const speaker = layer.name.replace(/\s+balloon$/i, "").trim() || panel.characters?.[0] || "Speaker";
        const balloonAnchor = balloonAnchorFromLayer(layer, panelFrame);
        dialogueLines.push({
          speaker,
          text: layer.text.trim(),
          bubbleStyle: layer.bubbleStyle ?? "speech",
          balloonAnchor,
        });
        promotedLayers.set(layer.id, {
          ...layer,
          id: `${editorPage.id}:panel:${panel.panelNumber}:dialogue:${dialogueIndex}`,
          source: {
            chapterId: source.chapterId,
            pageNumber: source.pageNumber,
            panelNumber: panel.panelNumber,
            field: "dialogue",
            dialogueIndex,
            canonicalText: layer.text.trim(),
            speaker,
            canonicalBubbleStyle: layer.bubbleStyle ?? "speech",
            canonicalBalloonAnchor: balloonAnchor,
          },
        });
      });
      const narrationLayer = panelLayers.find((layer) => layer.source?.field === "narration" && layer.type === "text");
      const soundEffectLayer = panelLayers.find((layer) => layer.source?.field === "soundEffect" && layer.type === "sfx")
        ?? panelLayers.find((layer) => !layer.source && layer.type === "sfx");
      if (soundEffectLayer?.type === "sfx" && !soundEffectLayer.source) {
        promotedLayers.set(soundEffectLayer.id, {
          ...soundEffectLayer,
          id: `${editorPage.id}:panel:${panel.panelNumber}:sfx`,
          source: {
            chapterId: source.chapterId,
            pageNumber: source.pageNumber,
            panelNumber: panel.panelNumber,
            field: "soundEffect",
            canonicalText: soundEffectLayer.text,
          },
        });
      }
      const panelLayout = {
        frame: panelFrame,
        layers: panelLayers.map((layer) => {
          const persistentLayer = promotedLayers.get(layer.id) ?? layer;
          return persistentLayer.type === "image" ? { ...persistentLayer, src: undefined } : persistentLayer;
        }),
      };
      latestChapter = await requestJson<ChapterPayload>(
        `/api/book-builder/projects/${selectedProjectId}/chapters/${source.chapterId}/pages/${source.pageNumber}/panels/${panel.panelNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: panel.action,
            prompt: panel.prompt,
            dialogue: dialogueLines.map((line) => `${line.speaker}: ${line.text}`).join("\n"),
            dialogueLines,
            narration: narrationLayer?.type === "text" ? narrationLayer.text : panel.narration ?? "",
            soundEffect: soundEffectLayer?.type === "sfx" ? soundEffectLayer.text : panel.soundEffect ?? "",
            continuityNotes: panel.continuityNotes ?? "",
            cameraAngle: panel.cameraAngle ?? "",
            shotType: panel.shotType ?? "",
            setting: panel.setting ?? "",
            mood: panel.mood ?? "",
            timeOfDay: panel.timeOfDay ?? "",
            characters: panel.characters ?? [],
            layout: panelLayout,
            layoutUpdatedAt: payload.changedAt,
          }),
        },
      );
    }

    const persistentEditorPage = promotedLayers.size ? {
      ...editorPage,
      layers: editorPage.layers.map((layer) => promotedLayers.get(layer.id) ?? layer),
    } : editorPage;
    latestChapter = await requestJson<ChapterPayload>(
      `/api/book-builder/projects/${selectedProjectId}/chapters/${source.chapterId}/pages/${source.pageNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          summary: editorPage.metadata.title.trim() || canonicalPage.summary,
          layout: editorPageForApi(persistentEditorPage),
          layoutUpdatedAt: payload.changedAt,
        }),
      },
    );

    setChapterData((current) => ({ ...current, [source.chapterId]: latestChapter }));
    if (promotedLayers.size) {
      setLayoutPages((current) => current.map((page) => page.id === editorPage.id ? {
        ...page,
        layers: page.layers.map((layer) => promotedLayers.get(layer.id) ?? layer),
      } : page));
    }
    setLayoutSaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }

  function autosaveLayout(payload: BookPageEditorAutosavePayload) {
    const operation = layoutSaveQueueRef.current.catch(() => undefined).then(() => persistLayoutPayload(payload));
    layoutSaveQueueRef.current = operation;
    return operation.catch((cause) => {
      setLayoutSaveStatus("Autosave needs attention");
      setError(cause instanceof Error ? cause.message : "Unable to autosave this page layout.");
      throw cause;
    });
  }

  async function refreshPrintJobs() {
    if (!selectedProjectId) return;
    try {
      setPrintJobs(await requestPrintJson<BookPrintJob[]>(`/api/book-print/projects/${selectedProjectId}/jobs`));
      setPrintError("");
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "Print jobs are unavailable.");
    }
  }

  async function createPrintJobHandler() {
    if (!selectedProjectId) return;
    setPrintLoading(true);
    setPrintError("");
    try {
      const job = await requestPrintJson<BookPrintJob>(
        `/api/book-print/projects/${selectedProjectId}/jobs`,
        {
          method: "POST",
          body: JSON.stringify({
            trimPreset: printTrimPresetId,
            bleed: printBleed,
            ink: printInk,
            paper: printPaper,
            readingDirection: printDirection,
            bodyFontPt: Math.max(8, Math.min(36, fontSizePx)),
            minimumImageDpi: printMinimumDpi,
            maximumImageDpi: 600,
            includeSpineText: printIncludeSpine,
            padToMinimumPages: printPadPages,
            frontMatter: ["half-title", "title", "copyright"],
            backMatter: ["about-book"],
          }),
        },
        [422],
      );
      setPrintJobs((current) => [job, ...current.filter((entry) => entry.jobId !== job.jobId)]);
      setMessage(job.status === "blocked" ? "KDP preflight found blocking issues. Review them in Layout & Print." : "KDP print job prepared and queued for PDF rendering.");
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "Unable to create the KDP print job.");
    } finally {
      setPrintLoading(false);
    }
  }

  async function retryPrintJobHandler(jobId: string) {
    setPrintLoading(true);
    try {
      const job = await requestPrintJson<BookPrintJob>(`/api/book-print/jobs/${jobId}/retry`, { method: "POST" });
      setPrintJobs((current) => current.map((entry) => entry.jobId === job.jobId ? job : entry));
      setPrintError("");
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "Unable to retry this print job.");
    } finally {
      setPrintLoading(false);
    }
  }

  async function downloadPrintArtifact(jobId: string, artifact: "interior-pdf" | "cover-pdf" | "manifest") {
    const adminToken = window.localStorage.getItem("opaija_admin_token");
    const response = await fetch(apiUrl(`/api/book-print/jobs/${jobId}/artifacts/${artifact}`), {
      headers: adminToken ? { "x-admin-session": adminToken } : {},
    });
    if (!response.ok) throw new Error("The requested print artifact is not ready.");
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${selectedProject?.projectSlug ?? "opaija-book"}-${artifact}.${artifact === "manifest" ? "json" : "pdf"}`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function pollJobsIfRunning(projectId: string) {
    if (!projectId) return false;
    try {
      const latest = await requestJson<Job[]>(`/api/book-builder/projects/${projectId}/jobs`);
      setJobs(latest);
      pollFailureCountRef.current = 0;
      return latest.some((job) => job.status === "queued" || job.status === "running");
    } catch {
      if (pollFailureCountRef.current < 6) {
        pollFailureCountRef.current += 1;
      }
      if (pollFailureCountRef.current === 6) {
        setError("Job progress polling is unstable right now; chapter build status may briefly pause.");
      }
      return jobs.some((job) => job.status === "queued" || job.status === "running");
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([refreshHealth(), refreshProjects(), refreshArtworkModels()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The library could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    pollFailureCountRef.current = 0;
    (async () => {
      try {
        await loadProject(selectedProjectId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The book could not be opened.");
      }
    })();
    const poll = async () => {
      if (!(await pollJobsIfRunning(selectedProjectId))) return;
      timer = setTimeout(poll, 2500);
    };
    poll();
    return () => { if (timer) clearTimeout(timer); };
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId && activeChapterId && !chapterData[activeChapterId]) {
      loadChapterPayload(selectedProjectId, activeChapterId).catch((cause) => setError(cause instanceof Error ? cause.message : "Pages could not be loaded."));
    }
  }, [selectedProjectId, activeChapterId]);

  useEffect(() => {
    layoutProjectIdRef.current = selectedProjectId;
    setLayoutPages([]);
    setLayoutActivePageId("");
    setPrintJobs([]);
    setPrintError("");
    setLayoutSaveStatus("Canonical source ready");
  }, [selectedProjectId]);

  useEffect(() => {
    if (studioStep !== "layout" || !selectedProjectId || !selectedProject) return;
    void prepareLayoutWorkspace();
  }, [studioStep, selectedProjectId, selectedProject?.projectId]);

  useEffect(() => {
    const previous = previousLayoutSizeRef.current;
    if (previous.width === layoutCanvasSize.width && previous.height === layoutCanvasSize.height) return;
    const scaleX = layoutCanvasSize.width / previous.width;
    const scaleY = layoutCanvasSize.height / previous.height;
    previousLayoutSizeRef.current = layoutCanvasSize;
    setLayoutPages((current) => current.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => ({
        ...layer,
        x: layer.x * scaleX,
        y: layer.y * scaleY,
        width: layer.width * scaleX,
        height: layer.height * scaleY,
      })),
    })));
  }, [layoutCanvasSize]);

  useEffect(() => {
    if (studioStep !== "layout" || !selectedProjectId || !selectedProject) return;
    const mapped = mapChaptersToEditorPages(selectedProjectId, selectedProject, chapterData, artworkUrls, layoutCanvasSize);
    if (!mapped.length) return;
    setLayoutPages((current) => layoutProjectIdRef.current === selectedProjectId ? mergeMappedEditorPages(current, mapped) : mapped);
    setLayoutActivePageId((current) => mapped.some((page) => page.id === current) ? current : mapped[0].id);
  }, [artworkUrls, chapterData, layoutCanvasSize, selectedProject, selectedProjectId, studioStep]);

  useEffect(() => {
    if (studioStep !== "layout" || !selectedProjectId) return;
    const hasActivePrintJob = printJobs.some((job) => job.status === "preparing" || job.status === "queued" || job.status === "running");
    if (!hasActivePrintJob) return;
    const timer = window.setTimeout(() => void refreshPrintJobs(), 3000);
    return () => window.clearTimeout(timer);
  }, [printJobs, selectedProjectId, studioStep]);

  function openBook(projectId: string, initialStep: StudioStep = "pages") {
    setSelectedProjectId(projectId);
    setScreen("studio");
    setStudioStep(initialStep);
    setError("");
    setMessage("");
  }

  function openProjectEditor() {
    if (!selectedProject) return;
    hydrateProjectForm(selectedProject);
    setShowEditProject(true);
  }

  function requestDeleteProject() {
    if (!selectedProjectId) return;
    setShowDeleteConfirm(true);
  }

  function openPageEditor(chapterId: string, pageNumber: number, pageSummary: string) {
    setEditingPage({
      chapterId,
      pageNumber,
      summary: pageSummary,
    });
  }

  async function createProjectHandler() {
    setLoading(true);
    setError("");
    try {
      const project = await requestJson<ProjectRecord>("/api/book-builder/projects", {
        method: "POST",
        body: JSON.stringify({
          title: newProjectTitle,
          description: newProjectDescription,
          targetPagesPerChapter: Number(targetPages),
          defaultPanelsPerPage: Number(targetPanels),
          targetTrim,
          styleNotes,
          artworkModelPreference,
          kdpBookType,
          fontFamily,
          fontSizePx,
        }),
      });
      await refreshProjects();
      setShowNewBook(false);
      openBook(project.projectId);
      setStudioStep("style");
      setMessage("Book created and saved to My Books.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the book.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProjectSetupHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      const isColor = kdpBookType !== "journal";
      const parsedTargetPages = Number(targetPages);
      const estimatePages = Math.max(1, parsedTargetPages * Math.max(1, selectedProject?.chapters.length || 1));
      const updatedProject = await requestJson<ProjectRecord>(`/api/book-builder/projects/${selectedProjectId}/setup`, {
        method: "PATCH",
        body: JSON.stringify({
          title: newProjectTitle,
          description: newProjectDescription,
          targetPagesPerChapter: Number(targetPages),
          defaultPanelsPerPage: Number(targetPanels),
          targetTrim,
          styleNotes,
          artworkModelPreference,
          kdpBookType,
          fontFamily,
          fontSizePx,
        }),
      });
      setSelectedProject(updatedProject);
      setMessage("Book settings saved.");
      await refreshKdpEstimate(selectedProjectId, {
        bookType: kdpBookType,
        trimSize: targetTrim,
        isColor,
        totalPages: estimatePages,
        targetRetail: estimatedRetailMax,
      });
      setKdpEstimateColor(isColor);
      setKdpEstimatePages(estimatePages);
      await loadProject(selectedProjectId);
      setShowEditProject(false);
      setStudioStep("style");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the book settings.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshKdpEstimateHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      const estimatePages = Number.isFinite(Number(kdpEstimatePages))
        ? Math.max(1, Number(kdpEstimatePages))
        : 1;
      await refreshKdpEstimate(selectedProjectId, {
        bookType: kdpBookType,
        trimSize: targetTrim,
        isColor: kdpEstimateColor,
        targetRetail: kdpTargetRetail,
        totalPages: estimatePages,
      });
      setKdpEstimatePages(estimatePages);
      setMessage("KDP estimate recalculated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to recalculate KDP estimate.");
    } finally {
      setLoading(false);
    }
  }

  async function saveStyleBibleHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      const moodedPrompt = applyMoodToPrompt(stylePrompt, styleMood);
      const moodedPalette = applyMoodToPalette(palette, styleMood);
      await requestJson(`/api/book-builder/projects/${selectedProjectId}/style-bible`, {
        method: "PUT",
        body: JSON.stringify({
          styleName,
          stylePrompt: moodedPrompt,
          palette: moodedPalette.split(",").map((value) => value.trim()).filter(Boolean),
          lineQuality: "bold",
          moodLevel: styleMood,
        }),
      });
      await loadProject(selectedProjectId);
      setMessage("Art direction saved.");
      setStudioStep("characters");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save art direction.");
    } finally { setLoading(false); }
  }

  async function importHermesProjectHandler() {
    if (!hermesSourcePath.trim()) {
      setError("Add the Hermes source folder path before importing.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await requestJson<HermesImportResponse>("/api/book-builder/projects/import", {
        method: "POST",
        body: JSON.stringify({
          sourcePath: hermesSourcePath,
          title: importProjectTitle.trim(),
          description: importProjectDescription.trim(),
        }),
      });
      await refreshProjects();
      setShowImportProject(false);
      openBook(response.project.projectId);
      setStudioStep("pages");
      setMessage(`Imported ${response.imported.chapters} chapter(s) (${response.imported.panels} panel(s)) from ${response.sourcePath}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import Hermes source.");
    } finally {
      setLoading(false);
    }
  }

  const previewStylePrompt = useMemo(() => applyMoodToPrompt(stylePrompt, styleMood), [stylePrompt, styleMood]);
  const previewPalette = useMemo(() => applyMoodToPalette(palette, styleMood), [palette, styleMood]);

  async function saveCharacterHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      await requestJson(`/api/book-builder/projects/${selectedProjectId}/character-bibles`, {
        method: "POST",
        body: JSON.stringify({ characterId, name: characterName, role: characterRole, visualStyle, personality, powers, referencePrompt } satisfies CharacterBible),
      });
      await loadProject(selectedProjectId);
      setMessage(`${characterName} was added to the character bible.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the character.");
    } finally { setLoading(false); }
  }

  async function generateCharacterArtworkHandler(character: CharacterBible) {
    if (!selectedProjectId) return;
    setGeneratingCharacter(character.characterId);
    setError("");
    try {
      const result = await requestJson<{ artworkApiPath: string; bytes: number; model: string }>(`/api/book-builder/projects/${selectedProjectId}/character-bibles/${character.characterId}/artwork`, { method: "POST" });
      const adminToken = window.localStorage.getItem("opaija_admin_token");
      const response = await fetch(apiUrl(result.artworkApiPath), { headers: adminToken ? { "x-admin-session": adminToken } : {} });
      if (!response.ok) throw new Error("Character reference was created but could not be displayed.");
      const objectUrl = URL.createObjectURL(await response.blob());
      setCharacterArtworkUrls((current) => ({ ...current, [character.characterId]: objectUrl }));
      await loadProject(selectedProjectId);
      setMessage(`${character.name}'s reference artwork was saved and will now guide panel artwork.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate character reference artwork.");
    } finally { setGeneratingCharacter(""); }
  }

  function updateCoverField(
    side: CoverSide,
    field: keyof Omit<CoverMetadataDraft, "side">,
    value: string,
  ) {
    setCoverDraft((current) => ({
      ...current,
      [side]: {
        ...current[side],
        [field]: value,
      },
    }));
  }

  async function saveCoverHandler(side: CoverSide) {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      const payload = side === "front" ? { front: coverDraft.front } : { back: coverDraft.back };
      const updatedProject = await requestJson<ProjectRecord>(`/api/book-builder/projects/${selectedProjectId}/cover`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setSelectedProject(updatedProject);
      setMessage(`${side === "front" ? "Front cover" : "Back cover"} metadata saved.`);
      if (selectedProject?.projectId === selectedProjectId) {
        await loadProject(selectedProjectId);
      }
      setStudioStep("cover");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save cover settings.");
    } finally {
      setLoading(false);
    }
  }

  async function generateCoverHandler(side: CoverSide) {
    if (!selectedProjectId) return;
    setGeneratingCoverSide(side);
    setError("");
    try {
      const result = await requestJson<{ artworkApiPath: string; bytes: number; model: string }>(
        `/api/book-builder/projects/${selectedProjectId}/cover/${side}/artwork`,
        { method: "POST" },
      );
      const adminToken = window.localStorage.getItem("opaija_admin_token");
      const response = await fetch(apiUrl(result.artworkApiPath), { headers: adminToken ? { "x-admin-session": adminToken } : {} });
      if (!response.ok) throw new Error("Cover artwork was created but could not be displayed.");
      const objectUrl = URL.createObjectURL(await response.blob());
      setCoverArtworkUrls((current) => ({ ...current, [side]: objectUrl }));
      await loadProject(selectedProjectId);
      setMessage(`${side === "front" ? "Front" : "Back"} cover generated and saved (${prettySize(result.bytes)}).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate this cover.");
    } finally {
      setGeneratingCoverSide("");
    }
  }

  async function startJobHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      const normalizedPages = Number.isFinite(Number(chapterPages)) && Number(chapterPages) > 0
        ? Math.round(Number(chapterPages))
        : (selectedProject?.setup.targetPagesPerChapter ?? 2);
      const normalizedPanels = Number.isFinite(Number(chapterPanels)) && Number(chapterPanels) > 0
        ? Math.round(Number(chapterPanels))
        : (selectedProject?.setup.defaultPanelsPerPage ?? 1);
      const requestBody: {
        chapterTitle: string;
        chapterPrompt: string;
        targetPages: number;
        panelsPerPage: number;
        includeDialogue: boolean;
        includeSoundEffects: boolean;
        appendToChapterId?: string;
        startPage?: number;
      } = {
        chapterTitle,
        chapterPrompt,
        targetPages: normalizedPages,
        panelsPerPage: normalizedPanels,
        includeDialogue,
        includeSoundEffects,
      };
      if (appendToChapterId) {
        requestBody.appendToChapterId = appendToChapterId;
        const parsedStartPage = Number(startPage);
        if (Number.isFinite(parsedStartPage) && parsedStartPage > 0) requestBody.startPage = parsedStartPage;
      }
      await requestJson(`/api/book-builder/projects/${selectedProjectId}/jobs`, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      await loadProject(selectedProjectId);
      setMessage("Chapter generation started. You can watch progress in Jobs.");
      setScreen("jobs");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate the chapter.");
    } finally { setLoading(false); }
  }

  async function deleteProjectHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      await requestJson(`/api/book-builder/projects/${selectedProjectId}`, { method: "DELETE" });
      setShowDeleteConfirm(false);
      setSelectedProjectId("");
      setSelectedProject(null);
      await refreshProjects();
      setMessage("Book deleted.");
      setScreen("library");
      setStudioStep("pages");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this book.");
    } finally {
      setLoading(false);
    }
  }

  async function cleanupEmptyProjectsHandler() {
    if (!window.confirm("Remove all empty books now?")) return;
    setCleanupLoading(true);
    setError("");
    try {
      const result = await requestJson<ProjectCleanupResponse>("/api/book-builder/projects/cleanup-empty", { method: "DELETE" });
      await refreshProjects();
      setMessage(
        result.deleted
          ? `Removed ${result.deleted} empty book${result.deleted === 1 ? "" : "s"} from your library.`
          : "No empty books were found.",
      );
      setShowDeleteConfirm(false);
      if (result.deletedProjectIds.includes(selectedProjectId)) {
        setSelectedProjectId("");
        setSelectedProject(null);
        setScreen("library");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cleanup empty books.");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function buildExportManifestHandler() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      const manifest = await requestJson<ProjectExportManifest>(`/api/book-builder/projects/${selectedProjectId}/export/manifest`);
      setProjectExportManifest(manifest);
      setMessage(`Book package ready: ${manifest.packageName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to build this book package.");
    } finally {
      setLoading(false);
    }
  }

  function downloadExportManifest() {
    if (!projectExportManifest) return;
    const blob = new Blob([JSON.stringify(projectExportManifest, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${projectExportManifest.packageName}.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  function openPanelEditor(panel: Panel, chapterId: string, pageNumber: number) {
    const dialogueLines = panel.dialogueLines?.length
      ? panel.dialogueLines
      : (panel.dialogue || "").split(/\r?\n/).filter(Boolean).map((entry, index) => {
          const match = entry.match(/^([^:]{1,60}):\s*(.+)$/);
          return { speaker: match?.[1]?.trim() || panel.characters?.[index] || panel.characters?.[0] || "Speaker", text: (match?.[2] || entry).trim(), bubbleStyle: "speech" as const };
        });
    setEditingPanel({
      chapterId,
      pageNumber,
      panelNumber: panel.panelNumber,
      action: panel.action || "",
      prompt: (panel as { prompt?: string }).prompt || "",
      dialogueLines,
      narration: panel.narration || "",
      soundEffect: panel.soundEffect || "",
      continuityNotes: panel.continuityNotes || "",
      cameraAngle: panel.cameraAngle || "",
      shotType: panel.shotType || "",
      setting: panel.setting || "",
      mood: panel.mood || "",
      timeOfDay: panel.timeOfDay || "",
      characters: panel.characters?.join(", ") || "",
    });
  }

  async function savePanelEditHandler() {
    if (!selectedProjectId || !editingPanel) return;
    setLoading(true);
    setError("");
    try {
      await requestJson(`/api/book-builder/projects/${selectedProjectId}/chapters/${editingPanel.chapterId}/pages/${editingPanel.pageNumber}/panels/${editingPanel.panelNumber}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: editingPanel.action,
          prompt: editingPanel.prompt,
          dialogueLines: editingPanel.dialogueLines,
          narration: editingPanel.narration,
          soundEffect: editingPanel.soundEffect,
          continuityNotes: editingPanel.continuityNotes,
          cameraAngle: editingPanel.cameraAngle,
          shotType: editingPanel.shotType,
          setting: editingPanel.setting,
          mood: editingPanel.mood,
          timeOfDay: editingPanel.timeOfDay,
          characters: editingPanel.characters
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      setEditingPanel(null);
      await loadProject(selectedProjectId);
      if (editingPanel.chapterId) {
        await loadChapterPayload(selectedProjectId, editingPanel.chapterId);
      }
      setMessage("Panel copy has been updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this panel.");
    } finally {
      setLoading(false);
    }
  }

  async function savePageEditHandler() {
    if (!selectedProjectId || !editingPage) return;
    setLoading(true);
    setError("");
    try {
      const chapter = await requestJson<ChapterPayload>(
        `/api/book-builder/projects/${selectedProjectId}/chapters/${editingPage.chapterId}/pages/${editingPage.pageNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            summary: editingPage.summary,
          }),
        },
      );
      setEditingPage(null);
      setSelectedProject((current) => (current ? { ...current } : current));
      await loadProject(selectedProjectId);
      if (chapter.chapterId) {
        await loadChapterPayload(selectedProjectId, chapter.chapterId);
      }
      setMessage("Page summary has been updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this page.");
    } finally {
      setLoading(false);
    }
  }

  async function autoBuildArtworkHandler() {
    if (!selectedProjectId) return;
    setAutoBuilding(true);
    setError("");
    try {
      const fromPage = buildFromPage ? Number(buildFromPage) : undefined;
      const toPage = buildToPage ? Number(buildToPage) : undefined;
      if (fromPage !== undefined && (!Number.isFinite(fromPage) || fromPage < 1)) throw new Error("From page must be at least 1.");
      if (toPage !== undefined && (!Number.isFinite(toPage) || toPage < 1)) throw new Error("To page must be at least 1.");
      if (fromPage !== undefined && toPage !== undefined && fromPage > toPage) {
        throw new Error("From page must be less than or equal to To page.");
      }
      const requestBody: {
        skipExisting: boolean;
        chapterId?: string;
        fromPage?: number;
        toPage?: number;
      } = {
        skipExisting: buildSkipExisting,
      };
      if (buildChapterId) requestBody.chapterId = buildChapterId;
      if (fromPage !== undefined) requestBody.fromPage = fromPage;
      if (toPage !== undefined) requestBody.toPage = toPage;
      const buildResult = await requestJson<{
        projectId: string;
        totalPanels: number;
        generated: number;
        skipped: number;
        errors: string[];
      }>(`/api/book-builder/projects/${selectedProjectId}/build-artwork`, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      await loadProject(selectedProjectId);
      if (activeChapterId) await loadChapterPayload(selectedProjectId, activeChapterId);
      if (!requestBody.chapterId && selectedProject?.chapters.length) {
        await Promise.all(selectedProject.chapters.map((chapter) => loadChapterPayload(selectedProjectId, chapter.chapterId)));
      }
      if (buildResult.errors.length) {
        const failures = buildResult.errors.length;
        setMessage(`Auto build complete: ${buildResult.generated} new panels, ${buildResult.skipped} skipped, ${failures} failures.`);
      } else {
        setMessage(`Auto build complete: ${buildResult.generated} new panels created.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to build artwork for this book.");
    } finally {
      setAutoBuilding(false);
    }
  }

  async function regenerateHandler(jobId: string) {
    if (!selectedProjectId) return;
    setLoading(true);
    setError("");
    try {
      await requestJson(`/api/book-builder/jobs/${jobId}/regenerate`, { method: "POST" });
      await loadProject(selectedProjectId);
      setMessage("A fresh version is being generated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to regenerate this chapter.");
    } finally { setLoading(false); }
  }

  async function generateArtworkHandler(chapterId: string, pageNumber: number, panelNumber: number) {
    if (!selectedProjectId) return;
    const artworkKey = `${chapterId}-${pageNumber}-${panelNumber}`;
    setGeneratingArtwork(artworkKey);
    setError("");
    try {
      const result = await requestJson<{ artworkApiPath: string; bytes: number; model: string }>(
        `/api/book-builder/projects/${selectedProjectId}/chapters/${chapterId}/pages/${pageNumber}/panels/${panelNumber}/artwork`,
        { method: "POST" },
      );
      const adminToken = window.localStorage.getItem("opaija_admin_token");
      const response = await fetch(apiUrl(result.artworkApiPath), { headers: adminToken ? { "x-admin-session": adminToken } : {} });
      if (!response.ok) throw new Error("Artwork was created but could not be displayed.");
      const objectUrl = URL.createObjectURL(await response.blob());
      setArtworkUrls((current) => ({ ...current, [artworkKey]: objectUrl }));
      await loadProject(selectedProjectId);
      await loadChapterPayload(selectedProjectId, chapterId);
      setMessage(`Panel artwork saved to the library (${prettySize(result.bytes)}).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate artwork.");
    } finally { setGeneratingArtwork(""); }
  }

  const completedSteps = new Set<StudioStep>([
    "setup",
    ...(selectedProject?.styleBible ? ["style" as StudioStep] : []),
    ...(selectedProject?.characterBibles.length ? ["characters" as StudioStep] : []),
    ...(selectedProject?.chapters.length ? ["chapter" as StudioStep, "pages" as StudioStep] : []),
    ...(artworkAssets.length ? ["artwork" as StudioStep] : []),
    ...((selectedProject?.cover?.front.lastArtworkFileName || selectedProject?.cover?.back.lastArtworkFileName) ? ["cover" as StudioStep] : []),
    ...((layoutPages.length || latestPrintJob?.preflight?.passed) ? ["layout" as StudioStep] : []),
  ]);

  return (
    <div className="book-builder-view">
      <header className="bb-topbar">
        <button className="bb-brand" type="button" onClick={() => setScreen("library")}>
          <span className="bb-brand-mark">O</span>
          <span><strong>OPAIJA</strong><small>Book Studio</small></span>
        </button>
        <nav className="bb-primary-nav" aria-label="Book Builder sections">
          <button className={screen === "library" ? "active" : ""} onClick={() => setScreen("library")}><Library size={17} /> My Books</button>
          <button className={screen === "studio" ? "active" : ""} onClick={() => selectedProjectId && setScreen("studio")} disabled={!selectedProjectId}><BookOpen size={17} /> Studio</button>
          <button className={screen === "assets" ? "active" : ""} onClick={() => setScreen("assets")}><Archive size={17} /> Artwork Library</button>
          <button className={screen === "jobs" ? "active" : ""} onClick={() => setScreen("jobs")}><Clock3 size={17} /> Jobs {runningJob && <span className="bb-live-dot" />}</button>
        </nav>
        <div className="bb-save-state"><Save size={15} /><span><strong>Saved automatically</strong><small>Securely stored on OPAIJA</small></span></div>
      </header>

      {error && <div className="bb-alert error"><CircleAlert size={18} />{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {message && <div className="bb-alert success"><Check size={18} />{message}<button onClick={() => setMessage("")}>Dismiss</button></div>}

      {screen === "library" && (
        <main className="bb-library">
        <section className="bb-library-hero">
          <div><span className="bb-eyebrow">YOUR CREATIVE HOME</span><h1>My Books</h1><p>Every OPAIJA book, chapter, page, and artwork file is saved here.</p></div>
          <div className="bb-library-actions">
            <button className="bb-primary" onClick={() => setShowNewBook(true)}><Plus size={18} /> Create a new book</button>
            <button className="bb-secondary" onClick={() => setShowImportProject(true)}><Upload size={18} /> Import Hermes package</button>
            <button className="bb-secondary" onClick={cleanupEmptyProjectsHandler} disabled={loading || cleanupLoading}>
              <Trash2 size={18} />
              {cleanupLoading ? "Cleaning empty books..." : "Remove empty books"}
            </button>
          </div>
        </section>
          <section className="bb-library-summary">
            <div><strong>{projects.length}</strong><span>Saved books</span></div>
            <div><strong>{projects.reduce((sum, project) => sum + project.chapterCount, 0)}</strong><span>Chapters</span></div>
            <div><strong>{health?.jobs.completed ?? 0}</strong><span>Completed jobs</span></div>
            <div
              className={`bb-system-ready ${health?.storyProviderStatus === "billing_required" ? "warning" : health?.storyProviderStatus === "fallback" ? "fallback" : ""}`}
              title={health?.storyProviderMessage}
            >
              <span />
              <strong>{health?.storyProviderStatus === "billing_required" ? "Script billing needed" : health?.storyProviderStatus === "fallback" ? "Local script fallback" : "Script AI ready"}</strong>
              <button type="button" className="bb-health-check" onClick={recheckStoryProvider} disabled={checkingStoryProvider}>
                {checkingStoryProvider ? "Checking..." : "Recheck"}
              </button>
            </div>
            <div className="bb-system-ready"><span /><strong>{health?.artworkProvider === "replicate" ? "AI artwork ready" : "Artwork setup needed"}</strong></div>
          </section>
          <section className="bb-book-grid" aria-label="Saved book library">
                <button className="bb-new-book-card" onClick={() => setShowNewBook(true)}><span><Plus size={28} /></span><strong>Start a new book</strong><small>Guided setup takes about a minute</small></button>
            {projects.map((project, index) => (
              <article className="bb-book-card" key={project.projectId}>
                <button className={`bb-book-cover cover-${index % 3}`} onClick={() => openBook(project.projectId)} aria-label={`Open ${project.title}`}>
                  <span>OPAIJA</span><strong>{project.title.replace(/^OPAIJA\s*/i, "")}</strong><small>{kdpBookTypes.find((entry) => entry.id === project.kdpBookType)?.label ?? "Other"}</small>
                </button>
                <div className="bb-book-meta"><div><strong>{project.title}</strong><span>Edited {formatDate(project.updatedAt)}</span></div><div className="bb-inline-actions">
                  <button className="bb-secondary" onClick={async () => {
                    await openBook(project.projectId);
                    await loadProject(project.projectId);
                    setShowEditProject(true);
                  }}>
                    <Pencil size={13} /> Settings
                  </button>
                  <button className="bb-secondary" onClick={() => {
                    setSelectedProjectId(project.projectId);
                    setShowDeleteConfirm(true);
                  }}>Delete</button>
                  <button className="bb-secondary" onClick={() => openBook(project.projectId, "cover")}>
                    <WandSparkles size={14} /> Cover
                  </button>
                  <button onClick={() => openBook(project.projectId)}>Open studio <ChevronRight size={16} /></button>
                </div></div>
                <div className="bb-book-stats">
                  <span>{project.chapterCount} chapters</span><span>{project.characterCount} characters</span><span>{project.styleBibleSet ? "Style locked" : "Style needed"}</span>
                  <span>{kdpBookTypes.find((entry) => entry.id === project.kdpBookType)?.label ?? "Graphic Novel"}</span>
                </div>
              </article>
            ))}
          </section>
        </main>
      )}

      {showNewBook && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setShowNewBook(false)}>
          <section className="bb-modal" role="dialog" aria-modal="true" aria-labelledby="new-book-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setShowNewBook(false)} aria-label="Close">x</button>
            <span className="bb-eyebrow">STEP 1 OF 9</span><h2 id="new-book-title">Set up your book</h2><p>Start with the basics. Everything can be refined later.</p>
            <div className="bb-form-grid">
              <label className="wide">Book title<input value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} /></label>
              <label className="wide">What is the story about?<textarea value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} rows={3} /></label>
              <label>Pages per chapter<input type="number" min={2} max={120} value={targetPages} onChange={(event) => setTargetPages(Number(event.target.value))} /></label>
              <label>Panels per page<input type="number" min={1} max={12} value={targetPanels} onChange={(event) => setTargetPanels(Number(event.target.value))} /></label>
              <label>Print size<input value={targetTrim} onChange={(event) => setTargetTrim(event.target.value)} /></label>
              <label className="wide">
                Art model
                <select value={artworkModelPreference} onChange={(event) => setArtworkModelPreference(event.target.value)}>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} {model.isDefault ? "(default)" : ""}
                    </option>
                  ))}
                </select>
                <small>{resolveModelLabel(artworkModelPreference)}: {availableModels.find((model) => model.id === artworkModelPreference)?.notes}</small>
              </label>
              <label className="wide">Creative notes<textarea value={styleNotes} onChange={(event) => setStyleNotes(event.target.value)} rows={2} /></label>
              <label>Book type
                <select value={kdpBookType} onChange={(event) => onBookTypeChange(event.target.value as KdpBookType)}>
                  {kdpBookTypes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
                <small>Best readability font: {recommendedReadabilityFont(kdpBookType)} @ {recommendedReadabilityFontSize(kdpBookType)}.</small>
              </label>
              <label>Reading font
                <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
                  {fontOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>Font size (px)<input type="number" min={12} max={36} value={fontSizePx} onChange={(event) => setFontSizePx(Number(event.target.value))} /></label>
            </div>
            <div className="bb-modal-actions"><button className="bb-secondary" onClick={() => setShowNewBook(false)}>Cancel</button><button className="bb-primary" onClick={createProjectHandler} disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} Create book and continue</button></div>
          </section>
        </div>
      )}

      {showImportProject && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setShowImportProject(false)}>
          <section className="bb-modal" role="dialog" aria-modal="true" aria-labelledby="import-book-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setShowImportProject(false)} aria-label="Close">x</button>
            <span className="bb-eyebrow">DATA IMPORT</span><h2 id="import-book-title">Import Hermes folder</h2>
              <p>Point this to the extracted Hermes folder on the server. This will create a new book and load Hermes chapter panels into the studio.</p>
              <small>If you only have a ZIP file, extract it first and point to that folder.</small>
            <div className="bb-form-grid">
              <label className="wide">
                Source folder path
                <input value={hermesSourcePath} onChange={(event) => setHermesSourcePath(event.target.value)} />
              </label>
              <label className="wide">Book title<input value={importProjectTitle} onChange={(event) => setImportProjectTitle(event.target.value)} /></label>
              <label className="wide">Book description<textarea value={importProjectDescription} onChange={(event) => setImportProjectDescription(event.target.value)} rows={3} /></label>
            </div>
              <div className="bb-modal-actions">
                <button className="bb-secondary" onClick={() => setShowImportProject(false)}>Cancel</button>
                <button className="bb-primary" onClick={importHermesProjectHandler} disabled={loading || !hermesSourcePath.trim()}>
                  {loading ? <LoaderCircle className="spin" size={16} /> : <Upload size={17} />} Import book
                </button>
              </div>
          </section>
        </div>
      )}

      {showEditProject && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setShowEditProject(false)}>
          <section className="bb-modal bb-compact" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setShowEditProject(false)} aria-label="Close">x</button>
            <span className="bb-eyebrow">EDIT BOOK SETTINGS</span><h2>Edit project settings</h2>
            <p>Tune the settings that shape generation quality, output type, and readable output style.</p>
            <div className="bb-form-grid">
              <label className="wide">Book title<input value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} /></label>
              <label className="wide">Project description<textarea value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} rows={3} /></label>
              <label>Pages per chapter<input type="number" min={2} max={120} value={targetPages} onChange={(event) => setTargetPages(Number(event.target.value))} /></label>
              <label>Panels per page<input type="number" min={1} max={12} value={targetPanels} onChange={(event) => setTargetPanels(Number(event.target.value))} /></label>
              <label>Print size<input value={targetTrim} onChange={(event) => setTargetTrim(event.target.value)} /></label>
              <label className="wide">
                Art model
                <select value={artworkModelPreference} onChange={(event) => setArtworkModelPreference(event.target.value)}>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} {model.isDefault ? "(default)" : ""}
                    </option>
                  ))}
                </select>
                <small>{resolveModelLabel(artworkModelPreference)}: {availableModels.find((model) => model.id === artworkModelPreference)?.notes}</small>
              </label>
              <label className="wide">KDP book type<select value={kdpBookType} onChange={(event) => onBookTypeChange(event.target.value as KdpBookType)}>
                {kdpBookTypes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select><small>Best readability font: {recommendedReadabilityFont(kdpBookType)} @ {recommendedReadabilityFontSize(kdpBookType)}.</small></label>
              <label>Font family<select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
                {fontOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select></label>
              <label>Font size (px)<input type="number" min={12} max={36} value={fontSizePx} onChange={(event) => setFontSizePx(Number(event.target.value))} /></label>
            </div>
            <div className="bb-modal-actions">
              <button className="bb-secondary" onClick={() => setShowEditProject(false)}>Cancel</button>
              <button className="bb-primary" onClick={saveProjectSetupHandler} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save settings</button>
            </div>
          </section>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setShowDeleteConfirm(false)}>
          <section className="bb-modal bb-compact" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setShowDeleteConfirm(false)} aria-label="Close">x</button>
            <span className="bb-eyebrow">REMOVE BOOK</span><h2>Delete this book?</h2>
            <p>This removes all generated chapters, artwork files, and project metadata for this book. This cannot be undone.</p>
            <div className="bb-modal-actions">
              <button className="bb-secondary" onClick={() => setShowDeleteConfirm(false)}>Keep book</button>
              <button className="bb-primary" onClick={deleteProjectHandler} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <X size={16} />} Delete permanently</button>
            </div>
          </section>
        </div>
      )}

      {editingPanel && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setEditingPanel(null)}>
          <section className="bb-modal bb-panel-editor" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setEditingPanel(null)} aria-label="Close">x</button>
            <span className="bb-eyebrow">PAGE EDITOR</span><h2>Redo panel copy</h2>
            <p>Update prompt text and continuity details before re-rendering this panel.</p>
            <div className="bb-form-grid">
              <label className="wide">Action or narration<textarea rows={3} value={editingPanel.action} onChange={(event) => setEditingPanel((current) => ({ ...current!, action: event.target.value }))} /></label>
              <label className="wide">Panel prompt<textarea rows={3} value={editingPanel.prompt} onChange={(event) => setEditingPanel((current) => ({ ...current!, prompt: event.target.value }))} /></label>
              <div className="wide"><strong>Speech balloons</strong><small>Speaker names guide placement only. Readers see only the exact words.</small>{editingPanel.dialogueLines.map((line, index) => <div className="bb-form-grid" key={`${index}-${line.speaker}`}><label>Speaker metadata<input value={line.speaker} onChange={(event) => setEditingPanel((current) => ({ ...current!, dialogueLines: current!.dialogueLines.map((entry, entryIndex) => entryIndex === index ? { ...entry, speaker: event.target.value } : entry) }))} /></label><label>Words in bubble<textarea rows={2} value={line.text} onChange={(event) => setEditingPanel((current) => ({ ...current!, dialogueLines: current!.dialogueLines.map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry) }))} /></label><label>Bubble style<select value={line.bubbleStyle || "speech"} onChange={(event) => setEditingPanel((current) => ({ ...current!, dialogueLines: current!.dialogueLines.map((entry, entryIndex) => entryIndex === index ? { ...entry, bubbleStyle: event.target.value as DialogueLine["bubbleStyle"] } : entry) }))}><option value="speech">Speech</option><option value="thought">Thought</option><option value="shout">Shout</option><option value="whisper">Whisper</option></select></label><label>Position<select value={line.balloonAnchor || ""} onChange={(event) => setEditingPanel((current) => ({ ...current!, dialogueLines: current!.dialogueLines.map((entry, entryIndex) => entryIndex === index ? { ...entry, balloonAnchor: (event.target.value || undefined) as DialogueLine["balloonAnchor"] } : entry) }))}><option value="">Automatic</option><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="mid-left">Middle left</option><option value="mid-right">Middle right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label><button type="button" className="bb-secondary" onClick={() => setEditingPanel((current) => ({ ...current!, dialogueLines: current!.dialogueLines.filter((_, entryIndex) => entryIndex !== index) }))}>Remove balloon</button></div>)}<button type="button" className="bb-secondary" onClick={() => setEditingPanel((current) => ({ ...current!, dialogueLines: [...current!.dialogueLines, { speaker: current!.characters.split(",")[0]?.trim() || "Speaker", text: "", bubbleStyle: "speech" }] }))}>Add speaker balloon</button></div>
              <label>Narration<textarea rows={2} value={editingPanel.narration} onChange={(event) => setEditingPanel((current) => ({ ...current!, narration: event.target.value }))} /></label>
              <label>Sound effect<input value={editingPanel.soundEffect} onChange={(event) => setEditingPanel((current) => ({ ...current!, soundEffect: event.target.value }))} /></label>
              <label>Characters (comma separated)<input value={editingPanel.characters} onChange={(event) => setEditingPanel((current) => ({ ...current!, characters: event.target.value }))} /></label>
              <label>Camera angle<input value={editingPanel.cameraAngle} onChange={(event) => setEditingPanel((current) => ({ ...current!, cameraAngle: event.target.value }))} /></label>
              <label>Shot type<input value={editingPanel.shotType} onChange={(event) => setEditingPanel((current) => ({ ...current!, shotType: event.target.value }))} /></label>
              <label>Setting<input value={editingPanel.setting} onChange={(event) => setEditingPanel((current) => ({ ...current!, setting: event.target.value }))} /></label>
              <label>Mood<input value={editingPanel.mood} onChange={(event) => setEditingPanel((current) => ({ ...current!, mood: event.target.value }))} /></label>
              <label>Time of day<input value={editingPanel.timeOfDay} onChange={(event) => setEditingPanel((current) => ({ ...current!, timeOfDay: event.target.value }))} /></label>
              <label className="wide">Continuity notes<textarea rows={2} value={editingPanel.continuityNotes} onChange={(event) => setEditingPanel((current) => ({ ...current!, continuityNotes: event.target.value }))} /></label>
            </div>
            <div className="bb-modal-actions">
              <button className="bb-secondary" onClick={() => setEditingPanel(null)}>Cancel</button>
              <button className="bb-primary" onClick={savePanelEditHandler} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <Text size={16} />} Save panel text</button>
            </div>
          </section>
        </div>
      )}

      {editingPage && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setEditingPage(null)}>
          <section className="bb-modal bb-page-editor" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setEditingPage(null)} aria-label="Close">x</button>
            <span className="bb-eyebrow">PAGE EDITOR</span><h2>Update page summary</h2>
            <p>Tweak the panel-summary line before generating or regenerating page-level renders.</p>
            <div className="bb-form-grid">
              <label className="wide">Page summary<textarea rows={3} value={editingPage.summary} onChange={(event) => setEditingPage((current) => ({ ...current!, summary: event.target.value }))} /></label>
            </div>
            <div className="bb-modal-actions">
              <button className="bb-secondary" onClick={() => setEditingPage(null)}>Cancel</button>
              <button className="bb-primary" onClick={savePageEditHandler} disabled={loading}>
                {loading ? <LoaderCircle className="spin" size={16} /> : <Text size={16} />} Save page summary
              </button>
            </div>
          </section>
        </div>
      )}

      {previewCharacter && (
        <div className="bb-modal-backdrop" role="presentation" onMouseDown={() => setPreviewCharacter(null)}>
          <section className="bb-modal bb-character-preview" role="dialog" aria-modal="true" aria-label={`${previewCharacter.name} character bible`} onMouseDown={(event) => event.stopPropagation()}>
            <button className="bb-close" onClick={() => setPreviewCharacter(null)} aria-label="Close">x</button>
            <span className="bb-eyebrow">AUTHORITATIVE OPAIJA BIBLE</span>
            <h2>{previewCharacter.name}</h2>
            <p>{previewCharacter.role}</p>
            {characterArtworkUrls[previewCharacter.characterId] && <img src={characterArtworkUrls[previewCharacter.characterId]} alt={`${previewCharacter.name} full production bible`} />}
            <div className="bb-saved-note"><Check size={16} /> This original sheet is locked and used before panel artwork.</div>
          </section>
        </div>
      )}

      {screen === "studio" && selectedProject && (
        <main className="bb-studio">
          <aside className="bb-workflow">
            <button className="bb-back" onClick={() => setScreen("library")}><ArrowLeft size={16} /> My Books</button>
            <div className="bb-current-book"><small>CURRENT BOOK</small><strong>{selectedProject.setup.title}</strong><span>{selectedProject.setup.targetTrim} in</span></div>
            <div className="bb-inline-actions">
              <button className="bb-secondary" onClick={openProjectEditor}><BookMarked size={14} /> Edit settings</button>
              <button className="bb-secondary" onClick={requestDeleteProject}><X size={14} /> Remove</button>
            </div>
            <p className="bb-workflow-label">BUILD YOUR BOOK</p>
            {workflowSteps.map((step, index) => (
              <button key={step.id} className={studioStep === step.id ? "active" : ""} onClick={() => setStudioStep(step.id)}><span className={completedSteps.has(step.id) ? "complete" : ""}>{completedSteps.has(step.id) ? <Check size={14} /> : index + 1}</span><div><strong>{step.label}</strong><small>{step.hint}</small></div><ChevronRight size={15} /></button>
            ))}
          </aside>

          <section className="bb-workspace">
            {studioStep === "setup" && (
              <StudioCard eyebrow="STEP 1" title="Book setup" intro="The foundation of this saved book.">
                <div className="bb-book-facts">
                  <div><span>Title</span><strong>{selectedProject.setup.title}</strong></div>
                  <div><span>Description</span><strong>{selectedProject.setup.description}</strong></div>
                  <div><span>Chapter size</span><strong>{selectedProject.setup.targetPagesPerChapter} pages</strong></div>
                  <div><span>Page layout</span><strong>{selectedProject.setup.defaultPanelsPerPage} panels per page</strong></div>
                  <div><span>Print trim</span><strong>{selectedProject.setup.targetTrim} in</strong></div>
                  <div><span>Reading setup</span><strong>{selectedProject.setup.fontFamily} @ {selectedProject.setup.fontSizePx}px</strong></div>
                  <div><span>Storage</span><strong>Saved automatically</strong></div>
                </div>
                <div className="bb-form-grid">
              <label>Book type<select value={kdpBookType} onChange={(event) => onBookTypeChange(event.target.value as KdpBookType)}><option value="coloring_book">Coloring Book</option><option value="comic_book">Comic Book</option><option value="art_book">Art Book</option><option value="journal">Journal</option><option value="graphic_novel">Graphic Novel</option><option value="other">Other</option></select></label>
                  <label>Print trim<input value={targetTrim} onChange={(event) => setTargetTrim(event.target.value)} /></label>
                  <label>Estimated pages<input type="number" min={1} max={9999} value={kdpEstimatePages} onChange={(event) => setKdpEstimatePages(Number(event.target.value))} /></label>
                  <label>Color print
                    <select value={kdpEstimateColor ? "color" : "bw"} onChange={(event) => setKdpEstimateColor(event.target.value === "color")}>
                      <option value="color">Color</option>
                      <option value="bw">Grayscale</option>
                    </select>
                  </label>
                  <label>Target retail floor<input type="number" min={4.99} step={0.25} value={kdpTargetRetail} onChange={(event) => setKdpTargetRetail(Number(event.target.value))} /></label>
                </div>
                <div className="bb-inline-actions">
                  <button className="bb-secondary" onClick={refreshKdpEstimateHandler} disabled={loading}><Wallet size={16} /> Recalculate estimate</button>
                </div>
                {kdpEstimate && (
                  <div className="bb-kdp-estimate">
                    <strong>KDP estimate</strong>
                    <p><small>{kdpEstimate.bookType.replace(/_/g, " ")} / {kdpEstimate.trimSize} / {kdpEstimateColor ? "color" : "grayscale"}</small></p>
                    <p>Print cost: ${kdpEstimate.printCostEstimate}</p>
                    <p>Suggested retail: ${kdpEstimate.suggestedRetail.min} - ${kdpEstimate.suggestedRetail.max}</p>
                    <p>Royalty (estimated): ${kdpEstimate.estimatedRoyalty.min} - ${kdpEstimate.estimatedRoyalty.max}</p>
                  </div>
                )}
                <button className="bb-primary" onClick={() => setStudioStep("style")}>
                  Continue to art direction <ChevronRight size={17} />
                </button>
              </StudioCard>
            )}

            {studioStep === "style" && <StudioCard eyebrow="STEP 2" title="Art direction" intro="Give the AI one consistent visual language for the whole book.">
              <div className="bb-style-presets">
                {stylePresets.map((item) => {
                  const isActive = styleName === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      className={`bb-style-preset ${isActive ? "active" : ""}`}
                      onClick={() => {
                        setStyleName(item.name);
                        setStylePrompt(item.prompt);
                        setPalette(item.palette);
                        setStyleMood(3);
                    }}
                  >
                    <strong>{item.name}</strong>
                    <div
                      className="bb-style-preview"
                      aria-hidden
                    >
                      {item.imagePreview ? <img src={item.imagePreview} alt={`${item.name} style reference`} /> : <div style={{ background: item.preview }} />}
                    </div>
                    <small>{item.label}</small>
                    <span className="tone">{item.tone}</span>
                      <div className="swatches">
                        {item.palette.split(",").map((value) => <i key={value.trim()} style={{ backgroundColor: value.trim() }} />)}
                      </div>
                    </button>
                  );
                })}
              </div>
              <label className="bb-mood-slider-label">
                Mood slider: {styleMoods[styleMood - 1]?.label ?? "Bright"}
              </label>
              <input
                className="bb-mood-slider"
                type="range"
                min={1}
                max={5}
                step={1}
                value={styleMood}
                onChange={(event) => setStyleMood(Number(event.target.value))}
              />
              <p className="bb-mood-description">
                {styleMoods[styleMood - 1]?.description ?? ""}
              </p>
              <div className="bb-form-grid">
                <label>Style name<input value={styleName} onChange={(event) => setStyleName(event.target.value)} /></label>
                <label>Color palette<input value={palette} onChange={(event) => setPalette(event.target.value)} /></label>
                <label className="wide">Visual instructions<textarea rows={5} value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} /></label>
                <label className="wide">Mood-adjusted prompt preview<textarea rows={5} value={previewStylePrompt} readOnly /></label>
              </div>
              <label className="wide">Palette preview from mood<input value={previewPalette} readOnly /></label>
              {selectedProject.styleBible && <div className="bb-saved-note"><Check size={16} /> Current style: <strong>{selectedProject.styleBible.styleName}</strong></div>}
              <button className="bb-primary" onClick={saveStyleBibleHandler} disabled={loading}><Palette size={17} /> Save art direction</button>
            </StudioCard>}

            {studioStep === "characters" && <StudioCard eyebrow="STEP 3" title="Official character bible library" intro="The ten original OPAIJA production sheets are loaded from the app and locked as the source of truth. Open any sheet to inspect it; matching names such as Kai automatically resolve to the correct original."><div className="bb-canon-count"><Check size={16} /><strong>{selectedProject.characterBibles.filter((character) => character.referenceImages?.some((reference) => reference.source === "canonical")).length} official cast sheets loaded</strong><span>These files are referenced before chapter and panel artwork.</span></div><div className="bb-character-list">{selectedProject.characterBibles.map((character) => { const isCanonical = character.referenceImages?.some((reference) => reference.source === "canonical"); return <article className="bb-character-bible-card" key={character.characterId}>{characterArtworkUrls[character.characterId] ? <img src={characterArtworkUrls[character.characterId]} alt={`${character.name} reference artwork`} /> : <span>{character.name.slice(0, 1).toUpperCase()}</span>}<div><strong>{character.name}</strong><small>{character.role || "Character"}</small><em>{isCanonical ? "Original production bible | identity locked" : character.referenceImages?.length ? `${character.referenceImages.length} saved reference${character.referenceImages.length === 1 ? "" : "s"}` : "No reference artwork yet"}</em></div>{isCanonical ? <button className="bb-secondary" onClick={() => setPreviewCharacter(character)}><FolderOpen size={15} /> Open bible</button> : <button className={character.referenceImages?.length ? "bb-secondary" : "bb-primary"} onClick={() => generateCharacterArtworkHandler(character)} disabled={Boolean(generatingCharacter)}>{generatingCharacter === character.characterId ? <><LoaderCircle className="spin" size={15} /> Creating...</> : character.referenceImages?.length ? <><RefreshCw size={15} /> New reference</> : <><Sparkles size={15} /> Generate reference</>}</button>}</article>; })}</div><h3>Add an original book character</h3><div className="bb-form-grid"><label>Character name<input value={characterName} onChange={(event) => { setCharacterName(event.target.value); setCharacterId(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></label><label>Story role<input value={characterRole} onChange={(event) => setCharacterRole(event.target.value)} /></label><label className="wide">Appearance<input value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)} /></label><label>Personality<input value={personality} onChange={(event) => setPersonality(event.target.value)} /></label><label>Powers or skills<input value={powers} onChange={(event) => setPowers(event.target.value)} /></label><label className="wide">Identity lock for artwork<textarea rows={3} value={referencePrompt} onChange={(event) => setReferencePrompt(event.target.value)} /></label></div><div className="bb-inline-actions"><button className="bb-primary" onClick={saveCharacterHandler} disabled={loading}><Users size={17} /> Save character bible</button><button className="bb-secondary" onClick={() => setStudioStep("chapter")}>Continue to chapter</button></div></StudioCard>}

            {studioStep === "chapter" && (
              <StudioCard
                eyebrow="STEP 4"
                title="Write a chapter with AI"
                intro="Describe the story beat. OPAIJA creates the chapter, pages, panels, prompts, dialogue, and continuity notes."
              >
                <div className="bb-form-grid">
                  <label className="wide">Chapter title<input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} /></label>
                  <label>Number of pages<input type="number" min={2} max={120} value={chapterPages} onChange={(event) => setChapterPages(Number(event.target.value))} /></label>
                  <label>Panels per page<input type="number" min={1} max={12} value={chapterPanels} onChange={(event) => setChapterPanels(Number(event.target.value))} /></label>
                  <label>Continue chapter (optional)
                    <select value={appendToChapterId} onChange={(event) => setAppendToChapterId(event.target.value)}>
                      <option value="">Start new chapter</option>
                      {selectedProject?.chapters.map((chapter) => (
                        <option key={chapter.chapterId} value={chapter.chapterId}>{chapter.chapterTitle}</option>
                      ))}
                    </select>
                  </label>
                  <label>Start page (optional for continuation)
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={startPage}
                      onChange={(event) => setStartPage(event.target.value)}
                      placeholder="auto"
                    />
                  </label>
                  <label className="wide">What should happen?
                    <textarea rows={6} value={chapterPrompt} onChange={(event) => setChapterPrompt(event.target.value)} />
                  </label>
                </div>
                <div className="bb-choice-row">
                  <label><input type="checkbox" checked={includeDialogue} onChange={(event) => setIncludeDialogue(event.target.checked)} /> Dialogue</label>
                  <label><input type="checkbox" checked={includeSoundEffects} onChange={(event) => setIncludeSoundEffects(event.target.checked)} /> Sound effects</label>
                </div>
                <button className="bb-primary bb-generate" onClick={startJobHandler} disabled={loading}><WandSparkles size={18} /> Generate chapter</button>
              </StudioCard>
            )}

            {(studioStep === "pages" || studioStep === "artwork") && (
              <div className="bb-page-studio">
                <header>
                  <div>
                    <span className="bb-eyebrow">{studioStep === "pages" ? "STEP 5 - STORYBOARD" : "STEP 6 - AI ARTWORK"}</span>
                    <h1>{studioStep === "pages" ? "Page-by-page studio" : "Create panel artwork"}</h1>
                    <p>{studioStep === "pages"
                      ? "Choose a chapter and page. Every panel is shown in reading order."
                      : "Generate one panel at a time, review it, and regenerate only what needs work."}
                    </p>
                  </div>
                  <div className="bb-inline-actions">
                    {studioStep === "pages" && activeChapterId && activePage ? <button className="bb-primary" onClick={() => openLayoutWorkspace(activeChapterId, activePage.pageNumber)}><LayoutDashboard size={15} /> Open Layout & Print</button> : null}
                    <button className="bb-secondary" onClick={autoBuildArtworkHandler} disabled={autoBuilding}>
                      {autoBuilding ? <><LoaderCircle className="spin" size={15} /> Auto build</> : <><Upload size={15} /> Auto build artwork</>}
                    </button>
                    <div className="bb-studio-status"><Save size={15} /> All changes saved</div>
                  </div>
                  <div className="bb-form-grid">
                    <label>Chapter
                      <select value={buildChapterId} onChange={(event) => setBuildChapterId(event.target.value)}>
                        <option value="">All chapters</option>
                        {selectedProject.chapters.map((chapter) => (
                          <option key={chapter.chapterId} value={chapter.chapterId}>{chapter.chapterTitle}</option>
                        ))}
                      </select>
                    </label>
                    <label>From page<input type="number" min={1} max={999} value={buildFromPage} onChange={(event) => setBuildFromPage(event.target.value)} placeholder="1" /></label>
                    <label>To page<input type="number" min={1} max={999} value={buildToPage} onChange={(event) => setBuildToPage(event.target.value)} placeholder="last" /></label>
                    <label><input type="checkbox" checked={buildSkipExisting} onChange={(event) => setBuildSkipExisting(event.target.checked)} /> Skip existing artwork</label>
                  </div>
                </header>
                <div className="bb-chapter-tabs">{selectedProject.chapters.length === 0 ? <p>No chapters yet. Use Write chapter first.</p> : selectedProject.chapters.map((chapter) => <button key={chapter.chapterId} className={activeChapterId === chapter.chapterId ? "active" : ""} onClick={() => loadChapterPayload(selectedProjectId, chapter.chapterId)}>{chapter.chapterTitle}</button>)}</div>
                {activeChapter && <div className="bb-editor-layout"><aside className="bb-page-strip"><div><strong>Pages</strong><span>{activeChapter.pages.length}</span></div>{activeChapter.pages.map((page) => <button key={page.pageNumber} className={activePage?.pageNumber === page.pageNumber ? "active" : ""} onClick={() => setActivePageNumber(page.pageNumber)}><span>PAGE {page.pageNumber}</span><div className="bb-mini-panels">{page.panels.slice(0, 6).map((panel) => <i key={panel.panelNumber} className={artworkUrls[`${activeChapterId}-${page.pageNumber}-${panel.panelNumber}`] ? "ready" : ""} />)}</div><small>{page.panels.length} panels</small></button>)}</aside><section className="bb-canvas"><div className="bb-page-heading"><div><small>PAGE {activePage?.pageNumber}</small><h2>{activePage?.summary}</h2><div className="bb-inline-actions">{activeChapterId && activePage ? <button className="bb-secondary" onClick={() => openPageEditor(activeChapterId, activePage.pageNumber, activePage.summary)}><Pencil size={14} /> Edit page</button> : null}</div></div><span>{activePage?.panels.length ?? 0} panels</span></div><div className="bb-panel-grid">{activePage?.panels.map((panel) => { const key = `${activeChapterId}-${activePage.pageNumber}-${panel.panelNumber}`; const image = artworkUrls[key]; return <article className={image ? "has-art" : ""} key={key}><div className="bb-panel-image">{image ? <img src={image} alt={`Page ${activePage.pageNumber}, panel ${panel.panelNumber}`} /> : <div><ImageIcon size={28} /><span>Artwork not created yet</span></div>}<b>Panel {panel.panelNumber}</b></div><div className="bb-panel-copy"><p>{panel.action || panel.prompt}</p><details><summary>View AI art prompt</summary><small>{panel.prompt}</small></details><div className="bb-inline-actions"><button className="bb-secondary" onClick={() => openPanelEditor(panel, activeChapterId, activePage.pageNumber)}><Pencil size={14} /> Edit panel</button><button className={image ? "bb-secondary" : "bb-primary"} onClick={() => generateArtworkHandler(activeChapterId, activePage.pageNumber, panel.panelNumber)} disabled={Boolean(generatingArtwork)}>{generatingArtwork === key ? <><LoaderCircle className="spin" size={16} /> Creating artwork...</> : image ? <><RefreshCw size={16} /> Regenerate artwork</> : <><Sparkles size={16} /> Generate artwork</>}</button></div></div></article>; })}</div><div className="bb-page-nav"><button className="bb-secondary" disabled={!activeChapter.pages.some((page) => page.pageNumber < (activePage?.pageNumber ?? 1))} onClick={() => setActivePageNumber((value) => Math.max(1, value - 1))}>Previous page</button><span>Page {activePage?.pageNumber ?? 0} of {activeChapter.pages.length}</span><button className="bb-primary" disabled={!activeChapter.pages.some((page) => page.pageNumber > (activePage?.pageNumber ?? 0))} onClick={() => setActivePageNumber((value) => value + 1)}>Next page <ChevronRight size={16} /></button></div></section></div>}
              </div>
            )}

            {studioStep === "cover" && <StudioCard eyebrow="STEP 7" title="Design front and back covers" intro="Set typography and custom text, then generate both covers before packaging.">
              <div className="bb-cover-grid">
                <section>
                  <div className="bb-cover-preview-wrap">
                    <h3>Front cover</h3>
                    <p>Use this for the book front title wrap and marketing art.</p>
                    {coverArtworkUrls.front ? <img className="bb-cover-preview-image" src={coverArtworkUrls.front} alt="Generated front cover" /> : <div className="bb-cover-placeholder">No front cover artwork yet</div>}
                    {selectedProject.cover.front.lastGeneratedAt ? (
                      <small>
                        Last generated {formatDate(selectedProject.cover.front.lastGeneratedAt)} · {selectedProject.cover.front.lastGeneratedModel}
                      </small>
                    ) : null}
                    {selectedProject.cover.front.lastArtworkFileName ? <small>File: {selectedProject.cover.front.lastArtworkFileName}</small> : null}
                  </div>
                  <div className="bb-form-grid">
                    <label className="wide">Title<input value={coverDraft.front.title} onChange={(event) => updateCoverField("front", "title", event.target.value)} /></label>
                    <label>Subtitle<input value={coverDraft.front.subtitle} onChange={(event) => updateCoverField("front", "subtitle", event.target.value)} /></label>
                    <label>Tagline<input value={coverDraft.front.tagline} onChange={(event) => updateCoverField("front", "tagline", event.target.value)} /></label>
                    <label>Author<input value={coverDraft.front.author} onChange={(event) => updateCoverField("front", "author", event.target.value)} /></label>
                    <label className="wide">Series name<input value={coverDraft.front.seriesName} onChange={(event) => updateCoverField("front", "seriesName", event.target.value)} /></label>
                    <label className="wide">Blurb<input value={coverDraft.front.blurb} onChange={(event) => updateCoverField("front", "blurb", event.target.value)} /></label>
                    <label className="wide">Front cover prompt<textarea rows={3} value={coverDraft.front.customPrompt} onChange={(event) => updateCoverField("front", "customPrompt", event.target.value)} /></label>
                  </div>
                  <div className="bb-inline-actions">
                    <button className="bb-secondary" onClick={() => saveCoverHandler("front")} disabled={loading}><Save size={15} /> Save front settings</button>
                    <button className="bb-primary" onClick={() => generateCoverHandler("front")} disabled={generatingCoverSide === "front"}>
                      {generatingCoverSide === "front" ? <><LoaderCircle className="spin" size={15} /> Generating...</> : <><Sparkles size={15} /> Generate front cover</>}
                    </button>
                  </div>
                </section>

                <section>
                  <div className="bb-cover-preview-wrap">
                    <h3>Back cover</h3>
                    <p>Use this space for blurb, notes, and branding strip text.</p>
                    {coverArtworkUrls.back ? <img className="bb-cover-preview-image" src={coverArtworkUrls.back} alt="Generated back cover" /> : <div className="bb-cover-placeholder">No back cover artwork yet</div>}
                    {selectedProject.cover.back.lastGeneratedAt ? (
                      <small>
                        Last generated {formatDate(selectedProject.cover.back.lastGeneratedAt)} · {selectedProject.cover.back.lastGeneratedModel}
                      </small>
                    ) : null}
                    {selectedProject.cover.back.lastArtworkFileName ? <small>File: {selectedProject.cover.back.lastArtworkFileName}</small> : null}
                  </div>
                  <div className="bb-form-grid">
                    <label className="wide">Title<input value={coverDraft.back.title} onChange={(event) => updateCoverField("back", "title", event.target.value)} /></label>
                    <label>Subtitle<input value={coverDraft.back.subtitle} onChange={(event) => updateCoverField("back", "subtitle", event.target.value)} /></label>
                    <label>Tagline<input value={coverDraft.back.tagline} onChange={(event) => updateCoverField("back", "tagline", event.target.value)} /></label>
                    <label>Author<input value={coverDraft.back.author} onChange={(event) => updateCoverField("back", "author", event.target.value)} /></label>
                    <label className="wide">Series name<input value={coverDraft.back.seriesName} onChange={(event) => updateCoverField("back", "seriesName", event.target.value)} /></label>
                    <label className="wide">Blurb<textarea rows={2} value={coverDraft.back.blurb} onChange={(event) => updateCoverField("back", "blurb", event.target.value)} /></label>
                    <label className="wide">Back cover prompt<textarea rows={3} value={coverDraft.back.customPrompt} onChange={(event) => updateCoverField("back", "customPrompt", event.target.value)} /></label>
                  </div>
                  <div className="bb-inline-actions">
                    <button className="bb-secondary" onClick={() => saveCoverHandler("back")} disabled={loading}><Save size={15} /> Save back settings</button>
                    <button className="bb-primary" onClick={() => generateCoverHandler("back")} disabled={generatingCoverSide === "back"}>
                      {generatingCoverSide === "back" ? <><LoaderCircle className="spin" size={15} /> Generating...</> : <><Sparkles size={15} /> Generate back cover</>}
                    </button>
                  </div>
                </section>
              </div>
              <div className="bb-inline-actions">
                <button className="bb-secondary" onClick={() => setStudioStep("review")}><ChevronRight size={15} /> Continue to review</button>
              </div>
            </StudioCard>}

            {studioStep === "layout" && (
              <div className="bb-layout-print-workspace">
                <header className="bb-layout-print-header">
                  <div>
                    <span className="bb-eyebrow">LAYOUT & PRINT</span>
                    <h1>Letter the book. Check the press file.</h1>
                    <p>Arrange canonical artwork and dialogue visually, then prepare a KDP-specific preflight without replacing the source chapter manifests.</p>
                  </div>
                  <div className="bb-layout-save-chip"><Save size={15} /><span><strong>{layoutSaveStatus}</strong><small>Page and panel PATCH autosave</small></span></div>
                </header>

                <section className="bb-print-console" aria-label="KDP print preparation">
                  <div className="bb-print-console-heading">
                    <div><span className="bb-eyebrow">KDP PREFLIGHT</span><h2>Print job controls</h2><p>Creating a job stages print HTML, checks artwork resolution, page count, fonts, paper, bleed, and cover geometry.</p></div>
                    <button className="bb-secondary" type="button" onClick={() => void refreshPrintJobs()} disabled={printLoading}><RefreshCw size={15} /> Refresh jobs</button>
                  </div>
                  {printError ? <div className="bb-print-service-error"><AlertTriangle size={17} /><span><strong>Print service unavailable</strong>{printError}</span></div> : null}
                  <div className="bb-print-control-grid">
                    <label>Trim preset<select value={printTrimPresetId} onChange={(event) => setPrintTrimPresetId(event.target.value)} disabled={!trimPresets.length}>{trimPresets.length ? trimPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>) : <option value={printTrimPresetId}>Waiting for presets…</option>}</select></label>
                    <label>Ink<select value={printInk} onChange={(event) => setPrintInk(event.target.value as BookPrintJob["request"]["ink"])}><option value="premium_color">Premium color</option><option value="standard_color">Standard color</option><option value="black_white">Black & white</option></select></label>
                    <label>Paper<select value={printPaper} onChange={(event) => setPrintPaper(event.target.value as BookPrintJob["request"]["paper"])}><option value="white">White</option><option value="cream" disabled={printInk !== "black_white"}>Cream</option></select></label>
                    <label>Reading direction<select value={printDirection} onChange={(event) => setPrintDirection(event.target.value as BookPrintJob["request"]["readingDirection"])}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
                    <label>Minimum artwork DPI<input type="number" min={72} max={1200} step={25} value={printMinimumDpi} onChange={(event) => setPrintMinimumDpi(Number(event.target.value))} /></label>
                    <div className="bb-print-toggles">
                      <label><input type="checkbox" checked={printBleed} onChange={(event) => setPrintBleed(event.target.checked)} /> 0.125 in bleed</label>
                      <label><input type="checkbox" checked={printIncludeSpine} onChange={(event) => setPrintIncludeSpine(event.target.checked)} /> Spine text when allowed</label>
                      <label><input type="checkbox" checked={printPadPages} onChange={(event) => setPrintPadPages(event.target.checked)} /> Pad minimum page count</label>
                    </div>
                  </div>
                  <div className="bb-print-actions">
                    <button className="bb-primary" type="button" onClick={createPrintJobHandler} disabled={printLoading || !trimPresets.length}>{printLoading ? <LoaderCircle className="spin" size={17} /> : <Printer size={17} />} Run KDP preflight & create job</button>
                    <span>{selectedPrintTrim.label} · {printBleed ? "bleed" : "no bleed"} · {fontFamily} {fontSizePx}pt</span>
                  </div>

                  {latestPrintJob ? (
                    <div className={`bb-preflight-card is-${latestPrintJob.preflight?.passed ? "passed" : latestPrintJob.status}`}>
                      <div className="bb-preflight-title">
                        {latestPrintJob.preflight?.passed ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
                        <div><strong>{latestPrintJob.preflight?.passed ? "Preflight passed" : latestPrintJob.status === "blocked" ? "Preflight blocked" : latestPrintJob.step}</strong><small>Job {latestPrintJob.jobId.slice(0, 8)} · {latestPrintJob.status} · {latestPrintJob.progress}%</small></div>
                        <div className="bb-progress"><span style={{ width: `${latestPrintJob.progress}%` }} /></div>
                      </div>
                      {latestPrintJob.preflight ? <div className="bb-preflight-facts"><span><b>{latestPrintJob.preflight.checks.printablePages}</b> printable pages</span><span><b>{latestPrintJob.preflight.checks.images}</b> images</span><span><b>{latestPrintJob.preflight.checks.lowestEffectiveDpi ?? "—"}</b> lowest DPI</span><span><b>{latestPrintJob.preflight.errors.length}</b> errors</span><span><b>{latestPrintJob.preflight.warnings.length}</b> warnings</span></div> : null}
                      {latestPrintJob.preflight?.errors.map((issue) => <div className="bb-preflight-issue error" key={`${issue.code}-${issue.location ?? "book"}`}><strong>{issue.code.replace(/_/g, " ")}</strong><span>{issue.message}{issue.location ? ` · ${issue.location}` : ""}</span></div>)}
                      {latestPrintJob.preflight?.warnings.map((issue) => <div className="bb-preflight-issue warning" key={`${issue.code}-${issue.location ?? "book"}`}><strong>{issue.code.replace(/_/g, " ")}</strong><span>{issue.message}{issue.location ? ` · ${issue.location}` : ""}</span></div>)}
                      {latestPrintJob.error ? <div className="bb-preflight-issue error"><strong>JOB ERROR</strong><span>{latestPrintJob.error}</span></div> : null}
                      <div className="bb-inline-actions">
                        {latestPrintJob.status === "failed" ? <button className="bb-secondary" type="button" onClick={() => retryPrintJobHandler(latestPrintJob.jobId)} disabled={printLoading}><RefreshCw size={15} /> Retry renderer</button> : null}
                        {latestPrintJob.status === "completed" ? <><button className="bb-secondary" type="button" onClick={() => void downloadPrintArtifact(latestPrintJob.jobId, "interior-pdf").catch((cause) => setPrintError(cause instanceof Error ? cause.message : "Download failed."))}><Download size={15} /> Interior PDF</button><button className="bb-secondary" type="button" onClick={() => void downloadPrintArtifact(latestPrintJob.jobId, "cover-pdf").catch((cause) => setPrintError(cause instanceof Error ? cause.message : "Download failed."))}><Download size={15} /> Cover PDF</button><button className="bb-secondary" type="button" onClick={() => void downloadPrintArtifact(latestPrintJob.jobId, "manifest").catch((cause) => setPrintError(cause instanceof Error ? cause.message : "Download failed."))}><Download size={15} /> Manifest</button></> : null}
                      </div>
                    </div>
                  ) : <div className="bb-print-empty"><Printer size={20} /><span>No KDP print job yet. Layout can continue while the print service is offline.</span></div>}
                  {printJobs.length > 1 ? <div className="bb-print-job-history"><strong>Recent print jobs</strong>{printJobs.slice(1, 5).map((job) => <div key={job.jobId}><span className={`is-${job.status}`}>{job.status}</span><b>{job.step}</b><small>{formatDate(job.updatedAt)} · {job.progress}% · attempt {job.attempt}</small>{job.status === "failed" ? <button type="button" onClick={() => retryPrintJobHandler(job.jobId)} disabled={printLoading}>Retry</button> : null}</div>)}</div> : null}
                </section>

                <section className="bb-visual-editor-shell">
                  <div className="bb-editor-source-note"><ShieldCheck size={17} /><span><strong>Canonical source protected</strong> Page structure, artwork bindings, prompts, and character data stay attached to their original chapter and panel IDs. Layout metadata is additive.</span></div>
                  {layoutLoading && !layoutPages.length ? <div className="bb-layout-loading"><LoaderCircle className="spin" size={24} /> Loading every chapter, page, panel, and artwork reference…</div> : null}
                  {layoutPages.length ? (
                    <BookPageEditor
                      pages={layoutPages}
                      activePageId={layoutActivePageId}
                      pageSize={layoutCanvasSize}
                      fonts={[...new Set([fontFamily, ...fontOptions, "Oswald", "Impact"])]}
                      autosaveDelayMs={1500}
                      allowPageStructureChanges={false}
                      protectSourceLayers
                      onPagesChange={setLayoutPages}
                      onActivePageChange={setLayoutActivePageId}
                      onAutosave={autosaveLayout}
                    />
                  ) : !layoutLoading ? <div className="bb-print-empty"><LayoutDashboard size={20} /><span>Create or load a chapter before opening the page composer.</span></div> : null}
                </section>
              </div>
            )}

            {studioStep === "review" && (
              <StudioCard eyebrow="STEP 9" title="Review your book" intro="See what is complete before export and keep continuity visible.">
                <div className="bb-review-grid">
                  <div><strong>{selectedProject.chapters.length}</strong><span>Chapters</span></div>
                  <div><strong>{selectedProject.chapters.reduce((sum, chapter) => sum + (chapterData[chapter.chapterId]?.pages.length ?? 0), 0)}</strong><span>Loaded pages</span></div>
                  <div><strong>{artworkAssets.length}</strong><span>Artwork files</span></div>
                  <div><strong>{coverAssets.length}</strong><span>Cover files</span></div>
                  <div><strong>{continuity.length}</strong><span>Continuity checks</span></div>
                </div>
                <h3>Latest continuity notes</h3>
                <div className="bb-continuity-list">
                  {continuity.slice(-8).reverse().map((entry) => (
                    <article key={`${entry.chapterId}-${entry.pageNumber}-${entry.panelNumber}`}>
                      <span>Page {entry.pageNumber}, panel {entry.panelNumber}</span>
                      <strong>{entry.location} | {entry.timeOfDay} | {entry.mood}</strong>
                      <p>{entry.notes}</p>
                    </article>
                  ))}
                </div>
                <div className="bb-inline-actions">
                  <button className="bb-primary" onClick={() => openLayoutWorkspace(activeChapterId || selectedProject.chapters[0]?.chapterId, activePage?.pageNumber ?? 1)}><LayoutDashboard size={17} /> Open Layout & Print</button>
                  <button className="bb-secondary" onClick={buildExportManifestHandler} disabled={loading}><Download size={17} /> Build print package</button>
                  <button className="bb-secondary" onClick={downloadExportManifest} disabled={!projectExportManifest}><Upload size={16} /> Download package manifest</button>
                </div>
                {projectExportManifest ? (
                  <div className="bb-book-facts">
                    <div><span>Package name</span><strong>{projectExportManifest.packageName}</strong></div>
                    <div><span>Total files</span><strong>{projectExportManifest.totalAssets}</strong></div>
                    <div><span>Panels</span><strong>{projectExportManifest.totalPanels}</strong></div>
                    <div><span>Artwork</span><strong>{projectExportManifest.totalArtworkFiles}</strong></div>
                  </div>
                ) : (
                  <p>Build a package manifest when you are ready to push to a print workflow.</p>
                )}
              </StudioCard>
            )}
          </section>
        </main>
      )}

      {screen === "assets" && <main className="bb-collection"><header><div><span className="bb-eyebrow">SAVED LIBRARY</span><h1>Artwork Library</h1><p>Your generated covers, panel art, and production files live here. Open a book to make changes.</p></div><button className="bb-secondary" onClick={() => selectedProjectId && setScreen("studio")} disabled={!selectedProjectId}><BookOpen size={17} /> Open current book</button></header><section className="bb-asset-grid">{assets.length === 0 ? <EmptyState icon={<FileImage size={30} />} title="No saved assets yet" copy="Open a book and generate panel or cover artwork to populate your library." /> : assets.map((asset) => <article key={asset.path}><span><FileImage size={22} /></span><div><strong>{asset.fileName}</strong><small>{asset.category.replace(/-/g, " ")} | {prettySize(asset.bytes)}</small><small>Saved {formatDate(asset.updatedAt)}</small></div></article>)}</section></main>}

      {screen === "jobs" && (
        <main className="bb-collection">
          <header>
            <div>
              <span className="bb-eyebrow">AI PRODUCTION QUEUE</span>
              <h1>Generation Jobs</h1>
              <p>Watch chapters being built and retry any generation without losing your book.</p>
            </div>
            <button className="bb-secondary" onClick={refreshHealth}><RefreshCw size={17} /> Refresh status</button>
          </header>
          <section className="bb-job-list">
            {jobs.length === 0 ? (
              <EmptyState
                icon={<Clock3 size={30} />}
                title="No generation jobs yet"
                copy="Open a book and use Write chapter to start your first AI generation job."
              />
            ) : (
              jobs.map((job) => {
                const isBusy = job.status === "queued" || job.status === "running";
                const duration = formatDuration(job.elapsedMs);
                const chapterTitle = job.request.chapterTitle || "Untitled chapter";
                const providerText = [job.error, ...(job.warnings ?? [])].filter(Boolean).join(" ");
                const quotaIssue = job.errorCode === "quota_or_rate_limit" || /(?:\b429\b|quota|billing|insufficient_quota|rate limit)/i.test(providerText);
                const usedStoryFallback = job.status === "completed" && job.warnings?.some((warning) => /fallback chapter script|quota|rate limit/i.test(warning));
                const statusLine =
                  job.status === "failed"
                    ? quotaIssue
                      ? "OpenAI API billing is out of credit. This older job failed before automatic fallback was enabled; regenerate it to create a local fallback chapter."
                      : job.error || "Generation failed."
                    : job.status === "completed"
                      ? usedStoryFallback
                        ? "Chapter and production files saved using the local story fallback because OpenAI billing is unavailable."
                        : "Chapter and production files saved."
                      : `${job.step} — ${job.progress}%`;
                return (
                  <article key={job.jobId}>
                    <span className={`bb-job-icon ${job.status}`}>
                      {job.status === "completed" ? <Check size={18} /> : job.status === "failed" ? <CircleAlert size={18} /> : <LoaderCircle className="spin" size={18} />}
                    </span>
                    <div className="bb-job-main">
                      <div>
                        <strong>{chapterTitle}</strong>
                        <small>
                          {formatDate(job.updatedAt)} • Attempt {job.attempt || 1} • {job.request.targetPages} pages
                        </small>
                        {job.errorCode || quotaIssue ? <small className="bb-job-error-code">Error code: {job.errorCode ?? "quota_or_rate_limit"}</small> : null}
                      </div>
                      <div className="bb-progress"><span style={{ width: `${job.progress}%` }} /></div>
                      <p>{statusLine}</p>
                      {duration ? <small className="bb-job-duration">Duration {duration}</small> : null}
                    </div>
                    <button
                      className="bb-secondary"
                      onClick={() => regenerateHandler(job.jobId)}
                      disabled={loading || isBusy}
                    >
                      <RefreshCw size={15} /> {isBusy ? "Running..." : "Regenerate"}
                    </button>
                  </article>
                );
              })
            )}
          </section>
        </main>
      )}

      {loading && <div className="bb-working"><LoaderCircle className="spin" size={18} /> Saving your work...</div>}
    </div>
  );
}

function StudioCard({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <section className="bb-studio-card"><header><span className="bb-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header><div className="bb-card-body">{children}</div></section>;
}

function EmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="bb-empty"><span>{icon}</span><h2>{title}</h2><p>{copy}</p></div>;
}

