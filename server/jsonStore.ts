import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const locks = new Map<string, Promise<unknown>>();
// Single-process serialization. Multiple server processes require a transactional database.
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}
export function updateJson<T>(file: string, fallback: T, update: (value: T) => T): Promise<T> {
  const run = (locks.get(file) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const next = update(await readJson(file, fallback));
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, file);
    return next;
  });
  locks.set(file, run);
  void run.finally(() => { if (locks.get(file) === run) locks.delete(file); }).catch(() => {});
  return run;
}
