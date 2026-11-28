// One receipt per document, even under React StrictMode remounts.
const CACHE_KEY='qbank:site-metrics:last-success:v1';
let visitId,request,result;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function normalize(data){
  if(!data||typeof data!=='object')return null;
  const pageViews=count(data.pageViews),registeredCount=count(data.registeredCount);
  if(pageViews===null||registeredCount===null||typeof data.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.day))return null;
  return {day:data.day,pageViews,registeredCount,onlineCount:count(data.onlineCount)};
}
export function readSiteMetricsCache(){
  try{const raw=JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY)||'null'),data=normalize(raw);return data?{...data,cached:true}:null;}catch{return null;}
}
export function cacheSiteMetrics(raw){
  const data=normalize(raw);
  if(!data)return null;
  try{globalThis.localStorage?.setItem(CACHE_KEY,JSON.stringify(data));}catch{}
  return {...data,cached:false};
}
export function loadSiteMetrics(api){
  if(result)return Promise.resolve(result);
  if(request)return request;
  if(!visitId)visitId=crypto.randomUUID();
  request=api.recordSiteVisit(visitId).then(data=>{
    const fresh=cacheSiteMetrics(data);
    if(!fresh)throw Error('站点统计响应异常');
    result=fresh;
    return result;
  }).finally(()=>{request=null;});
  return request;
}
export function siteMetricsDay(now=Date.now()){
  return new Date(now+8*3600000).toISOString().slice(0,10);
}
export function displayOnlineCount(value){return Math.max(1,count(value)??1);}
export function displayMetricCount(value){const n=count(value);return n===null?'获取中':n.toLocaleString('zh-CN');}
