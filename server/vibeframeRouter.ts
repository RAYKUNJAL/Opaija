import { Router, type NextFunction, type Request, type Response } from "express";
import {
  VibeFrameAdapterError,
  buildVibeFrameProject,
  cancelVibeFrameJob,
  getVibeFrameAdapterStatus,
  getVibeFrameJob,
  initVibeFrameProject,
  inspectVibeFrameProject,
  listVibeFrameJobs,
  planVibeFrameProject,
  remixVibeFrameProject,
  renderVibeFrameProject,
  runVibeFrameDoctor,
  runVibeFrameDryRun,
  runVibeFrameSchema,
  statusVibeFrameProject,
  type PaidOperationResult,
} from "./vibeframeAdapter.js";

export const vibeframeRouter = Router();

type AsyncRoute = (request: Request, response: Response, next: NextFunction) => Promise<void>;

const asyncRoute = (handler: AsyncRoute) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };

const requireJson = (request: Request, response: Response, next: NextFunction): void => {
  if (!request.is("application/json")) {
    response.status(415).json({
      error: {
        code: "JSON_REQUIRED",
        message: "Content-Type must be application/json.",
      },
    });
    return;
  }
  next();
};

const sendPaidResult = (response: Response, result: PaidOperationResult): void => {
  response.status(result.mode === "submitted" ? 202 : 200).json(result);
};

vibeframeRouter.get("/health", asyncRoute(async (_request, response) => {
  response.json(await getVibeFrameAdapterStatus());
}));

vibeframeRouter.get("/doctor", asyncRoute(async (request, response) => {
  response.json(await runVibeFrameDoctor({
    verbose: readQueryBoolean(request, "verbose"),
    timeoutMs: readQueryNumber(request, "timeoutMs"),
  }));
}));

vibeframeRouter.get("/schema", asyncRoute(async (request, response) => {
  response.json(await runVibeFrameSchema(readQueryString(request, "command")));
}));

vibeframeRouter.get("/jobs", asyncRoute(async (request, response) => {
  response.json({ jobs: await listVibeFrameJobs(readQueryNumber(request, "limit") ?? 50) });
}));

vibeframeRouter.get("/jobs/:jobId", asyncRoute(async (request, response) => {
  response.json(await getVibeFrameJob(request.params.jobId));
}));

vibeframeRouter.delete("/jobs/:jobId", asyncRoute(async (request, response) => {
  response.json(await cancelVibeFrameJob(request.params.jobId));
}));

vibeframeRouter.get("/projects/:projectId/status", asyncRoute(async (request, response) => {
  response.json(await statusVibeFrameProject(request.params.projectId, {
    refresh: readQueryBoolean(request, "refresh"),
    timeoutMs: readQueryNumber(request, "timeoutMs"),
  }));
}));

vibeframeRouter.use("/projects/:projectId", requireJson);

vibeframeRouter.post("/projects/:projectId/init", asyncRoute(async (request, response) => {
  response.json(await initVibeFrameProject(request.params.projectId, request.body));
}));

vibeframeRouter.post("/projects/:projectId/plan", asyncRoute(async (request, response) => {
  response.json(await planVibeFrameProject(request.params.projectId, request.body));
}));

vibeframeRouter.post("/projects/:projectId/dry-run", asyncRoute(async (request, response) => {
  sendPaidResult(response, await runVibeFrameDryRun(request.params.projectId, request.body));
}));

vibeframeRouter.post("/projects/:projectId/build", asyncRoute(async (request, response) => {
  sendPaidResult(response, await buildVibeFrameProject(request.params.projectId, request.body));
}));

vibeframeRouter.post("/projects/:projectId/render", asyncRoute(async (request, response) => {
  sendPaidResult(response, await renderVibeFrameProject(request.params.projectId, request.body));
}));

vibeframeRouter.post("/projects/:projectId/inspect", asyncRoute(async (request, response) => {
  response.json(await inspectVibeFrameProject(request.params.projectId, request.body));
}));

vibeframeRouter.post("/projects/:projectId/remix", asyncRoute(async (request, response) => {
  sendPaidResult(response, await remixVibeFrameProject(request.params.projectId, request.body));
}));

vibeframeRouter.use((error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
  if (error instanceof VibeFrameAdapterError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "VIBEFRAME_INTERNAL_ERROR",
      message: "The VibeFrame operation failed.",
    },
  });
});

function readQueryString(request: Request, key: string): string | undefined {
  const value = request.query[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new VibeFrameAdapterError(`${key} must be a single non-empty string.`, "VALIDATION_ERROR", 400);
  }
  return value.trim();
}

function readQueryBoolean(request: Request, key: string): boolean | undefined {
  const value = readQueryString(request, key);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new VibeFrameAdapterError(`${key} must be true or false.`, "VALIDATION_ERROR", 400);
}

function readQueryNumber(request: Request, key: string): number | undefined {
  const value = readQueryString(request, key);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new VibeFrameAdapterError(`${key} must be a positive integer.`, "VALIDATION_ERROR", 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new VibeFrameAdapterError(`${key} must be a positive integer.`, "VALIDATION_ERROR", 400);
  }
  return parsed;
}

export default vibeframeRouter;
