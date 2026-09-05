import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const server=new Server({name:'opaija-production',version:'1.0.0'},{capabilities:{tools:{}}});
const definitions=[
 {name:'read_shared_memory',description:'Read evidence-backed production observations. These cannot change locked canon.',inputSchema:{type:'object' as const,properties:{},additionalProperties:false}},
 {name:'record_observation',description:'Append a production observation, correction, experiment or result with evidence. Never changes locked canon.',inputSchema:{type:'object' as const,properties:{topic:{type:'string',enum:['observation','correction','experiment','result']},body:{type:'string'},evidence:{type:'string'}},required:['topic','body','evidence'],additionalProperties:false}},
 {name:'handoff_task',description:'Create a deduplicated persistent task handoff. Does not imply the receiving agent has executed it.',inputSchema:{type:'object' as const,properties:{recipient:{type:'string'},kind:{type:'string'},payload:{type:'object'}},required:['recipient','kind','payload'],additionalProperties:false}},
 {name:'read_agent_inbox',description:'Read pending handoffs for the production agent.',inputSchema:{type:'object' as const,properties:{},additionalProperties:false}},
 {name:'list_approved_sources',description:'List source panels and their recorded approval/canon state. Never implies visual inspection by this tool.',inputSchema:{type:'object' as const,properties:{},additionalProperties:false}},
 {name:'list_production_jobs',description:'List actual backend jobs and statuses.',inputSchema:{type:'object' as const,properties:{},additionalProperties:false}},
 {name:'queue_motion_short',description:'Queue 1–6 approved panels in story order for a numbered, captioned 9:16 motion comic. Does not publish.',inputSchema:{type:'object' as const,properties:{panelIds:{type:'array',items:{type:'string'},minItems:1,maxItems:6},canonVersion:{type:'string'}},required:['panelIds','canonVersion'],additionalProperties:false}},
];
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:definitions}));
server.setRequestHandler(CallToolRequestSchema,async(req)=>{
 try {
  const routes:Record<string,string>={read_shared_memory:'/memory',record_observation:'/memory',handoff_task:'/handoffs',read_agent_inbox:'/inbox',list_approved_sources:'/panels',list_production_jobs:'/jobs',queue_motion_short:'/jobs'};
  const route=routes[req.params.name];if(!route)throw new Error('Unknown tool');
  const base=process.env.OPAIJA_API_URL||'http://127.0.0.1:8787';
  const token=process.env.PRODUCTION_AGENT_TOKEN;if(!token)throw new Error('Agent token not configured.');
  const post=['queue_motion_short','record_observation','handoff_task'].includes(req.params.name);
  const response=await fetch(new URL('/api/production'+route,base),{method:post?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:post?JSON.stringify(req.params.arguments):undefined,signal:AbortSignal.timeout(15000)});
  let data=await response.json();if(!response.ok)throw new Error(data.error||'Production request failed');
  if(req.params.name==='list_approved_sources')data=data.filter((p:{approved:boolean})=>p.approved);
  return {content:[{type:'text' as const,text:JSON.stringify(data)}]};
 }catch(e){return {isError:true,content:[{type:'text' as const,text:e instanceof Error?e.message:'Tool failed'}]};}
});
await server.connect(new StdioServerTransport());
