import { matchesUserRequest } from './request-text.mjs';
export { matchesUserRequest } from './request-text.mjs';
// A click alone is not evidence of sending: require a newly rendered user turn.
export function confirmedCandidate(attempt, messages) {
  if (!attempt || messages.length <= attempt.beforeCount) return null;
  const latest=messages.at(-1);
  return latest && matchesUserRequest(attempt,latest.text) && !attempt.beforeIds.includes(latest.id) ? {...latest,text:attempt.text} : null;
}
export function sameScope(bound, pathname) { return !bound ? pathname==='/' : pathname===bound; }
export function isResultLink(label,href,material={}){
  const text=`${label||''} ${href||''}`.normalize('NFC');
  // ChatGPT cites the uploaded source as a file card inside its answer. It is
  // evidence for the answer, not a newly generated result to download and grade.
  if(material.file?.name&&text.includes(material.file.name.normalize('NFC')))return false;
  const ext=material.flexible?'xlsx|csv|pptx|docx|pdf|txt|md|json|html?|png|jpe?g|webp':{text:'docx|txt',pptx:'pptx',xlsx:'xlsx',image:'png|jpe?g|webp'}[material.format||'xlsx'];
  return new RegExp(`\\.(${ext})(?:\\b|\\?|#|$)`,'i').test(text)&&!/^javascript:/i.test(href||'');
}

// Preserve order when identical short follow-ups occur more than once, including after reload.
export function matchKnownTurns(known,messages){
  let cursor=0;const matches=[];
  for(const turn of known){
    let index=messages.findIndex((m,i)=>i>=cursor&&m.id===turn.id);
    if(index<0)index=messages.findIndex((m,i)=>i>=cursor&&matchesUserRequest(turn,m.text));
    if(index>=0){matches.push({...turn,node:messages[index].node,index});cursor=index+1;}
  }
  return matches;
}

// Viewer controls change while opening a completed artifact. That is not a new
// streaming answer; keep completion stable until the actual answer changes.
export const resultText=value=>String(value||'').replace(/미리보기를? 여는 중(?:\.{3}|…)?|미리보기 열기|미리보기 닫기|opening preview|open preview|close preview/gi,'').replace(/\s+/g,' ').trim();
export function responseStability(previous,reply,now=Date.now()){
  const fingerprint=JSON.stringify([resultText(reply.text),reply.links.map(l=>[l.id,resultText(l.label)]),reply.hasImage,reply.streaming]);
  const at=previous.fingerprint===fingerprint?previous.at:now;
  return {...previous,fingerprint,at,finished:!reply.streaming&&now-at>=1200&&!!(reply.text||reply.hasImage||reply.links.length)};
}
