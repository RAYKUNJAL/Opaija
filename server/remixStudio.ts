import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createBookProjectFromRemix,
  getChapterPayload,
  getProject,
  listProjects as listBookProjects,
  upsertProjectSetup,
  type BookRemixBeatInput,
  type BookRemixSourceProvenance,
  type DialogueLine,
  type PanelRecord,
} from "./bookBuilder.js";
import {
  createVideoProjectFromRemix,
  listVideoProjectsForRemix,
  type VideoProject,
  type VideoRemixBeatInput,
  type VideoRemixSourceProvenance,
} from "./videoStudio.js";

export type RemixSourceKind = "book" | "video";
export type RemixConversionKind = "book_to_video" | "video_to_book";
export type RemixOutputKind = "vertical_short" | "long_video" | "comic_book" | "graphic_novel" | "art_book";
export type RemixBookFormat = Extract<RemixOutputKind, "comic_book" | "graphic_novel" | "art_book">;
export type RemixNodeKind =
  | "source"
  | "chapter"
  | "scene"
  | "beat"
  | "script"
  | "dialogue"
  | "character"
  | "prompt"
  | "asset"
  | "qc";

export type QcState = {
  status: "unreviewed" | "pending" | "passed" | "failed" | "waived";
  score?: number;
  blockers: string[];
  findings: string[];
  policyVersion?: string;
  checkedAt?: string;
  raw?: Record<string, unknown>;
};

export type RemixProvenance = {
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

export type ContentNode = {
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

export type ContentEdge = {
  id: string;
  from: string;
  to: string;
  relation:
    | "contains"
    | "derived_from"
    | "features_character"
    | "uses_prompt"
    | "uses_asset"
    | "has_dialogue"
    | "has_qc"
    | "groups";
};

export type CanonicalContentGraph = {
  schemaVersion: "opaija.remix-graph.v1";
  nodes: ContentNode[];
  edges: ContentEdge[];
};

export type RemixOutputGroup = {
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

export type RemixPlan = {
  title: string;
  summary: string;
  notes: string;
  outputGroups: RemixOutputGroup[];
};

export type MaterializationRecord = {
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

export type RemixArtifactRecord = {
  id: string;
  type: "materialization-manifest" | "vibeframe-handoff" | "vibeframe-manifest";
  relativePath: string;
  projectVersion: number;
  createdAt: string;
};

export type RemixProject = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "planning" | "ready" | "materialized" | "archived";
  conversion: RemixConversionKind;
  source: {
    kind: RemixSourceKind;
    projectId: string;
    label: string;
    version?: string | number;
  };
  sourceProvenance: RemixProvenance;
  graph: CanonicalContentGraph;
  plan: RemixPlan;
  materializations: MaterializationRecord[];
  artifacts: RemixArtifactRecord[];
  version: number;
  contentRevision: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateRemixProjectInput = {
  name?: string;
  description?: string;
  source: {
    kind: RemixSourceKind;
    projectId: string;
    version?: string | number;
    label?: string;
  };
  outputs?: {
    shortCount?: number;
    includeLongVideo?: boolean;
    bookFormats?: RemixBookFormat[];
  };
};

export type UpdateRemixProjectInput = {
  name?: string;
  description?: string;
  status?: RemixProject["status"];
};

export type UpdateRemixPlanInput = {
  title?: string;
  summary?: string;
  notes?: string;
  outputGroups?: Array<Partial<RemixOutputGroup> & Pick<RemixOutputGroup, "kind" | "title" | "beatNodeIds">>;
};

export type UpdateContentNodeInput = {
  title?: string;
  order?: number;
  data?: Record<string, unknown>;
  qc?: Partial<QcState>;
};

export type MaterializeRemixInput = {
  outputGroupIds?: string[];
  force?: boolean;
};

export type RemixManifest = {
  schemaVersion: "opaija.remix-manifest.v1";
  id: string;
  type: "materialization" | "vibeframe";
  projectId: string;
  projectVersion: number;
  contentRevision: number;
  createdAt: string;
  zeroSpend: true;
  sourceProvenance: RemixProvenance;
  outputGroups: Array<{
    id: string;
    kind: RemixOutputKind;
    title: string;
    beatNodeIds: string[];
  }>;
  materializations: MaterializationRecord[];
  artifactInventory: Array<{
    nodeId: string;
    mediaKind: string;
    uri?: string;
    sourcePath?: string;
    qcStatus: QcState["status"];
  }>;
  details: Record<string, unknown>;
  checksum: string;
};

export type VibeFrameHandoff = {
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

export class RemixStudioError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "RemixStudioError";
  }
}

const root = path.resolve(process.cwd(), process.env.REMIX_STUDIO_DATA_DIR ?? "data/remix-studio");
const projectsRoot = path.join(root, "projects");
const bookBuilderRoot = path.resolve(process.cwd(), process.env.BOOK_BUILDER_DATA_DIR ?? "data/book-builder");
const validBookFormats = new Set<RemixBookFormat>(["comic_book", "graphic_novel", "art_book"]);

export async function getRemixStudioHealth() {
  await ensureDir(projectsRoot);
  const projects = await listRemixProjects();
  return {
    ok: true as const,
    schemaVersion: "opaija.remix-graph.v1",
    storagePath: root,
    projectCount: projects.length,
    paidExecutionAvailable: false,
    vibeFrameMode: "adapter-handoff-only",
  };
}

export async function listRemixSourceBooks() {
  return listBookProjects();
}

export async function listRemixSourceVideos() {
  const projects = await listVideoProjectsForRemix();
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    sceneCount: project.scenes.length,
    updatedAt: project.updatedAt,
    sourceProvenance: project.sourceProvenance,
  }));
}

export async function createRemixProject(input: CreateRemixProjectInput): Promise<RemixProject> {
  if (!input?.source?.projectId?.trim()) throw new RemixStudioError("source.projectId is required.");
  if (input.source.kind !== "book" && input.source.kind !== "video") {
    throw new RemixStudioError("source.kind must be book or video.");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const imported = input.source.kind === "book"
    ? await importBookGraph(id, input.source.projectId.trim(), input.source.version)
    : await importVideoGraph(id, input.source.projectId.trim(), input.source.version);
  const name = input.name?.trim() || `${imported.label} Remix`;
  const conversion: RemixConversionKind = input.source.kind === "book" ? "book_to_video" : "video_to_book";
  const plan = buildDefaultPlan(name, conversion, imported.graph, input.outputs);
  const project: RemixProject = {
    id,
    name,
    description: input.description?.trim() || `Canonical ${conversion.replace(/_/g, " ")} plan derived from ${imported.label}.`,
    status: "planning",
    conversion,
    source: {
      kind: input.source.kind,
      projectId: input.source.projectId.trim(),
      label: input.source.label?.trim() || imported.label,
      version: input.source.version,
    },
    sourceProvenance: imported.provenance,
    graph: imported.graph,
    plan,
    materializations: [],
    artifacts: [],
    version: 1,
    contentRevision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await persistProject(project, true);
  return project;
}

export async function listRemixProjects(): Promise<Array<Omit<RemixProject, "graph"> & { graphSummary: Record<string, number> }>> {
  await ensureDir(projectsRoot);
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const project = await readProjectFile(entry.name);
      const counts = project.graph.nodes.reduce<Record<string, number>>((result, node) => {
        result[node.kind] = (result[node.kind] ?? 0) + 1;
        return result;
      }, {});
      const { graph: _graph, ...summary } = project;
      return { ...summary, graphSummary: counts };
    } catch {
      return null;
    }
  }));
  return projects.filter((project): project is NonNullable<typeof project> => project !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getRemixProject(projectId: string): Promise<RemixProject> {
  return readProjectFile(assertSafeId(projectId, "project"));
}

export async function updateRemixProject(projectId: string, input: UpdateRemixProjectInput): Promise<RemixProject> {
  const project = await getRemixProject(projectId);
  if (input.name !== undefined) project.name = requiredText(input.name, "name");
  if (input.description !== undefined) project.description = input.description.trim();
  if (input.status !== undefined) {
    const allowed = new Set<RemixProject["status"]>(["draft", "planning", "ready", "materialized", "archived"]);
    if (!allowed.has(input.status)) throw new RemixStudioError("Invalid project status.");
    project.status = input.status;
  }
  await commitProject(project, true);
  return project;
}

export async function updateRemixPlan(projectId: string, input: UpdateRemixPlanInput): Promise<RemixProject> {
  const project = await getRemixProject(projectId);
  if (input.title !== undefined) project.plan.title = requiredText(input.title, "plan.title");
  if (input.summary !== undefined) project.plan.summary = input.summary.trim();
  if (input.notes !== undefined) project.plan.notes = input.notes.trim();
  if (input.outputGroups !== undefined) {
    project.plan.outputGroups = input.outputGroups.map((group, index) => normalizeOutputGroup(project, group, index + 1));
  }
  validateOutputGroups(project);
  await commitProject(project, true);
  return project;
}

export async function addRemixOutputGroup(
  projectId: string,
  input: Partial<RemixOutputGroup> & Pick<RemixOutputGroup, "kind" | "title" | "beatNodeIds">,
): Promise<RemixProject> {
  const project = await getRemixProject(projectId);
  project.plan.outputGroups.push(normalizeOutputGroup(project, input, project.plan.outputGroups.length + 1));
  normalizeGroupOrder(project.plan.outputGroups);
  validateOutputGroups(project);
  await commitProject(project, true);
  return project;
}

export async function updateRemixOutputGroup(
  projectId: string,
  outputGroupId: string,
  input: Partial<Omit<RemixOutputGroup, "id" | "createdAt">>,
): Promise<RemixProject> {
  const project = await getRemixProject(projectId);
  const index = project.plan.outputGroups.findIndex((group) => group.id === outputGroupId);
  if (index < 0) throw new RemixStudioError("Output group not found.", 404);
  const current = project.plan.outputGroups[index];
  project.plan.outputGroups[index] = normalizeOutputGroup(project, { ...current, ...input, id: current.id, createdAt: current.createdAt }, input.order ?? current.order);
  normalizeGroupOrder(project.plan.outputGroups);
  validateOutputGroups(project);
  await commitProject(project, true);
  return project;
}

export async function deleteRemixOutputGroup(projectId: string, outputGroupId: string): Promise<RemixProject> {
  const project = await getRemixProject(projectId);
  const next = project.plan.outputGroups.filter((group) => group.id !== outputGroupId);
  if (next.length === project.plan.outputGroups.length) throw new RemixStudioError("Output group not found.", 404);
  project.plan.outputGroups = next;
  normalizeGroupOrder(project.plan.outputGroups);
  await commitProject(project, true);
  return project;
}

export async function updateRemixNode(projectId: string, nodeId: string, input: UpdateContentNodeInput): Promise<RemixProject> {
  const project = await getRemixProject(projectId);
  const node = project.graph.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new RemixStudioError("Content node not found.", 404);
  if (input.title !== undefined) node.title = requiredText(input.title, "node.title");
  if (input.order !== undefined) node.order = positiveInteger(input.order, "node.order");
  if (input.data !== undefined) node.data = { ...node.data, ...clone(input.data) };
  if (input.qc !== undefined) node.qc = normalizeQc({ ...node.qc, ...input.qc });
  node.version += 1;
  node.updatedAt = new Date().toISOString();
  validateOutputGroups(project);
  await commitProject(project, true);
  return project;
}

export async function listRemixVersions(projectId: string) {
  const project = await getRemixProject(projectId);
  const directory = path.join(projectDirectory(project.id), "versions");
  await ensureDir(directory);
  const entries = (await readdir(directory)).filter((name) => /^version-\d{6}\.json$/.test(name)).sort().reverse();
  return Promise.all(entries.map(async (name) => {
    const snapshot = await readJson<RemixProject>(path.join(directory, name));
    return {
      version: snapshot.version,
      contentRevision: snapshot.contentRevision,
      status: snapshot.status,
      updatedAt: snapshot.updatedAt,
      fileName: name,
    };
  }));
}

export async function getRemixVersion(projectId: string, version: number): Promise<RemixProject> {
  const safeProjectId = assertSafeId(projectId, "project");
  const safeVersion = positiveInteger(version, "version");
  const file = path.join(projectDirectory(safeProjectId), "versions", versionFileName(safeVersion));
  try {
    return await readJson<RemixProject>(file);
  } catch {
    throw new RemixStudioError("Project version not found.", 404);
  }
}

export async function materializeRemixProject(
  projectId: string,
  input: MaterializeRemixInput = {},
): Promise<{ project: RemixProject; records: MaterializationRecord[]; manifest: RemixManifest }> {
  const project = await getRemixProject(projectId);
  const requestedIds = new Set((input.outputGroupIds ?? []).map((id) => assertSafeId(id, "output group")));
  const groups = project.plan.outputGroups.filter((group) => requestedIds.size === 0 || requestedIds.has(group.id));
  if (!groups.length) throw new RemixStudioError("No matching output groups were selected.");
  const missingIds = [...requestedIds].filter((id) => !project.plan.outputGroups.some((group) => group.id === id));
  if (missingIds.length) throw new RemixStudioError(`Output groups not found: ${missingIds.join(", ")}.`, 404);

  const records: MaterializationRecord[] = [];
  for (const group of groups) {
    const existing = project.materializations.find((record) =>
      record.outputGroupId === group.id && record.contentRevision === project.contentRevision && record.status === "completed"
    );
    if (existing && !input.force) {
      records.push({ ...existing, id: randomUUID(), status: "skipped", createdAt: new Date().toISOString() });
      continue;
    }
    try {
      const result = isVideoOutput(group.kind)
        ? await materializeVideoOutput(project, group)
        : await materializeBookOutput(project, group);
      const record: MaterializationRecord = {
        id: randomUUID(),
        outputGroupId: group.id,
        outputKind: group.kind,
        targetSystem: result.targetSystem,
        targetProjectId: result.targetProjectId,
        targetChapterId: "targetChapterId" in result ? result.targetChapterId : undefined,
        contentRevision: project.contentRevision,
        status: "completed",
        zeroSpend: true,
        createdAt: new Date().toISOString(),
      };
      project.materializations.unshift(record);
      group.status = "materialized";
      group.updatedAt = record.createdAt;
      records.push(record);
    } catch (error) {
      const record: MaterializationRecord = {
        id: randomUUID(),
        outputGroupId: group.id,
        outputKind: group.kind,
        targetSystem: isVideoOutput(group.kind) ? "video-studio" : "book-builder",
        contentRevision: project.contentRevision,
        status: "failed",
        zeroSpend: true,
        error: error instanceof Error ? error.message : "Materialization failed.",
        createdAt: new Date().toISOString(),
      };
      project.materializations.unshift(record);
      records.push(record);
    }
  }

  project.status = records.some((record) => record.status === "completed") ? "materialized" : project.status;
  const artifactId = randomUUID();
  const nextVersion = project.version + 1;
  const createdAt = new Date().toISOString();
  project.artifacts.unshift({
    id: artifactId,
    type: "materialization-manifest",
    relativePath: `manifests/${artifactId}.json`,
    projectVersion: nextVersion,
    createdAt,
  });
  await commitProject(project, false);
  const manifest = buildManifest(project, artifactId, "materialization", {
    selectedOutputGroupIds: groups.map((group) => group.id),
    recordIds: records.map((record) => record.id),
  });
  await writeJsonAtomic(path.join(projectDirectory(project.id), "manifests", `${artifactId}.json`), manifest);
  return { project, records, manifest };
}

export async function buildVibeFrameHandoff(
  projectId: string,
  input: { outputGroupIds?: string[] } = {},
): Promise<{ project: RemixProject; handoff: VibeFrameHandoff; manifest: RemixManifest }> {
  const project = await getRemixProject(projectId);
  const selectedIds = new Set(input.outputGroupIds ?? []);
  const outputGroups = project.plan.outputGroups.filter((group) => selectedIds.size === 0 || selectedIds.has(group.id));
  if (!outputGroups.length) throw new RemixStudioError("No output groups are available for handoff.");
  const missingIds = [...selectedIds].filter((id) => !project.plan.outputGroups.some((group) => group.id === id));
  if (missingIds.length) throw new RemixStudioError(`Output groups not found: ${missingIds.join(", ")}.`, 404);

  const beatIds = new Set(outputGroups.flatMap((group) => group.beatNodeIds));
  const assetById = new Map(project.graph.nodes.filter((node) => node.kind === "asset").map((node) => [node.id, node]));
  const handoffId = randomUUID();
  const now = new Date().toISOString();
  const handoff: VibeFrameHandoff = {
    schemaVersion: "opaija.vibeframe.storyboard.v1",
    handoffId,
    projectId: project.id,
    projectVersion: project.version,
    createdAt: now,
    executionPolicy: {
      adapterOnly: true,
      invokeAdapter: false,
      paidWorkAllowed: false,
      generationRequested: false,
    },
    projectBrief: {
      title: project.plan.title,
      description: project.plan.summary || project.description,
      conversion: project.conversion,
      source: clone(project.source),
      sourceProvenance: clone(project.sourceProvenance),
      characters: project.graph.nodes.filter((node) => node.kind === "character").map((node) => ({
        id: node.id,
        name: node.title,
        description: textValue(node.data.description) || textValue(node.data.visualStyle),
        provenance: clone(node.provenance),
      })),
      scripts: project.graph.nodes.filter((node) => node.kind === "script").map((node) => ({
        id: node.id,
        title: node.title,
        text: textValue(node.data.text),
      })),
    },
    outputGroups: clone(outputGroups),
    storyboard: orderedBeatNodes(project).filter((node) => beatIds.has(node.id)).map((node, index) => {
      const assetNodeIds = stringArray(node.data.assetNodeIds);
      return {
        id: node.id,
        order: node.order ?? index + 1,
        title: node.title,
        action: textValue(node.data.action),
        narration: textValue(node.data.narration),
        dialogueLines: dialogueArray(node.data.dialogueLines),
        characters: stringArray(node.data.characters),
        setting: textValue(node.data.setting),
        shotType: textValue(node.data.shotType) || "cinematic story shot",
        camera: textValue(node.data.camera) || textValue(node.data.cameraAngle) || "controlled camera movement",
        durationSec: boundedDuration(node.data.durationSec),
        prompt: textValue(node.data.prompt),
        negativePrompt: textValue(node.data.negativePrompt),
        assetReferences: assetNodeIds.flatMap((assetId) => {
          const asset = assetById.get(assetId);
          if (!asset) return [];
          return [{
            nodeId: asset.id,
            mediaKind: textValue(asset.data.mediaKind) || "asset",
            uri: safePublicUri(asset.data.uri),
            qcStatus: asset.qc.status,
          }];
        }),
        qc: clone(node.qc),
        provenance: clone(node.provenance),
      };
    }),
  };

  const manifestId = randomUUID();
  const nextVersion = project.version + 1;
  project.artifacts.unshift(
    { id: handoffId, type: "vibeframe-handoff", relativePath: `handoffs/${handoffId}.json`, projectVersion: nextVersion, createdAt: now },
    { id: manifestId, type: "vibeframe-manifest", relativePath: `manifests/${manifestId}.json`, projectVersion: nextVersion, createdAt: now },
  );
  await commitProject(project, false);
  handoff.projectVersion = project.version;
  const manifest = buildManifest(project, manifestId, "vibeframe", {
    handoffId,
    outputGroupIds: outputGroups.map((group) => group.id),
    invokeAdapter: false,
    paidWorkAllowed: false,
  });
  await writeJsonAtomic(path.join(projectDirectory(project.id), "handoffs", `${handoffId}.json`), handoff);
  await writeJsonAtomic(path.join(projectDirectory(project.id), "manifests", `${manifestId}.json`), manifest);
  return { project, handoff, manifest };
}

export async function listRemixManifests(projectId: string) {
  const project = await getRemixProject(projectId);
  return Promise.all(project.artifacts.filter((artifact) => artifact.type.endsWith("manifest")).map(async (artifact) => ({
    ...artifact,
    manifest: await readJson<RemixManifest>(path.join(projectDirectory(project.id), artifact.relativePath)),
  })));
}

export async function getRemixManifest(projectId: string, manifestId: string): Promise<RemixManifest> {
  const project = await getRemixProject(projectId);
  const safeManifestId = assertSafeId(manifestId, "manifest");
  const artifact = project.artifacts.find((entry) => entry.id === safeManifestId && entry.type.endsWith("manifest"));
  if (!artifact) throw new RemixStudioError("Manifest not found.", 404);
  return readJson<RemixManifest>(path.join(projectDirectory(project.id), artifact.relativePath));
}

export async function getVibeFrameHandoff(projectId: string, handoffId: string): Promise<VibeFrameHandoff> {
  const project = await getRemixProject(projectId);
  const safeHandoffId = assertSafeId(handoffId, "handoff");
  const artifact = project.artifacts.find((entry) => entry.id === safeHandoffId && entry.type === "vibeframe-handoff");
  if (!artifact) throw new RemixStudioError("VibeFrame handoff not found.", 404);
  return readJson<VibeFrameHandoff>(path.join(projectDirectory(project.id), artifact.relativePath));
}

export async function deleteRemixProject(projectId: string): Promise<{ deleted: true; projectId: string }> {
  const safeProjectId = assertSafeId(projectId, "project");
  const directory = projectDirectory(safeProjectId);
  await getRemixProject(safeProjectId);
  assertInsideProjectsRoot(directory);
  await rm(directory, { recursive: true, force: false });
  return { deleted: true, projectId: safeProjectId };
}

async function importBookGraph(remixProjectId: string, sourceProjectId: string, sourceVersion?: string | number) {
  let book;
  try {
    book = await getProject(sourceProjectId);
  } catch {
    throw new RemixStudioError("Source Book Builder project not found.", 404);
  }
  const importedAt = new Date().toISOString();
  const provenance = makeProvenance(remixProjectId, "book", sourceProjectId, sourceVersion, book.setup.title, importedAt);
  const graph = emptyGraph();
  const sourceNode = addNode(graph, {
    kind: "source",
    title: book.setup.title,
    data: {
      mediaKind: "book",
      description: book.setup.description,
      setup: clone(book.setup),
      styleBible: clone(book.styleBible),
      chapterCount: book.chapters.length,
    },
    provenance,
  });

  if (book.styleBible) {
    const promptNode = addNode(graph, {
      kind: "prompt",
      title: `${book.styleBible.styleName} style bible`,
      data: { prompt: book.styleBible.stylePrompt, palette: book.styleBible.palette, lineQuality: book.styleBible.lineQuality, moodLevel: book.styleBible.moodLevel },
      provenance: withSourceNode(provenance, "style-bible"),
    });
    addEdge(graph, sourceNode.id, promptNode.id, "contains");
  }

  const characterNodeByName = new Map<string, string>();
  for (const character of book.characterBibles) {
    const characterNode = addNode(graph, {
      kind: "character",
      title: character.name,
      data: {
        characterId: character.characterId,
        aliases: clone(character.aliases ?? []),
        role: character.role,
        description: character.visualStyle,
        visualStyle: character.visualStyle,
        personality: character.personality,
        powers: character.powers,
        referencePrompt: character.referencePrompt,
        referenceImages: clone(character.referenceImages ?? []),
      },
      provenance: withSourceNode(provenance, character.characterId),
    });
    addEdge(graph, sourceNode.id, characterNode.id, "contains");
    for (const name of [character.characterId, character.name, ...(character.aliases ?? [])]) characterNodeByName.set(slug(name), characterNode.id);
  }

  const chapters = (await Promise.all(book.chapters.map(async (summary) => {
    try { return await getChapterPayload(sourceProjectId, summary.chapterId); } catch { return null; }
  }))).filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== null);
  let beatOrder = 0;
  for (const chapter of chapters) {
    const chapterProvenance = withSourceNode(provenance, chapter.chapterId);
    const chapterNode = addNode(graph, {
      kind: "chapter",
      title: chapter.chapterTitle,
      data: { summary: chapter.summary, chapterPrompt: chapter.chapterPrompt, status: chapter.status },
      provenance: chapterProvenance,
    });
    addEdge(graph, sourceNode.id, chapterNode.id, "contains");
    const scriptNode = addNode(graph, {
      kind: "script",
      title: `${chapter.chapterTitle} script`,
      data: { text: chapter.pages.flatMap((page) => page.panels.map((panel) => [panel.narration, panel.dialogue].filter(Boolean).join("\n"))).filter(Boolean).join("\n\n") },
      provenance: chapterProvenance,
    });
    addEdge(graph, chapterNode.id, scriptNode.id, "contains");

    for (const page of [...chapter.pages].sort((left, right) => left.pageNumber - right.pageNumber)) {
      for (const panel of [...page.panels].sort((left, right) => left.panelNumber - right.panelNumber)) {
        beatOrder += 1;
        const sourceNodeId = `${chapter.chapterId}:page-${page.pageNumber}:panel-${panel.panelNumber}`;
        const panelProvenance = withSourceNode(provenance, sourceNodeId, `chapters/${chapter.chapterId}/pages/${page.pageNumber}/panel-${String(panel.panelNumber).padStart(2, "0")}`);
        const artwork = await findBookArtwork(sourceProjectId, panel);
        const assetNodeIds: string[] = [];
        const beatNode = addNode(graph, {
          kind: "beat",
          title: page.summary || `${chapter.chapterTitle} ${page.pageNumber}.${panel.panelNumber}`,
          order: beatOrder,
          data: {
            chapterId: chapter.chapterId,
            pageNumber: page.pageNumber,
            panelNumber: panel.panelNumber,
            action: panel.action,
            dialogueLines: clone(panel.dialogueLines ?? []),
            narration: panel.narration,
            soundEffect: panel.soundEffect,
            characters: clone(panel.characters),
            setting: panel.setting,
            cameraAngle: panel.cameraAngle,
            camera: panel.cameraAngle,
            shotType: panel.shotType,
            timeOfDay: panel.timeOfDay,
            mood: panel.mood,
            prompt: panel.prompt,
            negativePrompt: panel.negativePrompt,
            durationSec: 6,
            sourceArtworkUrl: panel.sourceArtworkUrl || artwork?.uri,
            sourceVideoUrl: panel.sourceVideoUrl,
            localBookArtworkPath: artwork?.localPath,
            assetNodeIds,
          },
          provenance: panel.sourceProvenance ? mergeProvenance(panelProvenance, panel.sourceProvenance) : panelProvenance,
        });
        addEdge(graph, chapterNode.id, beatNode.id, "contains");
        addEdge(graph, beatNode.id, chapterNode.id, "derived_from");

        const promptNode = addNode(graph, {
          kind: "prompt",
          title: `${beatNode.title} prompt`,
          order: beatOrder,
          data: { prompt: panel.prompt, negativePrompt: panel.negativePrompt },
          provenance: panelProvenance,
        });
        addEdge(graph, beatNode.id, promptNode.id, "uses_prompt");
        for (const [index, line] of (panel.dialogueLines ?? []).entries()) {
          const dialogueNode = addNode(graph, {
            kind: "dialogue",
            title: `${line.speaker || "Speaker"} line`,
            order: index + 1,
            data: clone(line as unknown as Record<string, unknown>),
            provenance: withSourceNode(panelProvenance, `${sourceNodeId}:dialogue-${index + 1}`),
          });
          addEdge(graph, beatNode.id, dialogueNode.id, "has_dialogue");
        }
        for (const characterName of panel.characters) {
          const characterNodeId = characterNodeByName.get(slug(characterName));
          if (characterNodeId) addEdge(graph, beatNode.id, characterNodeId, "features_character");
        }
        for (const assetPath of panel.assetFiles ?? []) {
          const mediaKind = inferMediaKind(assetPath);
          const localPath = path.resolve(bookBuilderRoot, "projects", sourceProjectId, assetPath);
          const uri = artwork?.assetPath === assetPath ? artwork.uri : undefined;
          const assetNode = addNode(graph, {
            kind: "asset",
            title: path.basename(assetPath),
            data: { mediaKind, assetPath, localPath, uri },
            provenance: withSourceNode(panelProvenance, `${sourceNodeId}:asset:${assetPath}`, assetPath),
          });
          assetNodeIds.push(assetNode.id);
          addEdge(graph, beatNode.id, assetNode.id, "uses_asset");
        }
      }
    }
  }
  return { label: book.setup.title, graph, provenance };
}

async function importVideoGraph(remixProjectId: string, sourceProjectId: string, sourceVersion?: string | number) {
  const videos = await listVideoProjectsForRemix();
  const video = videos.find((project) => project.id === sourceProjectId);
  if (!video) throw new RemixStudioError("Source Video Studio project not found.", 404);
  const importedAt = new Date().toISOString();
  const provenance = makeProvenance(remixProjectId, "video", sourceProjectId, sourceVersion, video.name, importedAt);
  const graph = emptyGraph();
  const sourceNode = addNode(graph, {
    kind: "source",
    title: video.name,
    data: {
      mediaKind: "video",
      format: video.format,
      aspectRatio: video.aspectRatio,
      resolution: video.resolution,
      fps: video.fps,
      styleProfile: video.styleProfile,
      canonLock: clone(video.canonLock),
      sourceEpisodeId: video.sourceEpisodeId,
    },
    provenance,
  });
  if (video.directorBrief?.trim()) {
    const scriptNode = addNode(graph, {
      kind: "script",
      title: `${video.name} director brief`,
      data: { text: video.directorBrief },
      provenance: withSourceNode(provenance, "director-brief"),
    });
    addEdge(graph, sourceNode.id, scriptNode.id, "contains");
  }

  const characterNodes = new Map<string, string>();
  for (const scene of [...video.scenes].sort((left, right) => left.order - right.order)) {
    const sceneProvenance = scene.sourceProvenance
      ? mergeProvenance(withSourceNode(provenance, scene.id), scene.sourceProvenance)
      : withSourceNode(provenance, scene.id);
    const sceneNode = addNode(graph, {
      kind: "scene",
      title: scene.title,
      order: scene.order,
      data: {
        storyBeat: scene.storyBeat,
        status: scene.status,
        selectedRevisionId: scene.selectedRevisionId,
        resolution: scene.resolution,
        aspectRatio: scene.aspectRatio,
        videoModelId: scene.videoModelId,
      },
      provenance: sceneProvenance,
      qc: normalizeQc(scene.startFrameQc),
    });
    addEdge(graph, sourceNode.id, sceneNode.id, "contains");
    const assetNodeIds: string[] = [];
    const beatNode = addNode(graph, {
      kind: "beat",
      title: scene.title,
      order: scene.order,
      data: {
        sceneId: scene.id,
        action: scene.storyBeat,
        dialogueLines: clone(scene.dialogue),
        narration: "",
        soundEffect: "",
        characters: clone(scene.characters),
        setting: scene.location,
        shotType: scene.shotType,
        camera: scene.camera,
        durationSec: scene.durationSec,
        prompt: scene.prompt,
        negativePrompt: scene.negativePrompt,
        sourceArtworkUrl: scene.sourceArtworkUrl,
        sourceVideoUrl: scene.sourceVideoUrl,
        assetNodeIds,
      },
      provenance: sceneProvenance,
      qc: normalizeQc(scene.startFrameQc),
    });
    addEdge(graph, sceneNode.id, beatNode.id, "contains");
    addEdge(graph, beatNode.id, sceneNode.id, "derived_from");
    const promptNode = addNode(graph, {
      kind: "prompt",
      title: `${scene.title} prompt`,
      order: scene.order,
      data: { prompt: scene.prompt, negativePrompt: scene.negativePrompt },
      provenance: sceneProvenance,
    });
    addEdge(graph, beatNode.id, promptNode.id, "uses_prompt");
    for (const [index, line] of scene.dialogue.entries()) {
      const dialogueNode = addNode(graph, {
        kind: "dialogue",
        title: `${line.speaker} line`,
        order: index + 1,
        data: clone(line),
        provenance: withSourceNode(sceneProvenance, `${scene.id}:dialogue-${index + 1}`),
      });
      addEdge(graph, beatNode.id, dialogueNode.id, "has_dialogue");
    }
    for (const character of scene.characters) {
      const key = slug(character);
      let characterNodeId = characterNodes.get(key);
      if (!characterNodeId) {
        const characterNode = addNode(graph, {
          kind: "character",
          title: character,
          data: { characterId: key, description: "Preserve source Video Studio identity and canonical references." },
          provenance: withSourceNode(provenance, `character:${key}`),
        });
        characterNodeId = characterNode.id;
        characterNodes.set(key, characterNodeId);
        addEdge(graph, sourceNode.id, characterNodeId, "contains");
      }
      addEdge(graph, beatNode.id, characterNodeId, "features_character");
    }
    const assets = [
      scene.sourceArtworkUrl ? { mediaKind: "still", uri: scene.sourceArtworkUrl, id: `${scene.id}:source-artwork` } : null,
      scene.sourceVideoUrl ? { mediaKind: "video", uri: scene.sourceVideoUrl, id: `${scene.id}:source-video` } : null,
      ...scene.revisions.flatMap((revision) => revision.assetUrl ? [{ mediaKind: "video", uri: revision.assetUrl, id: `${scene.id}:revision:${revision.id}` }] : []),
    ].filter((asset): asset is { mediaKind: string; uri: string; id: string } => asset !== null);
    for (const asset of assets) {
      const assetNode = addNode(graph, {
        kind: "asset",
        title: `${scene.title} ${asset.mediaKind}`,
        data: { mediaKind: asset.mediaKind, uri: asset.uri },
        provenance: withSourceNode(sceneProvenance, asset.id),
      });
      assetNodeIds.push(assetNode.id);
      addEdge(graph, beatNode.id, assetNode.id, "uses_asset");
    }
  }
  return { label: video.name, graph, provenance };
}

function buildDefaultPlan(
  name: string,
  conversion: RemixConversionKind,
  graph: CanonicalContentGraph,
  outputs?: CreateRemixProjectInput["outputs"],
): RemixPlan {
  const beatIds = graph.nodes.filter((node) => node.kind === "beat").sort(compareNodeOrder).map((node) => node.id);
  if (!beatIds.length) throw new RemixStudioError("The source project has no remixable beats or scenes.");
  const now = new Date().toISOString();
  const outputGroups: RemixOutputGroup[] = [];
  if (conversion === "book_to_video") {
    const count = Math.max(2, Math.min(6, Math.round(outputs?.shortCount ?? 3)));
    const chunks = splitBeatIds(beatIds, count);
    chunks.forEach((chunk, index) => outputGroups.push({
      id: randomUUID(),
      order: outputGroups.length + 1,
      kind: "vertical_short",
      title: `${name} Short ${index + 1}`,
      description: `Vertical short ${index + 1} of ${count}, derived from ordered canonical book beats.`,
      beatNodeIds: chunk,
      target: { aspectRatio: "9:16", durationSec: Math.max(15, Math.min(90, chunk.length * 8)) },
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }));
    if (outputs?.includeLongVideo !== false) outputGroups.push({
      id: randomUUID(),
      order: outputGroups.length + 1,
      kind: "long_video",
      title: `${name} Long Video`,
      description: "Long-form adaptation using the complete ordered canonical beat sequence.",
      beatNodeIds: beatIds,
      target: { aspectRatio: "16:9", durationSec: Math.max(60, beatIds.length * 8) },
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const requested = outputs?.bookFormats?.length ? outputs.bookFormats : ["graphic_novel" as const];
    const formats = Array.from(new Set(requested)).filter((format): format is RemixBookFormat => validBookFormats.has(format));
    if (!formats.length) throw new RemixStudioError("At least one valid book format is required.");
    formats.forEach((format) => outputGroups.push({
      id: randomUUID(),
      order: outputGroups.length + 1,
      kind: format,
      title: `${name} ${titleCase(format)}`,
      description: `${titleCase(format)} adaptation preserving the complete video storyboard and provenance.`,
      beatNodeIds: beatIds,
      target: { bookFormat: format },
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }));
  }
  return {
    title: `${name} Cross-Media Plan`,
    summary: conversion === "book_to_video"
      ? "Adapt canonical book beats into two to six vertical shorts and an optional long video."
      : "Adapt canonical video scenes into a comic book, graphic novel, or art book.",
    notes: "All downstream materialization is zero-spend. Generation remains a separate, explicitly approved studio action.",
    outputGroups,
  };
}

async function materializeVideoOutput(project: RemixProject, group: RemixOutputGroup) {
  const beats = selectBeatNodes(project, group);
  const provenance: VideoRemixSourceProvenance = {
    remixProjectId: project.id,
    sourceProjectId: project.source.projectId,
    sourceMediaType: project.source.kind,
    sourceLabel: project.source.label,
    remixContentRevision: project.contentRevision,
    outputGroupId: group.id,
    outputKind: group.kind,
    zeroSpend: true,
  };
  const inputBeats: VideoRemixBeatInput[] = beats.map((node, index) => ({
    id: node.id,
    order: index + 1,
    title: node.title,
    action: requiredNodeText(node, "action"),
    dialogueLines: dialogueArray(node.data.dialogueLines),
    narration: textValue(node.data.narration),
    soundEffect: textValue(node.data.soundEffect),
    prompt: requiredNodeText(node, "prompt"),
    negativePrompt: textValue(node.data.negativePrompt),
    characters: stringArray(node.data.characters),
    setting: textValue(node.data.setting),
    shotType: textValue(node.data.shotType),
    camera: textValue(node.data.camera) || textValue(node.data.cameraAngle),
    durationSec: boundedDuration(node.data.durationSec),
    sourceProvenance: { ...provenance, sourceBeatId: node.provenance.sourceNodeId },
    sourceArtworkUrl: safePublicUri(node.data.sourceArtworkUrl),
    sourceVideoUrl: safePublicUri(node.data.sourceVideoUrl),
    localBookArtworkPath: safeWorkspacePath(node.data.localBookArtworkPath),
  }));
  const video = await createVideoProjectFromRemix({
    name: group.title,
    worldId: "opaija",
    sourceEpisodeId: project.source.projectId,
    templateId: group.kind === "long_video" ? "remix-long-video" : "remix-vertical-short",
    directorBrief: `${group.description}\n\n${project.plan.notes}`.trim(),
    sourceProvenance: provenance,
    beats: inputBeats,
  });
  return { targetSystem: "video-studio" as const, targetProjectId: video.id };
}

async function materializeBookOutput(project: RemixProject, group: RemixOutputGroup) {
  const beats = selectBeatNodes(project, group);
  const provenance: BookRemixSourceProvenance = {
    remixProjectId: project.id,
    sourceProjectId: project.source.projectId,
    sourceMediaType: project.source.kind,
    sourceLabel: project.source.label,
    remixContentRevision: project.contentRevision,
    outputGroupId: group.id,
    outputKind: group.kind,
    zeroSpend: true,
  };
  const inputBeats: BookRemixBeatInput[] = beats.map((node, index) => ({
    id: node.id,
    order: index + 1,
    title: node.title,
    action: requiredNodeText(node, "action"),
    dialogueLines: dialogueArray(node.data.dialogueLines) as DialogueLine[],
    narration: textValue(node.data.narration),
    soundEffect: textValue(node.data.soundEffect),
    prompt: requiredNodeText(node, "prompt"),
    negativePrompt: textValue(node.data.negativePrompt),
    characters: stringArray(node.data.characters),
    setting: textValue(node.data.setting),
    cameraAngle: textValue(node.data.cameraAngle) || textValue(node.data.camera),
    shotType: textValue(node.data.shotType),
    timeOfDay: textValue(node.data.timeOfDay),
    mood: textValue(node.data.mood),
    sourceProvenance: { ...provenance, sourceBeatId: node.provenance.sourceNodeId },
    stillAssetUrl: safePublicUri(node.data.sourceArtworkUrl),
    videoAssetUrl: safePublicUri(node.data.sourceVideoUrl),
  }));
  const result = await createBookProjectFromRemix({
    title: group.title,
    description: group.description,
    chapterTitle: project.plan.title,
    chapterPrompt: inputBeats.map((beat) => beat.prompt).join("\n\n"),
    chapterSummary: project.plan.summary,
    styleNotes: `Cross-media ${group.kind} materialized from Remix Studio without paid generation.`,
    sourceProvenance: provenance,
    beats: inputBeats,
  });
  await upsertProjectSetup(result.project.projectId, { kdpBookType: group.kind as RemixBookFormat });
  return { targetSystem: "book-builder" as const, targetProjectId: result.project.projectId, targetChapterId: result.chapter.chapterId };
}

function buildManifest(
  project: RemixProject,
  id: string,
  type: RemixManifest["type"],
  details: Record<string, unknown>,
): RemixManifest {
  const payload = {
    schemaVersion: "opaija.remix-manifest.v1" as const,
    id,
    type,
    projectId: project.id,
    projectVersion: project.version,
    contentRevision: project.contentRevision,
    createdAt: new Date().toISOString(),
    zeroSpend: true as const,
    sourceProvenance: clone(project.sourceProvenance),
    outputGroups: project.plan.outputGroups.map((group) => ({ id: group.id, kind: group.kind, title: group.title, beatNodeIds: [...group.beatNodeIds] })),
    materializations: clone(project.materializations),
    artifactInventory: project.graph.nodes.filter((node) => node.kind === "asset").map((node) => ({
      nodeId: node.id,
      mediaKind: textValue(node.data.mediaKind) || "asset",
      uri: safePublicUri(node.data.uri),
      sourcePath: node.provenance.sourcePath,
      qcStatus: node.qc.status,
    })),
    details: clone(details),
  };
  return { ...payload, checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

function normalizeOutputGroup(
  project: RemixProject,
  input: Partial<RemixOutputGroup> & Pick<RemixOutputGroup, "kind" | "title" | "beatNodeIds">,
  order: number,
): RemixOutputGroup {
  const now = new Date().toISOString();
  if (!isOutputAllowed(project.conversion, input.kind)) throw new RemixStudioError(`Output kind ${input.kind} is not valid for ${project.conversion}.`);
  const target = clone(input.target ?? {});
  if (!isVideoOutput(input.kind)) target.bookFormat = input.kind as RemixBookFormat;
  else target.aspectRatio = input.kind === "vertical_short" ? "9:16" : target.aspectRatio ?? "16:9";
  return {
    id: input.id ? assertSafeId(input.id, "output group") : randomUUID(),
    order: positiveInteger(input.order ?? order, "output group order"),
    kind: input.kind,
    title: requiredText(input.title, "output group title"),
    description: input.description?.trim() || `${titleCase(input.kind)} output derived from canonical Remix beats.`,
    beatNodeIds: Array.from(new Set(input.beatNodeIds.map((id) => assertSafeId(id, "beat node")))),
    target,
    status: input.status ?? "draft",
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

function validateOutputGroups(project: RemixProject) {
  const beatIds = new Set(project.graph.nodes.filter((node) => node.kind === "beat").map((node) => node.id));
  for (const group of project.plan.outputGroups) {
    if (!group.beatNodeIds.length) throw new RemixStudioError(`Output group ${group.title} needs at least one beat.`);
    const missing = group.beatNodeIds.filter((id) => !beatIds.has(id));
    if (missing.length) throw new RemixStudioError(`Output group ${group.title} references missing beat nodes: ${missing.join(", ")}.`);
  }
  const shortCount = project.plan.outputGroups.filter((group) => group.kind === "vertical_short").length;
  if (project.conversion === "book_to_video" && shortCount > 0 && (shortCount < 2 || shortCount > 6)) {
    throw new RemixStudioError("Book-to-video plans must contain two to six vertical short groups.");
  }
}

function selectBeatNodes(project: RemixProject, group: RemixOutputGroup) {
  const map = new Map(project.graph.nodes.filter((node) => node.kind === "beat").map((node) => [node.id, node]));
  return group.beatNodeIds.map((id) => map.get(id)).filter((node): node is ContentNode => Boolean(node));
}

async function findBookArtwork(sourceProjectId: string, panel: PanelRecord) {
  const candidates = (panel.assetFiles ?? []).filter((asset) => /\.(?:png|jpe?g|webp)$/i.test(asset) && !/(?:rejected|context|prompt)/i.test(asset));
  for (const assetPath of [...candidates].reverse()) {
    const localPath = path.resolve(bookBuilderRoot, "projects", sourceProjectId, assetPath);
    const expectedRoot = path.resolve(bookBuilderRoot, "projects", sourceProjectId);
    if (!isPathInside(expectedRoot, localPath)) continue;
    const info = await stat(localPath).catch(() => null);
    if (!info?.isFile()) continue;
    const chapterMatch = assetPath.match(/^chapters\/([^/]+)\/pages\/(\d+)\/panel-(\d+)\/(.+)$/i);
    const uri = chapterMatch
      ? `/api/book-builder/projects/${sourceProjectId}/chapters/${chapterMatch[1]}/pages/${Number(chapterMatch[2])}/panels/${Number(chapterMatch[3])}/artwork/${encodeURIComponent(chapterMatch[4])}`
      : undefined;
    return { assetPath, localPath, uri };
  }
  return undefined;
}

function emptyGraph(): CanonicalContentGraph {
  return { schemaVersion: "opaija.remix-graph.v1", nodes: [], edges: [] };
}

function addNode(
  graph: CanonicalContentGraph,
  input: Omit<ContentNode, "id" | "qc" | "version" | "createdAt" | "updatedAt"> & { qc?: Partial<QcState> },
) {
  const now = new Date().toISOString();
  const key = `${input.kind}:${input.provenance.sourceNodeId ?? input.title}:${input.order ?? ""}`;
  const node: ContentNode = {
    id: `${input.kind}-${createHash("sha1").update(key).digest("hex").slice(0, 16)}`,
    kind: input.kind,
    title: input.title,
    order: input.order,
    data: clone(input.data),
    provenance: clone(input.provenance),
    qc: normalizeQc(input.qc),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const existing = graph.nodes.find((entry) => entry.id === node.id);
  if (existing) return existing;
  graph.nodes.push(node);
  return node;
}

function addEdge(graph: CanonicalContentGraph, from: string, to: string, relation: ContentEdge["relation"]) {
  const id = `edge-${createHash("sha1").update(`${from}:${relation}:${to}`).digest("hex").slice(0, 16)}`;
  if (!graph.edges.some((edge) => edge.id === id)) graph.edges.push({ id, from, to, relation });
}

function makeProvenance(
  remixProjectId: string,
  sourceKind: RemixSourceKind,
  sourceProjectId: string,
  sourceVersion: string | number | undefined,
  sourceLabel: string,
  importedAt: string,
): RemixProvenance {
  return {
    remixProjectId,
    sourceKind,
    sourceProjectId,
    sourceVersion,
    sourceLabel,
    importedAt,
    lineage: [{ system: sourceKind === "book" ? "book-builder" : "video-studio", projectId: sourceProjectId, version: sourceVersion }],
  };
}

function withSourceNode(base: RemixProvenance, sourceNodeId: string, sourcePath?: string): RemixProvenance {
  return {
    ...clone(base),
    sourceNodeId,
    sourcePath,
    lineage: [...base.lineage.map((entry) => ({ ...entry })), { system: base.sourceKind === "book" ? "book-builder" : "video-studio", projectId: base.sourceProjectId, nodeId: sourceNodeId, version: base.sourceVersion }],
  };
}

function mergeProvenance(base: RemixProvenance, source: Record<string, unknown>): RemixProvenance {
  return {
    ...base,
    sourceNodeId: textValue(source.sourceBeatId) || textValue(source.sourceSceneId) || base.sourceNodeId,
    sourceLabel: textValue(source.sourceLabel) || base.sourceLabel,
  };
}

function normalizeQc(value: unknown): QcState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const explicitStatus = textValue(row.status);
  const pass = row.pass === true;
  const failed = row.pass === false || stringArray(row.blockers).length > 0;
  const allowed = new Set<QcState["status"]>(["unreviewed", "pending", "passed", "failed", "waived"]);
  const status = allowed.has(explicitStatus as QcState["status"])
    ? explicitStatus as QcState["status"]
    : pass ? "passed" : failed ? "failed" : "unreviewed";
  const score = Number(row.score);
  return {
    status,
    score: Number.isFinite(score) ? score : undefined,
    blockers: stringArray(row.blockers),
    findings: stringArray(row.findings),
    policyVersion: textValue(row.policyVersion) || undefined,
    checkedAt: textValue(row.checkedAt) || undefined,
    raw: Object.keys(row).length ? clone(row) : undefined,
  };
}

async function commitProject(project: RemixProject, contentChanged: boolean) {
  project.version += 1;
  if (contentChanged) project.contentRevision += 1;
  project.updatedAt = new Date().toISOString();
  await persistProject(project, true);
}

async function persistProject(project: RemixProject, saveVersion: boolean) {
  const directory = projectDirectory(project.id);
  assertInsideProjectsRoot(directory);
  await ensureDir(path.join(directory, "versions"));
  await ensureDir(path.join(directory, "manifests"));
  await ensureDir(path.join(directory, "handoffs"));
  await writeJsonAtomic(path.join(directory, "project.json"), project);
  if (saveVersion) await writeJsonAtomic(path.join(directory, "versions", versionFileName(project.version)), project);
}

async function readProjectFile(projectId: string): Promise<RemixProject> {
  try {
    return await readJson<RemixProject>(path.join(projectDirectory(projectId), "project.json"));
  } catch {
    throw new RemixStudioError("Remix project not found.", 404);
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function ensureDir(directory: string) {
  await mkdir(directory, { recursive: true });
}

function projectDirectory(projectId: string) {
  return path.join(projectsRoot, assertSafeId(projectId, "project"));
}

function assertInsideProjectsRoot(candidate: string) {
  if (!isPathInside(projectsRoot, candidate)) throw new RemixStudioError("Unsafe Remix Studio storage path.", 500);
}

function isPathInside(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertSafeId(value: string, label: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) throw new RemixStudioError(`Invalid ${label} id.`);
  return value;
}

function versionFileName(version: number) {
  return `version-${String(version).padStart(6, "0")}.json`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requiredText(value: string, label: string) {
  const clean = value?.trim();
  if (!clean) throw new RemixStudioError(`${label} is required.`);
  return clean;
}

function requiredNodeText(node: ContentNode, key: string) {
  const value = textValue(node.data[key]);
  if (!value) throw new RemixStudioError(`${node.title} is missing ${key}.`);
  return value;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function dialogueArray(value: unknown): Array<{ speaker: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const speaker = textValue(row.speaker);
    const text = textValue(row.text);
    return speaker && text ? [{ speaker, text }] : [];
  });
}

function safePublicUri(value: unknown) {
  const uri = textValue(value);
  if (!uri) return undefined;
  if (uri.startsWith("/") || /^https:\/\//i.test(uri) || /^http:\/\/localhost(?::\d+)?\//i.test(uri)) return uri;
  return undefined;
}

function safeWorkspacePath(value: unknown) {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  const absolute = path.resolve(candidate);
  const workspace = path.resolve(process.cwd());
  return isPathInside(workspace, absolute) ? absolute : undefined;
}

function boundedDuration(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(900, Math.round(numeric))) : 6;
}

function positiveInteger(value: unknown, label: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) throw new RemixStudioError(`${label} must be a positive integer.`);
  return Math.round(numeric);
}

function orderedBeatNodes(project: RemixProject) {
  return project.graph.nodes.filter((node) => node.kind === "beat").sort(compareNodeOrder);
}

function compareNodeOrder(left: ContentNode, right: ContentNode) {
  return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.createdAt.localeCompare(right.createdAt);
}

function splitBeatIds(ids: string[], count: number) {
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * ids.length) / count);
    const end = Math.floor(((index + 1) * ids.length) / count);
    return end > start ? ids.slice(start, end) : [ids[index % ids.length]];
  });
}

function normalizeGroupOrder(groups: RemixOutputGroup[]) {
  groups.sort((left, right) => left.order - right.order).forEach((group, index) => { group.order = index + 1; });
}

function isVideoOutput(kind: RemixOutputKind) {
  return kind === "vertical_short" || kind === "long_video";
}

function isOutputAllowed(conversion: RemixConversionKind, kind: RemixOutputKind) {
  return conversion === "book_to_video" ? isVideoOutput(kind) : !isVideoOutput(kind);
}

function inferMediaKind(fileName: string) {
  if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(fileName)) return "still";
  if (/\.(?:mp4|mov|webm)$/i.test(fileName)) return "video";
  if (/\.(?:mp3|wav|m4a|ogg)$/i.test(fileName)) return "audio";
  if (/prompt/i.test(fileName)) return "prompt";
  if (/qc|context|manifest/i.test(fileName)) return "metadata";
  return "document";
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
