import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.OPAIJA_API_URL || "http://127.0.0.1:8787";
const artifacts = path.resolve("artifacts");

async function request(route, options) {
  const response = await fetch(`${base}${route}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route}: ${response.status} ${data.error || "request failed"}`);
  return data;
}

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

await mkdir(artifacts, { recursive: true });
const studio = await request("/api/video-studio");
const project = studio.projects?.[0];
if (!project) throw new Error("No Video Studio project exists.");
const scene = project.scenes?.[0];
if (!scene) throw new Error("The selected project has no scenes.");
const firstCharacter = scene.characters?.[0];
const firstReference = scene.referenceAssetIds?.[0];
if (!firstCharacter || !firstReference?.startsWith("character:")) throw new Error("The test shot requires one bound character reference.");
const referenceSlug = firstReference.slice("character:".length);
const canonicalFiles = { kai: "kairo-kai-baptiste.png" };
const referencePath = path.resolve("public", "assets", "characters", canonicalFiles[referenceSlug] ?? `${referenceSlug}.png`);
if (!existsSync(referencePath)) throw new Error(`Missing character reference: ${referencePath}`);

const prompt = [
  "CANON LOCK: OPAIJA Caribbean anime.",
  `Show exactly one named hero: ${firstCharacter}, matching the supplied reference face, hair, skin tone, outfit and silhouette.`,
  "One continuous low-medium action shot inside a Trinidad gayelle at night.",
  "The hero plants both feet, grips one slender cylindrical bois with both hands, performs one clean Kalinda guard-to-strike motion, then settles into a balanced guard.",
  "The bois remains connected to both hands. No floating, spare or duplicated weapons. No other hero or lookalike enters frame.",
  "Warm flambeau light, crowd held in soft background silhouette, clean hand-drawn ink, controlled cel shading, restrained rhythmic power trail.",
  "Stable face and outfit, plausible hands and limbs, stable camera horizon, no captions, no logos, no generated text, no cuts or split screen.",
].join(" ");

await request(`/api/video-studio/projects/${project.id}/scenes/${scene.id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ characters: [firstCharacter], referenceAssetIds: [firstReference], storyBeat: "A controlled Kalinda guard-to-strike demonstration.", durationSec: 6, shotType: "low medium action shot", camera: "slow grounded lateral track", prompt }),
});
const preflight = await request(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/preflight`, { method: "POST" });
if (!preflight.pass) throw new Error(`Paid generation blocked by preflight: ${JSON.stringify(preflight)}`);
const reference = await readFile(referencePath);
const render = await request("/api/video/jobs", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, negativePrompt: scene.negativePrompt, referenceImage: `data:image/png;base64,${reference.toString("base64")}`, durationSec: 6, aspectRatio: "9:16", episodeId: project.sourceEpisodeId, label: `${project.name} / ${scene.title}`, model: "ltx-2.3-pro" }),
});
if (render.status === "dry_run") throw new Error("The provider returned dry_run; no live video was built.");
await request(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "generate" }) });

const deadline = Date.now() + 15 * 60 * 1000;
let job;
while (Date.now() < deadline) {
  await request(`/api/jobs/${render.jobId}/poll`, { method: "POST" }).catch(() => null);
  const jobs = await request("/api/jobs");
  job = jobs.find((item) => item.id === render.jobId);
  process.stdout.write(`STATUS ${job?.status || "unknown"}\n`);
  if (job?.status === "completed" || job?.status === "failed") break;
  await sleep(10000);
}
if (!job || job.status !== "completed" || !job.outputUrl) throw new Error(`Video job did not complete: ${JSON.stringify(job)}`);
const videoResponse = await fetch(job.outputUrl);
if (!videoResponse.ok) throw new Error(`Could not download completed video (${videoResponse.status}).`);
const outputName = `opaija-${project.sourceEpisodeId.toLowerCase()}-${referenceSlug}-kalinda-test.mp4`;
const outputPath = path.join(artifacts, outputName);
await writeFile(outputPath, Buffer.from(await videoResponse.arrayBuffer()));
const qc = await request(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/vision-qc-video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoUrl: job.outputUrl }) });
const report = { status: qc.pass ? "PASS" : "QUARANTINED", projectId: project.id, sceneId: scene.id, jobId: job.id, providerRequestId: job.requestId, estimatedCost: render.cost, preflight, qc, outputPath, outputUrl: job.outputUrl, completedAt: new Date().toISOString() };
await writeFile(path.join(artifacts, "video-studio-live-build-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
