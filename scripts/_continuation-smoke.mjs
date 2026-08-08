import { spawn } from 'node:child_process';
import process from 'node:process';

const projectId = '61d61f31-2850-49a8-b590-8b461504cf64';
const chapterId = 'chapter-641b86f976';
const port = 18120;
const base = `http://127.0.0.1:${port}`;
const dataDir = `C:/Users/Banjo/OneDrive/Documents/Opaija/data/book-builder`;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function request(path, options = {}) {
  return fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${payload.error ?? 'request failed'}`);
    }
    return payload;
  });
}

async function waitForHealth(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/book-builder/health`);
      if (response.ok) return true;
    } catch {}
    await sleep(500);
  }
  throw new Error('Server health check timeout.');
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const job = await request(`/api/book-builder/jobs/${jobId}`);
    console.log(`JOB ${job.jobId} status=${job.status} progress=${job.progress}%`);
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(job.error || 'job failed');
    await sleep(1200);
  }
  throw new Error(`Job ${jobId} did not complete in time.`);
}

const server = spawn('node', ['dist-server/index.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    BOOK_BUILDER_DATA_DIR: dataDir,
    NODE_ENV: 'development',
    BOOK_BUILDER_FORCE_MOCK: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let exit = null;
server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${String(chunk)}`));
server.stderr.on('data', (chunk) => process.stdout.write(`[server] ${String(chunk)}`));
server.once('close', (code, signal) => {
  exit = `code=${code} signal=${signal}`;
});

try {
  await waitForHealth();
  const before = await request(`/api/book-builder/projects/${projectId}`);
  const chapterCount = before.chapters?.length ?? 0;
  console.log('Before chapters:', chapterCount, 'selected chapter?', before.chapters?.find(c => c.chapterId === chapterId)?.chapterId);

  const result = await request(`/api/book-builder/projects/${projectId}/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      chapterTitle: 'Continuation test',
      chapterPrompt: 'Continue with continuity lock and chapter beat progression from page 11 to 13.',
      targetPages: 3,
      panelsPerPage: 1,
      includeDialogue: true,
      includeSoundEffects: true,
      appendToChapterId: chapterId,
      startPage: 11,
    }),
  });
  console.log('Start response:', result.jobId, result.status);

  const job = await waitForJob(result.jobId);
  const updated = await request(`/api/book-builder/projects/${projectId}`);
  const chapter = updated.chapters.find((entry) => entry.chapterId === chapterId);
  ensure(Boolean(chapter), 'Chapter was not found after continuation.');
  const payload = await request(`/api/book-builder/projects/${projectId}/chapters/${chapterId}`);
  const pages = payload.pages.map((page) => page.pageNumber);
  console.log('Pages now:', pages.join(','));
  ensure(pages.includes(11) && pages.includes(12) && pages.includes(13), 'Continuation pages 11-13 missing.');
  ensure(pages.length >= 5, 'Expected at least 5 pages after continuation.');

  const lastPage = payload.pages.at(-1)?.pageNumber;
  console.log('Last page:', lastPage, 'job warnings:', job.warnings?.join('|') ?? 'none');
  console.log('CONTINUATION_SMOKE_PASS');
} catch (error) {
  console.error('CONTINUATION_SMOKE_FAIL', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (!server.killed) server.kill('SIGINT');
  await sleep(300);
}
