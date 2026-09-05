import { ProductionStore } from './store.js';
import { render } from './render.js';
export async function workOnce(store:ProductionStore,assets:string,outputs:string) {
  const job=store.claim();if(!job)return false;
  const heartbeat=setInterval(()=>store.heartbeat(job),10000);
  try { const output=await render(job,assets,outputs);store.finish(job,output.file,output.hash); }
  catch(e){store.fail(job,e instanceof Error?e.message:String(e));}
  finally{clearInterval(heartbeat);}
  return true;
}
export function startWorker(store:ProductionStore,assets:string,outputs:string) {
  let stopped=false;let timer:NodeJS.Timeout|undefined;
  const tick=async()=>{try{await workOnce(store,assets,outputs);}catch(e){console.error('Production worker:',e);}if(!stopped)timer=setTimeout(tick,2000);};
  void tick();return()=>{stopped=true;if(timer)clearTimeout(timer);};
}
