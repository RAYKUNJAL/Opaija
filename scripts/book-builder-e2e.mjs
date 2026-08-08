import process from "node:process";

const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8787";
const runId = Date.now();
const targetPages = Number(process.env.E2E_TARGET_PAGES ?? 3);
const panelsPerPage = Number(process.env.E2E_PANELS_PER_PAGE ?? 3);
const chapterCount = Number(process.env.E2E_CHAPTER_COUNT ?? 2);
let authHeaders = {};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders, ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function expectStatus(path, expectedStatus, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders, ...(options.headers ?? {}) },
    ...options,
  });
  if (response.status !== expectedStatus) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Expected ${expectedStatus} from ${path}, got ${response.status}: ${payload}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertExactChapterLayout(chapter, expectedPages, expectedPanelsPerPage) {
  if (!Array.isArray(chapter.pages) || chapter.pages.length !== expectedPages) {
    throw new Error(`Chapter ${chapter.chapterId} expected ${expectedPages} pages, got ${chapter.pages?.length ?? 0}.`);
  }
  for (const [pageIndex, page] of chapter.pages.entries()) {
    if (page.pageNumber !== pageIndex + 1) {
      throw new Error(`Chapter ${chapter.chapterId} page order mismatch at index ${pageIndex}.`);
    }
    if (!Array.isArray(page.panels) || page.panels.length !== expectedPanelsPerPage) {
      throw new Error(`Chapter ${chapter.chapterId} page ${page.pageNumber} expected ${expectedPanelsPerPage} panels, got ${page.panels?.length ?? 0}.`);
    }
    for (const [panelIndex, panel] of page.panels.entries()) {
      if (panel.panelNumber !== panelIndex + 1) {
        throw new Error(`Chapter ${chapter.chapterId} page ${page.pageNumber} panel order mismatch at index ${panelIndex}.`);
      }
      if (!panel.prompt || !panel.action || !panel.continuityNotes) {
        throw new Error(`Chapter ${chapter.chapterId} page ${page.pageNumber} panel ${panel.panelNumber} is missing production fields.`);
      }
      if (!Array.isArray(panel.dialogueLines)) {
        throw new Error(`Chapter ${chapter.chapterId} page ${page.pageNumber} panel ${panel.panelNumber} is missing structured dialogueLines.`);
      }
      for (const line of panel.dialogueLines) {
        if (!line.speaker || !line.text) throw new Error("Dialogue line is missing speaker metadata or text.");
        if (new RegExp(`^${line.speaker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i").test(line.text)) {
          throw new Error(`Speaker prefix leaked into bubble text for ${line.speaker}.`);
        }
      }
      if (!Array.isArray(panel.assetFiles) || !panel.assetFiles.some((entry) => entry.endsWith("panel-manifest.json"))) {
        throw new Error(`Chapter ${chapter.chapterId} page ${page.pageNumber} panel ${panel.panelNumber} did not persist its panel manifest path.`);
      }
    }
  }
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const job = await request(`/api/book-builder/jobs/${jobId}`);
    console.log(`E2E: job ${job.jobId} ${job.status} ${job.progress}%`);
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(`Job failed: ${job.error}`);
    await sleep(750);
  }
  throw new Error(`Job ${jobId} did not finish in time.`);
}

async function main() {
  if (process.env.E2E_ADMIN_PASSWORD) {
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.E2E_ADMIN_PASSWORD }),
    });
    const login = await loginResponse.json().catch(() => null);
    if (!loginResponse.ok || !login?.token) {
      throw new Error(login?.error ?? "Admin login failed for E2E test.");
    }
    authHeaders = { "x-admin-session": login.token };
  }

  console.log("E2E: checking health");
  const health = await request("/api/book-builder/health");
  console.log(`Provider: ${health.provider}, model: ${health.model}, projects: ${health.projectCount}, storage: ${health.storagePath}`);

  console.log("E2E: creating project");
  const project = await request("/api/book-builder/projects", {
    method: "POST",
    body: JSON.stringify({
      title: `BuildFlow E2E ${runId}`,
      description: "Automated full book build flow smoke test.",
      targetPagesPerChapter: targetPages,
      defaultPanelsPerPage: panelsPerPage,
      targetTrim: "6.625x10.25",
      styleNotes: "strict continuity, page/panel breakdown, export-ready persistence",
    }),
  });

  console.log("E2E: creating style bible");
  await request(`/api/book-builder/projects/${project.projectId}/style-bible`, {
    method: "PUT",
    body: JSON.stringify({
      styleName: "E2E Style",
      stylePrompt: "OPAIJA training sequence, hard ink, clean line art, high contrast.",
      palette: ["teal", "gold", "charcoal"],
      lineQuality: "clean",
      moodLevel: 4,
    }),
  });

  console.log("E2E: saving cover settings");
  const cover = await request(`/api/book-builder/projects/${project.projectId}/cover`, {
    method: "PATCH",
    body: JSON.stringify({
      front: {
        title: `BuildFlow E2E ${runId}`,
        subtitle: "Commercial Harness Cover",
        tagline: "Full-book persistence proof.",
        author: "OPAIJA QA",
        customPrompt: "Readable title lock, production print margin, no watermark.",
      },
      back: {
        blurb: "This cover copy must persist through project reloads and export manifest builds.",
      },
    }),
  });
  if (cover.cover.front.subtitle !== "Commercial Harness Cover" || cover.cover.back.blurb.length < 20) {
    throw new Error("Cover settings did not persist in patch response.");
  }
  const reloadedProject = await request(`/api/book-builder/projects/${project.projectId}`);
  if (reloadedProject.cover.front.subtitle !== "Commercial Harness Cover" || reloadedProject.cover.back.blurb !== cover.cover.back.blurb) {
    throw new Error("Cover settings did not persist after project reload.");
  }
  await expectStatus(`/api/book-builder/projects/${project.projectId}/cover/back/artwork/cover-front-${project.projectSlug}-123456789.png`, 404);

  console.log("E2E: saving character bible");
  await request(`/api/book-builder/projects/${project.projectId}/character-bibles`, {
    method: "POST",
    body: JSON.stringify({
      characterId: "kai",
      name: "Kai",
      role: "Lead",
      visualStyle: "lean, athletic",
      personality: "disciplined",
      powers: "focus",
      referencePrompt: "same angular face, short twists, teal training jacket, gold wrist wrap",
    }),
  });
  await request(`/api/book-builder/projects/${project.projectId}/character-bibles`, {
    method: "POST",
    body: JSON.stringify({
      characterId: "nia",
      name: "Nia",
      role: "Training partner",
      visualStyle: "athletic, long braids, crimson training jacket, silver earrings",
      personality: "observant and composed",
      powers: "rhythm sensing",
      referencePrompt: "same oval face, long braids, deep brown skin, crimson jacket, silver earrings",
    }),
  });

  let characterArtworkBytes = 0;
  if (process.env.E2E_GENERATE_ARTWORK === "1") {
    console.log("E2E: generating saved character reference artwork");
    const characterArtwork = await request(`/api/book-builder/projects/${project.projectId}/character-bibles/kai/artwork`, { method: "POST" });
    const referenceResponse = await fetch(`${API_BASE}${characterArtwork.artworkApiPath}`, { headers: authHeaders });
    if (!referenceResponse.ok || !String(referenceResponse.headers.get("content-type")).startsWith("image/")) throw new Error("Character reference artwork fetch failed.");
    characterArtworkBytes = (await referenceResponse.arrayBuffer()).byteLength;
    if (characterArtworkBytes < 1000) throw new Error("Character reference artwork is unexpectedly small.");
    const niaArtwork = await request(`/api/book-builder/projects/${project.projectId}/character-bibles/nia/artwork`, { method: "POST" });
    const niaResponse = await fetch(`${API_BASE}${niaArtwork.artworkApiPath}`, { headers: authHeaders });
    if (!niaResponse.ok || !String(niaResponse.headers.get("content-type")).startsWith("image/")) throw new Error("Nia reference artwork fetch failed.");
  }

  const chapters = [];
  for (let chapterIndex = 1; chapterIndex <= chapterCount; chapterIndex++) {
    console.log(`E2E: starting chapter ${chapterIndex}/${chapterCount}`);
    const start = await request(`/api/book-builder/projects/${project.projectId}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        chapterTitle: `E2E Chapter ${chapterIndex}`,
        chapterPrompt: `A test chapter ${chapterIndex} with continuity tracking and export-ready panel manifests.`,
        targetPages,
        panelsPerPage,
        includeDialogue: true,
        includeSoundEffects: true,
      }),
    });
    const job = await waitForJob(start.jobId);
    if (!job.resultChapterId) {
      throw new Error("Completed job has no chapter output.");
    }
    const chapter = await request(`/api/book-builder/projects/${project.projectId}/chapters/${job.resultChapterId}`);
    assertExactChapterLayout(chapter, targetPages, panelsPerPage);
    chapters.push(chapter);
  }

  const continuity = await request(`/api/book-builder/projects/${project.projectId}/continuity`);
  const expectedContinuityCount = chapterCount * targetPages * panelsPerPage;
  if (!Array.isArray(continuity) || continuity.length < expectedContinuityCount) {
    throw new Error(`Continuity tracking expected at least ${expectedContinuityCount} entries, got ${continuity?.length ?? 0}.`);
  }

  const assets = await request(`/api/book-builder/projects/${project.projectId}/assets`);
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error("No assets saved.");
  }
  if (!assets.some((asset) => asset.category === "style-bible")) throw new Error("Style bible asset missing.");
  if (!assets.some((asset) => asset.category === "character-bible")) throw new Error("Character bible asset missing.");
  if (!assets.some((asset) => asset.category === "continuity-log")) throw new Error("Continuity log asset missing.");
  if (!assets.some((asset) => asset.category === "panel-prompt")) throw new Error("Panel prompt assets missing.");

  console.log("E2E: building export manifest");
  const manifest = await request(`/api/book-builder/projects/${project.projectId}/export/manifest`);
  if (manifest.totalChapters !== chapterCount) throw new Error(`Export manifest expected ${chapterCount} chapters, got ${manifest.totalChapters}.`);
  if (manifest.totalPages !== chapterCount * targetPages) throw new Error(`Export manifest page count mismatch: ${manifest.totalPages}.`);
  if (manifest.totalPanels !== chapterCount * targetPages * panelsPerPage) throw new Error(`Export manifest panel count mismatch: ${manifest.totalPanels}.`);
  if (manifest.pagesPerPage !== panelsPerPage) throw new Error(`Export manifest panels-per-page mismatch: ${manifest.pagesPerPage}.`);
  if (!manifest.files.some((file) => file.path === manifest.manifestPath && file.category === "export-manifest" && file.bytes > 0)) {
    throw new Error("Export manifest does not include its own persisted manifest file.");
  }
  if (!manifest.files.some((file) => file.category === "continuity-log")) throw new Error("Export manifest missing continuity log.");
  if (!manifest.files.some((file) => file.category === "panel-prompt")) throw new Error("Export manifest missing panel prompts.");
  const assetsAfterExport = await request(`/api/book-builder/projects/${project.projectId}/assets`);
  if (!assetsAfterExport.some((asset) => asset.path === manifest.manifestPath && asset.category === "export-manifest" && asset.bytes > 0)) {
    throw new Error("Persisted export manifest is not visible through project assets.");
  }

  let artworkBytes = 0;
  if (process.env.E2E_GENERATE_ARTWORK === "1") {
    console.log("E2E: generating panel artwork");
    const firstChapter = chapters[0];
    const artwork = await request(
      `/api/book-builder/projects/${project.projectId}/chapters/${firstChapter.chapterId}/pages/1/panels/1/artwork`,
      { method: "POST" },
    );
    const artworkResponse = await fetch(`${API_BASE}${artwork.artworkApiPath}`, { headers: authHeaders });
    if (!artworkResponse.ok) throw new Error(`Artwork fetch failed: ${artworkResponse.status}`);
    if (!String(artworkResponse.headers.get("content-type")).startsWith("image/")) {
      throw new Error("Artwork endpoint did not return an image.");
    }
    artworkBytes = (await artworkResponse.arrayBuffer()).byteLength;
    if (artworkBytes < 1000) throw new Error("Generated artwork file is unexpectedly small.");
    if (!artwork.characterBiblesUsed?.includes("kai")) throw new Error("Panel artwork did not use Kai's character bible.");
    if (!artwork.characterReferencesUsed?.length) throw new Error("Panel artwork did not use the saved character reference image.");
    const generatedChapter = await request(`/api/book-builder/projects/${project.projectId}/chapters/${firstChapter.chapterId}`);
    const generatedPanel = generatedChapter.pages[0].panels[0];
    if (!generatedPanel.assetFiles.some((entry) => /clean-art|clean-/.test(entry))) throw new Error("Clean pre-lettering artwork asset is missing.");
    if (!generatedPanel.assetFiles.some((entry) => /lettering-.*\.svg$/i.test(entry))) throw new Error("Editable SVG lettering asset is missing.");
  }

  const smoke = {
    projectId: project.projectId,
    chapterIds: chapters.map((chapter) => chapter.chapterId),
    chapterCount,
    targetPages,
    panelsPerPage,
    totalPages: manifest.totalPages,
    totalPanels: manifest.totalPanels,
    continuityCount: continuity.length,
    assetsCount: assetsAfterExport.length,
    manifestPath: manifest.manifestPath,
    artworkBytes,
    characterArtworkBytes,
  };
  console.log("E2E PASS", JSON.stringify(smoke, null, 2));
}

main().catch((error) => {
  console.error("E2E FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
