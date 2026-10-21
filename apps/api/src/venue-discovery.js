const cache=new Map();
const timeout=Number(process.env.DISCOVERY_TIMEOUT_MS||18000);
const headers={'User-Agent':'SceneQuest/1.0 (venue story discovery)','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.5'};

async function nominatim(url){const response=await fetch(url,{headers,signal:AbortSignal.timeout(timeout)});if(!response.ok)throw new Error(`geocoding_http_${response.status}`);return response.json()}

export async function discoverVenue({name,region='',latitude,longitude}){
  const coordinateKey=Number.isFinite(latitude)&&Number.isFinite(longitude)?`${latitude.toFixed(3)},${longitude.toFixed(3)}`:'';
  const cacheKey=`${name.trim().toLowerCase()}|${region.trim().toLowerCase()}|${coordinateKey}`;
  const cached=cache.get(cacheKey);if(cached&&cached.until>Date.now())return cached.value;
  let center=Number.isFinite(latitude)&&Number.isFinite(longitude)?{lat:latitude,lon:longitude,display_name:name}:null;
  if(!center){const query=encodeURIComponent([name,region].filter(Boolean).join(', '));const matches=await nominatim(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${query}`);if(!matches[0])throw new Error('未能在地图中找到该景区，请补充城市或检查景区名称');center={lat:Number(matches[0].lat),lon:Number(matches[0].lon),display_name:matches[0].display_name};}
  const radius=Number(process.env.DISCOVERY_RADIUS_METERS||1800),lat=Number(center.lat),lon=Number(center.lon);
  const query=`[out:json][timeout:20];(node(around:${radius},${lat},${lon})[name][tourism];way(around:${radius},${lat},${lon})[name][tourism];node(around:${radius},${lat},${lon})[name][historic];way(around:${radius},${lat},${lon})[name][historic];node(around:${radius},${lat},${lon})[name][leisure];way(around:${radius},${lat},${lon})[name][leisure];node(around:${radius},${lat},${lon})[name][amenity~"museum|artwork|viewpoint|fountain|place_of_worship"];way(around:${radius},${lat},${lon})[name][amenity~"museum|artwork|viewpoint|fountain|place_of_worship"]);out center tags 80;`;
  const response=await fetch(process.env.OVERPASS_URL||'https://overpass-api.de/api/interpreter',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:`data=${encodeURIComponent(query)}`,signal:AbortSignal.timeout(timeout)});if(!response.ok)throw new Error(`map_discovery_http_${response.status}`);const map=await response.json();
  const seen=new Set(),discoveredPlaces=[];for(const el of map.elements||[]){const placeName=String(el.tags?.name||'').trim();if(!placeName||seen.has(placeName.toLowerCase()))continue;seen.add(placeName.toLowerCase());discoveredPlaces.push({name:placeName,category:el.tags?.tourism||el.tags?.historic||el.tags?.leisure||el.tags?.amenity||'景区地点',latitude:el.lat??el.center?.lat??null,longitude:el.lon??el.center?.lon??null,source:'OpenStreetMap'});}
  if(!discoveredPlaces.some(p=>p.name.toLowerCase()===name.trim().toLowerCase()))discoveredPlaces.unshift({name,category:'用户选择的景区',source:'OpenStreetMap geocoding'});
  let webResearch=[];
  if(process.env.TAVILY_API_KEY&&process.env.TAVILY_API_KEY!=='replace_me'){
    const searchResponse=await fetch(process.env.TAVILY_BASE_URL||'https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:process.env.TAVILY_API_KEY,query:`${name} ${region} 景区 景点 石碑 建筑 园林`,search_depth:'advanced',max_results:6,include_answer:true}),signal:AbortSignal.timeout(timeout)});
    if(searchResponse.ok){const result=await searchResponse.json();webResearch=(result.results||[]).map(x=>({title:x.title,url:x.url,content:String(x.content||'').slice(0,1200)}));}
  }
  if(discoveredPlaces.length<3)throw new Error('地图资料中可用的景区点位不足，请补充城市信息，或在服务端配置 TAVILY_API_KEY 扩展景区资料搜索');
  const mapUrl=`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  const value={venue:{name,region,latitude:lat,longitude:lon,displayName:center.display_name},discoveredPlaces:discoveredPlaces.slice(0,40),webResearch,sources:[...new Set([mapUrl,'https://www.openstreetmap.org/copyright',...webResearch.map(x=>x.url)])]};cache.set(cacheKey,{until:Date.now()+600000,value});return value;
}
