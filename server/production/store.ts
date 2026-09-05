import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export type Panel = { id:string; file:string; sha256:string; canonVersion:string; page:number; panel:number; caption:string; characters:string[]; props:string[]; approved:boolean };
export type Job = { id:string; status:string; spec:string; lease:string|null; leaseUntil:number; attempts:number; error:string|null; artifact:string|null; outputHash:string|null; created:number };
export class ProductionStore {
  db: DatabaseSync;
  constructor(file:string) {
    mkdirSync(path.dirname(file), {recursive:true});
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS panels(id TEXT PRIMARY KEY, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL, spec TEXT NOT NULL, lease TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, artifact TEXT, outputHash TEXT, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, jobId TEXT NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL);`);
  }
  panels():Panel[] { return this.db.prepare('SELECT document FROM panels ORDER BY id').all().map(r=>JSON.parse(String(r.document))); }
  panel(id:string):Panel { const p=this.panels().find(p=>p.id===id); if(!p) throw new Error('Panel not found.'); return p; }
  register(p:Panel) { this.db.prepare('INSERT INTO panels VALUES(?,?)').run(p.id,JSON.stringify({...p,approved:false})); return this.panel(p.id); }
  approvePanel(id:string, hash:string) { const p=this.panel(id); if(p.sha256!==hash) throw new Error('Source hash changed.'); p.approved=true; this.db.prepare('UPDATE panels SET document=? WHERE id=?').run(JSON.stringify(p),id); this.event(id,'source_approved',hash); return p; }
  enqueue(ids:string[], canonVersion:string) {
    if(!Array.isArray(ids)||ids.length<1||ids.length>6||new Set(ids).size!==ids.length) throw new Error('Choose 1–6 unique panels.');
    let previous=0;
    const panels=ids.map(id=>{ const p=this.panel(id); const order=p.page*100+p.panel;
      if(!p.approved||p.canonVersion!==canonVersion||order<=previous) throw new Error('Panels must be approved, in story order, and on the requested canon version.'); previous=order; return p; });
    const spec=JSON.stringify({adapter:'motion-comic-v1',canonVersion,secondsPerPanel:5,width:1080,height:1920,panels});
    const id=createHash('sha256').update(spec).digest('hex');
    if(this.db.prepare('SELECT id FROM jobs WHERE id=?').get(id))return this.job(id);
    if(Number(this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','rendering')").get()?.n)>=100)throw new Error('Queue capacity reached.');
    this.db.prepare("INSERT OR IGNORE INTO jobs(id,status,spec,created) VALUES(?,'queued',?,?)").run(id,spec,Date.now());
    return this.job(id);
  }
  job(id:string):Job { const r=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id); if(!r)throw new Error('Job not found.'); return r as unknown as Job; }
  jobs():Job[] { return this.db.prepare('SELECT * FROM jobs ORDER BY created DESC LIMIT 100').all() as unknown as Job[]; }
  event(id:string,action:string,details='') { this.db.prepare('INSERT INTO events(jobId,at,action,details) VALUES(?,?,?,?)').run(id,Date.now(),action,details); }
  claim():Job|undefined {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare("UPDATE jobs SET status='failed',error='Worker lease expired after maximum attempts',lease=NULL WHERE status='rendering' AND leaseUntil<? AND attempts>=3").run(Date.now());
      const r=this.db.prepare("SELECT id FROM jobs WHERE (status='queued' OR (status='rendering' AND leaseUntil<?)) AND attempts<3 ORDER BY created LIMIT 1").get(Date.now());
      if(!r){this.db.exec('COMMIT');return;}
      const id=String(r.id),lease=randomUUID();
      this.db.prepare("UPDATE jobs SET status='rendering',lease=?,leaseUntil=?,attempts=attempts+1,error=NULL WHERE id=?").run(lease,Date.now()+60000,id);
      this.event(id,'claimed',lease);this.db.exec('COMMIT');return this.job(id);
    } catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  heartbeat(j:Job) { return this.db.prepare("UPDATE jobs SET leaseUntil=? WHERE id=? AND lease=? AND status='rendering'").run(Date.now()+60000,j.id,j.lease).changes===1; }
  finish(j:Job,artifact:string,hash:string) { const n=this.db.prepare("UPDATE jobs SET status='needs_review',artifact=?,outputHash=?,lease=NULL WHERE id=? AND lease=? AND status='rendering'").run(artifact,hash,j.id,j.lease).changes; if(n!==1)throw new Error('Worker lost lease.');this.event(j.id,'rendered',hash); }
  fail(j:Job,error:string) { this.db.prepare("UPDATE jobs SET status='failed',error=?,lease=NULL WHERE id=? AND lease=?").run(error.slice(0,1000),j.id,j.lease);this.event(j.id,'failed',error.slice(0,1000)); }
  retry(id:string) { const n=this.db.prepare("UPDATE jobs SET status='queued',error=NULL WHERE id=? AND status='failed' AND attempts<3").run(id).changes;if(n!==1)throw new Error('Retry requires a failed job with fewer than three attempts.');this.event(id,'retry');return this.job(id); }
  review(id:string,hash:string,approved:boolean,note:string) { const j=this.job(id);if(j.status!=='needs_review'||j.outputHash!==hash||!note.trim())throw new Error('Review needs the current output hash and a note.');this.db.prepare('UPDATE jobs SET status=? WHERE id=?').run(approved?'approved':'rejected',id);this.event(id,approved?'approved':'rejected',note);return this.job(id); }
}
