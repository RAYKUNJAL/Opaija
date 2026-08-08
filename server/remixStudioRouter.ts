import { Router, type Request, type Response } from "express";
import {
  RemixStudioError,
  addRemixOutputGroup,
  buildVibeFrameHandoff,
  createRemixProject,
  deleteRemixOutputGroup,
  deleteRemixProject,
  getRemixManifest,
  getRemixProject,
  getRemixStudioHealth,
  getRemixVersion,
  getVibeFrameHandoff,
  listRemixManifests,
  listRemixProjects,
  listRemixSourceBooks,
  listRemixSourceVideos,
  listRemixVersions,
  materializeRemixProject,
  updateRemixNode,
  updateRemixOutputGroup,
  updateRemixPlan,
  updateRemixProject,
  type CreateRemixProjectInput,
  type MaterializeRemixInput,
  type RemixOutputGroup,
  type UpdateContentNodeInput,
  type UpdateRemixPlanInput,
  type UpdateRemixProjectInput,
} from "./remixStudio.js";

type AsyncHandler = (request: Request, response: Response) => Promise<void>;

function route(handler: AsyncHandler) {
  return (request: Request, response: Response) => {
    void handler(request, response).catch((error: unknown) => {
      const status = error instanceof RemixStudioError ? error.statusCode : 500;
      response.status(status).json({
        error: error instanceof Error ? error.message : "Remix Studio request failed.",
      });
    });
  };
}

export const remixStudioRouter = Router();

remixStudioRouter.get("/health", route(async (_request, response) => {
  response.json(await getRemixStudioHealth());
}));

remixStudioRouter.get("/sources/books", route(async (_request, response) => {
  response.json(await listRemixSourceBooks());
}));

remixStudioRouter.get("/sources/videos", route(async (_request, response) => {
  response.json(await listRemixSourceVideos());
}));

remixStudioRouter.get("/projects", route(async (_request, response) => {
  response.json(await listRemixProjects());
}));

remixStudioRouter.post("/projects", route(async (request, response) => {
  response.status(201).json(await createRemixProject(request.body as CreateRemixProjectInput));
}));

remixStudioRouter.get("/projects/:projectId", route(async (request, response) => {
  response.json(await getRemixProject(request.params.projectId));
}));

remixStudioRouter.patch("/projects/:projectId", route(async (request, response) => {
  response.json(await updateRemixProject(request.params.projectId, request.body as UpdateRemixProjectInput));
}));

remixStudioRouter.delete("/projects/:projectId", route(async (request, response) => {
  response.json(await deleteRemixProject(request.params.projectId));
}));

remixStudioRouter.get("/projects/:projectId/versions", route(async (request, response) => {
  response.json(await listRemixVersions(request.params.projectId));
}));

remixStudioRouter.get("/projects/:projectId/versions/:version", route(async (request, response) => {
  response.json(await getRemixVersion(request.params.projectId, Number(request.params.version)));
}));

remixStudioRouter.put("/projects/:projectId/plan", route(async (request, response) => {
  response.json(await updateRemixPlan(request.params.projectId, request.body as UpdateRemixPlanInput));
}));

remixStudioRouter.post("/projects/:projectId/output-groups", route(async (request, response) => {
  const input = request.body as Partial<RemixOutputGroup> & Pick<RemixOutputGroup, "kind" | "title" | "beatNodeIds">;
  response.status(201).json(await addRemixOutputGroup(request.params.projectId, input));
}));

remixStudioRouter.patch("/projects/:projectId/output-groups/:outputGroupId", route(async (request, response) => {
  response.json(await updateRemixOutputGroup(
    request.params.projectId,
    request.params.outputGroupId,
    request.body as Partial<Omit<RemixOutputGroup, "id" | "createdAt">>,
  ));
}));

remixStudioRouter.delete("/projects/:projectId/output-groups/:outputGroupId", route(async (request, response) => {
  response.json(await deleteRemixOutputGroup(request.params.projectId, request.params.outputGroupId));
}));

remixStudioRouter.patch("/projects/:projectId/nodes/:nodeId", route(async (request, response) => {
  response.json(await updateRemixNode(
    request.params.projectId,
    request.params.nodeId,
    request.body as UpdateContentNodeInput,
  ));
}));

remixStudioRouter.post("/projects/:projectId/materialize", route(async (request, response) => {
  response.status(201).json(await materializeRemixProject(
    request.params.projectId,
    (request.body ?? {}) as MaterializeRemixInput,
  ));
}));

remixStudioRouter.get("/projects/:projectId/manifests", route(async (request, response) => {
  response.json(await listRemixManifests(request.params.projectId));
}));

remixStudioRouter.get("/projects/:projectId/manifests/:manifestId", route(async (request, response) => {
  response.json(await getRemixManifest(request.params.projectId, request.params.manifestId));
}));

remixStudioRouter.post("/projects/:projectId/vibeframe-handoff", route(async (request, response) => {
  response.status(201).json(await buildVibeFrameHandoff(
    request.params.projectId,
    (request.body ?? {}) as { outputGroupIds?: string[] },
  ));
}));

remixStudioRouter.get("/projects/:projectId/vibeframe-handoffs/:handoffId", route(async (request, response) => {
  response.json(await getVibeFrameHandoff(request.params.projectId, request.params.handoffId));
}));

export default remixStudioRouter;
