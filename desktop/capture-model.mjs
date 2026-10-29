import { normalizeText } from './practice.mjs';
export function matchesUserRequest(attempt, rendered) {
  const expected=normalizeText(attempt.text),actual=normalizeText(rendered);
  if(actual===expected)return true;
  if(!attempt.attachmentName||!actual.endsWith(expected))return false;
  const prefix=actual.slice(0,-expected.length),compact=v=>String(v).normalize('NFC').toLowerCase().replace(/[\s_.\-]/g,'');
  const name=compact(attempt.attachmentName),stem=compact(attempt.attachmentName.replace(/\.(csv|xlsx|txt|md|docx|pptx)$/i,''));
  if(!stem||!compact(prefix).includes(stem))return false;
  // Only the observed file's card label may precede the exact newly sent text.
  return compact(prefix).split(name).join('').split(stem).join('').replace(/스프레드시트|spreadsheet|프레젠테이션|presentation|텍스트|text|문서|document|다운로드|download|열기|open|csv|xlsx|docx|pptx|txt|md/g,'')==='';
}
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
  const ext=material.flexible?'xlsx|csv|pptx|docx|pdf|txt|md|json|png|jpe?g|webp':{text:'docx|txt',pptx:'pptx',xlsx:'xlsx',image:'png|jpe?g|webp'}[material.format||'xlsx'];
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
