// Only locates UI controls. Does not read prompts, answers, files, or conversation history.
let host=null,targetKind=null,observer=null,frame=null;
const visible=el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>3&&r.height>3&&style.visibility!=='hidden'&&style.display!=='none';};
export function findControl(kind,root=document) {
  if(kind==='composer'){
    const candidates=[...root.querySelectorAll('#prompt-textarea, textarea[placeholder], [contenteditable="true"][role="textbox"], [contenteditable="true"].ProseMirror')].filter(visible);
    return candidates.length===1?candidates[0]:candidates.find(el=>el.id==='prompt-textarea')||null;
  }
  if(kind==='attach'){
    const known=root.querySelector('#composer-plus-btn');if(known&&visible(known))return known;
    const candidates=[...root.querySelectorAll('button,[role="button"]')].filter(el=>visible(el)&&/첨부|사진.*파일|파일.*추가|add photos|attach|upload|add files/i.test((el.getAttribute('aria-label')||'')+' '+(el.getAttribute('title')||'')));
    return candidates.length===1?candidates[0]:null;
  }
  return null;
}
function clear(){if(frame)cancelAnimationFrame(frame);frame=null;observer?.disconnect();observer=null;window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);host?.remove();host=null;targetKind=null;}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=null;position();});}
function position(){
  if(!host||!targetKind)return;
  const target=findControl(targetKind);if(!target){host.style.display='none';return;}
  host.style.display='block';const r=target.getBoundingClientRect(),box=host._box,tip=host._tip;
  Object.assign(box.style,{left:`${Math.max(0,r.left-5)}px`,top:`${r.top-5}px`,width:`${r.width+10}px`,height:`${r.height+10}px`});
  box.style.left=Math.max(0,r.left-5)+'px';
  tip.style.left=Math.max(12,Math.min(r.left,window.innerWidth-300))+'px';
  tip.style.top=(r.top>140?r.top-120:Math.min(window.innerHeight-130,r.bottom+14))+'px';
}
function show(kind){
  clear();if(!kind)return {found:true};
  const target=findControl(kind);if(!target)return {found:false,reason:kind==='attach'?'첨부 버튼을 확실히 찾지 못했어요. 입력창 주변의 + 또는 도구 메뉴에서 파일 추가를 찾아 주세요.':'입력창을 찾지 못했어요. 로그인하거나 새 대화를 연 뒤 다시 눌러 주세요.'};
  targetKind=kind;host=document.createElement('div');host.id='ai-bridge-coach-overlay';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'2147483600',pointerEvents:'none'});
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent='*{box-sizing:border-box}.box{position:fixed;border:3px solid #eb704e;border-radius:12px;box-shadow:0 0 0 5px #eb704e22;pointer-events:none}.tip{position:fixed;width:284px;padding:15px 38px 15px 16px;background:#fffaf3;border:1px solid #e5c7ad;border-radius:12px;color:#294337;box-shadow:0 8px 28px #172a2926;font:14px/1.65 system-ui,sans-serif;pointer-events:auto}.tip b{display:block;font-size:12px;color:#a64e35;margin-bottom:4px}.tip button{position:absolute;right:8px;top:8px;border:0;background:transparent;font-size:20px;cursor:pointer;color:#294337}.tip button:focus-visible{outline:2px solid #d75c3b}';
  const box=document.createElement('div');box.className='box';const tip=document.createElement('div');tip.className='tip';tip.setAttribute('role','status');
  const label=document.createElement('b');label.textContent='AI Bridge · 직접 해 보세요';
  const text=document.createElement('span');text.textContent=kind==='attach'?'원자료를 전달하는 곳이에요. 직접 눌러 실습 파일을 선택하세요.':'여기에 나의 요청을 작성하세요. 필요한 결과와 조건을 직접 정해 보세요.';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','버튼 안내 닫기');close.onclick=clear;
  tip.append(label,text,close);shadow.append(style,box,tip);host._box=box;host._tip=tip;document.documentElement.append(host);
  target.scrollIntoView({block:'nearest',behavior:'smooth'});position();window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
  observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
  return {found:true};
}
if(typeof chrome!=='undefined'&&chrome.runtime?.onMessage)chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(message?.type==='AIBRIDGE_HIGHLIGHT'&&sender.id===chrome.runtime.id)respond(show(message.target));});
window.addEventListener('pagehide',clear);
export { show as showHighlight, clear as clearHighlight };
