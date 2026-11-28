// Memory rating is not objective correctness. Only completed recall attempts count.
export function learningAttempt(q,task,answer,rating,event){
  if(!q||task?.kind==='intro'||!event||!answer?.result)return null;
  const subjective=q.type==='big'||answer.result==='self';
  const assisted=answer.result==='hint'||answer.usedHint===true;
  const objective=!subjective&&!assisted&&['correct','wrong','forgot'].includes(answer.result);
  const isCorrect=objective&&answer.result==='correct';
  const personalCorrect=subjective?rating>=3:isCorrect&&rating>=2;
  const userAnswer=q.type==='fill'?(answer.inputs||[]).map(x=>String(x??'')).join('；'):
    subjective?String(answer.text||''):(answer.selected||[]).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<26).sort((a,b)=>a-b).map(x=>String.fromCharCode(65+x)).join('');
  return {attemptId:event.id,questionId:q.id,questionTitle:q.question||'',category:q.category||'',
    isCorrect,personalCorrect,objective,countMastered:personalCorrect&&rating>=3,
    userAnswer:(answer.result==='forgot'?'忘记了':userAnswer).slice(0,200),timestamp:new Date(event.at).toISOString()};
}
