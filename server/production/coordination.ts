import { createHash } from 'node:crypto';
import type { ProductionStore } from './store.js';
export class Coordination {
 constructor(private store:ProductionStore){store.db.exec(`
  CREATE TABLE IF NOT EXISTS memory(id INTEGER PRIMARY KEY, topic TEXT NOT NULL, author TEXT NOT NULL, evidence TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS handoffs(id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS social_slots(id TEXT PRIMARY KEY, platform TEXT NOT NULL, due INTEGER NOT NULL, jobId TEXT, caption TEXT, targetUrl TEXT, status TEXT NOT NULL DEFAULT 'empty', externalId TEXT, error TEXT);
 `);}
 remember(author:string,topic:string,body:string,evidence:string){
  if(!['observation','correction','experiment','result'].includes(topic)||!author||!body||!evidence||body.length>10000)throw new Error('Memory requires an allowed topic, author, evidence and bounded text. Canon changes are not supported here.');
  return this.store.db.prepare('INSERT INTO memory(topic,author,evidence,body,created) VALUES(?,?,?,?,?)').run(topic,author,evidence,body,Date.now()).lastInsertRowid.toString();
 }
 memories(){return this.store.db.prepare('SELECT * FROM memory ORDER BY id DESC LIMIT 100').all();}
 handoff(sender:string,recipient:string,kind:string,payload:unknown){
  if(!sender||!recipient||!kind)throw new Error('Sender, recipient and task type required.');const body=JSON.stringify(payload);if(body.length>10000)throw new Error('Handoff too large.');
  const id=createHash('sha256').update(JSON.stringify({sender,recipient,kind,payload})).digest('hex');
  this.store.db.prepare('INSERT OR IGNORE INTO handoffs(id,sender,recipient,kind,payload,created) VALUES(?,?,?,?,?,?)').run(id,sender,recipient,kind,body,Date.now());return id;
 }
 inbox(recipient:string){return this.store.db.prepare("SELECT * FROM handoffs WHERE recipient=? AND status='pending' ORDER BY created").all(recipient);}
 slots(day:string,platforms:string[]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||!Array.isArray(platforms)||platforms.some(p=>!['instagram','facebook','youtube','tiktok','x','pinterest'].includes(p)))throw new Error('Valid date and supported platform IDs required.');
  // Ten slots, 08:00–21:30 Trinidad & Tobago time (UTC-4), spaced 90 minutes apart.
  const start=Date.parse(day+'T08:00:00-04:00');
  for(const platform of new Set(platforms))for(let i=0;i<10;i++)this.store.db.prepare('INSERT OR IGNORE INTO social_slots(id,platform,due) VALUES(?,?,?)').run(`${day}-${platform}-${i+1}`,platform,start+i*90*60000);
  return this.store.db.prepare('SELECT * FROM social_slots WHERE id LIKE ? ORDER BY due,platform').all(day+'-%');
 }
 schedule(slotId:string,jobId:string,caption:string,targetUrl:string){
  const j=this.store.job(jobId);if(j.status!=='approved'||!j.outputHash)throw new Error('Only approved cuts may be scheduled.');
  const target=new URL(targetUrl);if(target.protocol!=='https:'||target.hostname!=='opaija.com'||target.username||target.password)throw new Error('Campaign destination must be https://opaija.com.');
  if(typeof caption!=='string'||!caption.trim()||caption.length>2200)throw new Error('Valid platform caption required.');
  const slot=this.store.db.prepare('SELECT * FROM social_slots WHERE id=?').get(slotId);if(!slot||slot.status!=='empty')throw new Error('Choose an empty slot.');
  const duplicate=this.store.db.prepare("SELECT id FROM social_slots WHERE platform=? AND jobId=? AND status!='cancelled'").get(String(slot.platform),jobId);if(duplicate)throw new Error('This cut is already scheduled on that platform.');
  this.store.db.prepare("UPDATE social_slots SET jobId=?,caption=?,targetUrl=?,status='blocked_connection',error='Platform publisher is not connected' WHERE id=? AND status='empty'").run(jobId,caption,target.href,slotId);
 }
 due(now=Date.now()){return this.store.db.prepare("SELECT * FROM social_slots WHERE due<=? AND status IN ('blocked_connection','ready') ORDER BY due").all(now);}
}
