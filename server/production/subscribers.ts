import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import type { ProductionStore } from './store.js';
export function subscriptionsRouter(store:ProductionStore) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS subscribers(email TEXT PRIMARY KEY, interests TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL, consentVersion TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, tokenHash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS email_outbox(id INTEGER PRIMARY KEY, email TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS signup_limits(ip TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);`);
  const router=express.Router();router.use(express.json({limit:'8kb'}));
  router.post('/',(req,res)=>{
    try {
      const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
      const interests=req.body.interests;
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||req.body.consent!==true||!Array.isArray(interests)||!interests.length||interests.some(x=>!['books','merchandise'].includes(x))){res.status(400).json({error:'Enter your email, choose a drop list and agree to receive updates.'});return;}
      const now=Date.now(),ip=createHash('sha256').update(req.ip||'unknown').digest('hex');
      // Shared across API processes. Configure Express trust proxy to the exact VPS proxy topology.
      store.db.prepare('DELETE FROM signup_limits WHERE window<?').run(now-3600000);
      const n=store.db.prepare('INSERT INTO signup_limits VALUES(?,?,1) ON CONFLICT(ip) DO UPDATE SET count=count+1 RETURNING count').get(ip,now);
      if(Number(n?.count)>20){res.status(429).json({error:'Please try again later.'});return;}
      const existing=store.db.prepare('SELECT status FROM subscribers WHERE email=?').get(email);
      // Public requests cannot change preferences or reactivate an unsubscribed account.
      if(!existing) {
        const token=randomBytes(32).toString('hex');
        const source=typeof req.body.source==='string'?req.body.source.slice(0,100):'website';
        store.db.exec('BEGIN IMMEDIATE');
        try {
          const inserted=store.db.prepare("INSERT OR IGNORE INTO subscribers VALUES(?,?,'subscribed',?,'drop-list-v1',?,?,?)").run(email,JSON.stringify([...new Set(interests)]),source,now,now,createHash('sha256').update(token).digest('hex'));
          if(inserted.changes)store.db.prepare("INSERT INTO email_outbox(email,kind,payload,created) VALUES(?,'welcome',?,?)").run(email,JSON.stringify({unsubscribeToken:token,interests}),now);
          store.db.exec('COMMIT');
        }catch(e){store.db.exec('ROLLBACK');throw e;}
      }
      res.status(202).json({status:'received',message:'Your request has been received. Existing subscription preferences are preserved.'});
    } catch {res.status(503).json({error:'We could not save your signup. Please try again.'});}
  });
  router.post('/unsubscribe',(req,res)=>{
    const token=String(req.body.token||'');if(!/^[a-f0-9]{64}$/.test(token)){res.status(400).json({error:'Invalid unsubscribe link.'});return;}
    const hash=createHash('sha256').update(token).digest('hex');
    store.db.exec('BEGIN IMMEDIATE');try {
      const record=store.db.prepare('SELECT email FROM subscribers WHERE tokenHash=?').get(hash);
      store.db.prepare("UPDATE subscribers SET status='unsubscribed',updated=? WHERE tokenHash=?").run(Date.now(),hash);
      if(record)store.db.prepare("UPDATE email_outbox SET status='cancelled' WHERE email=? AND status='pending'").run(String(record.email));
      store.db.exec('COMMIT');res.json({status:'unsubscribed'});
    }catch{store.db.exec('ROLLBACK');res.status(503).json({error:'Please retry.'});}
  });
  return router;
}
