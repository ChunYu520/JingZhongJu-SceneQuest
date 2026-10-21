// Zero-dependency in-memory preview for trying SceneQuest before PostgreSQL/npm setup.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const baseStory = JSON.parse(await fs.readFile(path.join(root, 'data/stories/song-market/story.json'), 'utf8'));
const stories = new Map([['song-market', baseStory]]);
const sessions = new Map();
const demoAdmin = process.env.DEMO_ADMIN_TOKEN || 'demo-admin';
const demoSettings = {provider:'openai_compatible',baseUrl:'',model:'',visionModel:'',tavilyBaseUrl:'https://api.tavily.com/search',overpassUrl:'https://overpass-api.de/api/interpreter',discoveryRadius:1800,hasApiKey:false,hasTavilyKey:false};
const safe = (s) => String(s ?? '').replace(/[<>]/g, '').trim();
const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const fail = (res, code, message) => json(res, code, { error: { code: 'DEMO_ERROR', message } });
async function body(req) { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; }
function snapshot(s, player) {
  const story = stories.get(s.storyId);
  const me = s.players.find(p => p.token === player.token);
  return { session: { id:s.id, inviteCode:s.inviteCode, storyId:s.storyId, status:s.status, mode:s.mode, stage:s.stage, stateVersion:s.version },
    story:{ title:story.title, venue:story.venue || null, minPlayers:story.minPlayers || 1 }, players:s.players.filter(p=>p.status==='ACTIVE').map(({id,nickname,isHost,status,points})=>({id,nickname,isHost,status,points})),
    tasks:s.tasks.map(({evaluationCriteria,...t})=>({...t,status:(me.completedTasks||[]).includes(t.taskId)?'COMPLETED':'AVAILABLE'})), publicEvents:s.events, scenes:s.scenes, ending:s.ending, me:{id:me.id,nickname:me.nickname,isHost:me.isHost,role:me.role,clues:me.clues,points:me.points||0,inventory:me.inventory||[],completedTasks:me.completedTasks||[],votes:me.vote?1:0}, sequenceNo:s.version };
}
function advance(s, type, payload={}) { s.version++; s.events.push({sequenceNo:s.version,eventType:type,payload,stateVersion:s.version}); }
function storyCard(id, story) { return {id,title:story.title,version:story.version,venue:story.venue||null,genre:story.genre,estimatedMinutes:story.estimatedMinutes||18}; }
function setupScenes(s) { const story=stories.get(s.storyId); s.scenes=story.scenes.map((x,i)=>({id:x.sceneId,name:x.name,status:i===0?'AVAILABLE':'LOCKED'})); s.tasks=story.tasks.map(t=>({...t,status:'LOCKED'})); }
function newPlayer(s,nickname,isHost=false) { const id=randomUUID(),token=randomUUID()+randomUUID(); const p={id,token,nickname,isHost,status:'ACTIVE',role:null,clues:[],vote:null,points:0,inventory:[],completedTasks:[]}; s.players.push(p); return p; }
let demoSession=null;
function getDemoSession(){
  if(demoSession && sessions.has(demoSession.id) && demoSession.player.status==='ACTIVE') return demoSession;
  if(demoSession) sessions.delete(demoSession.session.id);
  demoSession=null;
  const id='demo-'+randomUUID().slice(0,8), storyId='demo-westlake';
  const story=structuredClone(baseStory);
  Object.assign(story,{storyId,title:'西湖 · 石刻遗踪',genre:'本地演示剧本（原创虚构）',minPlayers:3,maxPlayers:5,estimatedMinutes:20,venue:{name:'杭州西湖景区（演示场景）',region:'浙江省杭州市'},opening:'一张旧拓片指向几处值得观察的景区公共标识。队伍需要沿着开放步道寻找线索，记录发现并提交给 AI 验收。',generatedNarrative:{opening:'一张旧拓片指向景区中的几处公共线索。请结伴探索，只在开放区域行动。',resolution:'队伍完成了沿途观察，并把这段虚构故事留在景区的探索记录里。'}});
  story.scenes=[
    {sceneId:'demo_map',name:'景区导览图附近',publicDescription:'从公开导览信息开始规划路线。'},
    {sceneId:'demo_stele',name:'石刻展示区外围',publicDescription:'观察开放展示区域的文字与纹样。'},
    {sceneId:'demo_waterfront',name:'湖畔公共步道',publicDescription:'寻找步道沿线可公开观察的景观细节。'},
    {sceneId:'demo_sign',name:'公共指引牌附近',publicDescription:'记录一处清晰可辨的方向或安全提示。'}
  ];
  story.tasks=[
    ['demo_task_1','读取导览线索','前往景区公开导览图附近，记录一处路线或区域名称。','景区导览图附近','请拍摄或描述公开导览图上的一处路线/区域名称。',30],
    ['demo_task_2','寻找石刻纹样','在开放展示区域外围观察石刻或文字展示，记录一个可辨认的细节。','石刻展示区外围','拍摄或描述展示区外围一处可辨认的文字或纹样。',35],
    ['demo_task_3','观察湖畔景观','沿开放步道记录一处水岸景观细节，不进入封闭或湿滑区域。','湖畔公共步道','拍摄或描述开放步道上能看到的一处水岸景观。',40],
    ['demo_task_4','完成安全提示发现','找到公共指引牌，记录一条路线或安全提示。','公共指引牌附近','拍摄或描述指引牌上的一条路线或安全提示。',45]
  ].map(([taskId,title,description,location,evidencePrompt,points])=>({taskId,title,description,location,evidencePrompt,points,hint:'只在开放公共区域观察，不触碰文物或进入限制区域。',evaluationCriteria:`文字或照片能辨认出${location}相关内容；不需定位，不接受危险行为。`,type:'AI_VERIFIED_FIELD_TASK',stage:'exploration'}));
  story.sources=['本地演示模拟内容：未调用在线地图、网页搜索或真实 AI。'];
  stories.set(storyId,story);
  const s={id,inviteCode:'SQDEMO',storyId,mode:'AI_DIRECTOR',status:'RUNNING',stage:'exploration',version:1,players:[],events:[],ending:null,activated:[],completedTaskIds:[],shareCount:0,votes:{}};
  const host=newPlayer(s,'演示玩家',true); newPlayer(s,'同行伙伴'); newPlayer(s,'线索观察员'); setupScenes(s);
  s.tasks=s.tasks.map(t=>({...t,status:'AVAILABLE'})); s.scenes=s.scenes.map(x=>({...x,status:'AVAILABLE'}));
  s.players.forEach((pl,i)=>{const role=story.roles[i%story.roles.length];pl.role={id:role.roleId,name:role.name,bio:role.publicBio,goal:role.privateGoal};pl.clues=(role.initialClues||[]).map(key=>{const c=story.clues.find(x=>x.clueId===key);return c&&{id:c.clueId,title:c.title,body:c.body,shared:false}}).filter(Boolean)});
  s.events.push({sequenceNo:1,eventType:'GAME_STARTED',payload:{publicNarrative:story.opening,stateVersion:1}}); sessions.set(id,s);
  demoSession={session:s,player:host}; return demoSession;
}
function publicStory(story) { return story; }
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost'); const p=url.pathname;
    if(req.method==='GET'&&p==='/socket.io/socket.io.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end('/* Socket.IO is not part of the single-process preview simulator. */');}
    if (p.startsWith('/api/v1')) {
      const route=p.slice('/api/v1'.length), data=['POST','PUT','PATCH'].includes(req.method)?await body(req):{};
      const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      const player=[...sessions.values()].flatMap(s=>s.players).find(x=>x.token===token&&x.status==='ACTIVE');
      const admin=req.headers['x-admin-token']===demoAdmin;
      if(req.method==='GET'&&route==='/admin/settings/status')return json(res,200,{setupRequired:false,preview:true});
      if(req.method==='GET'&&route==='/admin/settings/ai'){if(!admin)return fail(res,403,'演示管理员 Token 为 demo-admin');return json(res,200,{settings:{...demoSettings}})}
      if(req.method==='PUT'&&route==='/admin/settings/ai'){if(!admin)return fail(res,403,'演示管理员 Token 为 demo-admin');Object.assign(demoSettings,{provider:safe(data.provider)||'openai_compatible',baseUrl:safe(data.baseUrl),model:safe(data.model),visionModel:safe(data.visionModel),tavilyBaseUrl:safe(data.tavilyBaseUrl)||demoSettings.tavilyBaseUrl,overpassUrl:safe(data.overpassUrl)||demoSettings.overpassUrl,discoveryRadius:Number(data.discoveryRadius)||1800});if(data.apiKey)demoSettings.hasApiKey=true;if(data.clearApiKey)demoSettings.hasApiKey=false;if(data.tavilyApiKey)demoSettings.hasTavilyKey=true;if(data.clearTavilyKey)demoSettings.hasTavilyKey=false;return json(res,200,{ok:true,settings:{...demoSettings}})}
      if(req.method==='POST'&&route==='/admin/settings/test-ai'){if(!admin)return fail(res,403,'演示管理员 Token 为 demo-admin');return json(res,200,{ok:false,preview:true,message:'本地预览不调用真实 AI。完整后端保存配置后可执行真实连接测试。'})}
      if(req.method==='GET'&&route==='/stories') return json(res,200,{stories:[...stories].map(([id,s])=>storyCard(id,s))});
      if(req.method==='GET'&&route==='/demo/session') {const d=getDemoSession();return json(res,200,{session:{id:d.session.id,inviteCode:d.session.inviteCode,status:d.session.status,mode:d.session.mode},accessToken:d.player.token,account:{nickname:d.player.nickname,label:'本地模拟账号'}})}
      if(req.method==='POST'&&route==='/demo/reset') {if(demoSession)sessions.delete(demoSession.session.id);demoSession=null;return json(res,200,{ok:true})}
      let inviteQr=route.match(/^\/sessions\/([^/]+)\/invite-qr$/);if(req.method==='GET'&&inviteQr){const s=sessions.get(inviteQr[1]);if(!s)return fail(res,404,'找不到本局');const inviteUrl=`${url.origin}/?join=${s.inviteCode}`;return json(res,200,{inviteUrl,image:`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(inviteUrl)}`});}
      if(req.method==='POST'&&route==='/sessions') {
        if(!data.nickname||!stories.has(data.storyId))return fail(res,400,'昵称或剧本无效');
        const s={id:randomUUID(),inviteCode:Math.random().toString(36).slice(2,8).toUpperCase(),storyId:data.storyId,mode:data.mode||'AI_DIRECTOR',status:'LOBBY',stage:'lobby',version:1,players:[],events:[],ending:null,activated:[],completedTaskIds:[],shareCount:0,votes:{}};
        const host=newPlayer(s,safe(data.nickname),true); setupScenes(s); sessions.set(s.id,s);
        return json(res,201,{session:{id:s.id,inviteCode:s.inviteCode,status:s.status,mode:s.mode},accessToken:host.token});
      }
      if(req.method==='POST'&&route==='/sessions/join') {const s=[...sessions.values()].find(x=>x.inviteCode===String(data.inviteCode||'').toUpperCase());if(!s)return fail(res,404,'邀请码无效');if(s.status!=='LOBBY')return fail(res,409,'本局已经开始，暂时无法加入');if(s.players.length>=5)return fail(res,409,'房间已满');const joined=newPlayer(s,safe(data.nickname));advance(s,'PLAYER_JOINED',{nickname:joined.nickname});return json(res,200,{session:{id:s.id,inviteCode:s.inviteCode,status:s.status,mode:s.mode},accessToken:joined.token});}
      let m=route.match(/^\/sessions\/([^/]+)$/);if(req.method==='GET'&&m){const s=sessions.get(m[1]);if(!s||!player||!s.players.includes(player))return fail(res,404,'找不到本局');return json(res,200,snapshot(s,player));}
      m=route.match(/^\/sessions\/([^/]+)\/(start|leave)$/);if(req.method==='POST'&&m){const s=sessions.get(m[1]);if(!s||!player||!s.players.includes(player))return fail(res,404,'找不到本局');if(m[2]==='start'){if(!player.isHost)return fail(res,403,'只有队长可以开始');s.status='RUNNING';s.stage='exploration';const story=stories.get(s.storyId);s.players.forEach((pl,i)=>{const role=story.roles[i%story.roles.length];pl.role={id:role.roleId,name:role.name,bio:role.publicBio,goal:role.privateGoal};pl.clues=(role.initialClues||[]).map(key=>{const c=story.clues.find(x=>x.clueId===key);return c&&{id:c.clueId,title:c.title,body:c.body,shared:false}}).filter(Boolean)});s.tasks=s.tasks.map(t=>({...t,status:'AVAILABLE'}));s.scenes=s.scenes.map(x=>({...x,status:'AVAILABLE'}));advance(s,'GAME_STARTED',{publicNarrative:story.opening});return json(res,200,{ok:true,stateVersion:s.version});}player.status='LEFT';advance(s,'PLAYER_LEFT',{nickname:player.nickname});return json(res,200,{ok:true,stateVersion:s.version});}
      if(req.method==='GET'&&route==='/rewards')return json(res,200,{rewards:[{id:'postcard',name:'景区纪念明信片',description:'本次旅程主题明信片',points:30,icon:'✉'},{id:'badge',name:'故事探索徽章',description:'限量主题徽章电子兑换券',points:60,icon:'✦'},{id:'audio-guide',name:'隐藏语音彩蛋',description:'解锁额外原创旁白',points:90,icon:'♫'}]});
      m=route.match(/^\/sessions\/([^/]+)\/tasks\/([^/]+)\/submissions$/);if(req.method==='POST'&&m){const s=sessions.get(m[1]),task=s?.tasks.find(x=>x.taskId===m[2]);if(!s||!player||!s.players.includes(player)||!task)return fail(res,404,'找不到本局任务');if(s.status!=='RUNNING')return fail(res,409,'游戏尚未开始');if(player.completedTasks.includes(task.taskId))return fail(res,409,'你已经完成过该任务');const evidence=String(data.description||'').trim();if(!evidence&&!data.imageData)return fail(res,400,'请描述发现内容或上传照片');const approved=Boolean(data.imageData)||(evidence.length>=12&&(evidence.includes(task.location)||evidence.includes(task.title)));if(!approved){advance(s,'TASK_REVIEWED',{taskId:task.taskId,approved:false,feedback:`请补充与「${task.location}」相关的现场照片或更具体的描述。`});return json(res,200,{ok:true,approved:false,feedback:`请补充与「${task.location}」相关的现场照片或更具体的描述。`,provider:'preview-simulator',stateVersion:s.version});}player.points+=task.points;player.completedTasks.push(task.taskId);const all=s.players.filter(x=>x.status==='ACTIVE').every(p=>s.tasks.every(t=>p.completedTasks.includes(t.taskId)));if(all){s.status='COMPLETED';s.stage='ending';s.ending={endingId:'ending_main',title:'景区探索完成',narrative:stories.get(s.storyId).generatedNarrative.resolution};}advance(s,all?'SESSION_COMPLETED':'TASK_COMPLETED',{taskId:task.taskId,title:task.title,points:task.points,player:player.nickname,feedback:'本地演示审核通过：证据已提交。',narrative:all?s.ending.narrative:`${player.nickname}完成了「${task.title}」，获得 ${task.points} 积分。`});return json(res,200,{ok:true,approved:true,awardedPoints:task.points,totalPoints:player.points,feedback:'本地演示审核通过：证据已提交。',provider:'preview-simulator',ending:s.ending,stateVersion:s.version});}
      m=route.match(/^\/sessions\/([^/]+)\/rewards\/([^/]+)\/redeem$/);if(req.method==='POST'&&m){const s=sessions.get(m[1]),item=({postcard:{id:'postcard',name:'景区纪念明信片',points:30},badge:{id:'badge',name:'故事探索徽章',points:60},'audio-guide':{id:'audio-guide',name:'隐藏语音彩蛋',points:90}})[m[2]];if(!s||!player||!s.players.includes(player)||!item)return fail(res,404,'找不到房间或兑换道具');if(player.points<item.points)return fail(res,409,'积分不足，完成更多任务后再兑换');player.points-=item.points;player.inventory.push({...item,redeemedAt:new Date().toISOString()});advance(s,'REWARD_REDEEMED',{player:player.nickname,reward:item.name,points:item.points});return json(res,200,{ok:true,reward:item,points:player.points,inventory:player.inventory,stateVersion:s.version});}
      m=route.match(/^\/stories\/generate$/);
      if(req.method==='POST'&&m){const venue={name:safe(data.name)||'未命名景区',region:safe(data.region),duration:data.duration||25,players:data.players||4,latitude:data.latitude,longitude:data.longitude};const places=[`${venue.name}游客中心`,`${venue.name}主入口广场`,`${venue.name}文化展示区`,`${venue.name}观景步道`,`${venue.name}休憩广场`];const story=structuredClone(baseStory);const id='venue-'+randomUUID().slice(0,8);story.storyId=id;story.minPlayers=1;story.title=`${venue.name}·寻迹故事`;story.venue=venue;story.estimatedMinutes=venue.duration;story.opening=`一段关于${venue.name}的原创虚构故事正在展开。队伍需要寻找景区公开展示的线索，拍摄现场发现并提交给 AI 验收。`;story.generatedNarrative={opening:story.opening,resolution:`你们沿着${venue.name}中的线索完成探索，重新发现了景区值得珍藏的故事。`};story.scenes=places.map((name,i)=>({sceneId:`place_${i+1}`,name,publicDescription:`在${name}的开放公共区域寻找与故事相关的细节。`}));story.tasks=places.slice(0,4).map((location,i)=>({taskId:`task_${i+1}`,title:['发现景区标识','寻找文化细节','记录独特景观','完成终章发现'][i],description:`前往${location}，观察公开展示的标识或景观，按提示拍照并描述你的发现。`,location,evidencePrompt:`请拍摄能辨认出${location}特征的现场照片，并描述照片中的具体细节。`,evaluationCriteria:`照片或文字需要能对应${location}，证据清晰、来自景区开放区域且不包含危险行为。`,points:20+i*10,hint:`先找到${location}附近的公共标识。`,type:'AI_VERIFIED_FIELD_TASK',stage:'exploration'}));story.roles=story.roles.map((r,i)=>({...r,initialClues:[story.clues[i%story.clues.length].clueId]}));story.sources=['本地演示模式：地点搜索和 AI 服务未连接'];stories.set(id,story);const result={id,title:story.title,version:story.version,venue,genre:story.genre,opening:story.opening,mystery:`探索${venue.name}中值得留意的地点与故事`,locations:story.scenes,tasks:story.tasks.map(({taskId,title,description,location,evidencePrompt,points,hint})=>({id:taskId,title,description,location,evidencePrompt,points,hint})),roles:story.roles.map(x=>({id:x.roleId,name:x.name,bio:x.publicBio,goal:x.privateGoal})),sources:story.sources,ai:{used:false,model:'preview-simulator',fallbackReason:'本地预览用规则模板代替外部 AI'}};return json(res,201,{story:result});}
      m=route.match(/^\/admin\/sessions\/([^/]+)\/(diagnostics|mode|reset)$/);
      if(m){if(!admin)return fail(res,403,'演示管理员 Token 为 demo-admin');const s=sessions.get(m[1]);if(!s)return fail(res,404,'找不到本局');if(req.method==='GET'&&m[2]==='diagnostics')return json(res,200,{session:{id:s.id,inviteCode:s.inviteCode,status:s.status,stage:s.stage,stateVersion:s.version,mode:s.mode,world:{events:s.events}},players:s.players.map(p=>({id:p.id,nickname:p.nickname,role:p.role?.name,clueCount:p.clues.length,status:p.status})),events:s.events,directorRuns:[]});if(req.method==='POST'&&m[2]==='mode'){s.mode=data.mode;advance(s,'MODE_CHANGED',{mode:s.mode});return json(res,200,{ok:true,mode:s.mode,stateVersion:s.version});}if(req.method==='POST'&&m[2]==='reset'){if(data.confirm!==true)return fail(res,400,'需要确认重置');sessions.delete(s.id);return json(res,200,{ok:true});}}
      return fail(res,404,'演示接口不存在');
    }
    const relative=decodeURIComponent(p==='/'?'/index.html':p).replace(/^[/\\]+/,'');const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return fail(res,403,'Forbidden');const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  } catch(e) { console.error(e); if(!res.headersSent)fail(res,500,'演示服务错误'); }
});
const port=Number(process.env.API_PORT||3001);server.listen(port,'127.0.0.1',()=>console.log(`SceneQuest demo preview: http://localhost:${port} (admin token: ${demoAdmin})`));
