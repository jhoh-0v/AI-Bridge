const allowed=new Set(['PING','LAUNCH','EXPORT']);
window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.source!=='ai-bridge-web'||!allowed.has(event.data.type)||typeof event.data.nonce!=='string'||event.data.nonce.length>80)return;
  const {type,nonce,level}=event.data;
  chrome.runtime.sendMessage({type,level},response=>{
    const error=chrome.runtime.lastError;
    window.postMessage({source:'ai-bridge-extension',nonce,result:error?{ok:false,error:'확장 프로그램을 다시 열어 주세요.'}:response},location.origin);
  });
});
