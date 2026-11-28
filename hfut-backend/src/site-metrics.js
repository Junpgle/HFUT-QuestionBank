const allowedOrigins=new Set(['https://qbank.junpgle.me','https://cxcy.junpgle.me']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const chinaDay=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
export function isLocalMetricsOrigin(origin){
  try{const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.origin===origin;}catch{return false;}
}
const registeredCache=new WeakMap();
async function collectMetrics(db,now,visitId=null){
  const day=chinaDay(now),threshold=new Date(now-180000).toISOString();
  const cached=registeredCache.get(db),useCached=cached&&now<cached.until;
  const statements=[];
  if(visitId)statements.push(db.prepare('INSERT INTO SitePageViews(visit_id,day) VALUES(?,?) ON CONFLICT(visit_id) DO NOTHING').bind(visitId,day));
  const offset=statements.length;
  // Scan one aggregate row per day, not the per-visit receipt table.
  statements.push(db.prepare('SELECT COALESCE(SUM(page_views),0) AS total_views, COALESCE(SUM(CASE WHEN day=? THEN page_views ELSE 0 END),0) AS today_views, (SELECT value FROM SystemConfig WHERE key=\'historical_page_views_estimate\') AS historical_estimate FROM SiteDailyMetrics').bind(day),
    db.prepare('SELECT COUNT(*) AS count FROM UserPresence WHERE last_seen>?').bind(threshold));
  if(!useCached)statements.push(db.prepare('SELECT COUNT(*) AS count FROM Users WHERE email_verified=1'));
  const result=await db.batch(statements);
  const registered=useCached?cached.count:Number(result[offset+2]?.results?.[0]?.count||0);
  if(!useCached)registeredCache.set(db,{count:registered,until:now+300000});
  const row=result[offset]?.results?.[0]||{};
  const rawEstimate=Number(row.historical_estimate??0);
  const historicalPageViewsEstimate=Number.isSafeInteger(rawEstimate)&&rawEstimate>=0?rawEstimate:0;
  const measuredPageViews=Number(row.total_views||0);
  // Keep inferred history separate from measured page-view receipts.
  return {day,pageViews:Number(row.today_views||0),totalPageViews:measuredPageViews+historicalPageViewsEstimate,measuredPageViews,historicalPageViewsEstimate,registeredCount:registered,onlineCount:Number(result[offset+1]?.results?.[0]?.count||0)};
}
export function recordSiteVisit(db,id,now=Date.now()){
  if(typeof id!=='string'||!uuid.test(id))return Promise.reject(Error('invalid visit id'));
  return collectMetrics(db,now,id);
}
export function readSiteMetrics(db,now=Date.now()){return collectMetrics(db,now);}
export function invalidateRegisteredCount(db){registeredCache.delete(db);}
export function registerSiteMetricsRoutes(app){
  app.get('/api/site-metrics',async c=>{
    c.header('Cache-Control','no-store');
    try{return c.json({success:true,...await readSiteMetrics(c.env.DB)});}
    catch(e){console.error('[site metrics read]',e);return c.json({error:'站点统计暂不可用'},503);}
  });
  app.post('/api/site-metrics/visit',async c=>{
    c.header('Cache-Control','no-store');
    const origin=c.req.header('Origin');
    // Local debugging is read-only; never pollute production PV.
    if(isLocalMetricsOrigin(origin)){
      try{return c.json({success:true,...await readSiteMetrics(c.env.DB)});}
      catch(e){console.error('[site metrics read]',e);return c.json({error:'站点统计暂不可用'},503);}
    }
    if(!allowedOrigins.has(origin))return c.json({error:'不支持的访问来源'},403);
    const len=Number(c.req.header('Content-Length')||0);
    if(len>64)return c.json({error:'请求过大'},413);
    const id=(await c.req.text()).trim();
    if(!uuid.test(id))return c.json({error:'无效访问标识'},400);
    try{return c.json({success:true,...await recordSiteVisit(c.env.DB,id)});}
    catch(e){console.error('[site metrics]',e);return c.json({error:'站点统计暂不可用'},503);}
  });
}
