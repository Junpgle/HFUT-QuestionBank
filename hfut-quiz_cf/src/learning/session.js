// Uncommitted interactions are local drafts, not memory observations.
const key=(user,subject)=>'qbank:learning-draft:v1:'+String(user?.id??'guest')+':'+subject;
export const cardVersion=c=>c?String(c.firstSeen)+':'+String(c.lastReview||0)+':'+String(c.reps||0)+(c.relearnedAt?':'+String(c.relearnedAt):''):'new';
export function readDraft(user,subject){
  try{return JSON.parse(localStorage.getItem(key(user,subject))||'null');}catch{return null;}
}
export function writeDraft(user,subject,value){
  try{if(value)localStorage.setItem(key(user,subject),JSON.stringify(value));else localStorage.removeItem(key(user,subject));return true;}catch{return false;}
}
export function validDraft(draft,ids,cards,plan){
  const a=draft?.answer;
  if(a!==undefined&&(!a||typeof a!=='object'||Array.isArray(a)||a.selected!==undefined&&(!Array.isArray(a.selected)||!a.selected.every(Number.isInteger))||a.inputs!==undefined&&(!Array.isArray(a.inputs)||!a.inputs.every(x=>x===null||typeof x==='string'))||a.text!==undefined&&typeof a.text!=='string'||a.relearning!==undefined&&typeof a.relearning!=='boolean'||a.result!==undefined&&![null,'correct','wrong','forgot','self','hint'].includes(a.result)))return false;
  return !!draft&&!!plan&&draft.exam===plan.exam&&draft.scope===plan.scope&&ids.includes(draft.task?.id)&&['intro','recall','review','relearn'].includes(draft.task.kind)&&draft.version===cardVersion(cards[draft.task.id])&&(!cards[draft.task.id]?.pendingRelearn||draft.task.kind==='relearn'||a?.result!=null);
}
