export const STAR_NOTICE_DELAY=5*60*1000;
export const STAR_NOTICE_DISMISSED_KEY='qbank:star-notice:dismissed:v1';
export const STAR_NOTICE_ELAPSED_KEY='qbank:star-notice:elapsed:v1';

export function createForegroundClock(initial=0,now=()=>performance.now()){
  let elapsed=Number.isFinite(initial)?Math.max(0,Math.min(initial,STAR_NOTICE_DELAY)):0;
  let started=null;
  const value=()=>Math.min(STAR_NOTICE_DELAY,elapsed+(started===null?0:Math.max(0,now()-started)));
  return {
    elapsed:value,
    remaining:()=>STAR_NOTICE_DELAY-value(),
    setActive(active){
      if(active&&started===null&&elapsed<STAR_NOTICE_DELAY)started=now();
      else if(!active&&started!==null){elapsed=value();started=null;}
      return value();
    },
  };
}
export function readNoticeStorage(storage,key){
  try{return storage()?.getItem(key)??null;}catch{return null;}
}
export function writeNoticeStorage(storage,key,value){
  try{storage()?.setItem(key,String(value));}catch{}
}
