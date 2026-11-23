// HFUT-CS-Online extension sync; reuses the main Question-Bank JWT middleware.
// This is NOT Question-Bank UserProgress. Each account owns one revisioned snapshot.
const validCourse = s => typeof s === 'string' && /^[a-z][a-z0-9-]{1,17}$/.test(s);
const validQuestion = s => typeof s === 'string' && /^[A-Za-z0-9:_-]{1,130}$/.test(s);
const validRoute = s => typeof s === 'string' && s.length <= 200 &&
  /^#\/[a-z][a-z0-9/-]*$/.test(s) && validCourse(s.split('/')[1]) &&
  !s.split('/').some(x => x === 'practice' || x === 'attachments');
const own = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validTime = t => Number.isSafeInteger(t) && t >= 0 && t <= 9e15;
const validDevice = d => typeof d === 'string' && d.length <= 90;
function compare(a, b, ta='t') {
  if (!a) return -1;
  if (!b) return 1;
  if (a[ta] !== b[ta]) return Math.sign(a[ta] - b[ta]);
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  // Match the client-side quiz tie order to avoid ping-pong updates.
  if(ta==='t' && 'v' in a && 'v' in b) return String(a.v).localeCompare(String(b.v));
  if(ta==='t' && 'disabled' in a && 'disabled' in b) return Number(a.disabled)-Number(b.disabled);
  return 0;
}

const validDay = s => typeof s === 'string' && /^20\\d{2}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])$/.test(s) &&
  !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const validMetricQuestion = s => typeof s === 'string' && s.length <= 150 &&
  /^[a-z][a-z0-9-]{1,17}:[A-Za-z0-9:_-]{1,130}$/.test(s);
function cleanMetrics(raw) {
  const result = {};
  if (!own(raw)) return result;
  const min = new Date(Date.now() - 90 * 86400000).toISOString().slice(0,10);
  const max = new Date(Date.now() + 86400000).toISOString().slice(0,10);
  for(const [day,row] of Object.entries(raw).slice(0,100)) {
    if(!validDay(day) || day<min || day>max || !own(row)) continue;
    const seconds={};
    for(const [device,n] of Object.entries(own(row.seconds)?row.seconds:{}).slice(0,30))
      if(validDevice(device) && device.length>0 && Number.isSafeInteger(n) && n>=0 && n<=86400)
        seconds[device]=n;
    const questions=[...new Set((Array.isArray(row.questions)?row.questions:[])
      .slice(0,3000).filter(validMetricQuestion))].sort();
    result[day]={seconds,questions};
  }
  return result;
}
function mergeMetrics(a,b) {
  const out={};
  for(const day of new Set([...Object.keys(a),...Object.keys(b)])) {
    const first=a[day]||{seconds:{},questions:[]};
    const second=b[day]||{seconds:{},questions:[]};
    const seconds={...first.seconds};
    for(const [device,value] of Object.entries(second.seconds))
      seconds[device]=Math.max(seconds[device]||0,value);
    const questions=[...new Set([...first.questions,...second.questions])].sort();
    if(questions.length>3000)throw new Error('每日题目统计超出额度');
    out[day]={seconds,questions};
  }
  return out;
}

function parseSnapshot(raw) {
  if (!own(raw)) return {records:{},reading:{},controls:{},metrics:{}};
  const records={}, reading={}, controls={};
  for (const [course, answers] of Object.entries(own(raw.records) ? raw.records : {})) {
    if (!validCourse(course) || !own(answers)) continue;
    const entries={};
    for (const [id, r] of Object.entries(answers).slice(0,5000)) {
      if (!validQuestion(id) || !own(r) ||
        !(r.v === null || ['right','wrong','revealed'].includes(r.v)) ||
        !validTime(r.t) || !validDevice(r.d)) continue;
      entries[id]={v:r.v,t:r.t,d:r.d};
    }
    records[course]=entries;
  }
  for (const [route,r] of Object.entries(own(raw.reading)?raw.reading:{}).slice(0,500)) {
    if (!validRoute(route) || !own(r) || !validTime(r.updated) || !validDevice(r.d)) continue;
    reading[route]={
      percent:Math.min(100,Math.max(0,Number(r.percent)||0)),
      y:Math.min(2000000,Math.max(0,Number(r.y)||0)),
      section:typeof r.section==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(r.section)?r.section:null,
      title:typeof r.title==='string'?r.title.slice(0,90):'',
      updated:r.updated,d:r.d
    };
  }
  for (const [course,c] of Object.entries(own(raw.controls)?raw.controls:{})) {
    if (!validCourse(course) || !own(c) || typeof c.disabled!=='boolean' ||
      !validTime(c.t) || !validDevice(c.d)) continue;
    controls[course]={disabled:c.disabled,t:c.t,d:c.d};
  }
  return {records,reading,controls,metrics:cleanMetrics(raw.metrics)};
}
function mergeSnapshots(a,b) {
  const out={records:{},reading:{},controls:{},metrics:mergeMetrics(a.metrics||{},b.metrics||{})};
  for (const course of new Set([...Object.keys(a.controls),...Object.keys(b.controls)])) {
    const x=a.controls[course], y=b.controls[course];
    out.controls[course] = compare(x,y)>=0?x:y;
  }
  for (const course of new Set([...Object.keys(a.records),...Object.keys(b.records)])) {
    if(out.controls[course]?.disabled)continue;
    const answers={};
    for(const id of new Set([...Object.keys(a.records[course]||{}),...Object.keys(b.records[course]||{})])) {
      const x=a.records[course]?.[id],y=b.records[course]?.[id];
      answers[id]=compare(x,y)>=0?x:y;
    }
    out.records[course]=answers;
  }
  for(const route of new Set([...Object.keys(a.reading),...Object.keys(b.reading)])) {
    const course=route.split('/')[1];
    if(out.controls[course]?.disabled)continue;
    const x=a.reading[route], y=b.reading[route];
    out.reading[route]=compare(x,y,'updated')>=0?x:y;
  }
  // Bound snapshot size even if a client sends many valid entries.
  if(Object.values(out.records).reduce((n,v)=>n+Object.keys(v).length,0)>6000)
    throw new Error('学习记录超出当前服务的 6000 题额度');
  if(Object.keys(out.reading).length>500)
    throw new Error('阅读位置超出当前服务的 500 条额度');
  return out;
}
const empty=()=>({records:{},reading:{},controls:{},metrics:{}});
function userId(c){
  const id=c.get('user')?.id;
  if(!Number.isSafeInteger(id)||id<=0)throw new Error('用户身份无效');
  return id;
}
function send(c,p,status=200){
  c.header('Cache-Control','no-store');
  return c.json(p,status);
}
// D1 migration: CREATE TABLE SiteSyncState (user_id INTEGER PRIMARY KEY,
// payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL).
export function registerSiteSyncRoutes(app) {
  app.post('/api/site-sync/exchange', async c => {
    let id;
    try{id=userId(c);}catch{return send(c,{error:'请重新登录'},401);}
    const length=Number(c.req.header('content-length')||0);
    if(length>220000)return send(c,{error:'同步数据超过 220 KB 上限'},413);
    let input;
    try{
      const text=await c.req.text();
      if(text.length>220000)return send(c,{error:'同步数据过大'},413);
      input=parseSnapshot(JSON.parse(text));
    }catch{return send(c,{error:'请求 JSON 无效'},400);}
    try{
      for(let attempt=0;attempt<5;attempt++){
        const prior=await c.env.DB.prepare('SELECT payload, version FROM SiteSyncState WHERE user_id=?').bind(id).first();
        const old=prior?parseSnapshot(JSON.parse(prior.payload)):empty();
        const merged=mergeSnapshots(old,input);
        const payload=JSON.stringify(merged);
        if(payload.length>190000)return send(c,{error:'云端记录超过单用户 190 KB 上限，请清理记录或先导出备份'},413);
        if(prior && payload===JSON.stringify(old))
          return send(c,{success:true,version:prior.version,...merged});
        if(!prior){
          const created=await c.env.DB.prepare(
            'INSERT INTO SiteSyncState(user_id,payload,version,updated_at) VALUES (?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO NOTHING'
          ).bind(id,payload).run();
          if(created.meta?.changes===1)return send(c,{success:true,version:1,...merged});
        }else{
          const changed=await c.env.DB.prepare(
            'UPDATE SiteSyncState SET payload=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND version=?'
          ).bind(payload,id,prior.version).run();
          if(changed.meta?.changes===1)return send(c,{success:true,version:prior.version+1,...merged});
        }
      }
      return send(c,{error:'同时存在多个同步更新，请稍后重试'},409);
    }catch(err){
      if(String(err?.message||err).includes('额度'))return send(c,{error:err.message},413);
      console.error('[Site Sync]',err);
      return send(c,{error:'云端同步暂不可用'},500);
    }
  });
  // Called when a course is explicitly disabled/re-enabled in the extension.
  app.post('/api/site-sync/course', async c => {
    let id;
    try{id=userId(c);}catch{return send(c,{error:'请重新登录'},401);}
    let input;
    try{input=await c.req.json();}catch{return send(c,{error:'无效 JSON'},400);}
    if(!validCourse(input?.course)||typeof input?.disabled!=='boolean' ||
      !validTime(input?.t)||!validDevice(input?.d))
      return send(c,{error:'无效的课程设置'},400);
    const patch={records:{},reading:{},controls:{[input.course]:{disabled:input.disabled,t:input.t,d:input.d}}};
    // Use the same CAS merge as exchange, so a course clear cannot revive old data.
    try{
      for(let attempt=0;attempt<5;attempt++){
        const prev=await c.env.DB.prepare('SELECT payload,version FROM SiteSyncState WHERE user_id=?').bind(id).first();
        const merged=mergeSnapshots(prev?parseSnapshot(JSON.parse(prev.payload)):empty(),patch);
        const body=JSON.stringify(merged);
        const result=prev
          ? await c.env.DB.prepare('UPDATE SiteSyncState SET payload=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND version=?').bind(body,id,prev.version).run()
          : await c.env.DB.prepare('INSERT INTO SiteSyncState(user_id,payload,version,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO NOTHING').bind(id,body).run();
        if(result.meta?.changes===1)return send(c,{success:true,control:merged.controls[input.course]});
      }
      return send(c,{error:'并发修改冲突，请重试'},409);
    }catch(err){console.error('[Site Sync control]',err);return send(c,{error:'课程设置更新失败'},500);}
  });
  app.delete('/api/site-sync', async c => {
    let id;try{id=userId(c);}catch{return send(c,{error:'请重新登录'},401);}
    await c.env.DB.prepare('DELETE FROM SiteSyncState WHERE user_id=?').bind(id).run();
    return send(c,{success:true});
  });
}
