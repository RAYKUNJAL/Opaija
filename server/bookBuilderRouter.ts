import { Router } from "express";
import {
  type CharacterBible,
  type HermesImportRequest,
  type ProjectCoverUpdate,
  type ChapterGenerationInput,
  createProject,
  importHermesPackage,
  getBookBuilderHealth,
  checkBookBuilderStoryProvider,
  getBookJob,
  getChapterPayload,
  getCharacterArtworkPath,
  getCanonicalCharacterArtworkPath,
  getPanelArtworkPath,
  getProject,
  getProjectContinuity,
  getProjectJobs,
  listProjectAssets,
  listCanonicalCharacters,
  listProjects,
  getConfiguredArtworkModels,
  generatePanelArtwork,
  generateCharacterArtwork,
  generateProjectCover,
  getProjectCoverArtworkPath,
  upsertProjectCover,
  type ProjectSetupInput,
  regenerateJob,
  buildAllPanelArtwork,
  deleteEmptyProjects,
  deleteProject,
  type KdpEstimateRequest,
  getKdpEstimate,
  updatePageContent,
  updatePanelContent,
  setStyleBible,
  startChapterGeneration,
  type StyleBibleInput,
  upsertCharacterBible,
  upsertProjectSetup,
  buildProjectExportManifest,
} from "./bookBuilder.js";

export const bookBuilderRouter = Router();

bookBuilderRouter.get("/canon/characters", async (_request, response) => {
  try {
    response.json(await listCanonicalCharacters());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to load canonical cast." });
  }
});

bookBuilderRouter.get("/canon/characters/:characterId/artwork", async (request, response) => {
  try {
    response.sendFile(await getCanonicalCharacterArtworkPath(request.params.characterId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Canonical artwork not found." });
  }
});

bookBuilderRouter.get("/health", async (_request, response) => {
  try {
    response.json(await getBookBuilderHealth());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to fetch health." });
  }
});

bookBuilderRouter.post("/provider-check", async (_request, response) => {
  try {
    await checkBookBuilderStoryProvider();
    response.json(await getBookBuilderHealth());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to check story provider." });
  }
});

bookBuilderRouter.get("/artwork-models", async (_request, response) => {
  try {
    response.json(getConfiguredArtworkModels());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to load artwork models." });
  }
});

bookBuilderRouter.get("/projects", async (_request, response) => {
  try {
    response.json(await listProjects());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to list projects." });
  }
});

bookBuilderRouter.post("/projects", async (request, response) => {
  try {
    response.status(201).json(await createProject(request.body as ProjectSetupInput));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create project." });
  }
});

bookBuilderRouter.post("/projects/import", async (request, response) => {
  try {
    response.status(201).json(await importHermesPackage(request.body as HermesImportRequest));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to import Hermes source." });
  }
});

bookBuilderRouter.delete("/projects/cleanup-empty", async (_request, response) => {
  try {
    response.json(await deleteEmptyProjects());
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to cleanup empty books." });
  }
});

bookBuilderRouter.get("/projects/:projectId", async (request, response) => {
  try {
    response.json(await getProject(request.params.projectId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Project not found." });
  }
});

bookBuilderRouter.patch("/projects/:projectId/setup", async (request, response) => {
  try {
    response.json(await upsertProjectSetup(request.params.projectId, request.body as Partial<ProjectSetupInput>));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to update project setup." });
  }
});

bookBuilderRouter.delete("/projects/:projectId", async (request, response) => {
  try {
    await deleteProject(request.params.projectId);
    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to delete project." });
  }
});

bookBuilderRouter.post("/projects/:projectId/kdp-estimate", async (request, response) => {
  try {
    response.json(await getKdpEstimate(request.params.projectId, request.body as KdpEstimateRequest));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to estimate project KDP price." });
  }
});

bookBuilderRouter.put("/projects/:projectId/style-bible", async (request, response) => {
  try {
    response.json(await setStyleBible(request.params.projectId, request.body as StyleBibleInput));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to store style bible." });
  }
});

bookBuilderRouter.post("/projects/:projectId/character-bibles", async (request, response) => {
  try {
    response.status(201).json(await upsertCharacterBible(request.params.projectId, request.body as CharacterBible));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to save character bible." });
  }
});

bookBuilderRouter.post("/projects/:projectId/character-bibles/:characterId/artwork", async (request, response) => {
  try {
    response.status(201).json(await generateCharacterArtwork(request.params.projectId, request.params.characterId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to generate character artwork." });
  }
});

bookBuilderRouter.post("/projects/:projectId/build-artwork", async (request, response) => {
  try {
    response.status(201).json(await buildAllPanelArtwork(request.params.projectId, request.body ?? {}));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to build project artwork." });
  }
});

bookBuilderRouter.get("/projects/:projectId/character-bibles/:characterId/artwork/:fileName", async (request, response) => {
  try {
    response.sendFile(await getCharacterArtworkPath(request.params.projectId, request.params.characterId, request.params.fileName));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Character artwork not found." });
  }
});

bookBuilderRouter.patch("/projects/:projectId/cover", async (request, response) => {
  try {
    response.json(await upsertProjectCover(request.params.projectId, request.body as ProjectCoverUpdate));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to save cover settings." });
  }
});

bookBuilderRouter.post("/projects/:projectId/cover/:side/artwork", async (request, response) => {
  try {
    response.status(201).json(await generateProjectCover(request.params.projectId, request.params.side as "front" | "back"));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to generate cover." });
  }
});

bookBuilderRouter.get(
  "/projects/:projectId/cover/:side/artwork/:fileName",
  async (request, response) => {
    try {
      response.sendFile(
        await getProjectCoverArtworkPath(request.params.projectId, request.params.side as "front" | "back", request.params.fileName),
      );
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Cover artwork not found." });
    }
  },
);

bookBuilderRouter.post("/projects/:projectId/jobs", async (request, response) => {
  try {
    response.status(202).json(
      await startChapterGeneration(request.params.projectId, request.body as ChapterGenerationInput),
    );
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to start chapter generation." });
  }
});

bookBuilderRouter.get("/projects/:projectId/jobs", async (request, response) => {
  try {
    response.json(await getProjectJobs(request.params.projectId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to list jobs." });
  }
});

bookBuilderRouter.get("/jobs/:jobId", async (request, response) => {
  try {
    response.json(await getBookJob(request.params.jobId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Job not found." });
  }
});

bookBuilderRouter.post("/jobs/:jobId/regenerate", async (request, response) => {
  try {
    response.status(202).json(await regenerateJob(request.params.jobId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to regenerate job." });
  }
});

bookBuilderRouter.get("/projects/:projectId/continuity", async (request, response) => {
  try {
    response.json(await getProjectContinuity(request.params.projectId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Unable to load continuity." });
  }
});

bookBuilderRouter.get("/projects/:projectId/assets", async (request, response) => {
  try {
    response.json(await listProjectAssets(request.params.projectId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Unable to list assets." });
  }
});

bookBuilderRouter.get("/projects/:projectId/export/manifest", async (request, response) => {
  try {
    response.json(await buildProjectExportManifest(request.params.projectId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to build export manifest." });
  }
});

bookBuilderRouter.get("/projects/:projectId/chapters/:chapterId", async (request, response) => {
  try {
    response.json(await getChapterPayload(request.params.projectId, request.params.chapterId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Chapter not found." });
  }
});

bookBuilderRouter.post(
  "/projects/:projectId/chapters/:chapterId/pages/:pageNumber/panels/:panelNumber/artwork",
  async (request, response) => {
    try {
      response.status(201).json(
        await generatePanelArtwork(
          request.params.projectId,
          request.params.chapterId,
          Number(request.params.pageNumber),
          Number(request.params.panelNumber),
        ),
      );
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Unable to generate artwork." });
    }
  },
);

bookBuilderRouter.patch(
  "/projects/:projectId/chapters/:chapterId/pages/:pageNumber/panels/:panelNumber",
  async (request, response) => {
    try {
      response.json(
        await updatePanelContent(
          request.params.projectId,
          request.params.chapterId,
          Number(request.params.pageNumber),
          Number(request.params.panelNumber),
          request.body ?? {},
        ),
      );
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Unable to save panel content." });
    }
  },
);

bookBuilderRouter.patch(
  "/projects/:projectId/chapters/:chapterId/pages/:pageNumber",
  async (request, response) => {
    try {
      response.json(
        await updatePageContent(
          request.params.projectId,
          request.params.chapterId,
          Number(request.params.pageNumber),
          request.body ?? {},
        ),
      );
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Unable to save page content." });
    }
  },
);

bookBuilderRouter.get(
  "/projects/:projectId/chapters/:chapterId/pages/:pageNumber/panels/:panelNumber/artwork/:fileName",
  async (request, response) => {
    try {
      const filePath = await getPanelArtworkPath(
        request.params.projectId,
        request.params.chapterId,
        Number(request.params.pageNumber),
        Number(request.params.panelNumber),
        request.params.fileName,
      );
      response.sendFile(filePath);
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Artwork not found." });
    }
  },
);
