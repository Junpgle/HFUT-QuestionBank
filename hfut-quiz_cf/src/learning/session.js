// Uncommitted interactions are local drafts, not memory observations.
const key=(user,subject)=>'qbank:learning-draft:v1:'+String(user?.id??'guest')+':'+subject;
export const cardVersion=c=>c?String(c.firstSeen)+':'+String(c.lastReview||0)+':'+String(c.reps||0):'new';
export function readDraft(user,subject){
  try{return JSON.parse(localStorage.getItem(key(user,subject))||'null');}catch{return null;}
}
export function writeDraft(user,subject,value){
  try{if(value)localStorage.setItem(key(user,subject),JSON.stringify(value));else localStorage.removeItem(key(user,subject));return true;}catch{return false;}
}
export function validDraft(draft,ids,cards,plan){
  return !!draft&&!!plan&&draft.exam===plan.exam&&draft.scope===plan.scope&&ids.includes(draft.task?.id)&&['intro','recall','review'].includes(draft.task.kind)&&draft.version===cardVersion(cards[draft.task.id]);
}
