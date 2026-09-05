import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { updateJson } from '../server/jsonStore.js';
import { planShort, type ApprovedPanel } from '../server/contentPlan.js';
test('concurrent writes retain every signup; corrupt storage is preserved', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opaija-'));
  const file = path.join(dir, 'leads.json');
  try {
    await Promise.all(Array.from({length:100}, (_, i) => updateJson<number[]>(file, [], a => [...a, i])));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).length, 100);
    await writeFile(file, '{damaged');
    await assert.rejects(updateJson<number[]>(file, [], a => [...a, 101]));
    assert.equal(await readFile(file, 'utf8'), '{damaged');
  } finally { await rm(dir, {recursive:true, force:true}); }
});
const panel: ApprovedPanel = {id:'B0-P01-A', sha256:'a'.repeat(64), canonVersion:'1', approved:true, imageUrl:'https://opaija.com/art.png', page:1, panel:1, caption:'Exact script.', characters:['kai'], props:[]};
test('plans are idempotent and cannot publish; stale and duplicate inputs fail', () => {
  assert.equal(planShort([panel], '1').idempotencyKey, planShort([panel], '1').idempotencyKey);
  assert.equal(planShort([panel], '1').publicationAllowed, false);
  assert.throws(() => planShort([panel], '2'));
  assert.throws(() => planShort([panel, panel], '1'));
  assert.throws(() => planShort([{...panel, approved:false}], '1'));
});
