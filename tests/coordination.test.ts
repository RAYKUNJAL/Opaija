import test from 'node:test';import assert from 'node:assert/strict';import { mkdtemp,rm } from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import { ProductionStore } from '../server/production/store.js';import { Coordination } from '../server/production/coordination.js';
test('shared memory stays separate from canon; handoffs and ten daily slots deduplicate',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'opaija-coordination-'));const store=new ProductionStore(path.join(root,'store.sqlite'));const c=new Coordination(store);
 try {
  assert.throws(()=>c.remember('agent','canon','change weapon','none'));
  c.remember('agent','correction','Staff geometry needs review','job:fixture');assert.equal(c.memories().length,1);
  const id=c.handoff('producer','reviewer','review',{jobId:'fixture'});assert.equal(c.handoff('producer','reviewer','review',{jobId:'fixture'}),id);assert.equal(c.inbox('reviewer').length,1);
  assert.equal(c.slots('2026-09-05',['instagram','youtube']).length,20);assert.equal(c.slots('2026-09-05',['instagram','youtube']).length,20);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM social_slots WHERE status='empty'").get()?.n,20);
  assert.throws(()=>c.schedule('2026-09-05-instagram-1','missing','caption','https://opaija.com'));
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
