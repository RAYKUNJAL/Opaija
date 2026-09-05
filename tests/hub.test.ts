import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import express from 'express';
import { ProductionStore } from '../server/production/store.js';
import { hashFile, run, probe } from '../server/production/render.js';
import { workOnce } from '../server/production/worker.js';
import { productionRouter } from '../server/production/api.js';
import { subscriptionsRouter } from '../server/production/subscribers.js';
test('persistent queue, leases, source gates and actual numbered video render',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'opaija-render-'));const assets=path.join(root,'assets');await mkdir(assets);
 const store=new ProductionStore(path.join(root,'queue.sqlite'));
 try {
  await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=teal:s=800x1000','-frames:v','1',path.join(assets,'fixture.png')]);
  const p={id:'fixture',file:'fixture.png',sha256:await hashFile(path.join(assets,'fixture.png')),canonVersion:'test-fixture',page:1,panel:1,caption:'Engineering test. Not story canon.',characters:[],props:[],approved:false};store.register(p);
  assert.throws(()=>store.enqueue(['fixture'],'test-fixture'));store.approvePanel(p.id,p.sha256);
  const j=store.enqueue(['fixture'],'test-fixture');assert.equal(store.enqueue(['fixture'],'test-fixture').id,j.id);
  assert.throws(()=>store.enqueue(['fixture','fixture'],'test-fixture'));
  const claimed=store.claim()!;assert.ok(claimed.lease);assert.equal(store.claim(),undefined);
  store.db.prepare('UPDATE jobs SET leaseUntil=0 WHERE id=?').run(j.id);
  const recovered=store.claim()!;assert.notEqual(recovered.lease,claimed.lease);assert.throws(()=>store.finish(claimed,'fake','fake'));
  store.db.prepare("UPDATE jobs SET status='queued',attempts=0,lease=NULL WHERE id=?").run(j.id);
  await workOnce(store,assets,path.join(root,'renders'));
  const completed=store.job(j.id);assert.equal(completed.status,'needs_review',completed.error||'');assert.ok(completed.artifact);
  const media=await probe(completed.artifact!);assert.equal(media.streams[0].width,1080);assert.equal(Number(media.format.duration),5);
  assert.throws(()=>store.review(j.id,'wrong',true,'QA'));store.review(j.id,completed.outputHash!,true,'Fixture technical test only');
  assert.equal(store.job(j.id).status,'approved');
  // Separate source revision detects changed bytes before rendering.
  store.register({...p,id:'fixture-two'});store.approvePanel('fixture-two',p.sha256);const bad=store.enqueue(['fixture-two'],'test-fixture');await writeFile(path.join(assets,'fixture.png'),'changed');await workOnce(store,assets,path.join(root,'renders'));assert.equal(store.job(bad.id).status,'failed');
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
test('production API rejects unauthenticated calls; drop consent, deduplication and unsubscribe persist',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'opaija-api-')),store=new ProductionStore(path.join(root,'queue.sqlite'));
 const old=process.env.PRODUCTION_ADMIN_TOKEN, oldAgent=process.env.PRODUCTION_AGENT_TOKEN;process.env.PRODUCTION_ADMIN_TOKEN='x'.repeat(40);process.env.PRODUCTION_AGENT_TOKEN='a'.repeat(40);
 const app=express();app.use(express.json());app.use('/api/production',productionRouter(store,root));app.use('/api/subscriptions',subscriptionsRouter(store));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 const signup=(body:unknown)=>fetch(base+'/api/subscriptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {
  assert.equal((await fetch(base+'/api/production/jobs')).status,401);
  assert.equal((await fetch(base+'/api/production/jobs',{headers:{Authorization:'Bearer '+'x'.repeat(40)}})).status,200);
  assert.equal((await fetch(base+'/api/production/panels/fixture/approve',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(40),'Content-Type':'application/json'},body:'{}'})).status,403);
  const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','server/production/mcp.ts'],env:{PATH:process.env.PATH||'',OPAIJA_API_URL:base,PRODUCTION_AGENT_TOKEN:'a'.repeat(40)}});
  const client=new Client({name:'opaija-test',version:'1.0.0'});
  try { await client.connect(transport);assert.equal((await client.listTools()).tools.length,7);const result=await client.callTool({name:'list_approved_sources',arguments:{}});assert.equal(result.isError,undefined); } finally {await client.close();}
  assert.equal((await signup({email:'fixture@example.com',interests:['books'],consent:false})).status,400);
  await Promise.all(Array.from({length:5},()=>signup({email:'fixture@example.com',interests:['books'],consent:true})));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM subscribers').get()?.n,1);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM email_outbox').get()?.n,1);
  const payload=JSON.parse(String(store.db.prepare('SELECT payload FROM email_outbox').get()?.payload));
  await fetch(base+'/api/subscriptions/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:payload.unsubscribeToken})});
  assert.equal(store.db.prepare('SELECT status FROM subscribers').get()?.status,'unsubscribed');assert.equal(store.db.prepare('SELECT status FROM email_outbox').get()?.status,'cancelled');
  await signup({email:'fixture@example.com',interests:['books'],consent:true});assert.equal(store.db.prepare('SELECT status FROM subscribers').get()?.status,'unsubscribed');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));store.db.close();if(old===undefined)delete process.env.PRODUCTION_ADMIN_TOKEN;else process.env.PRODUCTION_ADMIN_TOKEN=old;if(oldAgent===undefined)delete process.env.PRODUCTION_AGENT_TOKEN;else process.env.PRODUCTION_AGENT_TOKEN=oldAgent;await rm(root,{recursive:true,force:true});}
});
