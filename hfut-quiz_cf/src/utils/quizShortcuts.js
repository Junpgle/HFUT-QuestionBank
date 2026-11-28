export function ignoreQuizShortcut(event){
  const target=event.target;
  return !!(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||
    target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"],dialog[open]'));
}
export function optionShortcutIndex(key,count){
  const index=/^[1-8]$/.test(key)?Number(key)-1:/^[a-h]$/i.test(key)?key.toUpperCase().charCodeAt(0)-65:-1;
  return index>=0&&index<count?index:-1;
}
// Resolve keys without side effects. Arrows skip/navigation; Space/F explicitly recall.
export function quizShortcutAction(key,{mode,type,answered,selectedCount=0,optionCount=0,canGoBack=true}={}){
  if(!['quiz','memorize','mistakes','favorites'].includes(mode))return null;
  if(key==='Escape')return {type:'exit'};
  if(key==='ArrowLeft')return canGoBack?{type:'previous'}:null;
  if(key==='ArrowRight')return {type:'next'};
  const confirm=key===' '||key==='Enter';
  if(mode==='memorize')return confirm?{type:'memorize'}:null;
  if(answered)return confirm?{type:'next'}:null;
  if(type!=='fill'&&type!=='big'){
    const index=optionShortcutIndex(key,optionCount);
    if(index>=0)return {type:'option',index};
    if(type==='multiple'&&key==='Enter'&&selectedCount)return {type:'submit'};
  }
  if(type==='fill'&&key==='Enter')return {type:'submit-fill'};
  if(type!=='big'&&(key===' '||key.toLowerCase()==='f'))return {type:'reveal'};
  return null;
}
