export function modelAdvice(options, current = '', format='xlsx') {
  const available = options.filter(o => !o.disabled && !/잠김|한도|업그레이드|upgrade|locked|limit reached/i.test(o.label));
  const preferred = available.find(o => /thinking|medium|중간|표준|standard/i.test(o.label))
    || available.find(o => /auto|자동|default|기본/i.test(o.label))
    || available.find(o => o.selected)
    || available.find(o => /sol/i.test(o.label))
    || available.find(o => /^(?:GPT[- ]?)?\d(?:[.\d ]*)$/i.test(o.label));
  return { preferred, reason:format==='image'?'이번에는 이미지를 직접 생성해 달라고 요청해요. 계정에서 사용할 수 있는 기본 모델로 시작하고, 생성 기능이 제한되면 화면 안내를 확인해요.':format==='xlsx'?'이번에는 자료와 계산 관계를 확인해요. 기본·중간 수준으로 시작하고 복잡한 계산에서 생각할 시간을 늘려 보세요.':'자료를 읽고 원하는 결과를 만드는 연습이에요. 먼저 사용 가능한 기본·중간 수준으로 시작하고 결과를 보며 조절해요.', current: current ? `현재 표시: ${current}` : '계정에 표시되는 모델 중에서 선택해요.' };
}
export function hasOwnRequest(value, source) {
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  return normalize(value).replace(normalize(source), '').trim().length >= 8;
}
// Keep the explanation outside the entire open menu so every option is clickable.
export function placeGuide(rect, size, viewport) {
  const margin=16,gap=18,width=Math.min(size.width,viewport.width-margin*2),height=Math.min(size.height,viewport.height-margin*2);
  const clamp=(n,max)=>Math.max(margin,Math.min(n,max));
  if(!rect)return {left:Math.round((viewport.width-width)/2),top:margin,width};
  const candidates=[{left:rect.right+gap,top:clamp(rect.top,viewport.height-height-margin)},{left:rect.left-width-gap,top:clamp(rect.top,viewport.height-height-margin)},{left:clamp(rect.left,viewport.width-width-margin),top:rect.top-height-gap},{left:clamp(rect.left,viewport.width-width-margin),top:rect.bottom+gap}];
  const fit=candidates.find(p=>p.left>=margin&&p.top>=margin&&p.left+width<=viewport.width-margin&&p.top+height<=viewport.height-margin);
  return {...(fit||{left:margin,top:margin}),width};
}
// The remote page has no arbitrary native-command bridge.
export function guideCommand(action,value,session,flow) {
  const phase=session?.phase;
  if(action==='review'&&phase===1)return {type:'REVIEW_CHOICE',checkId:String(value).slice(0,60)};
  if(action==='next'&&phase===2&&session.submissions.some(s=>s.phase===2))return {type:'REFLECTION_CHOICE',choice:'changed'};
  if(action==='again'&&[0,2,3].includes(phase))return {type:'TRY_AGAIN'};
  if(action==='open-result'&&[2,4].includes(phase)&&['0','2'].includes(String(value)))return {type:'OPEN_RESULT',phase:Number(value)};
  if(action==='save-response'&&(phase===0||[2,3].includes(phase)&&(session.exercise?.dialogueLearning||session.exercise?.curriculum?.format==='text')))return {type:'SAVE_RESPONSE'};
  if(action==='retry-coach'&&phase!==3)return {type:'RETRY_COACH'};
  if(action==='enable-coach'&&phase!==3)return {type:'ENABLE_COACH'};
  if(action==='help'&&phase===3)return {type:'ENABLE_HELP'};
  if(action==='finish'&&phase===3)return {type:'FINISH',answers:session.draft.answers};
  if(action==='answer'&&phase===3&&/^(recalculate|verify):[0-2]$/.test(value||'')) {const [id,index]=value.split(':');return {type:'PATCH',revision:session.revision,patch:{answers:{...session.draft.answers,[id]:Number(index)}}};}
  if(action==='recover'&&flow?.pending)return {type:'RECOVER_SENT'};
  if(action==='home')return {type:'HOME'};
  if(action==='return')return {type:'RETURN_CHAT'};
  if(action==='sample'&&[0,3].includes(phase)&&!(session.exercise?.mode==='own'&&(phase===0||session.exercise.version>=2)))return {type:'SAVE_PRACTICE_SOURCE'};
  return null;
}

export function attachmentState(context,selection,chipVisible) {
  if(!selection)return {state:'missing'};
  if(selection.reading)return {state:'uploading'};
  const expected=context?.material?.file;
  if(!expected||selection.sha256!==expected.sha256)return {state:'wrong',message:`준비한 ${expected?.name||'자료 파일'}을 선택해 주세요. 다른 파일은 이 과제의 검사 기준과 달라요.`};
  return {state:chipVisible?'ready':'uploading'};
}

export const sameAttachmentName=(a,b)=>{
  const normalize=value=>String(value||'').normalize('NFC').replace(/\s*\(\d+\)(?=\.[^.]+$)/,'').toLowerCase().trim();
  return !!a&&!!b&&normalize(a)===normalize(b);
};
export function attachmentNameFromLabel(value){
  return String(value||'').match(/^(?:Remove\s+)?(.+\.(?:csv|xlsx|txt|md|docx|pptx))(?:\s*(?:제거|삭제|remove))?$/i)?.[1]?.trim()||'';
}
