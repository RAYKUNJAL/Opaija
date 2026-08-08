import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  Download,
  Film,
  GitBranch,
  GripVertical,
  ImageIcon,
  Layers3,
  Link2,
  LoaderCircle,
  PackageCheck,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Unlink,
  Wand2,
  X,
} from "lucide-react";
import { apiUrl } from "../lib/api";
import "./RemixStudioView.css";

type RemixSourceKind = "book" | "video";
type RemixConversionKind = "book_to_video" | "video_to_book";
type RemixOutputKind = "vertical_short" | "long_video" | "comic_book" | "graphic_novel" | "art_book";
type RemixBookFormat = Extract<RemixOutputKind, "comic_book" | "graphic_novel" | "art_book">;
type RemixNodeKind = "source" | "chapter" | "scene" | "beat" | "script" | "dialogue" | "character" | "prompt" | "asset" | "qc";
type ProjectStatus = "draft" | "planning" | "ready" | "materialized" | "archived";
type NoticeTone = "success" | "error" | "info";
type BusyAction = "create" | "save" | "materialize" | "manifest" | "vibeframe" | "refresh" | null;

type QcState = {
  status: "unreviewed" | "pending" | "passed" | "failed" | "waived";
  score?: number;
  blockers: string[];
  findings: string[];
  policyVersion?: string;
  checkedAt?: string;
  raw?: Record<string, unknown>;
};

type RemixProvenance = {
  remixProjectId: string;
  sourceKind: RemixSourceKind;
  sourceProjectId: string;
  sourceVersion?: string | number;
  sourceNodeId?: string;
  sourcePath?: string;
  sourceLabel?: string;
  importedAt: string;
  lineage: Array<{
    system: "book-builder" | "video-studio" | "remix-studio";
    projectId: string;
    nodeId?: string;
    version?: string | number;
  }>;
};

type ContentNode = {
  id: string;
  kind: RemixNodeKind;
  title: string;
  order?: number;
  data: Record<string, unknown>;
  provenance: RemixProvenance;
  qc: QcState;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ContentEdge = {
  id: string;
  from: string;
  to: string;
  relation: "contains" | "derived_from" | "features_character" | "uses_prompt" | "uses_asset" | "has_dialogue" | "has_qc" | "groups";
};

type RemixOutputGroup = {
  id: string;
  order: number;
  kind: RemixOutputKind;
  title: string;
  description: string;
  beatNodeIds: string[];
  target: {
    aspectRatio?: "9:16" | "16:9";
    durationSec?: number;
    bookFormat?: RemixBookFormat;
  };
  status: "draft" | "ready" | "materialized" | "archived";
  createdAt: string;
  updatedAt: string;
};

type MaterializationRecord = {
  id: string;
  outputGroupId: string;
  outputKind: RemixOutputKind;
  targetSystem: "book-builder" | "video-studio";
  targetProjectId?: string;
  targetChapterId?: string;
  contentRevision: number;
  status: "completed" | "failed" | "skipped";
  zeroSpend: true;
  error?: string;
  createdAt: string;
};

type RemixArtifactRecord = {
  id: string;
  type: "materialization-manifest" | "vibeframe-handoff" | "vibeframe-manifest";
  relativePath: string;
  projectVersion: number;
  createdAt: string;
};

type RemixProject = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  conversion: RemixConversionKind;
  source: {
    kind: RemixSourceKind;
    projectId: string;
    label: string;
    version?: string | number;
  };
  sourceProvenance: RemixProvenance;
  graph: { schemaVersion: "opaija.remix-graph.v1"; nodes: ContentNode[]; edges: ContentEdge[] };
  plan: { title: string; summary: string; notes: string; outputGroups: RemixOutputGroup[] };
  materializations: MaterializationRecord[];
  artifacts: RemixArtifactRecord[];
  version: number;
  contentRevision: number;
  createdAt: string;
  updatedAt: string;
};

type RemixProjectSummary = Omit<RemixProject, "graph"> & { graphSummary: Record<string, number> };

type BookSource = {
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

type VideoSource = {
  id: string;
  name: string;
  status: string;
  sceneCount: number;
  updatedAt: string;
  sourceProvenance?: Record<string, unknown>;
};

type RemixStudioHealth = {
  ok: true;
  schemaVersion: "opaija.remix-graph.v1";
  storagePath: string;
  projectCount: number;
  paidExecutionAvailable: false;
  vibeFrameMode: "adapter-handoff-only";
};

type RemixManifest = {
  schemaVersion: "opaija.remix-manifest.v1";
  id: string;
  type: "materialization" | "vibeframe";
  projectId: string;
  projectVersion: number;
  contentRevision: number;
  createdAt: string;
  zeroSpend: true;
  sourceProvenance: RemixProvenance;
  outputGroups: Array<{ id: string; kind: RemixOutputKind; title: string; beatNodeIds: string[] }>;
  materializations: MaterializationRecord[];
  artifactInventory: Array<{ nodeId: string; mediaKind: string; uri?: string; sourcePath?: string; qcStatus: QcState["status"] }>;
  details: Record<string, unknown>;
  checksum: string;
};

type ManifestListItem = RemixArtifactRecord & { manifest: RemixManifest };

type VibeFrameHandoff = {
  schemaVersion: "opaija.vibeframe.storyboard.v1";
  handoffId: string;
  projectId: string;
  projectVersion: number;
  createdAt: string;
  executionPolicy: {
    adapterOnly: true;
    invokeAdapter: false;
    paidWorkAllowed: false;
    generationRequested: false;
  };
  projectBrief: {
    title: string;
    description: string;
    conversion: RemixConversionKind;
    source: RemixProject["source"];
    sourceProvenance: RemixProvenance;
    characters: Array<{ id: string; name: string; description: string; provenance: RemixProvenance }>;
    scripts: Array<{ id: string; title: string; text: string }>;
  };
  outputGroups: RemixOutputGroup[];
  storyboard: Array<{
    id: string;
    order: number;
    title: string;
    action: string;
    narration: string;
    dialogueLines: Array<{ speaker: string; text: string }>;
    characters: string[];
    setting: string;
    shotType: string;
    camera: string;
    durationSec: number;
    prompt: string;
    negativePrompt: string;
    assetReferences: Array<{ nodeId: string; mediaKind: string; uri?: string; qcStatus: QcState["status"] }>;
    qc: QcState;
    provenance: RemixProvenance;
  }>;
};

type CreateForm = {
  sourceKind: RemixSourceKind;
  sourceProjectId: string;
  name: string;
  description: string;
  shortCount: number;
  includeLongVideo: boolean;
  bookFormats: RemixBookFormat[];
};

const BOOK_FORMATS: Array<{ kind: RemixBookFormat; label: string; detail: string }> = [
  { kind: "comic_book", label: "Comic book", detail: "Sequential panels and concise issue pacing" },
  { kind: "graphic_novel", label: "Graphic novel", detail: "Long-form cinematic page architecture" },
  { kind: "art_book", label: "Art book", detail: "Image-led editorial presentation" },
];

const OUTPUT_LABELS: Record<RemixOutputKind, string> = {
  vertical_short: "Vertical short",
  long_video: "Long video",
  comic_book: "Comic book",
  graphic_novel: "Graphic novel",
  art_book: "Art book",
};

function authHeaders(json = false) {
  const token = localStorage.getItem("opaija_admin_token") ?? sessionStorage.getItem("opaija_admin_token") ?? "";
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "x-admin-session": token } : {}),
  };
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  Object.entries(authHeaders(init.body !== undefined)).forEach(([key, value]) => headers.set(key, value));
  const response = await fetch(apiUrl(path), { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload;
}

function nodeText(node: ContentNode, key: string) {
  const value = node.data[key];
  return typeof value === "string" ? value : "";
}

function nodeNumber(node: ContentNode, key: string, fallback: number) {
  const value = Number(node.data[key]);
  return Number.isFinite(value) ? value : fallback;
}

function nodeStrings(node: ContentNode, key: string) {
  const value = node.data[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function safeLocalId(prefix: string) {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${token}`;
}

function splitBeatIds(ids: string[], count: number) {
  if (!ids.length) return Array.from({ length: count }, () => [] as string[]);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * ids.length) / count);
    const end = Math.floor(((index + 1) * ids.length) / count);
    return end > start ? ids.slice(start, end) : [ids[index % ids.length]];
  });
}

function createLocalGroup(kind: RemixOutputKind, order: number, beatNodeIds: string[], projectName: string): RemixOutputGroup {
  const now = new Date().toISOString();
  const shortNumber = kind === "vertical_short" ? ` ${order}` : "";
  return {
    id: safeLocalId("output"),
    order,
    kind,
    title: `${projectName} ${OUTPUT_LABELS[kind]}${shortNumber}`,
    description: `${OUTPUT_LABELS[kind]} adaptation preserving the selected canonical beat sequence and provenance.`,
    beatNodeIds,
    target: kind === "vertical_short"
      ? { aspectRatio: "9:16", durationSec: Math.max(15, beatNodeIds.length * 8) }
      : kind === "long_video"
        ? { aspectRatio: "16:9", durationSec: Math.max(60, beatNodeIds.length * 8) }
        : { bookFormat: kind },
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${remainder}s`;
}

function downloadJson(value: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RemixStudioView() {
  const [health, setHealth] = useState<RemixStudioHealth | null>(null);
  const [bookSources, setBookSources] = useState<BookSource[]>([]);
  const [videoSources, setVideoSources] = useState<VideoSource[]>([]);
  const [projects, setProjects] = useState<RemixProjectSummary[]>([]);
  const [project, setProject] = useState<RemixProject | null>(null);
  const [manifests, setManifests] = useState<ManifestListItem[]>([]);
  const [handoff, setHandoff] = useState<VibeFrameHandoff | null>(null);
  const [selectedOutputGroupIds, setSelectedOutputGroupIds] = useState<string[]>([]);
  const [dirtyNodeIds, setDirtyNodeIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [forceMaterialize, setForceMaterialize] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({
    sourceKind: "book",
    sourceProjectId: "",
    name: "",
    description: "",
    shortCount: 3,
    includeLongVideo: true,
    bookFormats: ["graphic_novel"],
  });

  async function fetchHandoffForProject(nextProject: RemixProject) {
    const artifact = nextProject.artifacts.find((item) => item.type === "vibeframe-handoff");
    if (!artifact) return null;
    return requestJson<VibeFrameHandoff>(
      `/api/remix-studio/projects/${nextProject.id}/vibeframe-handoffs/${artifact.id}`,
    ).catch(() => null);
  }

  async function openProject(projectId: string) {
    setBusy("refresh");
    try {
      const [nextProject, nextManifests] = await Promise.all([
        requestJson<RemixProject>(`/api/remix-studio/projects/${projectId}`),
        requestJson<ManifestListItem[]>(`/api/remix-studio/projects/${projectId}/manifests`),
      ]);
      const nextHandoff = await fetchHandoffForProject(nextProject);
      setProject(nextProject);
      setManifests(nextManifests);
      setHandoff(nextHandoff);
      setSelectedOutputGroupIds(nextProject.plan.outputGroups.map((group) => group.id));
      setDirtyNodeIds([]);
      setDirty(false);
      setCreating(false);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Project could not be opened." });
    } finally {
      setBusy(null);
    }
  }

  async function refreshProjectList() {
    const nextProjects = await requestJson<RemixProjectSummary[]>("/api/remix-studio/projects");
    setProjects(nextProjects);
    return nextProjects;
  }

  useEffect(() => {
    let active = true;
    async function loadStudio() {
      try {
        const [nextHealth, nextBooks, nextVideos, nextProjects] = await Promise.all([
          requestJson<RemixStudioHealth>("/api/remix-studio/health"),
          requestJson<BookSource[]>("/api/remix-studio/sources/books"),
          requestJson<VideoSource[]>("/api/remix-studio/sources/videos"),
          requestJson<RemixProjectSummary[]>("/api/remix-studio/projects"),
        ]);
        if (!active) return;
        setHealth(nextHealth);
        setBookSources(nextBooks);
        setVideoSources(nextVideos);
        setProjects(nextProjects);
        const preferredKind: RemixSourceKind = nextBooks.length ? "book" : "video";
        const preferredId = nextBooks[0]?.projectId ?? nextVideos[0]?.id ?? "";
        setCreateForm((current) => ({ ...current, sourceKind: preferredKind, sourceProjectId: preferredId }));
        if (nextProjects.length) {
          const [firstProject, firstManifests] = await Promise.all([
            requestJson<RemixProject>(`/api/remix-studio/projects/${nextProjects[0].id}`),
            requestJson<ManifestListItem[]>(`/api/remix-studio/projects/${nextProjects[0].id}/manifests`),
          ]);
          if (!active) return;
          setProject(firstProject);
          setManifests(firstManifests);
          setHandoff(await fetchHandoffForProject(firstProject));
          setSelectedOutputGroupIds(firstProject.plan.outputGroups.map((group) => group.id));
        } else {
          setCreating(true);
        }
      } catch (error) {
        if (active) setNotice({ tone: "error", message: error instanceof Error ? error.message : "Remix Studio could not be loaded." });
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadStudio();
    return () => { active = false; };
  }, []);

  const beats = useMemo(
    () => project?.graph.nodes.filter((node) => node.kind === "beat").sort((left, right) => (left.order ?? 9999) - (right.order ?? 9999)) ?? [],
    [project],
  );
  const assetNodes = useMemo(() => project?.graph.nodes.filter((node) => node.kind === "asset") ?? [], [project]);
  const linkedBeatCount = useMemo(() => beats.filter((beat) => nodeStrings(beat, "assetNodeIds").length > 0).length, [beats]);
  const sourceGapCount = useMemo(
    () => beats.filter((beat) => !beat.provenance.sourceNodeId && !beat.provenance.sourcePath).length,
    [beats],
  );
  const productionGapCount = useMemo(
    () => beats.filter((beat) => !nodeText(beat, "action") || !nodeText(beat, "prompt")).length,
    [beats],
  );
  const totalDuration = useMemo(() => beats.reduce((total, beat) => total + nodeNumber(beat, "durationSec", 6), 0), [beats]);
  const successfulMaterializations = project?.materializations.filter((record) => record.status === "completed") ?? [];
  const failedMaterializations = project?.materializations.filter((record) => record.status === "failed") ?? [];
  const bookTarget = successfulMaterializations.find((record) => record.targetSystem === "book-builder" && record.targetProjectId)?.targetProjectId
    ?? (project?.source.kind === "book" ? project.source.projectId : undefined);
  const coverage = beats.length ? (linkedBeatCount / beats.length) * 100 : 0;
  const outputGroups = project?.plan.outputGroups ?? [];
  const shortGroups = outputGroups.filter((group) => group.kind === "vertical_short");
  const longVideoGroup = outputGroups.find((group) => group.kind === "long_video");

  function updateProjectLocal(updater: (current: RemixProject) => RemixProject) {
    setProject((current) => current ? updater(current) : current);
    setDirty(true);
  }

  function updatePlan(patch: Partial<RemixProject["plan"]>) {
    updateProjectLocal((current) => ({ ...current, plan: { ...current.plan, ...patch } }));
  }

  function updateOutputGroups(groups: RemixOutputGroup[]) {
    const ordered = groups.map((group, index) => ({ ...group, order: index + 1 }));
    updatePlan({ outputGroups: ordered });
    setSelectedOutputGroupIds((current) => {
      const valid = current.filter((id) => ordered.some((group) => group.id === id));
      return valid.length ? valid : ordered.map((group) => group.id);
    });
  }

  function updateOutputGroup(groupId: string, patch: Partial<RemixOutputGroup>) {
    updateOutputGroups(outputGroups.map((group) => group.id === groupId ? { ...group, ...patch, target: patch.target ?? group.target } : group));
  }

  function updateBeat(nodeId: string, patch: { title?: string; order?: number; data?: Record<string, unknown> }) {
    updateProjectLocal((current) => ({
      ...current,
      graph: {
        ...current.graph,
        nodes: current.graph.nodes.map((node) => node.id === nodeId
          ? { ...node, ...patch, data: patch.data ? { ...node.data, ...patch.data } : node.data }
          : node),
      },
    }));
    setDirtyNodeIds((current) => current.includes(nodeId) ? current : [...current, nodeId]);
  }

  function moveBeat(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= beats.length) return;
    const ordered = [...beats];
    [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    const orders = new Map(ordered.map((beat, beatIndex) => [beat.id, beatIndex + 1]));
    updateProjectLocal((current) => ({
      ...current,
      graph: { ...current.graph, nodes: current.graph.nodes.map((node) => orders.has(node.id) ? { ...node, order: orders.get(node.id) } : node) },
    }));
    setDirtyNodeIds((current) => Array.from(new Set([...current, ...ordered.map((beat) => beat.id)])));
  }

  function setShortCount(count: number) {
    if (!project) return;
    const safeCount = Math.max(2, Math.min(6, count));
    const beatGroups = splitBeatIds(beats.map((beat) => beat.id), safeCount);
    const rebuilt = Array.from({ length: safeCount }, (_, index) => {
      const current = shortGroups[index];
      return current
        ? { ...current, order: index + 1, beatNodeIds: beatGroups[index], target: { ...current.target, aspectRatio: "9:16" as const } }
        : createLocalGroup("vertical_short", index + 1, beatGroups[index], project.name);
    });
    updateOutputGroups([...rebuilt, ...outputGroups.filter((group) => group.kind !== "vertical_short")]);
  }

  function toggleLongVideo() {
    if (!project) return;
    if (longVideoGroup) {
      updateOutputGroups(outputGroups.filter((group) => group.id !== longVideoGroup.id));
      return;
    }
    updateOutputGroups([
      ...outputGroups,
      createLocalGroup("long_video", outputGroups.length + 1, beats.map((beat) => beat.id), project.name),
    ]);
  }

  function toggleBookFormat(kind: RemixBookFormat) {
    if (!project) return;
    const existing = outputGroups.find((group) => group.kind === kind);
    if (existing) {
      if (outputGroups.length === 1) {
        setNotice({ tone: "info", message: "Video-to-book plans need at least one book format." });
        return;
      }
      updateOutputGroups(outputGroups.filter((group) => group.id !== existing.id));
      return;
    }
    updateOutputGroups([...outputGroups, createLocalGroup(kind, outputGroups.length + 1, beats.map((beat) => beat.id), project.name)]);
  }

  function toggleOutputSelection(groupId: string) {
    setSelectedOutputGroupIds((current) => current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]);
  }

  function selectSourceKind(kind: RemixSourceKind) {
    const firstId = kind === "book" ? bookSources[0]?.projectId ?? "" : videoSources[0]?.id ?? "";
    setCreateForm((current) => ({ ...current, sourceKind: kind, sourceProjectId: firstId }));
  }

  async function createProject() {
    if (!createForm.sourceProjectId) {
      setNotice({ tone: "error", message: "Choose an existing Book Builder or Video Studio source first." });
      return;
    }
    setBusy("create");
    setNotice(null);
    try {
      const source = createForm.sourceKind === "book"
        ? bookSources.find((item) => item.projectId === createForm.sourceProjectId)
        : videoSources.find((item) => item.id === createForm.sourceProjectId);
      const created = await requestJson<RemixProject>("/api/remix-studio/projects", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name.trim() || undefined,
          description: createForm.description.trim() || undefined,
          source: {
            kind: createForm.sourceKind,
            projectId: createForm.sourceProjectId,
            label: source ? ("title" in source ? source.title : source.name) : undefined,
          },
          outputs: createForm.sourceKind === "book"
            ? { shortCount: createForm.shortCount, includeLongVideo: createForm.includeLongVideo }
            : { bookFormats: createForm.bookFormats },
        }),
      });
      await refreshProjectList();
      setProject(created);
      setManifests([]);
      setHandoff(null);
      setSelectedOutputGroupIds(created.plan.outputGroups.map((group) => group.id));
      setDirtyNodeIds([]);
      setDirty(false);
      setCreating(false);
      setNotice({ tone: "success", message: `${created.name} imported with its canonical source graph.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Remix project could not be created." });
    } finally {
      setBusy(null);
    }
  }

  async function persistChanges(showNotice = true) {
    if (!project) throw new Error("Open a Remix project first.");
    let latest = await requestJson<RemixProject>(`/api/remix-studio/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: project.name, description: project.description, status: project.status }),
    });
    latest = await requestJson<RemixProject>(`/api/remix-studio/projects/${project.id}/plan`, {
      method: "PUT",
      body: JSON.stringify({
        title: project.plan.title,
        summary: project.plan.summary,
        notes: project.plan.notes,
        outputGroups: project.plan.outputGroups,
      }),
    });
    for (const nodeId of dirtyNodeIds) {
      const node = project.graph.nodes.find((item) => item.id === nodeId);
      if (!node) continue;
      latest = await requestJson<RemixProject>(`/api/remix-studio/projects/${project.id}/nodes/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: node.title, order: node.order, data: node.data, qc: node.qc }),
      });
    }
    setProject(latest);
    setDirtyNodeIds([]);
    setDirty(false);
    await refreshProjectList();
    if (showNotice) setNotice({ tone: "success", message: `Saved version ${latest.version}, content revision ${latest.contentRevision}.` });
    return latest;
  }

  async function saveProject() {
    if (!project) return;
    setBusy("save");
    setNotice(null);
    try {
      await persistChanges(true);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Project could not be saved." });
    } finally {
      setBusy(null);
    }
  }

  async function materialize() {
    if (!project) return;
    if (!selectedOutputGroupIds.length) {
      setNotice({ tone: "info", message: "Select at least one output target to materialize." });
      return;
    }
    setBusy("materialize");
    setNotice(null);
    try {
      const current = dirty ? await persistChanges(false) : project;
      const result = await requestJson<{ project: RemixProject; records: MaterializationRecord[]; manifest: RemixManifest }>(
        `/api/remix-studio/projects/${current.id}/materialize`,
        { method: "POST", body: JSON.stringify({ outputGroupIds: selectedOutputGroupIds, force: forceMaterialize }) },
      );
      setProject(result.project);
      setManifests(await requestJson<ManifestListItem[]>(`/api/remix-studio/projects/${current.id}/manifests`));
      await refreshProjectList();
      const completed = result.records.filter((record) => record.status === "completed").length;
      const skipped = result.records.filter((record) => record.status === "skipped").length;
      const failed = result.records.filter((record) => record.status === "failed");
      setNotice({
        tone: failed.length ? "error" : "success",
        message: failed.length
          ? failed.map((record) => record.error ?? `${OUTPUT_LABELS[record.outputKind]} failed`).join(" · ")
          : `${completed} target${completed === 1 ? "" : "s"} materialized${skipped ? `; ${skipped} current target${skipped === 1 ? " was" : "s were"} skipped` : ""}. Zero paid generation was invoked.`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Materialization failed." });
    } finally {
      setBusy(null);
    }
  }

  async function exportLatestManifest() {
    if (!project) return;
    setBusy("manifest");
    setNotice(null);
    try {
      const available = manifests.length
        ? manifests
        : await requestJson<ManifestListItem[]>(`/api/remix-studio/projects/${project.id}/manifests`);
      setManifests(available);
      const latest = available[0];
      if (!latest) throw new Error("Materialize a target or build a VibeFrame handoff before exporting a manifest.");
      const manifest = await requestJson<RemixManifest>(`/api/remix-studio/projects/${project.id}/manifests/${latest.id}`);
      downloadJson(manifest, `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "remix"}-${manifest.type}-manifest.json`);
      setNotice({ tone: "success", message: `${manifest.type === "vibeframe" ? "VibeFrame" : "Materialization"} manifest exported with checksum ${manifest.checksum.slice(0, 12)}…` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Manifest could not be exported." });
    } finally {
      setBusy(null);
    }
  }

  async function exportManifestById(manifestId: string) {
    if (!project) return;
    setBusy("manifest");
    setNotice(null);
    try {
      const manifest = await requestJson<RemixManifest>(`/api/remix-studio/projects/${project.id}/manifests/${manifestId}`);
      downloadJson(manifest, `${manifest.type}-${manifest.id}.json`);
      setNotice({ tone: "success", message: `${manifest.type} manifest exported from stored project artifacts.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Manifest could not be exported." });
    } finally {
      setBusy(null);
    }
  }

  async function buildOrRefreshHandoff() {
    if (!project) return;
    if (!selectedOutputGroupIds.length) {
      setNotice({ tone: "info", message: "Select at least one output target for the VibeFrame packet." });
      return;
    }
    setBusy("vibeframe");
    setNotice(null);
    try {
      const current = dirty ? await persistChanges(false) : project;
      const result = await requestJson<{ project: RemixProject; handoff: VibeFrameHandoff; manifest: RemixManifest }>(
        `/api/remix-studio/projects/${current.id}/vibeframe-handoff`,
        { method: "POST", body: JSON.stringify({ outputGroupIds: selectedOutputGroupIds }) },
      );
      setProject(result.project);
      setHandoff(result.handoff);
      setManifests(await requestJson<ManifestListItem[]>(`/api/remix-studio/projects/${current.id}/manifests`));
      setNotice({ tone: "success", message: `Adapter-only VibeFrame packet created with ${result.handoff.storyboard.length} storyboard beats. No provider was invoked.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "VibeFrame handoff could not be built." });
    } finally {
      setBusy(null);
    }
  }

  function openBuilder() {
    if (!bookTarget) {
      setNotice({ tone: "info", message: "Materialize a book output before opening Book Builder." });
      return;
    }
    sessionStorage.setItem("opaija_open_book_project", bookTarget);
    window.location.hash = "book-builder";
  }

  if (loading) {
    return (
      <section className="remix-studio rs-loading-state">
        <LoaderCircle className="rs-spin" size={28} />
        <strong>Opening Remix Studio</strong>
        <span>Loading source libraries, projects and stored manifests…</span>
      </section>
    );
  }

  const sourceOptions = createForm.sourceKind === "book" ? bookSources : videoSources;
  const hasAnySource = bookSources.length > 0 || videoSources.length > 0;

  return (
    <section className="remix-studio">
      <header className="rs-topbar">
        <div className="rs-brand">
          <span className="rs-brand-mark">R</span>
          <div><strong>Remix Studio</strong><small>Canonical conversion desk</small></div>
        </div>

        <div className="rs-project-switcher">
          <span>Remix project</span>
          <select
            aria-label="Open Remix project"
            value={project?.id ?? ""}
            disabled={!projects.length || busy !== null}
            onChange={(event) => void openProject(event.target.value)}
          >
            {!projects.length && <option value="">No projects yet</option>}
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}
          </select>
          <button type="button" onClick={() => setCreating(true)}><Plus size={15} /> New</button>
        </div>

        <div className="rs-top-status">
          <span className={dirty ? "dirty" : "saved"}>{dirty ? "Unsaved changes" : project ? "Project saved" : "Library ready"}</span>
          <small>{project ? `v${project.version} · revision ${project.contentRevision}` : `${projects.length} projects`}</small>
        </div>
      </header>

      {notice && (
        <div className={`rs-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.tone === "success" ? <CheckCircle2 size={17} /> : notice.tone === "error" ? <TriangleAlert size={17} /> : <Sparkles size={17} />}
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {creating && (
        <div className="rs-create-overlay" role="dialog" aria-modal="true" aria-labelledby="rs-create-title">
          <section className="rs-create-card">
            {project && <button type="button" className="rs-create-close" onClick={() => setCreating(false)} aria-label="Close"><X size={19} /></button>}
            <span className="rs-kicker"><Sparkles size={14} /> Canonical starting point</span>
            <h1 id="rs-create-title">Create a Remix project</h1>
            <p>Choose a real source project. Remix Studio imports its graph and creates only conversion targets allowed by the server contract.</p>

            <div className="rs-create-kind" role="group" aria-label="Source system">
              <button type="button" className={createForm.sourceKind === "book" ? "active" : ""} onClick={() => selectSourceKind("book")} disabled={!bookSources.length}>
                <BookOpen size={20} /><span><strong>Book Builder source</strong><small>{bookSources.length} available · creates video outputs</small></span>
              </button>
              <button type="button" className={createForm.sourceKind === "video" ? "active" : ""} onClick={() => selectSourceKind("video")} disabled={!videoSources.length}>
                <Clapperboard size={20} /><span><strong>Video Studio source</strong><small>{videoSources.length} available · creates book outputs</small></span>
              </button>
            </div>

            {!hasAnySource ? (
              <div className="rs-no-sources">
                <TriangleAlert size={24} />
                <div><strong>No eligible sources yet</strong><span>Create a Book Builder or Video Studio project first, then return here to preserve its provenance.</span></div>
                <button type="button" onClick={() => { window.location.hash = "book-builder"; }}><BookOpen size={15} /> Open Book Builder</button>
              </div>
            ) : (
              <>
                <div className="rs-create-fields">
                  <label className="wide">Source project
                    <select value={createForm.sourceProjectId} onChange={(event) => setCreateForm({ ...createForm, sourceProjectId: event.target.value })}>
                      {sourceOptions.map((source) => (
                        <option key={"projectId" in source ? source.projectId : source.id} value={"projectId" in source ? source.projectId : source.id}>
                          {"title" in source ? `${source.title} · ${source.chapterCount} chapters` : `${source.name} · ${source.sceneCount} scenes`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Remix name<input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Defaults to source name + Remix" /></label>
                  <label>Description<input value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} placeholder="What this conversion is for" /></label>
                </div>

                {createForm.sourceKind === "book" ? (
                  <div className="rs-create-output-plan">
                    <div><span>Vertical shorts</span><div><button type="button" onClick={() => setCreateForm({ ...createForm, shortCount: Math.max(2, createForm.shortCount - 1) })}>−</button><strong>{createForm.shortCount}</strong><button type="button" onClick={() => setCreateForm({ ...createForm, shortCount: Math.min(6, createForm.shortCount + 1) })}>+</button></div><small>Server allows 2–6 short groups</small></div>
                    <label className={createForm.includeLongVideo ? "active" : ""}><input type="checkbox" checked={createForm.includeLongVideo} onChange={(event) => setCreateForm({ ...createForm, includeLongVideo: event.target.checked })} /><span><Check size={14} /></span><div><strong>Include long video</strong><small>Complete ordered beat sequence · 16:9</small></div></label>
                  </div>
                ) : (
                  <div className="rs-create-book-formats">
                    {BOOK_FORMATS.map((format) => {
                      const checked = createForm.bookFormats.includes(format.kind);
                      return <label key={format.kind} className={checked ? "active" : ""}><input type="checkbox" checked={checked} onChange={() => setCreateForm((current) => ({ ...current, bookFormats: checked ? current.bookFormats.filter((item) => item !== format.kind) : [...current.bookFormats, format.kind] }))} /><span>{checked && <Check size={14} />}</span><div><strong>{format.label}</strong><small>{format.detail}</small></div></label>;
                    })}
                  </div>
                )}

                <button type="button" className="rs-create-submit" disabled={busy !== null || (createForm.sourceKind === "video" && !createForm.bookFormats.length)} onClick={() => void createProject()}>
                  {busy === "create" ? <LoaderCircle className="rs-spin" size={17} /> : <Sparkles size={17} />} Import source and create plan
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {!project ? (
        <div className="rs-empty-library">
          <span><GitBranch size={34} /></span>
          <div><small>Remix library</small><h1>No Remix projects yet.</h1><p>Start from a real Book Builder or Video Studio project and turn its canonical graph into reusable cross-media targets.</p></div>
          <button type="button" onClick={() => setCreating(true)} disabled={!hasAnySource}><Plus size={17} /> Create first Remix</button>
        </div>
      ) : (
        <>
          <div className="rs-page">
            <section className="rs-director-card">
              <div className="rs-director-intro">
                <span className="rs-kicker"><Wand2 size={14} /> {project.conversion.replace(/_/g, " ")}</span>
                <input className="rs-hero-title" aria-label="Remix project name" value={project.name} onChange={(event) => updateProjectLocal((current) => ({ ...current, name: event.target.value }))} />
                <textarea className="rs-project-description" aria-label="Remix project description" value={project.description} onChange={(event) => updateProjectLocal((current) => ({ ...current, description: event.target.value }))} />
                <div className="rs-source-lock">
                  <div className="rs-source-icon">{project.source.kind === "book" ? <BookOpen size={20} /> : <Clapperboard size={20} />}</div>
                  <div><small>Immutable source</small><strong>{project.source.label}</strong><span>{project.source.kind === "book" ? "Book Builder" : "Video Studio"} · {project.source.version ?? "current import"}</span></div>
                  <ShieldCheck size={20} />
                </div>
              </div>

              <div className="rs-direction-pad">
                <label htmlFor="remix-direction">Plan notes passed downstream</label>
                <textarea id="remix-direction" value={project.plan.notes} onChange={(event) => updatePlan({ notes: event.target.value })} />
                <label htmlFor="remix-summary">Cross-media summary</label>
                <input id="remix-summary" value={project.plan.summary} onChange={(event) => updatePlan({ summary: event.target.value })} />
                <div className="rs-direction-meta"><span><Check size={14} /> Source lineage stays attached to every node</span><b>Revision {project.contentRevision}</b></div>
              </div>
            </section>

            <section className="rs-format-section">
              <div className="rs-section-heading">
                <div><span className="rs-kicker">Actual output groups</span><h2>Conversion targets</h2></div>
                <p>Select the groups to materialize or include in the VibeFrame packet. Target edits save through the project plan route.</p>
              </div>

              <div className="rs-family-switch rs-family-fixed">
                <div className={project.conversion === "book_to_video" ? "active" : "muted"}><span><Clapperboard size={22} /></span><div><strong>Video outputs</strong><small>Vertical shorts and optional long video</small></div>{project.conversion === "book_to_video" && <CheckCircle2 size={19} />}</div>
                <div className={project.conversion === "video_to_book" ? "active" : "muted"}><span><BookOpen size={22} /></span><div><strong>Book outputs</strong><small>Comic, graphic novel and art book</small></div>{project.conversion === "video_to_book" && <CheckCircle2 size={19} />}</div>
              </div>

              {project.conversion === "book_to_video" ? (
                <div className="rs-output-controls">
                  <div className="rs-short-control"><span>Vertical short groups</span><div><button type="button" onClick={() => setShortCount(shortGroups.length - 1)} disabled={shortGroups.length <= 2}>−</button><strong>{shortGroups.length}</strong><button type="button" onClick={() => setShortCount(shortGroups.length + 1)} disabled={shortGroups.length >= 6}>+</button></div><small>Server-enforced range: 2–6</small></div>
                  <label className={`rs-long-toggle ${longVideoGroup ? "active" : ""}`}><input type="checkbox" checked={Boolean(longVideoGroup)} onChange={toggleLongVideo} /><span>{longVideoGroup && <Check size={14} />}</span><div><strong>Long-form companion</strong><small>Full canonical beat sequence · 16:9</small></div></label>
                </div>
              ) : (
                <div className="rs-book-format-toggle">
                  {BOOK_FORMATS.map((format) => {
                    const active = outputGroups.some((group) => group.kind === format.kind);
                    return <button type="button" key={format.kind} className={active ? "active" : ""} onClick={() => toggleBookFormat(format.kind)}><span>{active && <Check size={14} />}</span><div><strong>{format.label}</strong><small>{format.detail}</small></div></button>;
                  })}
                </div>
              )}

              <div className="rs-output-group-grid">
                {outputGroups.map((group) => {
                  const selected = selectedOutputGroupIds.includes(group.id);
                  return (
                    <article key={group.id} className={`${selected ? "selected" : ""} status-${group.status}`}>
                      <header>
                        <button type="button" className="rs-group-check" onClick={() => toggleOutputSelection(group.id)} aria-label={`${selected ? "Exclude" : "Include"} ${group.title}`}>{selected && <Check size={14} />}</button>
                        <div><span>{OUTPUT_LABELS[group.kind]} · {group.status}</span><input aria-label="Output title" value={group.title} onChange={(event) => updateOutputGroup(group.id, { title: event.target.value })} /></div>
                        <b>{group.beatNodeIds.length} beats</b>
                      </header>
                      <textarea aria-label="Output description" value={group.description} onChange={(event) => updateOutputGroup(group.id, { description: event.target.value })} />
                      {group.kind === "vertical_short" || group.kind === "long_video" ? (
                        <div className="rs-group-targets">
                          <label>Frame<select value={group.target.aspectRatio ?? (group.kind === "vertical_short" ? "9:16" : "16:9")} onChange={(event) => updateOutputGroup(group.id, { target: { ...group.target, aspectRatio: event.target.value as "9:16" | "16:9" } })}><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label>
                          <label>Target seconds<input type="number" min="1" max="900" value={group.target.durationSec ?? 60} onChange={(event) => updateOutputGroup(group.id, { target: { ...group.target, durationSec: Number(event.target.value) } })} /></label>
                        </div>
                      ) : <div className="rs-book-target"><BookOpen size={15} /> {OUTPUT_LABELS[group.kind]} materialization</div>}
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="rs-workbench">
              <main className="rs-beat-panel">
                <div className="rs-panel-heading">
                  <div><span className="rs-kicker"><GitBranch size={14} /> Canonical content graph</span><h2>Editable beat graph</h2><p>Titles, ordering, action and timing save through node-scoped PATCH routes. Imported node IDs and provenance never change.</p></div>
                  <div className="rs-beat-summary"><span><strong>{beats.length}</strong> beats</span><span><strong>{formatDuration(totalDuration)}</strong> runtime</span><span className={productionGapCount ? "warning" : "good"}><strong>{productionGapCount}</strong> gaps</span></div>
                </div>

                {!beats.length ? (
                  <div className="rs-no-beats"><TriangleAlert size={22} /><div><strong>No imported beats</strong><span>This source graph has no editable beat nodes. Add scenes or chapter panels in the source studio, then create a new Remix import.</span></div></div>
                ) : (
                  <div className="rs-beat-graph">
                    {beats.map((beat, index) => {
                      const assetIds = nodeStrings(beat, "assetNodeIds");
                      const sourceVerified = Boolean(beat.provenance.sourceNodeId || beat.provenance.sourcePath);
                      const missingFields = [nodeText(beat, "action"), nodeText(beat, "prompt")].filter((value) => !value).length;
                      return (
                        <article className="rs-beat-card" key={beat.id}>
                          <div className="rs-node-rail" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span>{index < beats.length - 1 && <i />}</div>
                          <div className="rs-beat-body">
                            <div className="rs-beat-toolbar"><GripVertical size={17} /><span>{beat.kind} · node v{beat.version}</span><div className="rs-beat-order"><button type="button" onClick={() => moveBeat(index, -1)} disabled={index === 0} aria-label="Move beat up"><ArrowUp size={15} /></button><button type="button" onClick={() => moveBeat(index, 1)} disabled={index === beats.length - 1} aria-label="Move beat down"><ArrowDown size={15} /></button></div></div>
                            <div className="rs-beat-fields">
                              <label><span>Beat title</span><input value={beat.title} onChange={(event) => updateBeat(beat.id, { title: event.target.value })} /></label>
                              <label className="rs-duration-field"><span>Timing</span><div><Clock3 size={14} /><input type="number" min="1" max="900" value={nodeNumber(beat, "durationSec", 6)} onChange={(event) => updateBeat(beat.id, { data: { durationSec: Number(event.target.value) } })} /><b>sec</b></div></label>
                              <label className="rs-action-field"><span>Action and editorial intention</span><textarea rows={2} value={nodeText(beat, "action")} onChange={(event) => updateBeat(beat.id, { data: { action: event.target.value } })} /></label>
                            </div>
                            <div className="rs-beat-evidence">
                              <span className={assetIds.length ? "linked" : "gap"}>{assetIds.length ? <Link2 size={13} /> : <Unlink size={13} />}{assetIds.length} linked {assetIds.length === 1 ? "asset" : "assets"}</span>
                              <span className={`provenance ${sourceVerified ? "verified" : "missing"}`}>{sourceVerified ? <ShieldCheck size={13} /> : <TriangleAlert size={13} />}{sourceVerified ? "Source verified" : "Source gap"}</span>
                              {missingFields > 0 && <span className="gap"><Unlink size={13} /> {missingFields} required {missingFields === 1 ? "field" : "fields"}</span>}
                              <small>{beat.provenance.sourceLabel ?? beat.provenance.sourcePath ?? beat.provenance.sourceNodeId ?? "No source label"}</small>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </main>

              <aside className="rs-inspector">
                <section className="rs-inspector-card rs-asset-card">
                  <header><div><span className="rs-kicker">Graph readiness</span><h3>Assets + provenance</h3></div><ImageIcon size={20} /></header>
                  <div className="rs-big-metric"><strong>{Math.round(coverage)}%</strong><span>{linkedBeatCount} of {beats.length} beats linked</span></div>
                  <div className="rs-meter"><i style={{ width: `${coverage}%` }} /></div>
                  <div className="rs-readiness-list"><span><Layers3 size={15} /> {assetNodes.length} imported asset nodes</span><span className={sourceGapCount ? "warning" : ""}>{sourceGapCount ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}{sourceGapCount || "No"} source gaps</span><span className={productionGapCount ? "warning" : ""}>{productionGapCount ? <TriangleAlert size={15} /> : <CheckCircle2 size={15} />}{productionGapCount || "No"} action/prompt gaps</span></div>
                </section>

                <section className="rs-inspector-card rs-spend-card">
                  <header><div><span className="rs-kicker">Execution boundary</span><h3>Quote vs actual</h3></div><CircleDollarSign size={20} /></header>
                  <div className="rs-spend-total"><div><span>Quoted spend</span><strong>{money(0)}</strong></div><div><span>Actual spend</span><strong>{money(0)}</strong></div></div>
                  <div className="rs-zero-spend"><ShieldCheck size={16} /><div><strong>Zero-spend materialization</strong><span>The server creates Builder and Studio records only. It never invokes paid generation from Remix Studio.</span></div></div>
                  <div className="rs-contract-stats"><span><b>{successfulMaterializations.length}</b> completed</span><span className={failedMaterializations.length ? "warning" : ""}><b>{failedMaterializations.length}</b> failed</span><span><b>{health?.paidExecutionAvailable ? "On" : "Off"}</b> paid execution</span></div>
                </section>

                <section className="rs-inspector-card rs-manifest-card">
                  <header><div><span className="rs-kicker">Stored artifacts</span><h3>Manifests</h3></div><PackageCheck size={20} /></header>
                  {manifests.length ? <div className="rs-manifest-list">{manifests.slice(0, 3).map((item) => <button type="button" key={item.id} disabled={busy !== null} onClick={() => void exportManifestById(item.id)}><span>{item.manifest.type}</span><strong>v{item.projectVersion} · {item.manifest.checksum.slice(0, 10)}…</strong><small>{new Date(item.createdAt).toLocaleString()}</small><Download size={14} /></button>)}</div> : <div className="rs-manifest-empty">No manifests yet. Materialize a target or build a handoff.</div>}
                </section>

                <section className="rs-inspector-card rs-vibeframe-card ready">
                  <header><div><span className="rs-kicker">Adapter handoff</span><h3>VibeFrame</h3></div><Film size={20} /></header>
                  <div className="rs-handoff-status"><span>{handoff ? <CheckCircle2 size={19} /> : <Send size={19} />}</span><div><strong>{handoff ? "Storyboard packet stored" : "Ready to build packet"}</strong><small>{handoff ? `${handoff.storyboard.length} beats · ${handoff.outputGroups.length} output groups` : "Creates JSON artifacts only; it does not invoke the adapter."}</small></div></div>
                  <dl><div><dt>Packet</dt><dd>{handoff?.handoffId ?? "Not created"}</dd></div><div><dt>Policy</dt><dd>{handoff ? "Adapter only · paid work blocked" : health?.vibeFrameMode ?? "adapter-handoff-only"}</dd></div></dl>
                  <div className="rs-vibe-actions"><button type="button" onClick={() => void buildOrRefreshHandoff()} disabled={busy !== null}>{busy === "vibeframe" ? <LoaderCircle className="rs-spin" size={16} /> : <Send size={16} />}{handoff ? "Build new selected packet" : "Build handoff packet"}</button>{handoff && <button type="button" onClick={() => downloadJson(handoff, `vibeframe-${handoff.handoffId}.json`)}><Download size={15} /> JSON</button>}</div>
                </section>
              </aside>
            </div>
          </div>

          <footer className="rs-action-dock">
            <div className="rs-dock-context"><span className={productionGapCount ? "warning" : "ready"}>{productionGapCount ? <TriangleAlert size={17} /> : <PackageCheck size={17} />}</span><div><strong>{productionGapCount ? `${productionGapCount} beats need action or prompt data` : "Graph ready for zero-spend materialization"}</strong><small>{selectedOutputGroupIds.length} of {outputGroups.length} targets selected · {manifests.length} manifests</small></div></div>
            <label className="rs-force-toggle"><input type="checkbox" checked={forceMaterialize} onChange={(event) => setForceMaterialize(event.target.checked)} /><span>Force current revision</span></label>
            <div className="rs-dock-actions">
              <button type="button" className="rs-button quiet" onClick={() => void saveProject()} disabled={busy !== null || !dirty}>{busy === "save" ? <LoaderCircle className="rs-spin" size={17} /> : <Save size={17} />} Save</button>
              <button type="button" className="rs-button secondary" onClick={() => void exportLatestManifest()} disabled={busy !== null}>{busy === "manifest" ? <LoaderCircle className="rs-spin" size={17} /> : <Download size={17} />} Export manifest</button>
              <button type="button" className="rs-button secondary" onClick={openBuilder} disabled={busy !== null || !bookTarget}><BookOpen size={17} /> Open Builder</button>
              <button type="button" className="rs-button primary" onClick={() => void materialize()} disabled={busy !== null || !beats.length || !selectedOutputGroupIds.length}>{busy === "materialize" ? <LoaderCircle className="rs-spin" size={17} /> : <Sparkles size={17} />} Materialize selected</button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
