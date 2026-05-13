import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const queuePath = path.join(process.cwd(), "data", "shared-memory", "QUEUE.json");
const contentLogPath = path.join(process.cwd(), "data", "shared-memory", "CONTENT_LOG.json");
const canonPath = path.join(process.cwd(), "data", "shared-memory", "OPAIJA_CANON.json");

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
    throw new Error("Could not read production queue.");
  }
}

export async function updateEpisodeStatus(episodeId: string, status: EpisodeStatus) {
  const queue = await readQueue();
  const episode = queue.episodes.find((ep) => ep.id === episodeId);
  if (!episode) throw new Error(`Episode ${episodeId} not found.`);
  episode.status = status;
  queue._meta["updated"] = new Date().toISOString().split("T")[0];

  if (status === "PUBLISHED") {
    queue.production_status.episodes_completed = queue.episodes.filter((ep) => ep.status === "PUBLISHED").length + 1;
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
    return JSON.parse(raw);
  } catch {
    return { total_published: 0, platforms: {}, published_content: [] };
  }
}

export async function logPublishedContent(entry: {
  episodeId: string;
  platform: string;
  url?: string;
  publishedAt?: string;
}) {
  const log = await readContentLog();
  log.total_published = (log.total_published ?? 0) + 1;
  log.published_content = log.published_content ?? [];
  log.published_content.push({
    ...entry,
    publishedAt: entry.publishedAt ?? new Date().toISOString(),
  });
  await mkdir(path.dirname(contentLogPath), { recursive: true });
  await writeFile(contentLogPath, JSON.stringify(log, null, 2), "utf8");
  return log;
}

export async function readCanon() {
  try {
    const raw = await readFile(canonPath, "utf8");
    return JSON.parse(raw);
  } catch {
    throw new Error("Could not read OPAIJA canon file.");
  }
}
