import { createSession, updateDraft, submitEvidence, advance, useHelp, outcome } from '../lib/coach/session.mjs';
import { SITE_ORIGIN } from '../lib/coach/lesson.mjs';
export const desktop=Boolean(window.aiBridge);
export const preview=!desktop&&(typeof chrome==='undefined'||!chrome.runtime?.id);
const KEY='aibridge-coach-preview-v1';
export async function dispatch(message) {
  if(desktop)return window.aiBridge.dispatch(message);
  if(!preview){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'확장 프로그램에 연결하지 못했어요. 다시 열어 주세요.');return r;}
  let state=JSON.parse(localStorage.getItem(KEY)||'{"session":null,"history":[]}');
  const save=()=>{localStorage.setItem(KEY,JSON.stringify(state));return state;};
  if(message.type==='GET')return state;
  if(message.type==='NEW'){if(state.session)state.history.push(state.session);state.session=createSession(message.level);return save();}
  if(message.type==='OPEN_CHAT'){window.open('https://chatgpt.com/','_blank','noopener,noreferrer');return {};}
  if(message.type==='OPEN_SITE'){window.open('/coach#records','_blank','noopener,noreferrer');return {};}
  if(message.type==='HIGHLIGHT'){
    if(state.session?.phase===3&&message.target){state.session=useHelp(state.session,'button-location');save();}
    parent.postMessage({source:'ai-bridge-preview',target:message.target},location.origin);return {found:true,preview:true};
  }
  if(message.type==='EXPORT'){const session=state.session?.completedAt?state.session:[...state.history].reverse().find(s=>s.completedAt);if(!session)throw Error('완료한 실습이 없어요.');return {session,outcome:outcome(session)};}
  if(message.revision!==state.session.revision)throw Error('다른 창에서 기록이 바뀌었어요. 코치를 다시 열어 주세요.');
  if(message.type==='PATCH')state.session=updateDraft(state.session,message.patch);
  else if(message.type==='SUBMIT')state.session=await submitEvidence(state.session,message.upload);
  else if(message.type==='NEXT')state.session=advance(state.session);
  else if(message.type==='HELP')state.session=useHelp(state.session,message.kind);
  else throw Error('지원하지 않는 작업입니다.');
  return save();
}
export { SITE_ORIGIN };
