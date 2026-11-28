import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSiteMetrics,siteMetricsDay,cacheSiteMetrics,readSiteMetricsCache,displayOnlineCount,displayMetricCount} from './siteMetrics.js';
test('concurrent mounts share one request; retries reuse receipt',async()=>{
 const ids=[];
 const api={recordSiteVisit:async id=>{ids.push(id);if(ids.length===1)throw Error('offline');return {day:'2026-11-28',pageViews:3,totalPageViews:10,registeredCount:2,onlineCount:0};}};
 await Promise.allSettled([loadSiteMetrics(api),loadSiteMetrics(api)]);
 assert.equal(ids.length,1);
 const [a,b]=await Promise.all([loadSiteMetrics(api),loadSiteMetrics(api)]);
 assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(a,b);
 await loadSiteMetrics(api);assert.equal(ids.length,2);
 assert.equal(siteMetricsDay(Date.parse('2026-11-28T16:00:00Z')),'2026-11-29');
});

test('online count has minimum 1, unavailable totals say loading but zero stays zero',()=>{
 for(const value of [null,undefined,0,-1,NaN,'7'])assert.equal(displayOnlineCount(value),1);
 assert.equal(displayOnlineCount(7),7);
 assert.equal(displayMetricCount(null),'获取中');
 assert.equal(displayMetricCount(undefined),'获取中');
 assert.equal(displayMetricCount(0),'0');
 assert.equal(displayMetricCount(1234),'1,234');
});
test('last successful counts persist across reloads, including previous-day cache; bad responses never overwrite',()=>{
 const old=globalThis.localStorage,store=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}});
 try{
  assert.equal(readSiteMetricsCache(),null);
  store.set('qbank:site-metrics:last-success:v1',JSON.stringify({day:'2026-11-26',pageViews:80,registeredCount:527,onlineCount:0}));
  assert.equal(readSiteMetricsCache().totalPageViews,null);
  assert.equal(readSiteMetricsCache().registeredCount,527);
  const previous={day:'2026-11-27',pageViews:386,totalPageViews:1234,registeredCount:528,onlineCount:0};
  assert.equal(cacheSiteMetrics(previous).cached,false);
  assert.deepEqual(readSiteMetricsCache(),{...previous,cached:true});
  assert.equal(cacheSiteMetrics({...previous,totalPageViews:null}),null);
  assert.equal(readSiteMetricsCache().pageViews,386);
  cacheSiteMetrics({day:'2026-11-28',pageViews:0,totalPageViews:1234,registeredCount:529,onlineCount:2});
  assert.equal(readSiteMetricsCache().pageViews,0);
  assert.equal(readSiteMetricsCache().totalPageViews,1234);
  assert.equal(readSiteMetricsCache().registeredCount,529);
  store.set('qbank:site-metrics:last-success:v2','broken json');
  assert.equal(readSiteMetricsCache(),null);
 }finally{if(old===undefined)delete globalThis.localStorage;else Object.defineProperty(globalThis,'localStorage',{configurable:true,value:old});}
});
