import 'dotenv/config';
import path from 'node:path';
import { ProductionStore } from './store.js';
import { Coordination } from './coordination.js';
const platforms=(process.env.SOCIAL_PLATFORMS||'').split(',').map(s=>s.trim()).filter(Boolean);
const store=new ProductionStore(path.resolve(process.env.PRODUCTION_DATA_DIR||'data/production','production.sqlite'));
try {
 const coordination=new Coordination(store);
 const localNow=new Date(Date.now()-4*3600000);
 for(let offset=0;offset<7;offset++){
  const date=new Date(localNow);date.setUTCDate(date.getUTCDate()+offset);
  coordination.slots(date.toISOString().slice(0,10),platforms);
 }
 console.log(JSON.stringify({plannedDays:7,slotsPerPlatformPerDay:10,platforms,due:coordination.due().length,published:0,publisherStatus:'not_connected'}));
}finally{store.db.close();}
