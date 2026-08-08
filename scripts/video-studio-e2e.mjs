const base = process.env.OPAIJA_API_URL || "http://127.0.0.1:8787";

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data.error || "request failed"}`);
  return data;
}

const studio = await request("/api/video-studio");
if (!Array.isArray(studio.templates) || studio.templates.length < 6) throw new Error("Template catalogue is incomplete.");
if (!studio.policy || studio.policy.minimumVisionScore !== 95) throw new Error("Commercial QC policy is missing.");
if (studio.defaultVideoModelId !== "bytedance/seedance-2.0") throw new Error("Seedance 2.0 is not the default video model.");
const seedance = studio.videoModels?.find((model) => model.id === "bytedance/seedance-2.0");
const ltx = studio.videoModels?.find((model) => model.id === "lightricks/ltx-2.3-pro");
if (!seedance || !ltx) throw new Error("Video model registry is incomplete.");
if (seedance.durations.min !== 1 || seedance.durations.max !== 15 || !seedance.nativeAudio) throw new Error("Seedance capabilities are incorrect.");
if (seedance.pricing.nonVideoInputPerSecond["480p"] !== 0.08 || seedance.pricing.nonVideoInputPerSecond["720p"] !== 0.18 || seedance.pricing.nonVideoInputPerSecond["1080p"] !== 0.45 || seedance.pricing.nonVideoInputPerSecond["4k"] !== 1) throw new Error("Seedance pricing is incorrect.");

const queue = await request("/api/episodes");
const episode = queue.episodes?.[0];
if (!episode) throw new Error("No episode is available for the test project.");

const project = await request("/api/video-studio/projects", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    episodeId: episode.id,
    templateId: "episode",
    name: `E2E ${episode.id} ${Date.now()}`,
    brief: "No-spend test: preserve canon, distinct characters, exact prop ownership and action continuity.",
  }),
});

if (!project.scenes?.length) throw new Error("Project did not create storyboard scenes.");
const scene = project.scenes[0];
if (project.videoModelId !== seedance.id || scene.videoModelId !== seedance.id) throw new Error("New project and scene did not persist the Seedance default.");
if (project.resolution !== "720p" || scene.resolution !== "720p" || project.aspectRatio !== "9:16" || scene.aspectRatio !== "9:16" || !project.generateAudio || !scene.generateAudio) throw new Error("Seedance project and scene settings were not persisted.");
const preflight = await request(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/preflight`, { method: "POST" });
if (preflight.pass || !preflight.blockers.some((item) => item.includes("start frame"))) throw new Error(`Missing start-frame gate did not block: ${JSON.stringify(preflight)}`);
if (!(preflight.estimatedCost > 0)) throw new Error("Blocked preflight did not retain its cost quote.");
if (preflight.estimatedCost !== Number((scene.durationSec * 0.18).toFixed(2))) throw new Error(`Dynamic Seedance quote is incorrect: ${preflight.estimatedCost}`);
if (preflight.modelId !== seedance.id || preflight.resolution !== scene.resolution || preflight.aspectRatio !== scene.aspectRatio || preflight.generateAudio !== scene.generateAudio) throw new Error("Preflight did not snapshot the selected model settings.");

const revision = await request(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/revisions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ operation: "variation" }),
});
if (!revision.id || revision.status !== "draft") throw new Error("Revision lineage was not created.");

await request(`/api/video-studio/projects/${project.id}`, { method: "DELETE" });
console.log(JSON.stringify({
  status: "PASS",
  spend: 0,
  templates: studio.templates.length,
  models: studio.videoModels.length,
  defaultModel: studio.defaultVideoModelId,
  sourceEpisode: episode.id,
  scenes: project.scenes.length,
  preflightScore: preflight.score,
  expectedGate: "start frame required",
  quote: preflight.estimatedCost,
  revisionOperation: revision.operation,
}, null, 2));
