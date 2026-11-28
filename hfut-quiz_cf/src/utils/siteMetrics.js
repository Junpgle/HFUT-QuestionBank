// One receipt per document, even under React StrictMode remounts.
let visitId,request,result;
export function loadSiteMetrics(api){
  if(result)return Promise.resolve(result);
  if(request)return request;
  if(!visitId)visitId=crypto.randomUUID();
  request=api.recordSiteVisit(visitId).then(data=>{result=data;return data;}).finally(()=>{request=null;});
  return request;
}
export function siteMetricsDay(now=Date.now()){
  return new Date(now+8*3600000).toISOString().slice(0,10);
}
