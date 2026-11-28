export const validAttemptId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const toAttemptKey=raw=>String(raw??'').replace(/["\\]/g,'').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,60)||'Unknown';
export function prepareAttemptStats(db,uid,results){
  const list=Array.isArray(results)?results.slice(0,100):[];
  const seen=new Set(),ack=[],rows=[],legacy=[];
  for(const x of list){
    if(!x||typeof x.questionId!=='string'||!x.questionId||x.questionId.length>160||x.questionId.startsWith('custom_'))continue;
    if(x.attemptId===undefined){legacy.push(x);continue;}
    if(!validAttemptId(x.attemptId)||typeof x.isCorrect!=='boolean')throw Error('无效答题统计事件');
    if(seen.has(x.attemptId))continue;
    seen.add(x.attemptId);ack.push(x.attemptId);
    rows.push([uid,x.attemptId,x.questionId,String(x.questionTitle||'').slice(0,4000),String(x.category||'').slice(0,300),x.isCorrect?1:0,toAttemptKey(x.userAnswer)]);
  }
  const statements=[];
  for(let i=0;i<rows.length;i+=14){
    const chunk=rows.slice(i,i+14);
    statements.push(db.prepare('INSERT INTO QuestionAttemptReceipts(user_id,attempt_id,question_id,question_title,category,is_correct,answer_key) VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?)').join(',')+' ON CONFLICT(user_id,attempt_id) DO NOTHING').bind(...chunk.flat()));
  }
  return {statements,ack,legacy};
}
