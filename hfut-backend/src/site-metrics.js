const allowedOrigins=new Set(['https://qbank.junpgle.me','https://cxcy.junpgle.me']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const chinaDay=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
const registeredCache=new WeakMap();
export async function recordSiteVisit(db,id,now=Date.now()){
  if(typeof id!=='string'||!uuid.test(id))throw Error('invalid visit id');
  const day=chinaDay(now),threshold=new Date(now-180000).toISOString();
  const cached=registeredCache.get(db);
  const useCached=cached&&now<cached.until;
  const statements=[
    db.prepare('INSERT INTO SitePageViews(visit_id,day) VALUES(?,?) ON CONFLICT(visit_id) DO NOTHING').bind(id,day),
    db.prepare('SELECT page_views FROM SiteDailyMetrics WHERE day=?').bind(day),
    db.prepare('SELECT COUNT(*) AS count FROM UserPresence WHERE last_seen>?').bind(threshold),
  ];
  if(!useCached)statements.push(db.prepare('SELECT COUNT(*) AS count FROM Users WHERE email_verified=1'));
  const result=await db.batch(statements);
  const registered=useCached?cached.count:Number(result[3]?.results?.[0]?.count||0);
  if(!useCached)registeredCache.set(db,{count:registered,until:now+300000});
  return {day,pageViews:Number(result[1]?.results?.[0]?.page_views||0),registeredCount:registered,onlineCount:Number(result[2]?.results?.[0]?.count||0)};
}
export function invalidateRegisteredCount(db){registeredCache.delete(db);}
export function registerSiteMetricsRoutes(app){
  app.post('/api/site-metrics/visit',async c=>{
    c.header('Cache-Control','no-store');
    // Browser-origin check is a low-cost filter, not bot-proof authentication.
    if(!allowedOrigins.has(c.req.header('Origin')))return c.json({error:'不支持的访问来源'},403);
    const len=Number(c.req.header('Content-Length')||0);
    if(len>64)return c.json({error:'请求过大'},413);
    const id=(await c.req.text()).trim();
    if(!uuid.test(id))return c.json({error:'无效访问标识'},400);
    try{return c.json({success:true,...await recordSiteVisit(c.env.DB,id)});}
    catch(e){console.error('[site metrics]',e);return c.json({error:'站点统计暂不可用'},503);}
  });
}
