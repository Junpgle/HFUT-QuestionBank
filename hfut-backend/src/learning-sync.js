const validSubject=s=>typeof s==='string'&&['innovation','maogai','hgdmy-maogai','english-culture','cultural-relics'].includes(s);
const prefixes={innovation:/^(OLD-|L\d+-)/,maogai:/^MG-/, 'hgdmy-maogai':/^HGD-MG-/, 'english-culture':/^ENG-CUL-/, 'cultural-relics':/^RELICS-/};
const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function clean(e,subject){
  if(!e||typeof e.id!=='string'||!/^[a-f0-9-]{36}$/i.test(e.id)||!Number.isSafeInteger(e.at)||e.at<1577836800000||e.at>Date.now()+86400000||!day(e.day))throw Error('无效学习事件');
  const base={id:e.id,kind:e.kind,at:e.at,day:e.day};
  if(e.kind==='plan'){
    const p=e.plan;
    if(!p||!day(p.exam)||!Number.isInteger(p.reserve)||p.reserve<0||p.reserve>30||typeof p.scope!=='string'||p.scope.length>200)throw Error('无效考试计划');
    if(p.target!==undefined&&![.85,.9,.95].includes(p.target))throw Error('无效目标记忆率');
    return {...base,plan:{exam:p.exam,reserve:p.reserve,scope:p.scope,target:p.target??.9}};
  }
  if(typeof e.questionId!=='string'||e.questionId.length>100||!prefixes[subject].test(e.questionId))throw Error('无效题目 ID');
  if(e.kind==='intro')return {...base,questionId:e.questionId,...(e.difficult===true?{difficult:true}:{})};
  if(e.kind==='rate'&&[1,2,3,4].includes(e.rating))return {...base,questionId:e.questionId,rating:e.rating,...(e.source==='practice'?{source:'practice'}:{})};
  throw Error('无效事件类型');
}
// D1 has a bound-parameter limit; 20 rows per statement stays below 100.
function insertStatements(db,uid,subject,items){
  const statements=[];
  for(let i=0;i<items.length;i+=20){
    const group=items.slice(i,i+20);
    statements.push(db.prepare('INSERT INTO LearningEvents(user_id,subject,event_id,payload) VALUES '+group.map(()=>'(?,?,?,?)').join(',')+' ON CONFLICT(user_id,subject,event_id) DO NOTHING').bind(...group.flatMap(e=>[uid,subject,e.id,JSON.stringify(e)])));
  }
  return statements;
}
const selectPage=(db,uid,subject,after)=>db.prepare('SELECT seq,payload FROM LearningEvents WHERE user_id=? AND subject=? AND seq>? ORDER BY seq LIMIT 201').bind(uid,subject,after);
function pageResult(res,after){const rows=res.results||[],page=rows.slice(0,200);return {events:page.map(r=>JSON.parse(r.payload)),cursor:page.at(-1)?.seq||after,more:rows.length>200};}
export function registerLearningRoutes(app){
  app.post('/api/learning/exchange',async c=>{
    const uid=c.get('user')?.id;
    c.header('Cache-Control','no-store');
    if(!Number.isSafeInteger(uid)||uid<=0)return c.json({error:'请重新登录'},401);
    let subject,after,items;
    try{
      const raw=await c.req.text();if(raw.length>80000)return c.json({error:'请求过大'},413);
      const body=JSON.parse(raw);subject=body.subject;after=body.after??0;
      if(!validSubject(subject)||!Number.isSafeInteger(after)||after<0||!Array.isArray(body.events)||body.events.length>50)throw Error('无效同步请求');
      items=body.events.map(e=>clean(e,subject));
    }catch{return c.json({error:'学习事件或游标无效'},400);}
    try{
      const db=c.env.DB;
      const select=selectPage(db,uid,subject,after);
      const res=items.length?(await db.batch([...insertStatements(db,uid,subject,items),select])).at(-1):await select.all();
      return c.json({success:true,userId:uid,ack:items.map(e=>e.id),...pageResult(res,after)});
    }catch(e){console.error('[learning exchange]',e);return c.json({error:'学习记录暂不可用'},500);}
  });
  app.post('/api/learning/events',async c=>{
    const uid=c.get('user')?.id;
    if(!Number.isSafeInteger(uid)||uid<=0)return c.json({error:'请重新登录'},401);
    try{
      const raw=await c.req.text();if(raw.length>80000)return c.json({error:'请求过大'},413);
      const {subject,events}=JSON.parse(raw);
      if(!validSubject(subject)||!Array.isArray(events)||events.length>50)throw Error('无效科目或事件数');
      const items=events.map(e=>clean(e,subject));
      if(items.length)await c.env.DB.batch(insertStatements(c.env.DB,uid,subject,items));
      c.header('Cache-Control','no-store');
      return c.json({success:true,userId:uid});
    }catch(e){console.error('[learning upload]',e);return c.json({error:'学习事件上传失败'},400);}
  });
  app.get('/api/learning/events',async c=>{
    const uid=c.get('user')?.id,subject=c.req.query('subject'),after=Number(c.req.query('after')||0);
    if(!Number.isSafeInteger(uid)||uid<=0)return c.json({error:'请重新登录'},401);
    if(!validSubject(subject)||!Number.isSafeInteger(after)||after<0)return c.json({error:'无效科目或游标'},400);
    try{
      const res=await c.env.DB.prepare('SELECT seq,payload FROM LearningEvents WHERE user_id=? AND subject=? AND seq>? ORDER BY seq LIMIT 201').bind(uid,subject,after).all();
      const rows=res.results||[], page=rows.slice(0,200);
      c.header('Cache-Control','no-store');
      return c.json({success:true,userId:uid,events:page.map(r=>JSON.parse(r.payload)),cursor:page.at(-1)?.seq||after,more:rows.length>200});
    }catch(e){console.error('[learning pull]',e);return c.json({error:'学习记录暂不可用'},500);}
  });
}
