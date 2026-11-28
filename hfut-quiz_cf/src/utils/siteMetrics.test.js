import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSiteMetrics,siteMetricsDay} from './siteMetrics.js';
test('concurrent mounts share one request; retries reuse receipt',async()=>{
 const ids=[];
 const api={recordSiteVisit:async id=>{ids.push(id);if(ids.length===1)throw Error('offline');return {pageViews:3,registeredCount:2};}};
 await Promise.allSettled([loadSiteMetrics(api),loadSiteMetrics(api)]);
 assert.equal(ids.length,1);
 const [a,b]=await Promise.all([loadSiteMetrics(api),loadSiteMetrics(api)]);
 assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(a,b);
 await loadSiteMetrics(api);assert.equal(ids.length,2);
 assert.equal(siteMetricsDay(Date.parse('2026-11-28T16:00:00Z')),'2026-11-29');
});
