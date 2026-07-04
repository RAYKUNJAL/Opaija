import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const storePath = path.join(process.cwd(), "data", "jobs.json");

export type JobRecord = {
  id: string;
  type: "video" | "voice" | "script" | "brain" | "publish";
  label: string;
  status: "queued" | "processing" | "completed" | "failed" | "dry_run";
  provider: string;
  modelId?: string;
  requestId?: string;
  episodeId?: string;
  createdAt: string;
  completedAt?: string;
  outputUrl?: string;
  outputText?: string;
  error?: string;
};

async function readJobs(): Promise<JobRecord[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw) as JobRecord[];
  } catch {
    return [];
  }
}

async function writeJobs(jobs: JobRecord[]) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(jobs.slice(-200), null, 2), "utf8");
}

export async function addJob(job: Omit<JobRecord, "id" | "createdAt">): Promise<JobRecord> {
  const record: JobRecord = {
    ...job,
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  const jobs = await readJobs();
  jobs.push(record);
  await writeJobs(jobs);
  return record;
}

export async function updateJob(id: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
  const jobs = await readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...updates };
  await writeJobs(jobs);
  return jobs[idx];
}

export async function listJobs(limit = 50): Promise<JobRecord[]> {
  const jobs = await readJobs();
  return jobs.slice(-limit).reverse();
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const jobs = await readJobs();
  return jobs.find((j) => j.id === id) ?? null;
}
