import { Router } from "express";
import {
  BOOK_PRINT_TRIM_PRESETS,
  claimBookPrintJob,
  completeBookPrintJob,
  createBookPrintJob,
  failBookPrintJob,
  getBookPrintArtifactPath,
  getBookPrintJob,
  getBookPrintWorkerContract,
  heartbeatBookPrintJob,
  listBookPrintJobs,
  retryBookPrintJob,
  type BookPrintArtifactName,
  type CreateBookPrintJobInput,
} from "./bookPrintEngine.js";

export const bookPrintRouter = Router();

bookPrintRouter.get("/trim-presets", (_request, response) => {
  response.json(Object.values(BOOK_PRINT_TRIM_PRESETS));
});

bookPrintRouter.post("/projects/:projectId/jobs", async (request, response) => {
  try {
    const job = await createBookPrintJob(request.params.projectId, (request.body ?? {}) as CreateBookPrintJobInput);
    response.status(job.status === "blocked" ? 422 : 202).json(job);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create print job." });
  }
});

bookPrintRouter.get("/projects/:projectId/jobs", async (request, response) => {
  try {
    response.json(await listBookPrintJobs(request.params.projectId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to list print jobs." });
  }
});

bookPrintRouter.get("/jobs/:jobId", async (request, response) => {
  try {
    response.json(await getBookPrintJob(request.params.jobId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Print job not found." });
  }
});

bookPrintRouter.post("/jobs/:jobId/claim", async (request, response) => {
  try {
    const workerId = String(request.body?.workerId ?? "");
    const leaseMs = request.body?.leaseMs === undefined ? undefined : Number(request.body.leaseMs);
    const job = await claimBookPrintJob(request.params.jobId, workerId, leaseMs);
    response.json({ job, contract: await getBookPrintWorkerContract(job.jobId, workerId) });
  } catch (error) {
    response.status(409).json({ error: error instanceof Error ? error.message : "Unable to claim print job." });
  }
});

bookPrintRouter.post("/jobs/:jobId/heartbeat", async (request, response) => {
  try {
    response.json(
      await heartbeatBookPrintJob(
        request.params.jobId,
        String(request.body?.workerId ?? ""),
        request.body?.progress === undefined ? undefined : Number(request.body.progress),
      ),
    );
  } catch (error) {
    response.status(409).json({ error: error instanceof Error ? error.message : "Unable to renew print job lease." });
  }
});

bookPrintRouter.post("/jobs/:jobId/complete", async (request, response) => {
  try {
    response.json(await completeBookPrintJob(request.params.jobId, String(request.body?.workerId ?? "")));
  } catch (error) {
    response.status(422).json({ error: error instanceof Error ? error.message : "Print PDF postflight failed." });
  }
});

bookPrintRouter.post("/jobs/:jobId/fail", async (request, response) => {
  try {
    response.json(
      await failBookPrintJob(
        request.params.jobId,
        String(request.body?.workerId ?? ""),
        String(request.body?.error ?? "PDF renderer failed."),
      ),
    );
  } catch (error) {
    response.status(409).json({ error: error instanceof Error ? error.message : "Unable to fail print job." });
  }
});

bookPrintRouter.post("/jobs/:jobId/retry", async (request, response) => {
  try {
    response.status(202).json(await retryBookPrintJob(request.params.jobId));
  } catch (error) {
    response.status(409).json({ error: error instanceof Error ? error.message : "Unable to retry print job." });
  }
});

bookPrintRouter.get("/jobs/:jobId/artifacts/:artifact", async (request, response) => {
  try {
    response.sendFile(await getBookPrintArtifactPath(request.params.jobId, request.params.artifact as BookPrintArtifactName));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Print artifact not found." });
  }
});
