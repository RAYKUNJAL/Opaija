import { Coordination } from "./coordination.js";
import express from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { ProductionStore } from './store.js';
import { hashFile, sourceFile } from './render.js';
import type { Panel } from './store.js';
export function productionRouter(store:ProductionStore,assetRoot:string) {
  const router=express.Router();
  const coordination=new Coordination(store);
  router.use((req,res,next)=>{
    const key=process.env.PRODUCTION_ADMIN_TOKEN;
    if(!key||key.length<32){res.status(503).json({error:'Production admin authentication is not configured.'});return;}
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    const hash=(s:string)=>createHash('sha256').update(s).digest();
    const admin=timingSafeEqual(hash(token),hash(key));
    const agentKey=process.env.PRODUCTION_AGENT_TOKEN;
    const agent=Boolean(agentKey && agentKey.length>=32 && timingSafeEqual(hash(token),hash(agentKey)));
    if(!admin&&!agent){res.status(401).json({error:'Unauthorized'});return;}
    const agentAllowed=(req.method==='GET'&&['/status','/panels','/jobs','/memory','/inbox'].includes(req.path))||(req.method==='POST'&&['/jobs','/memory','/handoffs'].includes(req.path));
    if(!admin&&!agentAllowed){res.status(403).json({error:'Agent permission does not include approval, subscriber access or release.'});return;}
    next();
  });
  const endpoint=(fn:(req:express.Request,res:express.Response)=>unknown)=>async(req:express.Request,res:express.Response)=>{try{await fn(req,res);}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Request failed'});}};
  router.get('/memory',endpoint((_req,res)=>res.json(coordination.memories())));
  router.post('/memory',endpoint((req,res)=>res.status(201).json({id:coordination.remember('production-agent',req.body.topic,req.body.body,req.body.evidence)})));
  router.post('/handoffs',endpoint((req,res)=>res.status(201).json({id:coordination.handoff('production-agent',req.body.recipient,req.body.kind,req.body.payload)})));
  router.get('/inbox',endpoint((req,res)=>res.json(coordination.inbox(String(req.query.recipient||'production-agent')))));
  router.post('/social/slots',endpoint((req,res)=>res.json(coordination.slots(req.body.day,req.body.platforms))));
  router.post('/social/schedule',endpoint((req,res)=>{coordination.schedule(req.body.slotId,req.body.jobId,req.body.caption,req.body.targetUrl);res.status(202).json({status:'blocked_connection',message:'Saved; no live platform adapter is connected.'});}));
  router.get('/social/due',endpoint((_req,res)=>res.json(coordination.due())));
  router.get('/status',endpoint((_req,res)=>res.json({renderer:'motion-comic-v1',workerEnabled:process.env.PRODUCTION_WORKER_ENABLED==='true',goose:'not_connected',paperclip:'not_connected',paidVideo:'not_connected',pod:'draft_only',publication:'manual_review',jobs:store.jobs().map(({spec,...j})=>j)})));
  router.get('/panels',endpoint((_req,res)=>res.json(store.panels())));
  router.post('/panels',endpoint(async(req,res)=>{
    const p=req.body as Panel;
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||typeof p.file!=='string'||typeof p.canonVersion!=='string'||!p.canonVersion.trim())throw new Error('Panel ID, local image path and canon version are required.');
    if(!Number.isInteger(p.page)||p.page<1||!Number.isInteger(p.panel)||p.panel<1||p.panel>99)throw new Error('Valid page and panel numbers required.');
    if(typeof p.caption!=='string'||p.caption.length>120||/[\x00-\x1f]/.test(p.caption))throw new Error('Caption must be plain text, at most 120 characters.');
    if(!Array.isArray(p.characters)||!Array.isArray(p.props)||[...p.characters,...p.props].some(v=>typeof v!=='string'||v.length>100))throw new Error('Character and prop IDs are required.');
    const file=await sourceFile(assetRoot,p.file);
    res.status(201).json(store.register({...p,sha256:await hashFile(file),approved:false}));
  }));
  router.post('/panels/:id/approve',endpoint(async(req,res)=>{const p=store.panel(String(req.params.id));if(await hashFile(await sourceFile(assetRoot,p.file))!==req.body.sha256)throw new Error('Source bytes changed.');res.json(store.approvePanel(p.id,req.body.sha256));}));
  router.post('/jobs',endpoint((req,res)=>res.status(202).json(store.enqueue(req.body.panelIds,req.body.canonVersion))));
  router.get('/jobs',endpoint((_req,res)=>res.json(store.jobs())));
  router.post('/jobs/:id/retry',endpoint((req,res)=>res.json(store.retry(String(req.params.id)))));
  router.post('/jobs/:id/review',endpoint(async(req,res)=>{
    const j=store.job(String(req.params.id));if(typeof req.body.approved!=='boolean'||typeof req.body.note!=='string')throw new Error('Approval decision and note required.');
    if(!j.artifact||await hashFile(j.artifact)!==j.outputHash)throw new Error('Rendered artifact changed.');
    res.json(store.review(j.id,req.body.outputHash,req.body.approved,req.body.note));
  }));
  router.get('/jobs/:id/video',endpoint(async(req,res)=>{const j=store.job(String(req.params.id));if(!j.artifact||!['needs_review','approved','rejected'].includes(j.status))throw new Error('No rendered video yet.');res.setHeader('Cache-Control','no-store');res.sendFile(j.artifact);}));
  router.get('/jobs/:id/events',endpoint((req,res)=>res.json(store.db.prepare('SELECT * FROM events WHERE jobId=? ORDER BY id').all(String(req.params.id)))));
  return router;
}
