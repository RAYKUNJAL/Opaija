import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import {
  getChapterPayload,
  getPanelArtworkPath,
  getProject,
  type ChapterRecord,
  type PanelRecord,
  type ProjectRecord,
} from "./bookBuilder.js";

const require = createRequire(import.meta.url);
const INCH_TO_POINTS = 72;
const KDP_BLEED_IN = 0.125;
const MAX_KDP_FILE_BYTES = 650 * 1024 * 1024;
const RECOMMENDED_KDP_FILE_BYTES = 40 * 1024 * 1024;
const DEFAULT_LEASE_MS = 15 * 60 * 1000;
const ARTWORK_FILE_PATTERN = /^(?:artwork-[0-9]+\.png|art-[a-z0-9-]+-p\d+-panel-\d+-\d+\.png)$/;

export const BOOK_PRINT_TRIM_PRESETS = {
  "kdp-5x8": { id: "kdp-5x8", label: "5 × 8 in", widthIn: 5, heightIn: 8 },
  "kdp-5_25x8": { id: "kdp-5_25x8", label: "5.25 × 8 in", widthIn: 5.25, heightIn: 8 },
  "kdp-5_5x8_5": { id: "kdp-5_5x8_5", label: "5.5 × 8.5 in", widthIn: 5.5, heightIn: 8.5 },
  "kdp-6x9": { id: "kdp-6x9", label: "6 × 9 in", widthIn: 6, heightIn: 9 },
  "kdp-6_14x9_21": { id: "kdp-6_14x9_21", label: "6.14 × 9.21 in", widthIn: 6.14, heightIn: 9.21 },
  "kdp-7x10": { id: "kdp-7x10", label: "7 × 10 in", widthIn: 7, heightIn: 10 },
  "kdp-8x10": { id: "kdp-8x10", label: "8 × 10 in", widthIn: 8, heightIn: 10 },
  "kdp-8_25x11": { id: "kdp-8_25x11", label: "8.25 × 11 in", widthIn: 8.25, heightIn: 11 },
  "kdp-8_5x11": { id: "kdp-8_5x11", label: "8.5 × 11 in", widthIn: 8.5, heightIn: 11 },
} as const;

export type BookPrintTrimPresetId = keyof typeof BOOK_PRINT_TRIM_PRESETS;
export type BookPrintInk = "black_white" | "standard_color" | "premium_color";
export type BookPrintPaper = "white" | "cream";
export type BookPrintReadingDirection = "ltr" | "rtl";
export type BookPrintJobStatus = "preparing" | "blocked" | "queued" | "running" | "completed" | "failed";
export type BookPrintMatterKind =
  | "half-title"
  | "title"
  | "copyright"
  | "dedication"
  | "blank"
  | "end"
  | "about-book";

export type BookPrintFontInput = {
  family: string;
  fileName: string;
  weight?: number;
  style?: "normal" | "italic";
};

export type CreateBookPrintJobInput = {
  trimPreset?: BookPrintTrimPresetId;
  customTrim?: { label?: string; widthIn: number; heightIn: number };
  bleed?: boolean;
  ink?: BookPrintInk;
  paper?: BookPrintPaper;
  readingDirection?: BookPrintReadingDirection;
  bodyFontPt?: number;
  minimumImageDpi?: number;
  maximumImageDpi?: number;
  includeSpineText?: boolean;
  padToMinimumPages?: boolean;
  copyrightText?: string;
  dedication?: string;
  frontMatter?: BookPrintMatterKind[];
  backMatter?: BookPrintMatterKind[];
  fonts?: BookPrintFontInput[];
};

export type BookPrintTrim = {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  isLargeTrim: boolean;
};

export type BookPrintGeometry = {
  trim: BookPrintTrim;
  bleed: boolean;
  bleedIn: number;
  interiorPage: { widthIn: number; heightIn: number };
  safeMargins: { topIn: number; bottomIn: number; outsideIn: number; gutterIn: number };
  cssPageMargins: { topIn: number; bottomIn: number; outsideIn: number; gutterIn: number };
  cover: {
    spineWidthIn: number;
    wrapWidthIn: number;
    wrapHeightIn: number;
    panelWidthIn: number;
    panelHeightIn: number;
    spineTextAllowed: boolean;
    spineSafeInsetIn: number;
  };
};

export type BookPrintPageMapEntry = {
  sequence: number;
  side: "recto" | "verso";
  section: "front" | "story" | "back" | "padding";
  kind: BookPrintMatterKind | "story";
  label: string;
  chapterId?: string;
  chapterTitle?: string;
  sourcePageNumber?: number;
  panelCount?: number;
};

export type BookPrintPreflightIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  location?: string;
  actual?: number | string;
  expected?: number | string;
};

export type BookPrintPreflight = {
  passed: boolean;
  checkedAt: string;
  errors: BookPrintPreflightIssue[];
  warnings: BookPrintPreflightIssue[];
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

export type BookPrintPdfContract = {
  contractVersion: 1;
  renderer: "pagedjs";
  media: "print";
  inputs: { interiorHtml: string; coverHtml: string };
  outputs: { interiorPdf: string; coverPdf: string };
  expected: {
    interiorPageCount: number;
    interiorPageWidthIn: number;
    interiorPageHeightIn: number;
    coverPageCount: 1;
    coverPageWidthIn: number;
    coverPageHeightIn: number;
    fontsEmbedded: true;
    maximumFileBytes: number;
  };
};

export type BookPrintExportFile = {
  role: "interior-html" | "cover-html" | "interior-pdf" | "cover-pdf" | "image" | "font" | "manifest";
  path: string;
  bytes: number;
  sha256: string;
};

export type BookPrintExportManifest = {
  schemaVersion: 1;
  jobId: string;
  projectId: string;
  projectTitle: string;
  sourceUpdatedAt: string;
  contentHash: string;
  generatedAt: string;
  geometry: BookPrintGeometry;
  print: { ink: BookPrintInk; paper: BookPrintPaper; readingDirection: BookPrintReadingDirection };
  pageMap: BookPrintPageMapEntry[];
  preflight: BookPrintPreflight;
  files: BookPrintExportFile[];
};

export type BookPrintJob = {
  jobId: string;
  projectId: string;
  status: BookPrintJobStatus;
  step: string;
  progress: number;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  sourceUpdatedAt?: string;
  request: Required<
    Pick<
      CreateBookPrintJobInput,
      | "bleed"
      | "ink"
      | "paper"
      | "readingDirection"
      | "bodyFontPt"
      | "minimumImageDpi"
      | "maximumImageDpi"
      | "includeSpineText"
      | "padToMinimumPages"
    >
  > &
    CreateBookPrintJobInput;
  geometry?: BookPrintGeometry;
  pageMap?: BookPrintPageMapEntry[];
  preflight?: BookPrintPreflight;
  contract?: BookPrintPdfContract;
  manifest?: BookPrintExportManifest;
  workerId?: string;
  leaseExpiresAt?: string;
  error?: string;
};

type PreparedFont = BookPrintFontInput & {
  relativePath: string;
  absolutePath: string;
  bytes: number;
  sha256: string;
};

type PreparedPanel = {
  panel: PanelRecord;
  relativePath?: string;
  absolutePath?: string;
  widthPx?: number;
  heightPx?: number;
  effectiveDpi?: number;
};

type PreparedStoryPage = {
  chapter: ChapterRecord;
  sourcePageNumber: number;
  summary: string;
  panels: PreparedPanel[];
};

function getStorageRoot() {
  const bookBuilderRoot = process.env.BOOK_BUILDER_DATA_DIR ?? "data/book-builder";
  return path.resolve(process.cwd(), process.env.BOOK_PRINT_DATA_DIR ?? path.join(bookBuilderRoot, "print-engine"));
}

function getJobDirectory(jobId: string) {
  assertIdentifier(jobId, "jobId");
  return path.join(getStorageRoot(), "jobs", jobId);
}

function getJobFile(jobId: string) {
  return path.join(getJobDirectory(jobId), "job.json");
}

function assertIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(value)) throw new Error(`Invalid ${label}.`);
}

function roundInches(value: number) {
  return Number(value.toFixed(6));
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cssString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "asset";
}

function resolveInside(root: string, candidate: string) {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, candidate);
  if (resolved !== absoluteRoot && !resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error("Path escapes the configured print asset directory.");
  }
  return resolved;
}

async function ensureDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true });
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await ensureDirectory(path.dirname(filePath));
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

async function atomicWriteText(filePath: string, value: string) {
  await ensureDirectory(path.dirname(filePath));
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, value, "utf8");
  await fs.rename(temporary, filePath);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function persistJob(job: BookPrintJob) {
  job.updatedAt = new Date().toISOString();
  await atomicWriteJson(getJobFile(job.jobId), job);
  return job;
}

async function withJobLock<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = path.join(getJobDirectory(jobId), ".job.lock");
  await ensureDirectory(path.dirname(lockPath));
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`, "utf8");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 5 * 60 * 1000) await fs.rm(lockPath, { force: true });
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }
  if (!handle) throw new Error("Print job is busy; retry shortly.");
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

function normalizeRequest(project: ProjectRecord, input: CreateBookPrintJobInput): BookPrintJob["request"] {
  const ink = input.ink ?? "premium_color";
  const bodyFontPt = input.bodyFontPt ?? project.setup.fontSizePx ?? 10;
  if (!Number.isFinite(bodyFontPt) || bodyFontPt < 1 || bodyFontPt > 72) throw new Error("bodyFontPt must be between 1 and 72 points.");
  const minimumImageDpi = clampNumber(input.minimumImageDpi ?? 300, 72, 1200);
  const maximumImageDpi = Math.max(minimumImageDpi, clampNumber(input.maximumImageDpi ?? 600, 300, 2400));
  return {
    ...input,
    trimPreset: input.trimPreset ?? inferTrimPreset(project.setup.targetTrim),
    bleed: input.bleed ?? true,
    ink,
    paper: input.paper ?? "white",
    readingDirection: input.readingDirection ?? "ltr",
    bodyFontPt,
    minimumImageDpi,
    maximumImageDpi,
    includeSpineText: input.includeSpineText ?? true,
    padToMinimumPages: input.padToMinimumPages ?? true,
    frontMatter: normalizeMatter(input.frontMatter, ["half-title", "blank", "title", "copyright"]),
    backMatter: normalizeMatter(input.backMatter, ["end", "about-book"]),
    copyrightText: input.copyrightText ?? `Copyright © ${new Date(project.createdAt).getUTCFullYear()} ${project.cover.front.author || "OPAIJA"}. All rights reserved.`,
  };
}

function normalizeMatter(value: BookPrintMatterKind[] | undefined, fallback: BookPrintMatterKind[]) {
  const allowed = new Set<BookPrintMatterKind>(["half-title", "title", "copyright", "dedication", "blank", "end", "about-book"]);
  const result = value ?? fallback;
  if (result.length > 32 || result.some((entry) => !allowed.has(entry))) throw new Error("Front/back matter contains an unsupported page kind.");
  return [...result];
}

function clampNumber(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function inferTrimPreset(value: string): BookPrintTrimPresetId {
  const numbers = value.match(/[0-9]+(?:\.[0-9]+)?/g)?.map(Number) ?? [];
  if (numbers.length >= 2) {
    const match = Object.values(BOOK_PRINT_TRIM_PRESETS).find(
      (preset) => Math.abs(preset.widthIn - numbers[0]) < 0.02 && Math.abs(preset.heightIn - numbers[1]) < 0.02,
    );
    if (match) return match.id;
  }
  return "kdp-6x9";
}

export function resolveBookPrintTrim(input: CreateBookPrintJobInput, projectTargetTrim = "6 x 9"): BookPrintTrim {
  if (input.customTrim) {
    const widthIn = roundInches(input.customTrim.widthIn);
    const heightIn = roundInches(input.customTrim.heightIn);
    if (widthIn < 4 || widthIn > 8.5 || heightIn < 6 || heightIn > 11.69) {
      throw new Error("KDP custom paperback trim must be 4–8.5 inches wide and 6–11.69 inches high.");
    }
    return {
      id: "custom",
      label: input.customTrim.label?.trim() || `${widthIn} × ${heightIn} in`,
      widthIn,
      heightIn,
      isLargeTrim: widthIn > 6.12 || heightIn > 9,
    };
  }
  const presetId = input.trimPreset ?? inferTrimPreset(projectTargetTrim);
  const preset = BOOK_PRINT_TRIM_PRESETS[presetId];
  if (!preset) throw new Error("Unknown KDP trim preset.");
  return { ...preset, isLargeTrim: preset.widthIn > 6.12 || preset.heightIn > 9 };
}

export function getKdpGutterIn(pageCount: number) {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

function pageCountRange(ink: BookPrintInk, paper: BookPrintPaper) {
  if (ink === "standard_color") return { minimum: 72, maximum: 600 };
  if (ink === "black_white" && paper === "cream") return { minimum: 24, maximum: 776 };
  return { minimum: 24, maximum: 828 };
}

function spineMultiplier(ink: BookPrintInk, paper: BookPrintPaper) {
  if (ink === "premium_color") return 0.002347;
  if (ink === "black_white" && paper === "cream") return 0.0025;
  return 0.002252;
}

function buildGeometry(trim: BookPrintTrim, request: BookPrintJob["request"], pageCount: number): BookPrintGeometry {
  const bleedIn = request.bleed ? KDP_BLEED_IN : 0;
  const outsideSafeIn = request.bleed ? 0.375 : 0.25;
  const gutterIn = getKdpGutterIn(pageCount);
  const spineWidthIn = roundInches(pageCount * spineMultiplier(request.ink, request.paper));
  return {
    trim,
    bleed: request.bleed,
    bleedIn,
    interiorPage: {
      widthIn: roundInches(trim.widthIn + bleedIn),
      heightIn: roundInches(trim.heightIn + bleedIn * 2),
    },
    safeMargins: { topIn: outsideSafeIn, bottomIn: outsideSafeIn, outsideIn: outsideSafeIn, gutterIn },
    cssPageMargins: {
      topIn: roundInches(outsideSafeIn + bleedIn),
      bottomIn: roundInches(outsideSafeIn + bleedIn),
      outsideIn: roundInches(outsideSafeIn + bleedIn),
      gutterIn,
    },
    cover: {
      spineWidthIn,
      wrapWidthIn: roundInches(trim.widthIn * 2 + spineWidthIn + KDP_BLEED_IN * 2),
      wrapHeightIn: roundInches(trim.heightIn + KDP_BLEED_IN * 2),
      panelWidthIn: trim.widthIn,
      panelHeightIn: trim.heightIn,
      spineTextAllowed: pageCount >= 80,
      spineSafeInsetIn: 0.0625,
    },
  };
}

function getPageSide(sequence: number, readingDirection: BookPrintReadingDirection): "recto" | "verso" {
  const odd = sequence % 2 === 1;
  return readingDirection === "ltr" ? (odd ? "recto" : "verso") : odd ? "verso" : "recto";
}

function buildPageMap(
  chapters: ChapterRecord[],
  request: BookPrintJob["request"],
  issues: BookPrintPreflightIssue[],
): BookPrintPageMapEntry[] {
  const entries: Omit<BookPrintPageMapEntry, "sequence" | "side">[] = [];
  for (const kind of request.frontMatter ?? []) {
    entries.push({ section: "front", kind, label: matterLabel(kind) });
  }
  for (const chapter of chapters) {
    for (const page of chapter.pages) {
      entries.push({
        section: "story",
        kind: "story",
        label: `${chapter.chapterTitle} — page ${page.pageNumber}`,
        chapterId: chapter.chapterId,
        chapterTitle: chapter.chapterTitle,
        sourcePageNumber: page.pageNumber,
        panelCount: page.panels.length,
      });
    }
  }
  for (const kind of request.backMatter ?? []) {
    entries.push({ section: "back", kind, label: matterLabel(kind) });
  }

  const range = pageCountRange(request.ink, request.paper);
  if (entries.length < range.minimum && request.padToMinimumPages) {
    const required = range.minimum - entries.length;
    for (let index = 0; index < required; index += 1) {
      entries.push({ section: "padding", kind: "blank", label: "KDP minimum page-count padding" });
    }
    issues.push({
      code: "PAGE_COUNT_PADDED",
      severity: "warning",
      message: `Added ${required} blank page${required === 1 ? "" : "s"} to reach the ${range.minimum}-page minimum for ${request.ink.replace(/_/g, " ")}.`,
      actual: entries.length - required,
      expected: range.minimum,
    });
  }
  if (entries.length % 2 !== 0) {
    entries.push({ section: "padding", kind: "blank", label: "Even page-count padding" });
    issues.push({
      code: "PAGE_COUNT_EVEN_PADDING",
      severity: "warning",
      message: "Added one blank final page so the paperback page count is even.",
    });
  }
  return entries.map((entry, index) => ({
    ...entry,
    sequence: index + 1,
    side: getPageSide(index + 1, request.readingDirection),
  }));
}

function matterLabel(kind: BookPrintMatterKind) {
  return kind.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function gridDimensions(panelCount: number) {
  if (panelCount <= 1) return { columns: 1, rows: 1 };
  if (panelCount === 2) return { columns: 1, rows: 2 };
  if (panelCount <= 4) return { columns: 2, rows: 2 };
  if (panelCount <= 6) return { columns: 2, rows: 3 };
  if (panelCount <= 9) return { columns: 3, rows: 3 };
  return { columns: 3, rows: 4 };
}

function expectedPanelBoxIn(geometry: BookPrintGeometry, panelCount: number) {
  const { columns, rows } = gridDimensions(panelCount);
  const gapIn = 0.08;
  const widthIn = geometry.trim.widthIn - geometry.safeMargins.gutterIn - geometry.safeMargins.outsideIn;
  const heightIn = geometry.trim.heightIn - geometry.safeMargins.topIn - geometry.safeMargins.bottomIn;
  return {
    columns,
    rows,
    widthIn: Math.max(0.5, (widthIn - gapIn * (columns - 1)) / columns),
    heightIn: Math.max(0.5, (heightIn - gapIn * (rows - 1)) / rows),
  };
}

async function prepareFonts(
  request: BookPrintJob["request"],
  jobDirectory: string,
  issues: BookPrintPreflightIssue[],
): Promise<PreparedFont[]> {
  const fontDirectory = path.join(jobDirectory, "assets", "fonts");
  await ensureDirectory(fontDirectory);
  const configured = request.fonts?.length ? request.fonts : defaultFontInputs();
  const prepared: PreparedFont[] = [];
  const allowedFontRoot = path.resolve(process.cwd(), process.env.BOOK_PRINT_FONT_DIR ?? "assets/fonts");

  for (const font of configured) {
    try {
      const sourcePath = font.fileName.startsWith("package:")
        ? require.resolve(font.fileName.slice("package:".length))
        : resolveInside(allowedFontRoot, font.fileName);
      const extension = path.extname(sourcePath).toLowerCase();
      if (![".ttf", ".otf", ".woff", ".woff2"].includes(extension)) throw new Error("Unsupported font file type.");
      const buffer = await fs.readFile(sourcePath);
      const digest = sha256(buffer);
      const destinationName = `${safeFileName(font.family)}-${font.weight ?? 400}-${digest.slice(0, 12)}${extension}`;
      const destination = path.join(fontDirectory, destinationName);
      await fs.writeFile(destination, buffer);
      prepared.push({
        ...font,
        weight: font.weight ?? 400,
        style: font.style ?? "normal",
        relativePath: `assets/fonts/${destinationName}`,
        absolutePath: destination,
        bytes: buffer.length,
        sha256: digest,
      });
    } catch (error) {
      issues.push({
        code: "FONT_ASSET_MISSING",
        severity: "error",
        message: `Unable to stage font ${font.family}: ${error instanceof Error ? error.message : "Unknown font error."}`,
        location: font.fileName,
      });
    }
  }
  if (!prepared.length) {
    issues.push({
      code: "NO_EMBEDDABLE_FONT",
      severity: "error",
      message: "At least one local TTF, OTF, WOFF, or WOFF2 font is required for deterministic PDF embedding.",
    });
  }
  return prepared;
}

function defaultFontInputs(): BookPrintFontInput[] {
  return [
    {
      family: "Noto Sans",
      fileName: "package:@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
      weight: 400,
    },
    {
      family: "Noto Sans",
      fileName: "package:@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2",
      weight: 700,
    },
  ];
}

async function loadChapters(project: ProjectRecord, issues: BookPrintPreflightIssue[]) {
  const chapters: ChapterRecord[] = [];
  for (const summary of project.chapters) {
    try {
      const chapter = await getChapterPayload(project.projectId, summary.chapterId);
      chapters.push(chapter);
      if (chapter.status !== "completed") {
        issues.push({
          code: "CHAPTER_PARTIAL",
          severity: "error",
          message: `Chapter ${chapter.chapterTitle} is not complete.`,
          location: chapter.chapterId,
        });
      }
    } catch (error) {
      issues.push({
        code: "CHAPTER_UNREADABLE",
        severity: "error",
        message: error instanceof Error ? error.message : "Unable to load chapter.",
        location: summary.chapterId,
      });
    }
  }
  if (!chapters.length) {
    issues.push({ code: "NO_STORY_CHAPTERS", severity: "error", message: "The project has no printable chapters." });
  }
  return chapters;
}

async function prepareStoryPages(
  projectId: string,
  chapters: ChapterRecord[],
  geometry: BookPrintGeometry,
  request: BookPrintJob["request"],
  jobDirectory: string,
  issues: BookPrintPreflightIssue[],
): Promise<PreparedStoryPage[]> {
  const imageDirectory = path.join(jobDirectory, "assets", "images");
  await ensureDirectory(imageDirectory);
  const preparedPages: PreparedStoryPage[] = [];

  for (const chapter of chapters) {
    for (const page of chapter.pages) {
      const panelBox = expectedPanelBoxIn(geometry, page.panels.length);
      const panels: PreparedPanel[] = [];
      if (!page.panels.length) {
        issues.push({
          code: "EMPTY_STORY_PAGE",
          severity: "error",
          message: "Story page has no panels.",
          location: `${chapter.chapterId}/page-${page.pageNumber}`,
        });
      }
      for (const panel of page.panels) {
        const location = `${chapter.chapterId}/page-${page.pageNumber}/panel-${panel.panelNumber}`;
        const artworkName = [...(panel.assetFiles ?? [])]
          .map((entry) => path.basename(entry))
          .filter((entry) => ARTWORK_FILE_PATTERN.test(entry))
          .at(-1);
        if (!artworkName) {
          issues.push({
            code: "PANEL_ARTWORK_MISSING",
            severity: "error",
            message: "Panel has no approved printable artwork.",
            location,
          });
          panels.push({ panel });
          continue;
        }
        try {
          const sourcePath = await getPanelArtworkPath(projectId, chapter.chapterId, page.pageNumber, panel.panelNumber, artworkName);
          const buffer = await fs.readFile(sourcePath);
          const metadata = await sharp(buffer).metadata();
          if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable.");
          const digest = sha256(buffer);
          const destinationName = `${safeFileName(chapter.chapterId)}-p${String(page.pageNumber).padStart(3, "0")}-panel-${String(panel.panelNumber).padStart(2, "0")}-${digest.slice(0, 12)}.png`;
          const destination = path.join(imageDirectory, destinationName);
          await fs.writeFile(destination, buffer);
          const effectiveDpi = Math.min(metadata.width / panelBox.widthIn, metadata.height / panelBox.heightIn);
          if (effectiveDpi < request.minimumImageDpi) {
            issues.push({
              code: "IMAGE_DPI_TOO_LOW",
              severity: "error",
              message: `Effective image resolution is ${effectiveDpi.toFixed(1)} DPI; KDP print requires at least ${request.minimumImageDpi} DPI.`,
              location,
              actual: Number(effectiveDpi.toFixed(1)),
              expected: request.minimumImageDpi,
            });
          } else if (effectiveDpi > request.maximumImageDpi) {
            issues.push({
              code: "IMAGE_DPI_HIGH",
              severity: "warning",
              message: `Effective image resolution is ${effectiveDpi.toFixed(1)} DPI; consider downsampling to reduce PDF size.`,
              location,
              actual: Number(effectiveDpi.toFixed(1)),
              expected: `≤ ${request.maximumImageDpi}`,
            });
          }
          panels.push({
            panel,
            relativePath: `assets/images/${destinationName}`,
            absolutePath: destination,
            widthPx: metadata.width,
            heightPx: metadata.height,
            effectiveDpi,
          });
        } catch (error) {
          issues.push({
            code: "PANEL_ARTWORK_UNREADABLE",
            severity: "error",
            message: error instanceof Error ? error.message : "Unable to read panel artwork.",
            location,
          });
          panels.push({ panel });
        }
      }
      preparedPages.push({ chapter, sourcePageNumber: page.pageNumber, summary: page.summary, panels });
    }
  }
  return preparedPages;
}

function renderMatterPage(entry: BookPrintPageMapEntry, project: ProjectRecord, request: BookPrintJob["request"]) {
  const sideClass = entry.side;
  const base = `class="print-page matter-page ${sideClass}" data-page-number="${entry.sequence}" data-section="${entry.section}"`;
  switch (entry.kind) {
    case "half-title":
      return `<section ${base}><div class="matter-center"><h1>${escapeHtml(project.setup.title)}</h1></div></section>`;
    case "title":
      return `<section ${base}><div class="matter-center"><p class="series">${escapeHtml(project.cover.front.seriesName)}</p><h1>${escapeHtml(project.cover.front.title || project.setup.title)}</h1><p class="subtitle">${escapeHtml(project.cover.front.subtitle)}</p><p class="author">${escapeHtml(project.cover.front.author)}</p></div></section>`;
    case "copyright":
      return `<section ${base}><div class="copyright"><p>${escapeHtml(request.copyrightText)}</p><p>Edition prepared for print from OPAIJA Book Builder.</p></div></section>`;
    case "dedication":
      return `<section ${base}><div class="matter-center"><p class="dedication">${escapeHtml(request.dedication)}</p></div></section>`;
    case "end":
      return `<section ${base}><div class="matter-center"><h2>End</h2></div></section>`;
    case "about-book":
      return `<section ${base}><div class="about"><h2>About this book</h2><p>${escapeHtml(project.setup.description)}</p></div></section>`;
    case "blank":
    default:
      return `<section ${base} aria-label="Intentional blank page"></section>`;
  }
}

function renderStoryPage(entry: BookPrintPageMapEntry, page: PreparedStoryPage) {
  const grid = gridDimensions(page.panels.length);
  const panels = page.panels
    .map((prepared) => {
      const label = `Panel ${prepared.panel.panelNumber}: ${prepared.panel.action || prepared.panel.prompt}`;
      return `<figure class="panel" data-panel-id="${escapeHtml(prepared.panel.panelId)}">${
        prepared.relativePath
          ? `<img src="${escapeHtml(prepared.relativePath)}" alt="${escapeHtml(label)}">`
          : `<div class="missing-art">Missing approved artwork</div>`
      }</figure>`;
    })
    .join("");
  return `<section class="print-page story-page ${entry.side}" data-page-number="${entry.sequence}" data-section="story" data-chapter-id="${escapeHtml(page.chapter.chapterId)}" data-source-page="${page.sourcePageNumber}"><header class="running-header"><span>${escapeHtml(page.chapter.chapterTitle)}</span></header><div class="panel-grid" style="--columns:${grid.columns};--rows:${grid.rows}">${panels}</div><footer class="folio">${entry.sequence}</footer></section>`;
}

function renderInteriorHtml(
  project: ProjectRecord,
  request: BookPrintJob["request"],
  geometry: BookPrintGeometry,
  pageMap: BookPrintPageMapEntry[],
  storyPages: PreparedStoryPage[],
  fonts: PreparedFont[],
) {
  const storyLookup = new Map(storyPages.map((page) => [`${page.chapter.chapterId}:${page.sourcePageNumber}`, page]));
  const pages = pageMap
    .map((entry) => {
      if (entry.kind !== "story" || !entry.chapterId || entry.sourcePageNumber === undefined) {
        return renderMatterPage(entry, project, request);
      }
      const story = storyLookup.get(`${entry.chapterId}:${entry.sourcePageNumber}`);
      return story ? renderStoryPage(entry, story) : renderMatterPage({ ...entry, kind: "blank" }, project, request);
    })
    .join("\n");
  const fontFaces = fonts
    .map(
      (font) => `@font-face{font-family:"${cssString(font.family)}";src:url("${font.relativePath}") format("${font.relativePath.endsWith("woff2") ? "woff2" : font.relativePath.endsWith("woff") ? "woff" : "truetype"}");font-weight:${font.weight};font-style:${font.style};font-display:block;}`,
    )
    .join("\n");
  const bodyFamily = fonts[0]?.family ?? "Noto Sans";
  const margin = geometry.cssPageMargins;
  return `<!doctype html>
<html lang="en" dir="${request.readingDirection}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.setup.title)} — KDP interior</title>
<style>
${fontFaces}
@page{size:${geometry.interiorPage.widthIn}in ${geometry.interiorPage.heightIn}in;margin:0;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:#fff;color:#111;font-family:"${cssString(bodyFamily)}",sans-serif;font-size:${request.bodyFontPt}pt;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.print-page{position:relative;width:${geometry.interiorPage.widthIn}in;height:${geometry.interiorPage.heightIn}in;break-after:page;page-break-after:always;overflow:hidden;background:#fff;padding-top:${margin.topIn}in;padding-bottom:${margin.bottomIn}in;}
.print-page.recto{padding-left:${margin.gutterIn}in;padding-right:${margin.outsideIn}in;}
.print-page.verso{padding-left:${margin.outsideIn}in;padding-right:${margin.gutterIn}in;}
.matter-page{display:flex;align-items:center;justify-content:center;}
.matter-center{max-width:85%;text-align:center;}
.matter-center h1{font-size:26pt;line-height:1.05;margin:0 0 .25in;font-weight:700;}
.subtitle,.series,.author{margin:.12in 0;}
.series{font-size:9pt;letter-spacing:.08em;text-transform:uppercase;}
.author{margin-top:.45in;font-weight:700;}
.copyright{align-self:flex-end;max-width:75%;font-size:7pt;line-height:1.35;}
.about{max-width:82%;line-height:1.45;}
.story-page{display:block;}
.running-header{height:.2in;font-size:7pt;text-transform:uppercase;letter-spacing:.05em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.panel-grid{height:calc(100% - .36in);display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));grid-template-rows:repeat(var(--rows),minmax(0,1fr));gap:.08in;}
.panel{min-width:0;min-height:0;margin:0;overflow:hidden;background:#111;border:.75pt solid #111;}
.panel img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;}
.missing-art{display:flex;width:100%;height:100%;align-items:center;justify-content:center;text-align:center;padding:.15in;background:#eee;color:#900;font-size:8pt;}
.folio{position:absolute;bottom:${Math.max(0.08, geometry.bleedIn)}in;left:0;right:0;text-align:center;font-size:7pt;}
</style>
</head>
<body>
<main id="book-interior" data-project-id="${escapeHtml(project.projectId)}" data-page-count="${pageMap.length}">
${pages}
</main>
</body>
</html>`;
}

function renderCoverHtml(
  project: ProjectRecord,
  request: BookPrintJob["request"],
  geometry: BookPrintGeometry,
  fonts: PreparedFont[],
) {
  const cover = geometry.cover;
  const backLeft = request.readingDirection === "ltr" ? KDP_BLEED_IN : KDP_BLEED_IN + geometry.trim.widthIn + cover.spineWidthIn;
  const frontLeft = request.readingDirection === "ltr" ? KDP_BLEED_IN + geometry.trim.widthIn + cover.spineWidthIn : KDP_BLEED_IN;
  const spineLeft = KDP_BLEED_IN + geometry.trim.widthIn;
  const bodyFamily = fonts[0]?.family ?? "Noto Sans";
  const fontFaces = fonts
    .map(
      (font) => `@font-face{font-family:"${cssString(font.family)}";src:url("${font.relativePath}");font-weight:${font.weight};font-style:${font.style};font-display:block;}`,
    )
    .join("\n");
  const palette = project.styleBible?.palette?.length
    ? project.styleBible.palette.filter((color) => /^#[0-9a-f]{3,8}$/i.test(color)).slice(0, 3)
    : [];
  const colors = palette.length ? palette : ["#080808", "#b82020", "#f2a51a"];
  const spineText = request.includeSpineText && cover.spineTextAllowed
    ? `<div class="spine-text">${escapeHtml(project.cover.front.title || project.setup.title)}${project.cover.front.author ? ` · ${escapeHtml(project.cover.front.author)}` : ""}</div>`
    : "";
  return `<!doctype html>
<html lang="en" dir="${request.readingDirection}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(project.setup.title)} — KDP cover wrap</title>
<style>
${fontFaces}
@page{size:${cover.wrapWidthIn}in ${cover.wrapHeightIn}in;margin:0;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;width:${cover.wrapWidthIn}in;height:${cover.wrapHeightIn}in;overflow:hidden;font-family:"${cssString(bodyFamily)}",sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.wrap{position:relative;width:100%;height:100%;background:linear-gradient(135deg,${colors.join(",")});color:#fff;overflow:hidden;}
.panel{position:absolute;top:${KDP_BLEED_IN}in;width:${geometry.trim.widthIn}in;height:${geometry.trim.heightIn}in;padding:.3in;overflow:hidden;}
.back{left:${backLeft}in;display:flex;align-items:center;}
.front{left:${frontLeft}in;display:flex;flex-direction:column;justify-content:flex-end;text-align:left;}
.spine{position:absolute;left:${spineLeft}in;top:${KDP_BLEED_IN}in;width:${cover.spineWidthIn}in;height:${geometry.trim.heightIn}in;overflow:hidden;}
.spine-text{position:absolute;inset:${cover.spineSafeInsetIn}in;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;transform:rotate(180deg);font-size:${Math.max(6, Math.min(12, cover.spineWidthIn * 42))}pt;font-weight:700;white-space:nowrap;}
.front h1{margin:0;font-size:32pt;line-height:.95;text-transform:uppercase;overflow-wrap:anywhere;}
.front .subtitle{font-size:13pt;line-height:1.15;margin:.18in 0;}
.front .author{font-size:11pt;font-weight:700;margin-top:.3in;}
.back-copy{max-width:85%;font-size:9pt;line-height:1.4;}
.barcode-reserve{position:absolute;right:.25in;bottom:.25in;width:2in;height:1.2in;background:#fff;}
</style>
</head>
<body>
<main class="wrap" data-project-id="${escapeHtml(project.projectId)}" data-spine-width-in="${cover.spineWidthIn}">
  <section class="panel back"><div class="back-copy"><h2>${escapeHtml(project.cover.back.title || project.setup.title)}</h2><p>${escapeHtml(project.cover.back.blurb || project.setup.description)}</p></div><div class="barcode-reserve" aria-label="Reserved KDP barcode area"></div></section>
  <section class="spine">${spineText}</section>
  <section class="panel front"><p>${escapeHtml(project.cover.front.seriesName)}</p><h1>${escapeHtml(project.cover.front.title || project.setup.title)}</h1><p class="subtitle">${escapeHtml(project.cover.front.subtitle || project.cover.front.tagline)}</p><p class="author">${escapeHtml(project.cover.front.author)}</p></section>
</main>
</body>
</html>`;
}

function buildPreflight(
  chapters: ChapterRecord[],
  pageMap: BookPrintPageMapEntry[],
  storyPages: PreparedStoryPage[],
  fonts: PreparedFont[],
  request: BookPrintJob["request"],
  geometry: BookPrintGeometry,
  issues: BookPrintPreflightIssue[],
): BookPrintPreflight {
  const range = pageCountRange(request.ink, request.paper);
  if (request.ink !== "black_white" && request.paper === "cream") {
    issues.push({
      code: "COLOR_REQUIRES_WHITE_PAPER",
      severity: "error",
      message: "KDP standard and premium color interiors require white paper.",
    });
  }
  if (pageMap.length < range.minimum || pageMap.length > range.maximum) {
    issues.push({
      code: "PAGE_COUNT_OUT_OF_RANGE",
      severity: "error",
      message: `Page count ${pageMap.length} is outside the supported ${range.minimum}–${range.maximum} range.`,
      actual: pageMap.length,
      expected: `${range.minimum}-${range.maximum}`,
    });
  }
  if (pageMap.length % 2 !== 0) {
    issues.push({ code: "PAGE_COUNT_ODD", severity: "error", message: "KDP paperback page count must resolve to an even number." });
  }
  if (request.bodyFontPt < 7) {
    issues.push({
      code: "FONT_SIZE_TOO_SMALL",
      severity: "error",
      message: "Interior font size must be at least 7 points.",
      actual: request.bodyFontPt,
      expected: 7,
    });
  }
  if (request.includeSpineText && !geometry.cover.spineTextAllowed) {
    issues.push({
      code: "SPINE_TEXT_NOT_ALLOWED",
      severity: "warning",
      message: "Spine text was omitted because KDP requires at least 80 pages for a safe text-bearing spine.",
      actual: pageMap.length,
      expected: ">= 80",
    });
  }
  const panels = storyPages.flatMap((page) => page.panels);
  const effectiveDpis = panels.flatMap((panel) => (panel.effectiveDpi === undefined ? [] : [panel.effectiveDpi]));
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    passed: errors.length === 0,
    checkedAt: new Date().toISOString(),
    errors,
    warnings,
    checks: {
      chapters: chapters.length,
      storyPages: storyPages.length,
      printablePages: pageMap.length,
      panels: panels.length,
      images: panels.filter((panel) => panel.absolutePath).length,
      fonts: fonts.length,
      minimumImageDpi: request.minimumImageDpi,
      lowestEffectiveDpi: effectiveDpis.length ? Number(Math.min(...effectiveDpis).toFixed(1)) : undefined,
    },
  };
}

async function fileManifestEntry(jobDirectory: string, relativePath: string, role: BookPrintExportFile["role"]): Promise<BookPrintExportFile> {
  const absolutePath = resolveInside(jobDirectory, relativePath);
  const buffer = await fs.readFile(absolutePath);
  return { role, path: relativePath.split(path.sep).join("/"), bytes: buffer.length, sha256: sha256(buffer) };
}

async function writeManifest(job: BookPrintJob, jobDirectory: string, project: ProjectRecord, contentHash: string) {
  if (!job.geometry || !job.pageMap || !job.preflight) throw new Error("Print job is not prepared.");
  const files: BookPrintExportFile[] = [
    await fileManifestEntry(jobDirectory, "interior.html", "interior-html"),
    await fileManifestEntry(jobDirectory, "cover.html", "cover-html"),
  ];
  for (const relativePath of await listRelativeFiles(path.join(jobDirectory, "assets"), jobDirectory)) {
    files.push(await fileManifestEntry(jobDirectory, relativePath, relativePath.includes("/fonts/") ? "font" : "image"));
  }
  for (const [relativePath, role] of [
    ["interior.pdf", "interior-pdf"],
    ["cover.pdf", "cover-pdf"],
  ] as const) {
    try {
      files.push(await fileManifestEntry(jobDirectory, relativePath, role));
    } catch {
      // PDF artifacts do not exist until a renderer completes the job.
    }
  }
  const manifest: BookPrintExportManifest = {
    schemaVersion: 1,
    jobId: job.jobId,
    projectId: job.projectId,
    projectTitle: project.setup.title,
    sourceUpdatedAt: project.updatedAt,
    contentHash,
    generatedAt: new Date().toISOString(),
    geometry: job.geometry,
    print: { ink: job.request.ink, paper: job.request.paper, readingDirection: job.request.readingDirection },
    pageMap: job.pageMap,
    preflight: job.preflight,
    files,
  };
  await atomicWriteJson(path.join(jobDirectory, "manifest.json"), manifest);
  job.manifest = manifest;
}

async function listRelativeFiles(directory: string, root: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) results.push(...(await listRelativeFiles(absolutePath, root)));
      else if (entry.isFile()) results.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return results;
}

export async function createBookPrintJob(projectId: string, input: CreateBookPrintJobInput = {}): Promise<BookPrintJob> {
  assertIdentifier(projectId, "projectId");
  const project = await getProject(projectId);
  const request = normalizeRequest(project, input);
  const now = new Date().toISOString();
  const job: BookPrintJob = {
    jobId: randomUUID(),
    projectId,
    status: "preparing",
    step: "loading project",
    progress: 5,
    attempt: 1,
    createdAt: now,
    updatedAt: now,
    sourceUpdatedAt: project.updatedAt,
    request,
  };
  const jobDirectory = getJobDirectory(job.jobId);
  await ensureDirectory(jobDirectory);
  await persistJob(job);

  try {
    const issues: BookPrintPreflightIssue[] = [];
    const chapters = await loadChapters(project, issues);
    const preliminaryMap = buildPageMap(chapters, request, issues);
    const trim = resolveBookPrintTrim(request, project.setup.targetTrim);
    const geometry = buildGeometry(trim, request, preliminaryMap.length);
    job.step = "staging fonts and artwork";
    job.progress = 30;
    await persistJob(job);
    const fonts = await prepareFonts(request, jobDirectory, issues);
    const storyPages = await prepareStoryPages(projectId, chapters, geometry, request, jobDirectory, issues);
    const pageMap = preliminaryMap;
    const preflight = buildPreflight(chapters, pageMap, storyPages, fonts, request, geometry, issues);
    const interiorHtml = renderInteriorHtml(project, request, geometry, pageMap, storyPages, fonts);
    const coverHtml = renderCoverHtml(project, request, geometry, fonts);
    await atomicWriteText(path.join(jobDirectory, "interior.html"), interiorHtml);
    await atomicWriteText(path.join(jobDirectory, "cover.html"), coverHtml);

    job.geometry = geometry;
    job.pageMap = pageMap;
    job.preflight = preflight;
    job.contract = {
      contractVersion: 1,
      renderer: "pagedjs",
      media: "print",
      inputs: { interiorHtml: "interior.html", coverHtml: "cover.html" },
      outputs: { interiorPdf: "interior.pdf", coverPdf: "cover.pdf" },
      expected: {
        interiorPageCount: pageMap.length,
        interiorPageWidthIn: geometry.interiorPage.widthIn,
        interiorPageHeightIn: geometry.interiorPage.heightIn,
        coverPageCount: 1,
        coverPageWidthIn: geometry.cover.wrapWidthIn,
        coverPageHeightIn: geometry.cover.wrapHeightIn,
        fontsEmbedded: true,
        maximumFileBytes: MAX_KDP_FILE_BYTES,
      },
    };
    const contentHash = sha256(
      stableJson({
        projectId,
        sourceUpdatedAt: project.updatedAt,
        request,
        geometry,
        pageMap,
        interiorHtml: sha256(interiorHtml),
        coverHtml: sha256(coverHtml),
        assets: (await listRelativeFiles(path.join(jobDirectory, "assets"), jobDirectory)).sort(),
      }),
    );
    job.status = preflight.passed ? "queued" : "blocked";
    job.step = preflight.passed ? "awaiting PDF renderer" : "blocked by preflight";
    job.progress = preflight.passed ? 60 : 100;
    await writeManifest(job, jobDirectory, project, contentHash);
    return await persistJob(job);
  } catch (error) {
    job.status = "failed";
    job.step = "print preparation failed";
    job.progress = 100;
    job.error = error instanceof Error ? error.message : "Unable to prepare print job.";
    await persistJob(job);
    throw error;
  }
}

export async function getBookPrintJob(jobId: string): Promise<BookPrintJob> {
  assertIdentifier(jobId, "jobId");
  return readJson<BookPrintJob>(getJobFile(jobId));
}

export async function listBookPrintJobs(projectId: string): Promise<BookPrintJob[]> {
  assertIdentifier(projectId, "projectId");
  const jobsRoot = path.join(getStorageRoot(), "jobs");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(jobsRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const jobs = await Promise.all(
    entries.map(async (entry) => {
      try {
        return await readJson<BookPrintJob>(path.join(jobsRoot, entry, "job.json"));
      } catch {
        return null;
      }
    }),
  );
  return jobs
    .filter((job): job is BookPrintJob => Boolean(job && job.projectId === projectId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function claimBookPrintJob(jobId: string, workerId: string, leaseMs = DEFAULT_LEASE_MS) {
  if (!workerId?.trim() || workerId.length > 120) throw new Error("A valid workerId is required.");
  return withJobLock(jobId, async () => {
    const job = await getBookPrintJob(jobId);
    const now = Date.now();
    const leaseExpired = !job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= now;
    if (job.status === "running" && job.workerId !== workerId && !leaseExpired) throw new Error("Print job is already leased.");
    if (job.status !== "queued" && !(job.status === "running" && leaseExpired) && !(job.status === "running" && job.workerId === workerId)) {
      throw new Error(`Print job cannot be claimed from status ${job.status}.`);
    }
    job.status = "running";
    job.step = "rendering PDFs";
    job.progress = Math.max(65, job.progress);
    job.workerId = workerId.trim();
    job.leaseExpiresAt = new Date(now + clampNumber(leaseMs, 30_000, 60 * 60 * 1000)).toISOString();
    return persistJob(job);
  });
}

export async function heartbeatBookPrintJob(jobId: string, workerId: string, progress?: number) {
  return withJobLock(jobId, async () => {
    const job = await getBookPrintJob(jobId);
    if (job.status !== "running" || job.workerId !== workerId) throw new Error("Worker does not own this print job lease.");
    job.leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_MS).toISOString();
    if (progress !== undefined) job.progress = Math.max(job.progress, clampNumber(progress, 65, 95));
    return persistJob(job);
  });
}

type PdfInspection = { issues: BookPrintPreflightIssue[]; bytes: number; pageCount: number };

async function inspectPdf(
  filePath: string,
  expected: { pages: number; widthIn: number; heightIn: number },
  label: string,
): Promise<PdfInspection> {
  const issues: BookPrintPreflightIssue[] = [];
  const buffer = await fs.readFile(filePath);
  if (buffer.length > MAX_KDP_FILE_BYTES) {
    issues.push({ code: "PDF_TOO_LARGE", severity: "error", message: `${label} exceeds KDP's 650 MB limit.`, actual: buffer.length, expected: MAX_KDP_FILE_BYTES });
  } else if (buffer.length > RECOMMENDED_KDP_FILE_BYTES) {
    issues.push({ code: "PDF_LARGE", severity: "warning", message: `${label} exceeds the recommended 40 MB working size.`, actual: buffer.length, expected: RECOMMENDED_KDP_FILE_BYTES });
  }
  const document = await PDFDocument.load(buffer, { updateMetadata: false });
  const pages = document.getPages();
  if (pages.length !== expected.pages) {
    issues.push({ code: "PDF_PAGE_COUNT_MISMATCH", severity: "error", message: `${label} page count does not match its contract.`, actual: pages.length, expected: expected.pages });
  }
  const expectedWidth = expected.widthIn * INCH_TO_POINTS;
  const expectedHeight = expected.heightIn * INCH_TO_POINTS;
  pages.forEach((page, index) => {
    const size = page.getSize();
    if (Math.abs(size.width - expectedWidth) > 1 || Math.abs(size.height - expectedHeight) > 1) {
      issues.push({
        code: "PDF_PAGE_DIMENSION_MISMATCH",
        severity: "error",
        message: `${label} page ${index + 1} has incorrect media-box dimensions.`,
        location: `page-${index + 1}`,
        actual: `${(size.width / INCH_TO_POINTS).toFixed(4)} × ${(size.height / INCH_TO_POINTS).toFixed(4)} in`,
        expected: `${expected.widthIn} × ${expected.heightIn} in`,
      });
    }
  });
  const raw = buffer.toString("latin1");
  if (!/\/FontFile(?:2|3)?\b/.test(raw)) {
    issues.push({ code: "PDF_FONTS_NOT_EMBEDDED", severity: "error", message: `${label} does not expose embedded font streams.` });
  }
  return { issues, bytes: buffer.length, pageCount: pages.length };
}

export async function completeBookPrintJob(jobId: string, workerId: string) {
  return withJobLock(jobId, async () => {
  const job = await getBookPrintJob(jobId);
  if (job.status !== "running" || job.workerId !== workerId) throw new Error("Worker does not own this print job lease.");
  if (!job.contract || !job.geometry || !job.preflight) throw new Error("Print job contract is incomplete.");
  try {
  const jobDirectory = getJobDirectory(jobId);
  const interiorPath = resolveInside(jobDirectory, job.contract.outputs.interiorPdf);
  const coverPath = resolveInside(jobDirectory, job.contract.outputs.coverPdf);
  const [interior, cover] = await Promise.all([
    inspectPdf(
      interiorPath,
      {
        pages: job.contract.expected.interiorPageCount,
        widthIn: job.contract.expected.interiorPageWidthIn,
        heightIn: job.contract.expected.interiorPageHeightIn,
      },
      "Interior PDF",
    ),
    inspectPdf(
      coverPath,
      {
        pages: job.contract.expected.coverPageCount,
        widthIn: job.contract.expected.coverPageWidthIn,
        heightIn: job.contract.expected.coverPageHeightIn,
      },
      "Cover PDF",
    ),
  ]);
  const issues = [...interior.issues, ...cover.issues];
  const errors = issues.filter((issue) => issue.severity === "error");
  job.preflight = {
    ...job.preflight,
    passed: errors.length === 0 && job.preflight.errors.length === 0,
    checkedAt: new Date().toISOString(),
    errors: [...job.preflight.errors, ...errors],
    warnings: [...job.preflight.warnings, ...issues.filter((issue) => issue.severity === "warning")],
  };
  if (errors.length) {
    job.status = "failed";
    job.step = "PDF postflight failed";
    job.progress = 100;
    job.error = errors.map((issue) => issue.message).join(" | ");
    await persistJob(job);
    throw new Error(job.error);
  }
  const project = await getProject(job.projectId);
  if (project.updatedAt !== job.sourceUpdatedAt) {
    job.status = "failed";
    job.step = "source changed during render";
    job.progress = 100;
    job.error = "Book Builder project changed after this print job was staged; create a fresh print job.";
    await persistJob(job);
    throw new Error(job.error);
  }
  await writeManifest(job, jobDirectory, project, job.manifest?.contentHash ?? sha256(stableJson(job.contract)));
  job.status = "completed";
  job.step = "KDP artifacts ready";
  job.progress = 100;
  job.leaseExpiresAt = undefined;
  return persistJob(job);
  } catch (error) {
    if (job.status === "running") {
      job.status = "failed";
      job.step = "PDF postflight failed";
      job.progress = 100;
      job.error = error instanceof Error ? error.message : "Unable to inspect rendered PDFs.";
      job.leaseExpiresAt = undefined;
      await persistJob(job);
    }
    throw error;
  }
  });
}

export async function failBookPrintJob(jobId: string, workerId: string, errorMessage: string) {
  return withJobLock(jobId, async () => {
  const job = await getBookPrintJob(jobId);
  if (job.status !== "running" || job.workerId !== workerId) throw new Error("Worker does not own this print job lease.");
  job.status = "failed";
  job.step = "PDF renderer failed";
  job.progress = 100;
  job.error = errorMessage.trim().slice(0, 2000) || "PDF renderer failed.";
  job.leaseExpiresAt = undefined;
  return persistJob(job);
  });
}

export async function retryBookPrintJob(jobId: string) {
  return withJobLock(jobId, async () => {
  const job = await getBookPrintJob(jobId);
  if (job.status !== "failed") throw new Error("Only failed print jobs can be retried.");
  const project = await getProject(job.projectId);
  if (project.updatedAt !== job.sourceUpdatedAt) throw new Error("Project changed; create a new print job instead of retrying stale HTML.");
  job.status = "queued";
  job.step = "awaiting PDF renderer";
  job.progress = 60;
  job.attempt += 1;
  job.error = undefined;
  job.workerId = undefined;
  job.leaseExpiresAt = undefined;
  return persistJob(job);
  });
}

const artifactNames = {
  "interior-html": "interior.html",
  "cover-html": "cover.html",
  "interior-pdf": "interior.pdf",
  "cover-pdf": "cover.pdf",
  manifest: "manifest.json",
} as const;

export type BookPrintArtifactName = keyof typeof artifactNames;

export async function getBookPrintArtifactPath(jobId: string, artifact: BookPrintArtifactName) {
  const fileName = artifactNames[artifact];
  if (!fileName) throw new Error("Unknown print artifact.");
  const job = await getBookPrintJob(jobId);
  if ((artifact === "interior-pdf" || artifact === "cover-pdf") && job.status !== "completed") {
    throw new Error("PDF artifact is not ready.");
  }
  const filePath = resolveInside(getJobDirectory(jobId), fileName);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("Print artifact not found.");
  return filePath;
}

export async function getBookPrintWorkerContract(jobId: string, workerId: string) {
  const job = await getBookPrintJob(jobId);
  if (job.status !== "running" || job.workerId !== workerId || !job.contract) {
    throw new Error("Worker does not own an active print job contract.");
  }
  const jobDirectory = getJobDirectory(jobId);
  return {
    ...job.contract,
    absolutePaths: {
      interiorHtml: resolveInside(jobDirectory, job.contract.inputs.interiorHtml),
      coverHtml: resolveInside(jobDirectory, job.contract.inputs.coverHtml),
      interiorPdf: resolveInside(jobDirectory, job.contract.outputs.interiorPdf),
      coverPdf: resolveInside(jobDirectory, job.contract.outputs.coverPdf),
    },
  };
}
