import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const queuePath = path.join(process.cwd(), "data", "shared-memory", "QUEUE.json");
const contentLogPath = path.join(process.cwd(), "data", "shared-memory", "CONTENT_LOG.json");
const canonPath = path.join(process.cwd(), "data", "shared-memory", "OPAIJA_CANON.json");

type ContentPlatform = string;
type ContentLogEntry = {
  episodeId: string;
  platform: ContentPlatform;
  url?: string;
  publishedAt: string;
};

type ContentPlatformStats = {
  total: number;
  last_post: string | null;
  subscribers?: number;
  followers?: number;
  total_chapters?: number;
  total_items?: number;
  revenue_usd?: number;
};

type ContentLog = {
  total_published: number;
  platforms: Record<ContentPlatform, ContentPlatformStats>;
  published_content: ContentLogEntry[];
};

const INITIAL_CONTENT_LOG: ContentLog = {
  total_published: 0,
  platforms: {},
  published_content: [],
};

function normalizePublishedContent(raw: unknown): ContentLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries = raw.filter((entry) => {
    return (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { episodeId?: unknown }).episodeId === "string" &&
      typeof (entry as { platform?: unknown }).platform === "string" &&
      (typeof (entry as { publishedAt?: unknown }).publishedAt === "string" || typeof (entry as { url?: unknown }).url === "string")
    );
  }) as ContentLogEntry[];
  return entries
    .map((entry) => ({
      ...entry,
      episodeId: entry.episodeId.trim(),
      platform: entry.platform.trim(),
      publishedAt: entry.publishedAt || new Date().toISOString(),
      url: entry.url ? String(entry.url).trim() : undefined,
    }))
    .filter((entry) => entry.episodeId && entry.platform);
}

function recalculateContentLog(raw: unknown): ContentLog {
  const safePayload = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const publishedContent = normalizePublishedContent(safePayload.published_content);
  const platforms: Record<string, ContentPlatformStats> = {};

  for (const entry of publishedContent) {
    const key = (entry.platform || "unknown").toLowerCase();
    const parsedDate = new Date(entry.publishedAt);
    const normalizedDate = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    const existing = platforms[key];
    platforms[key] = {
      total: (existing?.total ?? 0) + 1,
      last_post: normalizedDate,
      subscribers: existing?.subscribers,
      followers: existing?.followers,
      total_chapters: existing?.total_chapters,
      total_items: existing?.total_items,
      revenue_usd: existing?.revenue_usd,
    };
  }

  return {
    total_published: Math.max(0, Number(safePayload.total_published ?? publishedContent.length) || 0),
    platforms,
    published_content: publishedContent,
  };
}

function buildContentLogShape(raw: unknown): ContentLog {
  return recalculateContentLog(raw ?? INITIAL_CONTENT_LOG);
}

export type EpisodeStatus =
  | "PLANNED"
  | "SCRIPTED"
  | "STORYBOARDED"
  | "VIDEO_GENERATED"
  | "AUDIO_COMPLETE"
  | "QA_PASSED"
  | "SCHEDULED"
  | "PUBLISHED";

export type QueueData = {
  _meta: Record<string, string>;
  production_status: {
    phase: string;
    episodes_completed: number;
    episodes_in_pipeline: number;
    teaser_days_scheduled: number;
    character_sheets_locked: boolean;
    trailer_complete: boolean;
    cleared_for_launch: boolean;
  };
  episodes: Array<{
    id: string;
    title: string;
    status: EpisodeStatus;
    priority: number;
    doubles_moment: string;
    hook: string;
    conflict: string;
    reveal: string;
    escalation: string;
    cliffhanger: string;
    narrator_script?: string;
    characters: string[];
    location: string;
    island: string;
    villain_presence: boolean | string;
    assets_needed?: string[];
    scheduled_publish: string | null;
    platforms?: string[];
    caption_patois?: string;
    status_notes?: string;
    CANON_NOTE?: string;
    SEASON_1_TITLE_EPISODE?: boolean;
    SEASON_FINALE?: boolean;
    LORE_HEAVY?: boolean;
    generated_script?: string;
    qa_passed?: boolean;
    qa_notes?: string;
  }>;
  prelaunch_teaser_content: Array<{
    id: string;
    type: string;
    caption?: string;
    topic?: string;
    character?: string;
    includes_doubles?: boolean;
    includes_kai_comedy?: boolean;
    reveal_level?: string;
    status: string;
  }>;
};

export async function readQueue(): Promise<QueueData> {
  try {
    const raw = await readFile(queuePath, "utf8");
    return JSON.parse(raw) as QueueData;
  } catch {
    const queue = buildDefaultQueue();
    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
    return queue;
  }
}

export async function updateEpisodeStatus(episodeId: string, status: EpisodeStatus) {
  const queue = await readQueue();
  const episode = queue.episodes.find((ep) => ep.id === episodeId);
  if (!episode) throw new Error(`Episode ${episodeId} not found.`);
  episode.status = status;
  queue._meta["updated"] = new Date().toISOString().split("T")[0];

  // Count once: episodes_completed equals the number of episodes currently in the PUBLISHED state.
  if (status === "PUBLISHED") {
    queue.production_status.episodes_completed = queue.episodes.filter((ep) => ep.status === "PUBLISHED").length;
  }

  await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
  return { episodeId, status };
}

export async function saveEpisodeScript(episodeId: string, script: string, qaPass?: boolean) {
  const queue = await readQueue();
  const episode = queue.episodes.find((ep) => ep.id === episodeId);
  if (!episode) throw new Error(`Episode ${episodeId} not found.`);
  episode.generated_script = script;
  if (qaPass !== undefined) episode.qa_passed = qaPass;
  if (episode.status === "PLANNED") episode.status = "SCRIPTED";
  await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
  return { episodeId, scriptLength: script.length };
}

export async function readContentLog() {
  try {
    const raw = await readFile(contentLogPath, "utf8");
    return buildContentLogShape(JSON.parse(raw));
  } catch {
    return INITIAL_CONTENT_LOG;
  }
}

export async function logPublishedContent(entry: {
  episodeId: string;
  platform: string;
  url?: string;
  publishedAt?: string;
}) {
  const log = buildContentLogShape(await readContentLog());
  log.published_content.push({
    ...entry,
    publishedAt: entry.publishedAt ?? new Date().toISOString(),
  });
  log.total_published = (log.total_published ?? 0) + 1;
  log.published_content = log.published_content.slice(-120);
  Object.assign(log, buildContentLogShape(log));
  await mkdir(path.dirname(contentLogPath), { recursive: true });
  await writeFile(contentLogPath, JSON.stringify(log, null, 2), "utf8");
  return log;
}

export async function readCanon() {
  try {
    const raw = await readFile(canonPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return BUILT_IN_STORY_FRAMEWORK;
  }
}

function buildDefaultQueue(): QueueData {
  return {
    _meta: {
      created: new Date().toISOString().split("T")[0],
      updated: new Date().toISOString().split("T")[0],
      source: "generated-default-opaiija-cross-media-framework",
    },
    production_status: {
      phase: "story-framework-ready",
      episodes_completed: 0,
      episodes_in_pipeline: 1,
      teaser_days_scheduled: 0,
      character_sheets_locked: true,
      trailer_complete: false,
      cleared_for_launch: false,
    },
    episodes: [
      {
        id: "EP001",
        title: "The Stick Chose Him",
        status: "PLANNED",
        priority: 1,
        doubles_moment: "Kai reaches for doubles before the rhythm in the gayelle calls him away.",
        hook: "Kai thinks he is late for practice, but the bois already remembers his name.",
        conflict: "The training yard tests Kai before he understands the Guardian legacy watching him.",
        reveal: "The stick does not belong to Kai; it chooses him because memory recognizes spirit.",
        escalation: "The drum rhythm shifts, the gayelle tightens, and every watcher realizes this is not ordinary training.",
        cliffhanger: "A silent figure connected to Marius Vale watches from the edge of the crowd.",
        characters: ["Kai", "Nia", "Malik", "Jabari", "Papa Etienne"],
        location: "Gayelle training yard",
        island: "Trinidad",
        villain_presence: "Back-only distant watcher, no face reveal.",
        scheduled_publish: null,
        narrator_script: "",
      },
    ],
    prelaunch_teaser_content: [],
  };
}

const BUILT_IN_STORY_FRAMEWORK = {
  series: "OPAIJA",
  premise:
    "A Caribbean Afrocentric martial anime where bois, lavway, drums, memory, spirit, and the gayelle reveal an island-rooted power system.",
  volumeZero:
    "Volume 0 follows Kai as the stick chooses him, pulls him into the Guardian legacy, and forces the cast to confront rhythm, memory, and responsibility.",
  canonRules: [
    "Books, episodes, video prompts, captions, and covers must align to the same character bible and story continuity.",
    "Use enslaved Africans, never slaves, in historical backstory.",
    "Kai must keep a doubles moment in episode stories when Kai is present.",
    "A stick has memory, a fighter has spirit, a drum has rhythm, a lavway has command, and the gayelle binds them.",
    "Jabari uses African-style wooden Kalinda drums and curved L-shaped sticks, never a modern drum kit.",
    "Marius Vale stays back-only until the canon face reveal point.",
    "Characters cannot use powers they have not unlocked yet.",
    "Patois should be authentic and accessible, limited to a few sharp lines per episode.",
    "Visuals stay OPAIJA 2.5D Caribbean anime: rounded Afro-Caribbean faces, clean ink, bright island palette, no generic fantasy armor.",
  ],
  crossMediaRules: [
    "Episode scripts must be able to become video beats without changing plot meaning.",
    "Video prompts must preserve the book-panel character, costume, location, and power continuity.",
    "Book pages and episode beats should share the same hook, conflict, reveal, escalation, and cliffhanger language.",
  ],
};

export async function getEpisodeStoryFramework(episodeId?: string) {
  const sections: string[] = [
    "MAIN STORY FRAMEWORK:",
    JSON.stringify(BUILT_IN_STORY_FRAMEWORK, null, 2),
  ];

  const canon = await readJsonIfExists(canonPath);
  if (canon) {
    sections.push("CANON FILE CONTEXT:", JSON.stringify(compactJson(canon), null, 2));
  }

  const queue = await readJsonIfExists(queuePath) as QueueData | null;
  if (queue?.episodes?.length) {
    const episode = episodeId ? queue.episodes.find((entry) => entry.id === episodeId) : undefined;
    const seasonMap = queue.episodes.map((entry) => ({
      id: entry.id,
      title: entry.title,
      hook: entry.hook,
      conflict: entry.conflict,
      reveal: entry.reveal,
      escalation: entry.escalation,
      cliffhanger: entry.cliffhanger,
      characters: entry.characters,
      location: entry.location,
      island: entry.island,
      status: entry.status,
    }));
    sections.push("CURRENT EPISODE CONTEXT:", JSON.stringify(episode ?? {}, null, 2));
    sections.push("SEASON STORY MAP:", JSON.stringify(seasonMap, null, 2));
  }

  const bookContinuity = await summarizeBookContinuity();
  if (bookContinuity.length) {
    sections.push("BOOK BUILDER CONTINUITY SUMMARY:", JSON.stringify(bookContinuity, null, 2));
  }

  return sections.join("\n\n");
}

export function getVideoPromptStoryLock() {
  return [
    `Series: ${BUILT_IN_STORY_FRAMEWORK.series}.`,
    BUILT_IN_STORY_FRAMEWORK.premise,
    BUILT_IN_STORY_FRAMEWORK.volumeZero,
    "Cross-media lock: video beats must match the books, character bible, current episode story, and OPAIJA continuity.",
    ...BUILT_IN_STORY_FRAMEWORK.canonRules,
    ...BUILT_IN_STORY_FRAMEWORK.crossMediaRules,
  ].join(" ");
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function compactJson(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length <= 6000) return value;
  if (Array.isArray(value)) return value.slice(0, 20);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40));
  }
  return value;
}

async function summarizeBookContinuity() {
  const root = path.join(process.cwd(), process.env.BOOK_BUILDER_DATA_DIR ?? "data/book-builder", "projects");
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) return [];

  const summaries: Array<Record<string, unknown>> = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((item) => item.isDirectory()).slice(-8)) {
    const projectRoot = path.join(root, entry.name);
    const project = await readJsonIfExists(path.join(projectRoot, "project.json")) as {
      setup?: { title?: string; kdpBookType?: string };
      chapters?: Array<{ chapterTitle?: string }>;
    } | null;
    const continuity = await readJsonIfExists(path.join(projectRoot, "continuity.json")) as Array<{
      pageNumber?: number;
      panelNumber?: number;
      location?: string;
      timeOfDay?: string;
      mood?: string;
      presentCharacters?: string[];
      notes?: string;
    }> | null;
    if (!project) continue;
    summaries.push({
      title: project.setup?.title,
      bookType: project.setup?.kdpBookType,
      chapters: project.chapters?.map((chapter) => chapter.chapterTitle).slice(0, 6) ?? [],
      latestContinuity: (continuity ?? []).slice(-12),
    });
  }
  return summaries;
}
