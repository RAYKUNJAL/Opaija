import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeDollarSign,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Download,
  Eye,
  Film,
  FolderKanban,
  Gauge,
  Image,
  LayoutDashboard,
  LoaderCircle,
  MessageSquareText,
  Music2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  WandSparkles,
} from "lucide-react";
import { apiUrl } from "../lib/api";
import type { Episode } from "../data/episodes";
import type { VideoAspectRatio, VideoProject, VideoResolution, VideoScene, VideoStudioPayload } from "../data/videoStudio";

type StudioTab = "home" | "storyboard" | "projects" | "assets" | "jobs";
type Job = { id: string; type: string; label: string; status: string; provider?: string; modelId?: string; requestId?: string; episodeId?: string; outputUrl?: string; createdAt?: string; created_at?: string; error?: string };

const templateIcons: Record<string, typeof Clapperboard> = {
  clapperboard: Clapperboard,
  sparkles: Sparkles,
  message: MessageSquareText,
  music: Music2,
  book: BookOpen,
  badge: BadgeDollarSign,
};

const statusLabel: Record<VideoScene["status"], string> = {
  draft: "Draft",
  preflight_blocked: "Blocked",
  ready_to_render: "Ready to render",
  rendering: "Rendering",
  needs_review: "Needs review",
  approved: "Approved",
};

async function jsonRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), options);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}.`);
  return data;
}

export function EpisodesView() {
  const [studio, setStudio] = useState<VideoStudioPayload | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [tab, setTab] = useState<StudioTab>("home");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [directorBrief, setDirectorBrief] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [templateId, setTemplateId] = useState("episode");
  const [search, setSearch] = useState("");

  async function loadStudio() {
    setLoading(true);
    try {
      const [studioData, queueData, jobData] = await Promise.all([
        jsonRequest<VideoStudioPayload>("/api/video-studio"),
        jsonRequest<{ episodes: Episode[] }>("/api/episodes"),
        jsonRequest<Job[]>("/api/jobs"),
      ]);
      setStudio(studioData);
      setEpisodes(queueData.episodes ?? []);
      setJobs(jobData.filter((job) => job.type === "video" || job.type === "image"));
      const projectId = selectedProjectId || studioData.projects[0]?.id || "";
      setSelectedProjectId(projectId);
      const project = studioData.projects.find((item) => item.id === projectId);
      setSelectedSceneId((current) => current && project?.scenes.some((item) => item.id === current) ? current : project?.scenes[0]?.id || "");
      if (!episodeId) setEpisodeId(queueData.episodes?.[0]?.id || "");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not load Video Studio." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStudio();
  }, []);

  useEffect(() => {
    const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "processing");
    if (!activeJobs.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(activeJobs.map((job) => jsonRequest(`/api/jobs/${job.id}/poll`, { method: "POST" }).catch(() => null))).then(() => loadStudio());
    }, 8000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  const project = studio?.projects.find((item) => item.id === selectedProjectId) ?? studio?.projects[0];
  const scene = project?.scenes.find((item) => item.id === selectedSceneId) ?? project?.scenes[0];
  const selectedVideoModel = studio?.videoModels.find((item) => item.id === scene?.videoModelId) ?? studio?.videoModels[0];
  const durationOptions = selectedVideoModel?.durations.values ?? Array.from({ length: selectedVideoModel ? selectedVideoModel.durations.max - selectedVideoModel.durations.min + 1 : 1 }, (_, index) => (selectedVideoModel?.durations.min ?? 1) + index);
  const selectedRate = scene && selectedVideoModel ? selectedVideoModel.pricing.nonVideoInputPerSecond[scene.resolution] ?? 0 : 0;
  const liveSceneQuote = scene ? Number((scene.durationSec * selectedRate).toFixed(2)) : 0;
  const projectJobs = jobs.filter((job) => job.episodeId === project?.sourceEpisodeId);
  const approvedScenes = project?.scenes.filter((item) => item.status === "approved").length ?? 0;
  const readyScenes = project?.scenes.filter((item) => item.status === "ready_to_render").length ?? 0;
  const blockedScenes = project?.scenes.filter((item) => item.status === "preflight_blocked" || item.status === "needs_review").length ?? 0;
  const estimatedProjectCost = project?.scenes.reduce((sum, item) => {
    const model = studio?.videoModels.find((candidate) => candidate.id === item.videoModelId);
    const rate = model?.pricing.nonVideoInputPerSecond[item.resolution] ?? 0;
    return sum + (item.preflight?.estimatedCost ?? item.durationSec * rate);
  }, 0) ?? 0;
  const assets = useMemo(() => {
    const refs = new Map<string, { id: string; type: string; usedBy: number }>();
    for (const item of studio?.projects ?? []) {
      for (const shot of item.scenes) {
        for (const ref of shot.referenceAssetIds) {
          const current = refs.get(ref);
          refs.set(ref, { id: ref, type: ref.split(":")[0] || "asset", usedBy: (current?.usedBy ?? 0) + 1 });
        }
      }
    }
    return [...refs.values()].filter((asset) => asset.id.toLowerCase().includes(search.toLowerCase()));
  }, [studio, search]);

  async function createProject(chosenTemplate = templateId) {
    setWorking("create-project");
    setNotice(null);
    try {
      const created = await jsonRequest<VideoProject>("/api/video-studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, templateId: chosenTemplate, brief: directorBrief }),
      });
      await loadStudio();
      setSelectedProjectId(created.id);
      setSelectedSceneId(created.scenes[0]?.id || "");
      setTab("storyboard");
      setNotice({ type: "success", text: "Storyboard created from the selected canon episode. No generation credits were used." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not create project." });
    } finally {
      setWorking("");
    }
  }

  async function updateProject(patch: Record<string, unknown>) {
    if (!project) return;
    setWorking("save-project");
    try {
      await jsonRequest(`/api/video-studio/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      await loadStudio();
      setNotice({ type: "success", text: "Project settings saved." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save project." });
    } finally {
      setWorking("");
    }
  }

  async function updateScene(patch: Partial<VideoScene>) {
    if (!project || !scene) return;
    setWorking("save-scene");
    try {
      await jsonRequest(`/api/video-studio/projects/${project.id}/scenes/${scene.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      await loadStudio();
      setNotice({ type: "success", text: "Shot saved. Preflight must run again before spending." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save shot." });
    } finally {
      setWorking("");
    }
  }

  async function updateVideoSettings(patch: Partial<Pick<VideoScene, "videoModelId" | "durationSec" | "resolution" | "aspectRatio" | "generateAudio">>) {
    if (!project || !scene) return;
    setWorking("save-video-settings");
    try {
      await jsonRequest(`/api/video-studio/projects/${project.id}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, syncProjectDefaults: true }),
      });
      await loadStudio();
      setNotice({ type: "success", text: "Video model settings saved. The no-spend quote and preflight were refreshed." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save video settings." });
    } finally {
      setWorking("");
    }
  }

  async function runPreflight(target = scene) {
    if (!project || !target) return;
    setWorking(`preflight-${target.id}`);
    setNotice(null);
    try {
      const result = await jsonRequest<{ score: number; pass: boolean; blockers: string[]; estimatedCost: number }>(`/api/video-studio/projects/${project.id}/scenes/${target.id}/preflight`, { method: "POST" });
      await loadStudio();
      setNotice({ type: result.pass ? "success" : "error", text: result.pass ? `Preflight passed ${result.score}/100. Estimated render $${result.estimatedCost.toFixed(2)}.` : `Preflight blocked at ${result.score}/100: ${result.blockers.join(" ")}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Preflight failed." });
    } finally {
      setWorking("");
    }
  }

  async function createRevision(operation: "retake" | "variation" | "edit") {
    if (!project || !scene) return;
    setWorking(`revision-${operation}`);
    try {
      await jsonRequest(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation }) });
      await loadStudio();
      setNotice({ type: "success", text: `${operation.charAt(0).toUpperCase() + operation.slice(1)} revision created without overwriting the accepted asset.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not create revision." });
    } finally {
      setWorking("");
    }
  }

  async function addScene() {
    if (!project) return;
    setWorking("add-scene");
    try {
      const created = await jsonRequest<VideoScene>(`/api/video-studio/projects/${project.id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyBeat: "Describe the new story beat here." }),
      });
      await loadStudio();
      setSelectedSceneId(created.id);
      setNotice({ type: "success", text: "Scene added. Edit its story beat and run preflight when ready." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add scene." });
    } finally {
      setWorking("");
    }
  }

  async function referenceDataUrl(assetId?: string) {
    if (!assetId) return undefined;
    const response = await fetch(apiUrl(`/api/video-studio/assets/${assetId}`));
    if (!response.ok) throw new Error("The approved start frame is missing from Video Studio.");
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the start-frame reference."));
      reader.readAsDataURL(blob);
    });
  }

  async function uploadStartFrame(file?: File) {
    if (!file || !project || !scene) return;
    setWorking("start-frame");
    setNotice({ type: "info", text: "Inspecting the start frame against the shot and character contract..." });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the selected image."));
        reader.readAsDataURL(file);
      });
      const result = await jsonRequest<{ assetId: string; qc: { pass: boolean; score: number; blockers: string[] } }>(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/start-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      await loadStudio();
      setNotice({ type: result.qc.pass ? "success" : "error", text: result.qc.pass ? `Start frame passed vision QC at ${result.qc.score}/100.` : `Start frame rejected at ${result.qc.score}/100: ${result.qc.blockers.join(" ")}` });
    } catch (error) {
      await loadStudio();
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Start-frame inspection failed." });
    } finally {
      setWorking("");
    }
  }

  async function recheckImportedStartFrame() {
    if (!project || !scene?.startFrameAssetId) return;
    setWorking("start-frame-recheck");
    setNotice({ type: "info", text: "Running vision QC on the imported start frame..." });
    try {
      const result = await jsonRequest<{ qc: { pass: boolean; score: number; blockers: string[] } }>(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/start-frame/recheck`, { method: "POST" });
      await loadStudio();
      setNotice({ type: result.qc.pass ? "success" : "error", text: result.qc.pass ? `Imported start frame passed vision QC at ${result.qc.score}/100.` : `Imported start frame rejected at ${result.qc.score}/100: ${result.qc.blockers.join(" ")}` });
    } catch (error) {
      await loadStudio();
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Imported start-frame inspection failed." });
    } finally {
      setWorking("");
    }
  }

  async function submitRender() {
    if (!project || !scene?.preflight?.pass) {
      setNotice({ type: "error", text: "Run and pass the no-spend preflight before submitting a paid render." });
      return;
    }
    const confirmed = window.confirm(`Submit this ${scene.durationSec}s ${selectedVideoModel?.name ?? "video"} shot at ${scene.resolution} to Replicate? Estimated cost $${scene.preflight.estimatedCost.toFixed(2)}. This can use real credits.`);
    if (!confirmed) return;
    setWorking("render");
    try {
      const referenceImage = await referenceDataUrl(scene.startFrameAssetId);
      const result = await jsonRequest<{ status: string; requestId: string; cost: number }>("/api/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: scene.prompt, negativePrompt: scene.negativePrompt, referenceImage, durationSec: scene.durationSec, modelId: scene.videoModelId, resolution: scene.resolution, aspectRatio: scene.aspectRatio, generateAudio: scene.generateAudio, episodeId: project.sourceEpisodeId, label: `${project.name} / ${scene.title}` }),
      });
      await jsonRequest(`/api/video-studio/projects/${project.id}/scenes/${scene.id}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "generate" }),
      });
      await loadStudio();
      setNotice({ type: result.status === "dry_run" ? "info" : "success", text: result.status === "dry_run" ? "Dry-run job saved; no provider credits were used." : `Render queued as ${result.requestId}. Estimated cost $${result.cost.toFixed(2)}.` });
      setTab("jobs");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not submit render." });
    } finally {
      setWorking("");
    }
  }

  async function pollJob(job: Job) {
    setWorking(`poll-${job.id}`);
    try {
      await jsonRequest(`/api/jobs/${job.id}/poll`, { method: "POST" });
      await loadStudio();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not refresh the job." });
    } finally {
      setWorking("");
    }
  }

  async function runVideoQc(job: Job, targetScene: VideoScene) {
    if (!project || !job.outputUrl) return;
    setWorking(`qc-${job.id}`);
    setNotice({ type: "info", text: "Extracting representative frames and running the commercial vision inspection..." });
    try {
      const result = await jsonRequest<{ pass: boolean; score: number; blockers: string[]; framesInspected: number }>(`/api/video-studio/projects/${project.id}/scenes/${targetScene.id}/vision-qc-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: job.outputUrl }),
      });
      await loadStudio();
      setNotice({ type: result.pass ? "success" : "error", text: result.pass ? `Vision QC passed ${result.score}/100 across ${result.framesInspected} frames.` : `Video quarantined at ${result.score}/100: ${result.blockers.join(" ")}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Video QC failed." });
    } finally {
      setWorking("");
    }
  }

  async function bindAssetToScene(assetId: string) {
    if (!scene) return;
    if (scene.referenceAssetIds.includes(assetId)) {
      setNotice({ type: "info", text: "That reference is already bound to the selected scene." });
      return;
    }
    await updateScene({ referenceAssetIds: [...scene.referenceAssetIds, assetId] });
  }

  async function deleteProject(item: VideoProject) {
    if (!window.confirm(`Delete ${item.name}? Generated assets and provider jobs are not deleted.`)) return;
    setWorking(`delete-${item.id}`);
    try {
      await jsonRequest(`/api/video-studio/projects/${item.id}`, { method: "DELETE" });
      setSelectedProjectId("");
      setSelectedSceneId("");
      await loadStudio();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not delete project." });
    } finally {
      setWorking("");
    }
  }

  if (loading && !studio) {
    return <div className="video-studio-loading"><LoaderCircle className="spin" size={28} /><span>Opening Video Studio...</span></div>;
  }

  return (
    <div className="video-studio">
      <aside className="vs-sidebar">
        <div className="vs-brand"><span>VS</span><div><strong>Video Studio</strong><small>Creative Engine v1</small></div></div>
        <nav>
          {([
            ["home", LayoutDashboard, "Studio Home"],
            ["storyboard", Clapperboard, "Storyboard"],
            ["projects", FolderKanban, "Projects"],
            ["assets", Boxes, "Asset Library"],
            ["jobs", Clock3, "Jobs and Costs"],
          ] as Array<[StudioTab, typeof LayoutDashboard, string]>).map(([value, Icon, label]) => (
            <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={17} /><span>{label}</span>{value === "jobs" && projectJobs.length > 0 ? <b>{projectJobs.length}</b> : null}</button>
          ))}
        </nav>
        <div className="vs-world-card"><ShieldCheck size={18} /><div><strong>OPAIJA World</strong><small>Canon and combat locks active</small></div></div>
        <div className="vs-provider-list">
          {Object.entries(studio?.capabilities ?? {}).map(([key, item]) => <span key={key}><i className={item.enabled ? "online" : "offline"} />{item.provider}</span>)}
        </div>
      </aside>

      <main className="vs-main">
        <header className="vs-topbar">
          <div><span className="vs-eyebrow">Cross-media production</span><h1>{tab === "home" ? "What are we directing today?" : tab === "storyboard" ? project?.name || "Storyboard" : tab === "projects" ? "Director Projects" : tab === "assets" ? "Shared Asset Library" : "Background Jobs and Costs"}</h1></div>
          <div className="vs-top-actions"><button type="button" onClick={() => void loadStudio()} title="Refresh"><RefreshCw size={16} /></button><button type="button" className="vs-primary" onClick={() => setTab("home")}><Plus size={16} />New production</button></div>
        </header>

        {notice ? <div className={`vs-notice ${notice.type}`}>{notice.type === "success" ? <CheckCircle2 size={16} /> : notice.type === "error" ? <AlertTriangle size={16} /> : <Clock3 size={16} />}<span>{notice.text}</span><button type="button" onClick={() => setNotice(null)}>x</button></div> : null}

        {tab === "home" && (
          <div className="vs-home">
            <section className="vs-director">
              <div className="vs-director-copy"><span><WandSparkles size={16} />Story Director</span><h2>Turn one canon brief into a reviewable scene plan.</h2><p>The Director plans first. Replicate is never called until each shot passes its no-spend gate and you approve the estimated cost.</p></div>
              <div className="vs-director-box">
                <textarea value={directorBrief} onChange={(event) => setDirectorBrief(event.target.value)} placeholder="Describe the episode, scene, campaign, emotional beat, action and ending..." />
                <div className="vs-director-controls">
                  <label>Canon source<select value={episodeId} onChange={(event) => setEpisodeId(event.target.value)}>{episodes.map((item) => <option value={item.id} key={item.id}>{item.id} - {item.title}</option>)}</select></label>
                  <label>Production type<select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{studio?.templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  <button type="button" className="vs-primary" onClick={() => void createProject()} disabled={working === "create-project"}>{working === "create-project" ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}Create storyboard</button>
                </div>
              </div>
            </section>

            <section className="vs-section"><div className="vs-section-head"><div><span>Quick starts</span><h2>Build by outcome, not by model name.</h2></div></div><div className="vs-template-grid">{studio?.templates.map((item) => { const Icon = templateIcons[item.icon] ?? Film; return <button type="button" key={item.id} onClick={() => { setTemplateId(item.id); void createProject(item.id); }}><div className={`vs-template-icon tint-${item.id}`}><Icon size={22} /></div><strong>{item.name}</strong><p>{item.description}</p><span>{item.duration}<ChevronRight size={14} /></span></button>; })}</div></section>

            <section className="vs-section"><div className="vs-section-head"><div><span>Continue directing</span><h2>Recent productions</h2></div><button type="button" onClick={() => setTab("projects")}>View all projects</button></div><div className="vs-recent-grid">{studio?.projects.slice(0, 3).map((item) => { const approved = item.scenes.filter((shot) => shot.status === "approved").length; return <button type="button" key={item.id} onClick={() => { setSelectedProjectId(item.id); setSelectedSceneId(item.scenes[0]?.id || ""); setTab("storyboard"); }}><div className="vs-project-art"><Film size={36} /><span>{item.aspectRatio}</span></div><div><strong>{item.name}</strong><p>{item.sourceEpisodeId} / {item.scenes.length} scenes</p><div className="vs-progress"><i style={{ width: `${item.scenes.length ? approved / item.scenes.length * 100 : 0}%` }} /></div><small>{approved} approved / {item.scenes.length} total</small></div></button>; })}</div></section>
          </div>
        )}

        {tab === "storyboard" && project && (
          <div className="vs-workspace">
            <section className="vs-story-map">
              <div className="vs-story-head"><span>Scenes</span><strong>{project.scenes.length}</strong></div>
              <div className="vs-scene-list">{project.scenes.map((item) => <button type="button" key={item.id} className={scene?.id === item.id ? "active" : ""} onClick={() => setSelectedSceneId(item.id)}><div className="vs-scene-thumb"><span>{String(item.order).padStart(2, "0")}</span>{item.status === "approved" ? <CheckCircle2 size={14} /> : item.status === "preflight_blocked" || item.status === "needs_review" ? <AlertTriangle size={14} /> : <Film size={14} />}</div><div><strong>{item.title}</strong><small>{item.shotType}</small><span className={`vs-shot-status status-${item.status}`}>{statusLabel[item.status]}</span></div></button>)}</div>
              <button type="button" className="vs-add-scene" onClick={() => void addScene()} disabled={working === "add-scene"}>{working === "add-scene" ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}Add scene</button>
            </section>

            {scene ? <section className="vs-canvas">
              <div className="vs-canvas-toolbar"><div><span>{project.sourceEpisodeId} / Scene {scene.order}</span><strong>{scene.title}</strong></div><div><button type="button" onClick={() => void createRevision("variation")}><Sparkles size={15} />Variation</button><button type="button" onClick={() => void createRevision("retake")}><RotateCcw size={15} />Retake</button></div></div>
              <div className="vs-preview-frame"><div className="vs-safe-frame"><Film size={42} /><strong>{scene.storyBeat}</strong><span>{scene.shotType} / {scene.camera}</span><small>Approved media appears here. Drafts and rejected assets never replace the selected revision.</small></div><div className="vs-frame-badges"><span><ShieldCheck size={13} />Canon locked</span><span><Eye size={13} />Vision QC required</span><span>{scene.aspectRatio}</span></div></div>
              <div className="vs-timeline"><div className="vs-play"><Video size={17} /></div>{project.scenes.map((item) => <button type="button" key={item.id} className={item.id === scene.id ? "active" : ""} style={{ flex: item.durationSec }} onClick={() => setSelectedSceneId(item.id)}><span>{item.order}</span><small>{item.durationSec}s</small></button>)}</div>
              <div className="vs-scene-contract"><div><span>Shot contract</span><h3>{scene.storyBeat}</h3></div><dl><div><dt>Cast</dt><dd>{scene.characters.join(", ") || "Unassigned"}</dd></div><div><dt>Location</dt><dd>{scene.location}</dd></div><div><dt>References</dt><dd>{scene.referenceAssetIds.length} bound</dd></div><div><dt>Versions</dt><dd>{scene.revisions.length}</dd></div></dl></div>
            </section> : null}

            {scene ? <aside className="vs-inspector">
              <div className="vs-inspector-head"><div><Settings2 size={17} /><strong>Shot Inspector</strong></div><span>Auto-saved contract</span></div>
              <label>Video model<select value={scene.videoModelId} disabled={working === "save-video-settings"} onChange={(event) => { const model = studio?.videoModels.find((item) => item.id === event.target.value); if (model) void updateVideoSettings({ videoModelId: model.id, durationSec: model.durations.values?.[0] ?? Math.max(model.durations.min, Math.min(model.durations.max, scene.durationSec)), resolution: model.defaultResolution, aspectRatio: model.defaultAspectRatio, generateAudio: model.defaultAudio }); }}>{studio?.videoModels.map((model) => <option value={model.id} key={model.id}>{model.name}{model.id === studio.defaultVideoModelId ? " (Default)" : " (Fallback)"}</option>)}</select><small className="vs-field-help">{selectedVideoModel?.description}</small></label>
              <label>Story beat<textarea defaultValue={scene.storyBeat} key={`${scene.id}-beat`} onBlur={(event) => event.target.value !== scene.storyBeat && void updateScene({ storyBeat: event.target.value })} /></label>
              <div className="vs-two-fields"><label>Shot type<input defaultValue={scene.shotType} key={`${scene.id}-shot`} onBlur={(event) => event.target.value !== scene.shotType && void updateScene({ shotType: event.target.value })} /></label><label>Duration<select value={scene.durationSec} disabled={working === "save-video-settings"} onChange={(event) => void updateVideoSettings({ durationSec: Number(event.target.value) })}>{durationOptions.map((value) => <option value={value} key={value}>{value} sec</option>)}</select></label></div>
              <div className="vs-two-fields"><label>Resolution<select value={scene.resolution} disabled={working === "save-video-settings"} onChange={(event) => void updateVideoSettings({ resolution: event.target.value as VideoResolution })}>{selectedVideoModel?.resolutions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label>Aspect ratio<select value={scene.aspectRatio} disabled={working === "save-video-settings"} onChange={(event) => void updateVideoSettings({ aspectRatio: event.target.value as VideoAspectRatio })}>{selectedVideoModel?.aspectRatios.map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div>
              <label>Native audio<select value={scene.generateAudio ? "on" : "off"} disabled={!selectedVideoModel?.nativeAudio || working === "save-video-settings"} onChange={(event) => void updateVideoSettings({ generateAudio: event.target.value === "on" })}><option value="on">On - dialogue, SFX and music</option><option value="off">Off - silent video</option></select><small className="vs-field-help">{selectedVideoModel?.nativeAudio ? "Audio is generated with the video." : "This fallback model does not support native audio."}</small></label>
              <label>Camera<input defaultValue={scene.camera} key={`${scene.id}-camera`} onBlur={(event) => event.target.value !== scene.camera && void updateScene({ camera: event.target.value })} /></label>
              <label>Generation prompt<textarea className="vs-prompt" defaultValue={scene.prompt} key={`${scene.id}-prompt`} onBlur={(event) => event.target.value !== scene.prompt && void updateScene({ prompt: event.target.value })} /></label>
              <label className={`vs-start-frame ${scene.startFrameQc?.pass ? "pass" : scene.startFrameQc ? "fail" : "idle"}`}>Approved start frame<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadStartFrame(event.target.files?.[0])} disabled={working === "start-frame" || working === "start-frame-recheck"} /><span>{working === "start-frame" || working === "start-frame-recheck" ? "Vision inspection running..." : scene.startFrameName || "Choose one clean cinematic frame"}</span><small className="vs-field-help">Do not upload a model sheet, collage or comic page. One frame must pass 95/100 before paid video unlocks.</small>{scene.startFrameQc ? <strong>{scene.startFrameQc.pass ? "Approved" : "Rejected"} {scene.startFrameQc.score}/100</strong> : null}</label>
              {scene.startFrameAssetId && !scene.startFrameQc ? <button type="button" className="vs-primary" onClick={() => void recheckImportedStartFrame()} disabled={working === "start-frame-recheck"}>{working === "start-frame-recheck" ? <LoaderCircle size={15} className="spin" /> : <Eye size={15} />}Run QC on imported frame</button> : null}
              <details><summary>Negative constraints and engine settings</summary><label>Negative prompt<textarea defaultValue={scene.negativePrompt} key={`${scene.id}-negative`} onBlur={(event) => event.target.value !== scene.negativePrompt && void updateScene({ negativePrompt: event.target.value })} /></label><div className="vs-engine-row"><span>Creative profile</span><strong>{project.styleProfile}</strong></div><div className="vs-engine-row"><span>Engine</span><strong>Replicate / {selectedVideoModel?.name}</strong></div><div className="vs-engine-row"><span>Model ID</span><strong>{scene.videoModelId}</strong></div></details>
              <div className={`vs-preflight ${scene.preflight?.pass ? "pass" : scene.preflight ? "fail" : "idle"}`}><div><Gauge size={19} /><div><strong>{scene.preflight ? `Preflight ${scene.preflight.score}/100` : "No-spend preflight"}</strong><span>{scene.preflight?.pass ? "Safe to submit" : scene.preflight ? `${scene.preflight.blockers.length} blocker(s)` : "Required before provider call"}</span></div></div><small>Live quote: ${liveSceneQuote.toFixed(2)} / {scene.durationSec}s / {scene.resolution}{scene.generateAudio ? " / audio" : " / silent"}</small>{scene.preflight?.blockers.map((item) => <p key={item}>{item}</p>)}<button type="button" onClick={() => void runPreflight()} disabled={working === `preflight-${scene.id}`}>{working === `preflight-${scene.id}` ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}Run preflight</button></div>
              <button type="button" className="vs-render" onClick={() => void submitRender()} disabled={!scene.preflight?.pass || working === "render"}>{working === "render" ? <LoaderCircle size={16} className="spin" /> : <Clapperboard size={16} />}Submit approved render<span>{scene.preflight ? `$${scene.preflight.estimatedCost.toFixed(2)}` : "Blocked"}</span></button>
            </aside> : null}
          </div>
        )}

        {tab === "projects" && <div className="vs-library-page"><div className="vs-metric-row"><article><FolderKanban /><div><strong>{studio?.projects.length ?? 0}</strong><span>Projects</span></div></article><article><Clapperboard /><div><strong>{studio?.projects.reduce((sum, item) => sum + item.scenes.length, 0) ?? 0}</strong><span>Scenes</span></div></article><article><CheckCircle2 /><div><strong>{studio?.projects.reduce((sum, item) => sum + item.scenes.filter((shot) => shot.status === "approved").length, 0) ?? 0}</strong><span>Approved</span></div></article></div><div className="vs-project-table">{studio?.projects.map((item) => <article key={item.id}><div className="vs-project-poster"><Film /><span>{item.aspectRatio}</span></div><div className="vs-project-copy"><span>{item.worldId} / {item.sourceEpisodeId}</span><h3>{item.name}</h3><p>{item.directorBrief || "No director brief yet."}</p><div><i style={{ width: `${item.scenes.length ? item.scenes.filter((shot) => shot.status === "approved").length / item.scenes.length * 100 : 0}%` }} /></div><small>{item.scenes.length} scenes / Updated {new Date(item.updatedAt).toLocaleDateString()}</small></div><div className="vs-project-actions"><button type="button" className="vs-primary" onClick={() => { setSelectedProjectId(item.id); setSelectedSceneId(item.scenes[0]?.id || ""); setTab("storyboard"); }}>Continue</button><button type="button" onClick={() => void deleteProject(item)} disabled={working === `delete-${item.id}`}><Trash2 size={15} /></button></div></article>)}</div></div>}

        {tab === "assets" && <div className="vs-library-page"><div className="vs-library-tools"><div><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search characters, worlds, props and revisions" /></div><span className="vs-library-scope"><Archive size={15} />All reusable references</span></div><div className="vs-asset-grid">{assets.map((asset) => <article key={asset.id}><div><Image size={28} /></div><span>{asset.type}</span><strong>{asset.id.split(":").slice(1).join(":").replace(/-/g, " ")}</strong><small>Used by {asset.usedBy} scene(s)</small><button type="button" onClick={() => void bindAssetToScene(asset.id)} disabled={!scene || scene.referenceAssetIds.includes(asset.id)}>{scene?.referenceAssetIds.includes(asset.id) ? "Bound to selected scene" : "Use as reference"}</button></article>)}</div></div>}

        {tab === "jobs" && <div className="vs-library-page">
          <div className="vs-budget-hero"><div><span>Project budget</span><strong>${project?.budget.spent.toFixed(2) ?? "0.00"} spent</strong><small>${project?.budget.limit.toFixed(2) ?? "0.00"} hard limit / ${estimatedProjectCost.toFixed(2)} storyboard estimate</small></div><div className="vs-budget-bar"><i style={{ width: `${project ? Math.min(100, project.budget.spent / project.budget.limit * 100) : 0}%` }} /></div><div className="vs-budget-stats"><span><b>{readyScenes}</b> ready</span><span><b>{approvedScenes}</b> approved</span><span><b>{blockedScenes}</b> blocked</span></div></div>
          <div className="vs-job-results">{projectJobs.length ? projectJobs.map((job) => {
            const targetScene = project?.scenes.find((item) => job.label.endsWith(`/ ${item.title}`));
            const qc = targetScene?.revisions.find((item) => item.id === targetScene.selectedRevisionId)?.qc;
            return <article key={job.id} className="vs-result-card">
              <div className="vs-result-preview">{job.outputUrl ? <video src={job.outputUrl} controls preload="metadata" /> : <div><LoaderCircle className={job.status === "queued" || job.status === "processing" ? "spin" : ""} size={28} /><strong>{job.status === "dry_run" ? "Dry run only" : job.status === "failed" ? "Generation failed" : "Video is processing"}</strong><span>{job.error || "You can leave this page. The saved job refreshes automatically."}</span></div>}</div>
              <div className="vs-result-info"><div><span>{job.provider || "local"} / {job.modelId || "video"}</span><h3>{job.label}</h3><small>{job.requestId || job.id}</small></div><b className={`job-${job.status}`}>{job.status}</b>
                {qc ? <div className={`vs-qc-result ${qc.pass ? "pass" : "fail"}`}><ShieldCheck size={16} /><span><strong>Vision QC {qc.score}/100</strong><small>{qc.pass ? "Approved" : `${qc.blockers.length} blocker(s); quarantined`}</small></span></div> : null}
                <div className="vs-result-actions">{job.status === "queued" || job.status === "processing" ? <button type="button" onClick={() => void pollJob(job)} disabled={working === `poll-${job.id}`}><RefreshCw size={15} />Refresh status</button> : null}{job.outputUrl && targetScene ? <button type="button" onClick={() => void runVideoQc(job, targetScene)} disabled={working === `qc-${job.id}`}><Eye size={15} />{working === `qc-${job.id}` ? "Inspecting..." : "Run vision QC"}</button> : null}{job.outputUrl ? <a href={job.outputUrl} target="_blank" rel="noreferrer" download><Download size={15} />Download</a> : null}{targetScene ? <button type="button" onClick={() => { setSelectedSceneId(targetScene.id); setTab("storyboard"); }}><RotateCcw size={15} />Edit or retake</button> : null}</div>
              </div>
            </article>;
          }) : <div className="vs-empty-jobs"><Clock3 size={28} /><strong>No provider jobs for this project.</strong><span>Run preflight, review the quote, then submit one approved shot.</span></div>}</div>
        </div>}
      </main>
    </div>
  );
}
