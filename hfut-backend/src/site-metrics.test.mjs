import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {chinaDay,recordSiteVisit,readSiteMetrics,invalidateRegisteredCount,registerSiteMetricsRoutes} from './site-metrics.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE Users(id INTEGER PRIMARY KEY,email_verified INTEGER); INSERT INTO Users VALUES(1,1),(2,0),(3,1); CREATE TABLE UserPresence(user_id INTEGER,last_seen TEXT); INSERT INTO UserPresence VALUES(1,'2026-11-28T15:59:00Z');");
 sql.exec(readFileSync(new URL('../migrations/0003_site_metrics.sql',import.meta.url),'utf8'));
 const db={prepare(q){const stmt=(args)=>({run(){return {results:q.startsWith('SELECT')?sql.prepare(q).all(...args):(sql.prepare(q).run(...args),[])}}});return {...stmt([]),bind:(...args)=>stmt(args)};},async batch(s){sql.exec('BEGIN');try{const out=s.map(x=>x.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {db,sql};
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('PV counts independent loads, deduplicates retries, resets at China midnight',async()=>{
 const {db,sql}=fixture(),t=Date.parse('2026-11-28T15:59:59Z');
 assert.equal(chinaDay(t),'2026-11-28');assert.equal(chinaDay(t+1000),'2026-11-29');
 assert.deepEqual(await recordSiteVisit(db,id(1),t),{day:'2026-11-28',pageViews:1,totalPageViews:1,registeredCount:2,onlineCount:1});
 assert.equal((await recordSiteVisit(db,id(1),t)).pageViews,1);
 assert.equal((await recordSiteVisit(db,id(2),t)).pageViews,2);
 assert.equal((await recordSiteVisit(db,id(1),t+1000)).pageViews,0);
 assert.equal((await recordSiteVisit(db,id(3),t+1000)).pageViews,1);
 sql.exec('UPDATE Users SET email_verified=1 WHERE id=2');
 invalidateRegisteredCount(db);assert.equal((await recordSiteVisit(db,id(3),t+2000)).registeredCount,3);
 assert.equal(sql.prepare('SELECT SUM(page_views) AS n FROM SiteDailyMetrics').get().n,3);
 await assert.rejects(recordSiteVisit(db,'invalid',t));sql.close();
});
test('visit route rejects untrusted origins and malformed receipts',async()=>{
 let handler;registerSiteMetricsRoutes({get:()=>{},post:(_path,h)=>handler=h});
 const call=(origin,body)=>handler({req:{header:k=>k==='Origin'?origin:null,text:async()=>body},header:()=>{},json:(body,status=200)=>({body,status})});
 assert.equal((await call('https://elsewhere.example',id(1))).status,403);
 assert.equal((await call('https://qbank.junpgle.me','bad')).status,400);
});

test('cumulative totals survive midnight and read-only requests never increase PV',async()=>{
 const {db,sql}=fixture(),t=Date.parse('2026-11-28T15:59:59Z');
 assert.equal((await readSiteMetrics(db,t)).totalPageViews,0);
 await recordSiteVisit(db,id(1),t);await recordSiteVisit(db,id(2),t+1000);
 const result=await readSiteMetrics(db,t+1000);
 assert.equal(result.pageViews,1);assert.equal(result.totalPageViews,2);
 assert.equal((await recordSiteVisit(db,id(1),t+1000)).totalPageViews,2);
 let get,post;registerSiteMetricsRoutes({get:(_p,h)=>get=h,post:(_p,h)=>post=h});
 const ctx={env:{DB:db},req:{header:k=>k==='Origin'?'http://localhost:5173':null,text:async()=>id(3)},header:()=>{},json:(body,status=200)=>({body,status})};
 assert.equal((await get(ctx)).body.totalPageViews,2);
 assert.equal((await post(ctx)).body.totalPageViews,2);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM SitePageViews').get().n,2);
 sql.close();
});
