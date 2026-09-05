import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Panel, Job } from './store.js';
export const hashFile=async(file:string)=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function sourceFile(root:string, relative:string) {
  const base=await realpath(root), target=await realpath(path.resolve(base,relative));
  if(!target.startsWith(base+path.sep)||!['.png','.jpg','.jpeg','.webp'].includes(path.extname(target).toLowerCase()))throw new Error('Source must be an image inside the configured asset directory.');
  if((await stat(target)).size>30*1024*1024)throw new Error('Source exceeds 30 MB.');
  return target;
}
export function run(binary:string,args:string[],cwd?:string):Promise<string> { return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd,stdio:['ignore','pipe','pipe']});let output='',errors='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
  child.stdout.on('data',d=>{output=(output+d).slice(-50000);});child.stderr.on('data',d=>{errors=(errors+d).slice(-3000);});
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(`Media process failed (${code}): ${errors}`));});
}); }
export async function probe(file:string) { return JSON.parse(await run(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])); }
export async function render(j:Job,assetRoot:string,outputRoot:string) {
  const spec=JSON.parse(j.spec) as {panels:Panel[];secondsPerPanel:number};
  const folder=path.join(outputRoot,j.id,String(j.lease));await mkdir(folder,{recursive:true});
  const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
  const font=process.env.PRODUCTION_FONT||'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  await writeFile(path.join(folder,'font.ttf'),await readFile(font));
  for(let i=0;i<spec.panels.length;i++) {
    const p=spec.panels[i],source=await sourceFile(assetRoot,p.file), bytes=await readFile(source);
    if(createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw new Error(`Source changed: ${p.id}`);
    const name=`source-${i}${path.extname(source)}`;await writeFile(path.join(folder,name),bytes);
    const metadata=await probe(path.join(folder,name));const stream=metadata.streams[0];
    if(!stream?.width||!stream?.height||stream.width*stream.height>50000000)throw new Error('Invalid or oversized image.');
    const lines=p.caption.match(/.{1,34}(?:\s|$)|\S{1,34}/g)?.map(s=>s.trim()).join('\n')||'';
    await writeFile(path.join(folder,`caption-${i}.txt`),lines);
    await writeFile(path.join(folder,`page-${i}.txt`),`OPAIJA  |  PAGE ${p.page} · PANEL ${p.panel}`);
    // Fit the entire panel; zoom the fitted canvas, never invent character motion or lettering.
    const filter=`scale=1000:1420:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:120:color=0x101923,setsar=1,zoompan=z='1+0.015*on/150':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=150:s=1080x1920:fps=30,drawbox=x=40:y=1560:w=1000:h=300:color=0x101923:t=fill,drawtext=fontfile=font.ttf:textfile=caption-${i}.txt:expansion=none:fontcolor=white:fontsize=44:line_spacing=14:x=(w-text_w)/2:y=1600,drawtext=fontfile=font.ttf:textfile=page-${i}.txt:expansion=none:fontcolor=0xf3c967:fontsize=25:x=(w-text_w)/2:y=1870`;
    await run(ffmpeg,['-y','-v','error','-i',name,'-vf',filter,'-t','5','-an','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-threads','2',`shot-${i}.mp4`],folder);
  }
  await writeFile(path.join(folder,'shots.txt'),spec.panels.map((_,i)=>`file 'shot-${i}.mp4'`).join('\n'));
  await run(ffmpeg,['-y','-v','error','-f','concat','-safe','1','-i','shots.txt','-c','copy','-movflags','+faststart','short.mp4'],folder);
  const file=path.join(folder,'short.mp4'),info=await probe(file),video=info.streams.find((s:{codec_type:string})=>s.codec_type==='video');
  if(video?.width!==1080||video?.height!==1920||Math.abs(Number(info.format.duration)-spec.panels.length*5)>0.3)throw new Error('Export failed geometry/duration validation.');
  await writeFile(path.join(folder,'manifest.json'),JSON.stringify({jobId:j.id,adapter:'motion-comic-v1',sources:spec.panels,technicalQC:'passed',creativeApproval:false,audio:'none',generatedAt:new Date().toISOString()},null,2));
  return {file,hash:await hashFile(file)};
}
