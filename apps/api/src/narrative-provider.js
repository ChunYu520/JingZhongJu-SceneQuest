import { z } from 'zod';

const Output=z.object({narrative:z.string().min(8).max(180)});
const unsafe=/攀爬|奔跑|跳下|翻越|进入封闭|进入禁区|接触电气|穿越车道|擅自进入/;

export async function narrateCommittedEvent({story,event}) {
  const fallback=event.payload.publicNarrative||`剧情已更新：${event.eventType}`;
  if(!process.env.AI_API_KEY||process.env.AI_API_KEY==='replace_me'||!process.env.AI_BASE_URL||process.env.AI_BASE_URL.includes('.invalid')||!process.env.AI_MODEL) return {narrative:fallback,status:'FALLBACK',reason:'AI 配置未完成'};
  const system='你是景区多人实景故事的叙事导演。只把已确认事件改写成简短、清楚的中文旁白。不得增加事实、线索、任务、场景或玩家信息；不得给出危险行动；只能返回 JSON：{"narrative":"..."}。这是虚构剧情。';
  const user=JSON.stringify({storyTitle:story.title,venue:story.venue?.name||null,genre:story.genre,eventType:event.eventType,confirmedNarrative:fallback});
  try {
    const response=await fetch(process.env.AI_BASE_URL.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.AI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.AI_MODEL,temperature:Number(process.env.AI_TEMPERATURE||0.3),response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:user}]}),signal:AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS||10000))});
    if(!response.ok)throw new Error(`provider_http_${response.status}`);
    const json=await response.json(),parsed=Output.parse(JSON.parse(json.choices?.[0]?.message?.content||'{}'));
    if(unsafe.test(parsed.narrative))throw new Error('unsafe_narrative');
    return {narrative:parsed.narrative,status:'SUCCEEDED',reason:null};
  } catch(error) {return {narrative:fallback,status:'FALLBACK',reason:String(error.message||'provider_error').slice(0,100)}}
}
