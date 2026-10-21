import { z } from 'zod';
export const GeneratedStorySchema=z.object({
  title:z.string().min(4).max(48),mystery:z.string().min(20).max(300),opening:z.string().min(20).max(500),tone:z.string().min(2).max(80),resolution:z.string().min(30).max(600),
  locations:z.array(z.object({name:z.string().min(1).max(60),description:z.string().min(10).max(260)})).min(3).max(10),
  roles:z.array(z.object({name:z.string().min(2).max(24),bio:z.string().min(10).max(180),goal:z.string().min(10).max(180)})).min(3).max(5),
  tasks:z.array(z.object({title:z.string().min(2).max(60),description:z.string().min(10).max(300),location:z.string().min(1).max(60),evidencePrompt:z.string().min(10).max(240),evaluationCriteria:z.string().min(20).max(500),points:z.number().int().min(5).max(100),hint:z.string().min(4).max(200)})).min(3).max(8),
  clueTitles:z.array(z.string().min(2).max(30)).min(3).max(10),clueBodies:z.array(z.string().min(20).max(260)).min(3).max(10)
});
export function validateGeneratedStory(value,venue){const parsed=GeneratedStorySchema.parse(value),allowed=new Set((venue.discoveredPlaces||[]).map(s=>s.name.trim()));if(parsed.clueTitles.length!==parsed.clueBodies.length)throw new Error('模型输出的线索标题和正文数量不一致');if(allowed.size&&parsed.locations.some(l=>!allowed.has(l.name)))throw new Error('模型输出了未发现的景区点位');if(parsed.tasks.some(t=>!allowed.has(t.location)))throw new Error('任务引用了未发现的景区点位');const unsafe=/攀爬|奔跑|跳下|翻越|进入封闭|进入禁区|接触电气|穿越车道|擅自进入|触摸文物|采摘/;if(unsafe.test(JSON.stringify(parsed)))throw new Error('模型输出包含不安全行动');return parsed}
