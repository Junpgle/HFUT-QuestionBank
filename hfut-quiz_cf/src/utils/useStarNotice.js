import {useCallback,useEffect,useState} from 'react';
import {createForegroundClock,STAR_NOTICE_DELAY,STAR_NOTICE_DISMISSED_KEY,STAR_NOTICE_ELAPSED_KEY,readNoticeStorage,writeNoticeStorage} from './starNotice';

const local=()=>window.localStorage;
const session=()=>window.sessionStorage;
const dismissed=()=>readNoticeStorage(local,STAR_NOTICE_DISMISSED_KEY)==='1';
const elapsed=()=>Number(readNoticeStorage(session,STAR_NOTICE_ELAPSED_KEY)||0);

export function useStarNotice(){
  const [closed,setClosed]=useState(dismissed);
  const [ready,setReady]=useState(()=>elapsed()>=STAR_NOTICE_DELAY);
  const close=useCallback(()=>{
    writeNoticeStorage(local,STAR_NOTICE_DISMISSED_KEY,'1');
    setClosed(true);
  },[]);
  useEffect(()=>{
    const onStorage=e=>{if(e.key===STAR_NOTICE_DISMISSED_KEY&&e.newValue==='1')setClosed(true);};
    window.addEventListener('storage',onStorage);
    return ()=>window.removeEventListener('storage',onStorage);
  },[]);
  useEffect(()=>{
    if(closed||ready)return;
    const clock=createForegroundClock(elapsed());
    let timer=null,alive=true;
    const persist=()=>writeNoticeStorage(session,STAR_NOTICE_ELAPSED_KEY,clock.elapsed());
    const stop=()=>{
      if(timer!==null)clearTimeout(timer);
      timer=null;
      clock.setActive(false);persist();
    };
    const update=()=>{
      stop();
      if(!alive)return;
      if(clock.remaining()<=0){setReady(true);return;}
      if(document.visibilityState!=='visible'||navigator.onLine===false)return;
      clock.setActive(true);
      timer=setTimeout(()=>{
        stop();
        if(clock.remaining()<=0)setReady(true);
        else update();
      },Math.ceil(clock.remaining()));
    };
    document.addEventListener('visibilitychange',update);
    window.addEventListener('online',update);
    window.addEventListener('offline',update);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',update);
    update();
    return ()=>{
      alive=false;stop();
      document.removeEventListener('visibilitychange',update);
      window.removeEventListener('online',update);
      window.removeEventListener('offline',update);
      window.removeEventListener('pagehide',stop);
      window.removeEventListener('pageshow',update);
    };
  },[closed,ready]);
  return {show:ready&&!closed,close};
}
