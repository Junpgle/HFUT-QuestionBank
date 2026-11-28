// One receipt per document, even under React StrictMode remounts.
const CACHE_KEY='qbank:site-metrics:last-success:v2';
const OLD_CACHE_KEY='qbank:site-metrics:last-success:v1';
let visitId,request,result;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function normalize(data){
  if(!data||typeof data!=='object')return null;
  const totalPageViews=count(data.totalPageViews),registeredCount=count(data.registeredCount);
  if(registeredCount===null)return null;
  return {day:typeof data.day==='string'?data.day:null,pageViews:count(data.pageViews),totalPageViews,registeredCount,onlineCount:count(data.onlineCount)};
}
export function readSiteMetricsCache(){
  try{
    const storage=globalThis.localStorage;
    const raw=JSON.parse(storage?.getItem(CACHE_KEY)||storage?.getItem(OLD_CACHE_KEY)||'null'),data=normalize(raw);
    return data?{...data,cached:true}:null;
  }catch{return null;}
}
export function cacheSiteMetrics(raw){
  const data=normalize(raw);
  if(!data||data.totalPageViews===null)return null;
  try{globalThis.localStorage?.setItem(CACHE_KEY,JSON.stringify(data));}catch{}
  return {...data,cached:false};
}
export function loadSiteMetrics(api,{readOnly=false}={}){
  if(result)return Promise.resolve(result);
  if(request)return request;
  if(!readOnly&&!visitId)visitId=crypto.randomUUID();
  request=(readOnly?api.readSiteMetrics():api.recordSiteVisit(visitId)).then(data=>{
    const fresh=cacheSiteMetrics(data);
    if(!fresh)throw Error('站点统计响应异常或后端尚未更新');
    result=fresh;
    return result;
  }).finally(()=>{request=null;});
  return request;
}
export function siteMetricsDay(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(0,10);}
export function displayOnlineCount(value){return Math.max(1,count(value)??1);}
export function displayMetricCount(value){const n=count(value);return n===null?'获取中':n.toLocaleString('zh-CN');}
