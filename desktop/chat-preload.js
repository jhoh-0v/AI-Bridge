import { ipcRenderer } from 'electron';
import { findControl } from '../extension/content.js';
import { guideOverlay, hideOverlay, resetOverlay } from './overlay.js';
import { modelAdvice, hasOwnRequest, attachmentState, sameAttachmentName, attachmentNameFromLabel } from './guide-model.mjs';
import { lessonGuide } from './lesson-guide.mjs';
import { confirmedCandidate, sameScope, matchesUserRequest, isResultLink, matchKnownTurns } from './capture-model.mjs';
import { normalizeText } from './practice.mjs';

const fixture=process.argv.includes('--aibridge-fixture');
const permitted=()=>location.origin==='https://chatgpt.com'||fixture&&location.href==='aibridge://app/qa-chat.html';
let context=null,pending=null,baselineCount=0,baselineIds=[],active=null,observer=null,timer=0,replyTimer=0,lastReply='',lastReplyAt=0,lastSentReply='',lastReady='',preparedToken='',boundSent='';
const nodeIds=new WeakMap();let nextId=0;
let links=new Map(),downloadButtons=new Set(),downloadState=null;
let resultOwners=new WeakMap();const replyStates=new Map();
let lastHistory='';
let modelOpened=false,modelSeen=false,modelClosedAt=0,modelOptionClicked=false,modelSent=false,lastInputAt=0,templateId='repair',modelMissingAt=0;
let selectedFile=null,attachmentSent='',sawAttachment=false,missingSince=0;
let selectionRevision=0,seenFiles=new WeakSet(),seenUploadProofId='';
const boundFileInputs=new WeakSet();
const visible=el=>{const r=el.getBoundingClientRect();return r.width>2&&r.height>2&&getComputedStyle(el).visibility!=='hidden';};
const exposed=el=>{
  if(!visible(el)||el.closest('[inert],[aria-hidden="true"]'))return false;
  const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return !!hit&&el.contains(hit);
};
const text=el=>el?.matches?.('input,textarea,select')?el.value:(el?.innerText||el?.textContent||'');
const label=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||text(el)).trim();
const headings='h1,h2,h3,h4,h5,h6,[role="heading"]';
const roleLabel=role=>role==='user'?/^(?:내가 한 말|You said|Your message)\s*:?$/i:/^(?:ChatGPT의 말|ChatGPT 답변|ChatGPT said|최신 응답|Latest response)\s*:?$/i;
function messageText(node,role){
  let value=text(node).trim();
  if(role==='user')for(const card of node.querySelectorAll('[role="region"],section[aria-label],figure[aria-label]')){
    const name=card.getAttribute('aria-label')||'';
    if(name===context?.material?.file?.name||name===selectedFile?.name){const content=text(card).trim();if(content)value=value.replace(content,'');}
  }
  for(const label of node.querySelectorAll(headings)){
    const caption=text(label).trim();if(roleLabel(role).test(caption)&&value.startsWith(caption))value=value.slice(caption.length).trim();
  }
  for(const button of [...node.querySelectorAll('button')].reverse()){
    const caption=text(button).trim();if(caption&&value.endsWith(caption))value=value.slice(0,-caption.length).trim();
  }
  return value;
}
function roleNodes(role){
  for(const selector of [`[data-message-author-role="${role}"]`,`[data-testid="${role}-message"]`,`[data-turn="${role}"]`,`[data-role="${role}"]`]){
    const found=[...document.querySelectorAll(selector)].filter(el=>!el.closest('#aibridge-live-guide'));
    if(found.length)return found.filter(el=>!found.some(other=>other!==el&&other.contains(el)));
  }
  // New ChatGPT layouts identify turns with accessible headings instead of author attributes.
  const labels=[...document.querySelectorAll(headings)].filter(el=>roleLabel(role).test(text(el).trim()));
  return labels.map(label=>{
    let node=label.parentElement;
    while(node&&node!==document.body&&node!==document.documentElement){
      if(node.querySelector('#prompt-textarea,[contenteditable="true"],textarea'))return null;
      if([...node.querySelectorAll(headings)].some(h=>h!==label&&(roleLabel('user').test(text(h).trim())||roleLabel('assistant').test(text(h).trim()))))return null;
      if(messageText(node,role).length>5)return node;
      node=node.parentElement;
    }
    return null;
  }).filter(Boolean);
}
function nodeId(el){
  const explicit=el.getAttribute('data-message-id')||el.closest('[data-message-id]')?.getAttribute('data-message-id');
  if(explicit)return explicit.slice(0,90);
  if(!nodeIds.has(el))nodeIds.set(el,`view-${Date.now().toString(36)}-${++nextId}`);
  return nodeIds.get(el);
}
function matchesScope(){return fixture||sameScope(context?.conversation,location.pathname)||!context?.conversation&&/^\/c\/[a-z0-9-]+$/i.test(location.pathname)&&!!(pending||active?.node?.isConnected);}
function scope(){return !!context?.enabled&&permitted()&&matchesScope();}
function emit(type,extra={}){if(context)ipcRenderer.send('bridge:observation',{type,token:context.token,phase:context.phase,...extra});}
function modelLabel(){
  const explicit=document.querySelector('[data-testid="model-switcher-dropdown-button"],button[aria-label*="모델"],button[aria-label^="Model"]');
  if(explicit&&visible(explicit))return text(explicit).replace(/^(?:추론 수준|Reasoning effort)\s*/i,'').trim().slice(0,60);
  const button=[...document.querySelectorAll('button')].find(el=>visible(el)&&/^(?:GPT[-\s]?[0-9][\w .-]*|[0-9](?:\.[0-9])?\s+(?:Pro|Thinking|Instant|Auto))$/i.test(text(el).trim()));
  return button?text(button).trim().slice(0,60):'';
}
function modelButton(){
  return [...document.querySelectorAll('[data-testid="model-switcher-dropdown-button"],button[aria-label*="모델"],button[aria-label*="model" i]')].find(visible)
    || [...document.querySelectorAll('button')].find(el=>visible(el)&&/^(?:GPT[-\s]?[0-9][\w .-]*|[0-9](?:\.[0-9])?\s+(?:Pro|Thinking|Instant|Auto))$/i.test(text(el).trim()));
}
function modelMenu(){
  const button=modelButton(),id=button?.getAttribute('aria-controls');
  const own=id&&document.getElementById(id);if(own&&visible(own))return own;
  return [...document.querySelectorAll('[role="menu"],[role="listbox"]')].filter(visible).find(el=>/모델|model|추론|reasoning/i.test(label(el))||modelOpened&&el.querySelector('[role="menuitemradio"],[role="option"]'));
}
function composerSurface(composer){
  const form=composer?.closest('form');if(form&&form.getBoundingClientRect().width<innerWidth-20)return form;
  const control=modelButton()||findControl('attach');
  let parent=composer;
  while(parent&&parent!==document.body){
    if(control&&parent.contains(control)){
      const outer=parent.parentElement,r=parent.getBoundingClientRect(),o=outer?.getBoundingClientRect();
      return outer&&o.width<=r.width+40&&o.height<=r.height+350?outer:parent;
    }
    parent=parent.parentElement;
  }
  return composer;
}
function uploadMenu(control){
  let parent=control?.parentElement;
  for(let i=0;parent&&parent!==document.body&&i<5;i++,parent=parent.parentElement){
    if([...parent.querySelectorAll('button')].some(b=>/라이브러리에서 가져오기|add from library/i.test(label(b))))return parent;
  }
  return control;
}
function modelItems(menu){
  return [...(menu?.querySelectorAll('[role="menuitemradio"],[role="radio"],[role="option"]')||[])].filter(exposed).map(node=>({node,label:label(node),selected:node.getAttribute('aria-checked')==='true'||node.getAttribute('aria-selected')==='true',disabled:node.getAttribute('aria-disabled')==='true'||node.disabled}));
}
function observeModel(){
  const menu=modelMenu();if(menu){modelOpened=true;modelSeen=true;modelClosedAt=0;}
  if(modelSeen&&!menu&&!modelSent){
    if(!modelClosedAt)modelClosedAt=Date.now();
    if(Date.now()-modelClosedAt<400)return;
    const current=modelLabel();
    if(current&&!/^(추론 수준|Reasoning effort)$/i.test(current)){modelSent=true;emit('model-reviewed',{model:current,selected:modelOptionClicked});}
  }
}
function previewControls(){
  if(!downloadState)return {};
  const panels=[...document.querySelectorAll('[role="tabpanel"],[role="dialog"]')].filter(visible);
  const panel=panels.find(el=>{
    const name=(el.getAttribute('aria-label')||'')+' '+(el.getAttribute('aria-labelledby')||'').split(' ').map(id=>text(document.getElementById(id))).join(' ');
    return name.includes(downloadState.name)&&!!downloadState.name||!downloadState.existingPanels.has(el)&&el.id.startsWith('app-shell-tab-panel-');
  });
  if(panel)downloadState.panel=panel;
  return {panel,download:panel&&[...panel.querySelectorAll('button')].find(el=>visible(el)&&/^(다운로드|파일 다운로드|Download|Download file)$/i.test(label(el))),close:panel&&[...panel.querySelectorAll('button')].find(el=>visible(el)&&/^(뷰어 닫기|Close viewer)$/i.test(label(el)))};
}
function attachmentChip(){
  const composer=findControl('composer');if(!composer)return null;
  const name=selectedFile?.name||context?.material?.file?.name;
  const surfaces=[composer.closest('form'),composerSurface(composer)?.parentElement].filter(Boolean);
  const nodes=[...new Set(surfaces.flatMap(surface=>[...surface.querySelectorAll('button,span,[role="button"],p')]))].filter(el=>visible(el)&&!composer.contains(el)&&!el.closest('#aibridge-live-guide'));
  const removals=nodes.filter(el=>el.matches('button,[role="button"]')&&/제거|삭제|remove/i.test(label(el))&&attachmentNameFromLabel(label(el)));
  // Upload evidence is content based. A visible chip alone is never enough.
  if(removals.length>1)return null;
  const candidates=removals.length?removals:nodes.filter(el=>attachmentNameFromLabel(label(el)));
  return candidates.find(el=>{
    const chipName=attachmentNameFromLabel(label(el));
    return (sameAttachmentName(chipName,name)||selectedFile?.uploadId&&candidates.length===1)&&!el.closest('[aria-busy="true"]');
  })||null;
}
async function selectedFiles(files){
  if(!scope()||![0,3].includes(context.phase)||context.hasPhaseTurn||!files?.length)return;
  const token=context.token,file=files[0];if(seenFiles.has(file))return;seenFiles.add(file);
  const revision=++selectionRevision;
  selectedFile={name:file.name,sha256:'',reading:true};attachmentSent='';sawAttachment=false;missingSince=0;paintGuide();
  if(context.prepared)emit('attachment-invalid');
  if(files.length!==1||file.size>3*1024*1024){selectedFile={name:file.name,sha256:'',error:'준비한 자료 파일 하나만 선택해 주세요. 파일은 3MB 이내여야 해요.'};paintGuide();return;}
  try{
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(context?.token!==token||revision!==selectionRevision)return;
    selectedFile={name:file.name,sha256:hash};inspect();
  }catch{if(context?.token!==token||revision!==selectionRevision)return;selectedFile={name:file.name,sha256:'',error:'선택한 자료를 확인하지 못했어요. 준비한 파일을 다시 선택해 주세요.'};paintGuide();}
}
function fileInputEvent(event){
  if(!event.isTrusted)return;
  const input=event.composedPath().find(el=>el?.matches?.('input[type="file"]'));
  if(input)void selectedFiles(input.files);
}
function observeFileInputs(){
  for(const input of document.querySelectorAll('input[type="file"]')){
    if(!boundFileInputs.has(input)){
      boundFileInputs.add(input);input.addEventListener('input',fileInputEvent,true);input.addEventListener('change',fileInputEvent,true);
    }
    if(input.files?.length)void selectedFiles(input.files);
  }
}
function observeAttachment(){
  if(!scope()||![0,3].includes(context.phase)||context.hasPhaseTurn||pending||active)return;
  const chip=attachmentChip(),state=attachmentState(context,selectedFile,!!chip);
  if(state.state==='wrong'&&context.prepared)emit('attachment-invalid');
  if(chip){sawAttachment=true;missingSince=0;}
  if(state.state==='ready'&&attachmentSent!==context.token){attachmentSent=context.token;emit('attachment-ready',{name:attachmentNameFromLabel(label(chip))||selectedFile.name,sha256:selectedFile.sha256,uploadId:selectedFile.uploadId});}
  if(!chip&&sawAttachment&&!selectedFile?.reading){
    if(!missingSince)missingSince=Date.now();
    if(Date.now()-missingSince>2500){selectionRevision++;selectedFile=null;sawAttachment=false;attachmentSent='';emit('attachment-removed');}
  }
}
function trackDownload(control){
  const turnId=resultOwners.get(control)||active?.id;
  downloadState={turnId,name:(label(control).match(/[^\n]+\.(xlsx|csv|pptx|docx|pdf|txt|md|json|png|jpe?g|webp)/i)?.[0]||'').trim(),existingPanels:new Set([...document.querySelectorAll('[role="tabpanel"],[role="dialog"]')].filter(visible))};
  if(turnId)emit('download-click',{turnId});
}
function confirm(candidate,recovered=false){
  active={id:candidate.id,node:candidate.node,text:candidate.text};pending=null;lastReply='';lastSentReply='';
  emit('confirmed',{id:candidate.id,text:candidate.text,model:modelLabel(),url:fixture?'https://chatgpt.com/':location.href,recovered});
  hideOverlay();inspect();
}
function startAttempt(){
  if(!scope()||![0,1,2,3].includes(context.phase))return;
  const composer=findControl('composer'),value=text(composer).trim();
  if(value.length<1)return;
  if(value.length>60000){emit('capture-error',{error:'요청이 60,000자를 넘어 기록하지 못했어요. 내용을 파일로 첨부하고 요청을 줄여 주세요.'});return;}
  const nodes=roleNodes('user');
  if(pending&&normalizeText(pending.text)===normalizeText(value)&&Date.now()-pending.started<1000)return;
  pending={text:value,attachmentName:selectedFile?.name||context.attachment?.name,beforeCount:nodes.length,beforeIds:nodes.map(nodeId),started:Date.now()};
  emit('attempt',{text:value,beforeCount:pending.beforeCount,beforeIds:pending.beforeIds});
}
function observeReply(){
  const users=roleNodes('user'),messages=users.map(node=>({node,id:nodeId(node),text:messageText(node,'user')}));
  const known=[...(context.knownTurns||[])];
  if(active&&!known.some(t=>t.id===active.id))known.push(active);
  const matched=matchKnownTurns(known.map(t=>({...t,attachmentName:context.attachment?.name||context.material?.file?.name})),messages);
  if(context.dialogueLearning&&context.conversation&&sameScope(context.conversation,location.pathname)&&matched.length<messages.length){
    const history=messages.map((m,i)=>({id:matched.find(t=>t.index===i)?.id||m.id,text:matched.find(t=>t.index===i)?.text||m.text}));
    const signature=JSON.stringify(history);
    if(signature!==lastHistory){
      lastHistory=signature;
      if(history.length>100||signature.length>300000)emit('capture-error',{error:'대화 기록이 분석 범위를 넘었어요. 새 실습에서 이어가 주세요.'});
      else emit('history',{url:location.href,messages:history});
    }
  }
  const assistants=roleNodes('assistant');
  const stop=[...document.querySelectorAll('button[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="중지"]')].some(visible);
  resultOwners=new WeakMap();downloadButtons=new Set();links=new Map();
  for(const turn of matched){
    const nextUser=users[turn.index+1];
    const replies=assistants.filter(el=>(turn.node.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)&&(!nextUser||(el.compareDocumentPosition(nextUser)&Node.DOCUMENT_POSITION_FOLLOWING)));
    if(!replies.length)continue;
    const answer=replies.map(el=>messageText(el,'assistant')).join('\n\n');
    if(answer.length>60000){emit('capture-error',{error:'답변이 60,000자를 넘어 자동 분석을 멈췄어요. 더 짧게 나누어 요청해 주세요.'});continue;}
    const hasImage=replies.some(el=>[...el.querySelectorAll('img')].some(img=>img.naturalWidth>128&&img.naturalHeight>128));
    const controls=[];
    for(const reply of replies){
      const anchors=[...reply.querySelectorAll('a[href]')].filter(a=>isResultLink(label(a),a.getAttribute('href'),context.material));
      const buttons=[...reply.querySelectorAll('button,[role="button"]')].filter(el=>(isResultLink(label(el),'',context.material)&&/미리보기|preview|열기|open/i.test(label(el))||hasImage&&/^(다운로드|이미지 다운로드|이미지 저장|Download|Download image|Save image)$/i.test(label(el)))&&!anchors.some(a=>a.contains(el)));
      controls.push(...anchors,...buttons);
      for(const control of [...anchors,...buttons]){
        resultOwners.set(control,turn.id);
        let card=control.parentElement;
        while(card&&reply.contains(card)){
          if([...anchors,...buttons].filter(el=>card.contains(el)).length>1)break;
          const ds=[...card.querySelectorAll('button')].filter(el=>/^(파일 다운로드|다운로드|Download file|Download)$/i.test(label(el)));
          if(ds.length===1){downloadButtons.add(ds[0]);resultOwners.set(ds[0],turn.id);break;}
          if(card===reply)break;card=card.parentElement;
        }
      }
    }
    const turnLinks=new Map(controls.slice(0,8).map((a,i)=>[`link-${turn.id.replace(/[^a-z0-9-]/gi,'').toLowerCase().slice(0,70)}-${i}`,a]));
    if(turn.id===active?.id)links=turnLinks;
    const linkData=[...turnLinks].map(([id,a])=>({id,label:label(a)||'생성된 파일'}));
    const streaming=stop&&!nextUser;
    const fingerprint=JSON.stringify([normalizeText(answer),linkData.map(l=>[l.id,normalizeText(l.label)]),hasImage,streaming]);
    const previous=replyStates.get(turn.id)||{};
    if(previous.fingerprint!==fingerprint){previous.fingerprint=fingerprint;previous.at=Date.now();}
    const finished=!streaming&&Date.now()-previous.at>=1200&&(!!answer||hasImage||!!turnLinks.size);
    const payload=JSON.stringify({turnId:turn.id,text:answer,finished,hasImage,links:linkData});
    if(payload!==previous.sent){previous.sent=payload;emit('response',JSON.parse(payload));}
    replyStates.set(turn.id,previous);
  }
}
function paintGuide(){
  if(!scope()||!context.showGuide){hideOverlay();return;}
  const composer=findControl('composer'),button=modelButton(),menu=modelMenu(),phase=context.phase,step=context.step,preview=previewControls();
  const show=(target,guide,obstacle=null)=>guideOverlay(target,guide,(action,value)=>{if(action==='template'){templateId=value;resetOverlay();paintGuide();}else emit('guide-action',{action,value});},obstacle);
  if(context.lesson?.error){show(null,{key:'error',title:'이 부분을 확인해 주세요',text:context.lesson.error,actions:[{id:'return',label:'실습 대화 다시 열기'}]});return;}
  if(!composer&&!preview.panel&&['prepare','compose'].includes(step)){show(null,{key:'loading',title:'ChatGPT를 준비하고 있어요',text:'로그인 화면이 보이면 본인 계정으로 로그인해 주세요. 대화 입력창이 준비되면 안내가 시작돼요.'});return;}
  if(phase===0&&!context.modelReviewed&&!context.hasTurns||menu&&phase!==3){
    const options=modelItems(menu),advice=modelAdvice(options,modelLabel(),context.material?.format);
    if(menu){
      const choose=!options.length&&!modelOptionClicked&&[...menu.querySelectorAll('[role="menuitem"],button')].find(el=>exposed(el)&&/^(모델 선택|Choose model|Select model)$/i.test(label(el)));
      const power=[...menu.querySelectorAll('[role="slider"],[role="menuitem"]')].find(el=>exposed(el)&&/파워|power|추론|reasoning/i.test(label(el)));
      const preferred=advice.preferred;
      show(preferred?.node||choose||power||menu,{key:'model-menu',title:choose?'모델과 생각할 시간을 구분해요':preferred?'이 모델로 시작해 볼까요?':'생각할 시간을 살펴보세요',text:choose?'‘모델 선택’을 직접 눌러 사용 가능한 모델을 살펴보세요. 아래 ‘파워’는 답변을 생각하는 시간을 조절해요.':preferred?`이 메뉴의 ‘${preferred.label}’을 직접 선택해 보세요. 다른 사용 가능한 모델을 골라도 괜찮아요.`:'기본·중간 수준부터 시작해 보세요. 조절 막대는 직접 클릭하거나 방향키로 바꿀 수 있어요. 선택한 뒤 입력창을 누르면 계속해요.',details:[{title:'이 과제에서는 왜 이렇게 고르나요?',text:advice.reason,source:'OpenAI Docs · learn.chatgpt.com/docs/models'}],footer:'잠겼거나 한도에 걸린 항목은 선택하지 않아도 돼요.'},[menu,composerSurface(composer)]);return;
    }
    if(button){show(button,{key:'model-open',eyebrow:'AI Bridge · 1 / 4 · 먼저 도구 선택',title:'표시된 모델 버튼을 눌러 보세요',text:'오늘 할 일: '+(context.material?.goal||'자료로 원하는 결과 만들기')+'\n먼저 사용할 모델을 살펴볼게요. '+advice.current,footer:'주황색 테두리의 실제 ChatGPT 버튼을 직접 눌러 주세요. 메뉴가 열리면 다음 설명이 나와요.'},composerSurface(composer));return;}
    if(!modelMissingAt)modelMissingAt=Date.now();
    if(Date.now()-modelMissingAt<5000){show(composer,{key:'model-find',title:'모델 선택 위치를 확인하고 있어요',text:'이 계정에서 사용할 수 있는 메뉴를 살펴보고 있어요.'});return;}
  }
  if(phase===3&&!['quiz','complete','result'].includes(step)){show(null,lessonGuide(context));return;}
  if(phase===3&&step==='result'){show(null,lessonGuide(context));return;}
  if([0,3].includes(phase)&&!context.hasPhaseTurn&&!pending){
    const material=context.material||{},name=material.file?.name||'실습 자료';
    if(!material.saved){show(null,{key:'get-source',title:'연습할 파일을 먼저 준비해요',text:`${name}을 내려받은 뒤 ChatGPT의 첨부 버튼으로 직접 넣어 볼게요.`,actions:[{id:'sample',label:'실습 자료 내려받기'}]});return;}
    const state=attachmentState(context,selectedFile,!!attachmentChip());
    if(state.state!=='ready'){
      const remove=state.state==='wrong'&&[...document.querySelectorAll('button')].find(el=>exposed(el)&&label(el).includes(selectedFile.name)&&/제거|remove/i.test(label(el)));
      if(remove){show(remove,{key:'wrong-source',title:'준비한 자료와 다른 파일이에요',text:`이 제거 버튼을 누른 뒤, ${name} 파일을 다시 선택해 주세요. 파일 이름이 같아도 내용이 바뀌면 다시 준비해야 해요.`},composerSurface(composer));return;}
      const upload=[...document.querySelectorAll('button,[role="menuitem"]')].find(el=>exposed(el)&&/사진 및 파일 추가|컴퓨터에서 업로드|upload from computer|add photos.*files/i.test(label(el)));
      const target=upload||findControl('attach'),opening=!!upload;
      show(target,{key:opening?'attach-menu':'attach-file',eyebrow:'AI Bridge · 1 / 4 · 자료 첨부',title:opening?'준비한 파일을 직접 선택해요':'먼저, 이 + 버튼을 눌러 주세요',text:state.state==='wrong'?selectedFile?.error||state.message:state.state==='uploading'||selectedFile?.reading?'파일을 올리는 중이에요. 입력창 위에 파일 이름이 나타날 때까지 기다려 주세요.':opening?`‘사진 및 파일 추가’를 누르고 ${material.location}에서 ${name} 파일을 선택하세요.`:'ChatGPT가 자료를 읽을 수 있도록 직접 첨부하는 단계예요. +를 누르면 파일을 고르는 메뉴가 나와요.',blocks:context.level==='starter'?[{label:'선택할 파일',text:name+'\n위치: '+material.location}]:[],footer:'올바른 파일이 첨부되면 무엇을 적을지 이어서 안내할게요.'},[uploadMenu(upload),composerSurface(composer)]);return;
    }
  }
  if(context.dialogueLearning&&step==='result'&&links.size){
    show(preview.download||[...links.values()][0],lessonGuide(context,templateId),preview.panel);return;
  }
  if(preview.close&&phase===2&&['prepare','compose'].includes(step)){show(preview.close,{key:'close-preview',title:'이제 요청을 고쳐 볼게요',text:'파일을 살펴봤다면 이 닫기 버튼을 직접 누르세요. 이어서 ChatGPT 입력창에 수정할 조건을 적어 봐요.'});return;}
  if(step==='result'&&links.size&&!context.dialogueLearning&&context.material?.format!=='text'){
    show(preview.download||[...links.values()][0],{key:preview.download?'download-file':'open-file',eyebrow:'AI Bridge · 만든 결과 확인',title:preview.download?'이 다운로드 버튼을 눌러 주세요':'만든 결과를 직접 열어 보세요',text:preview.download?'받은 파일은 이 실습 기록에 연결돼요. 파일을 받은 뒤 원자료와 대조할 내용을 함께 살펴볼게요.':'표시된 파일이나 이미지 다운로드 버튼을 직접 누르세요. 실제로 받은 결과를 보관하고 다음 확인 단계로 이어가요.'});return;
  }
  if(['prepare','compose'].includes(step)){
    const send=[...document.querySelectorAll('button')].find(el=>visible(el)&&!el.disabled&&(/send-button|composer-submit/i.test((el.id||'')+' '+(el.getAttribute('data-testid')||''))||/^(전송|보내기|메시지 보내기|Send|Send prompt|Send message)$/i.test(el.getAttribute('aria-label')||'')));
    const guide=lessonGuide(context,templateId);
    const ready=send&&hasOwnRequest(text(composer),'')&&Date.now()-lastInputAt>3500;
    show(ready?send:composer,{...guide,footer:ready?'다 썼다면 표시된 ↑ 전송 버튼을 누르세요. 아직 쓰는 중이면 계속 입력해도 돼요.':guide.footer},composerSurface(composer));return;
  }
  show(null,lessonGuide(context,templateId));
}
function inspect(){
  if(!permitted())return;
  const ready=JSON.stringify({composer:!!findControl('composer'),scopeMatches:!context||matchesScope()});
  if(ready!==lastReady){lastReady=ready;ipcRenderer.send('bridge:observation',{type:'ready',...JSON.parse(ready)});}
  if(!scope()){
    if(context?.enabled&&permitted()&&!matchesScope()&&context.showGuide)guideOverlay(null,{key:'return',title:'실습하던 대화로 돌아가요',text:'이 대화는 학습 기록에 포함하지 않아요.',actions:[{id:'return',label:'실습 대화로 돌아가기'}]},action=>emit('guide-action',{action}));
    else hideOverlay();return;
  }
  observeModel();
  observeFileInputs();
  observeAttachment();
  const known=context.knownTurns?.at(-1);
  if(!active&&known&&sameScope(context.conversation,location.pathname)){
    const node=roleNodes('user').find(el=>nodeId(el)===known.id||matchesUserRequest({...known,attachmentName:context.attachment?.name},messageText(el,'user')));
    if(node)active={id:known.id,node,text:known.text};
  }
  if(context.enabled&&preparedToken!==context.token&&findControl('composer')){
    const close=[...document.querySelectorAll('button')].find(el=>visible(el)&&(/^(?:사이드바 닫기|Close sidebar)$/i.test(label(el))||/^(?:사이드바 표시\/숨기기|Toggle sidebar)$/i.test(label(el))&&(el.closest('nav,[role="navigation"]')?.getBoundingClientRect().width||0)>200));
    if(close){close.click();preparedToken=context.token;}
  }
  if(!fixture&&!context.conversation&&active?.node?.isConnected&&location.pathname.startsWith('/c/')&&boundSent!==location.pathname){
    boundSent=location.pathname;emit('conversation-bound',{url:location.href,turnId:active.id});
  }
  if(pending){
    const messages=roleNodes('user').map(node=>({node,id:nodeId(node),text:messageText(node,'user')}));
    const found=confirmedCandidate(pending,messages);if(found){confirm(found);return;}
    if(Date.now()-pending.started>25000){emit('capture-error',{error:'전송을 아직 확인하지 못했어요. 전송 버튼을 눌렀는지 확인하거나 아래에서 다시 확인해 주세요.'});pending.started=Date.now()+60000;}
  }
  observeReply();paintGuide();
}
function schedule(){clearTimeout(timer);timer=setTimeout(inspect,120);}
ipcRenderer.on('bridge:practice-config',(_event,next)=>{
  if(!permitted()||!next?.token)return;
  const changed=context?.token!==next.token,reshow=next.showGuide&&!context?.showGuide;context=next;
  if(changed||reshow)resetOverlay();
  if(changed){
    replyStates.clear();lastHistory='';
    modelOpened=false;modelSeen=false;modelClosedAt=0;modelOptionClicked=false;modelSent=false;modelMissingAt=0;
    selectedFile=next.attachment||null;attachmentSent=next.attachment?next.token:'';sawAttachment=false;missingSince=0;
    selectionRevision++;seenFiles=new WeakSet();seenUploadProofId='';
    const nodes=roleNodes('user');baselineCount=nodes.length;baselineIds=nodes.map(nodeId);pending=null;active=null;links.clear();downloadButtons.clear();lastSentReply='';boundSent='';
    if(next.pending && Date.now()-Date.parse(next.pending.at)<600000 && (sameScope(next.conversation,location.pathname)||!next.conversation&&/^\/c\/[a-z0-9-]+$/i.test(location.pathname)))pending={...next.pending,started:Date.now(),beforeIds:next.pending.beforeIds||[]};
    const known=next.knownTurns?.at(-1);
    if(known&&scope()){const found=nodes.find(el=>nodeId(el)===known.id||matchesUserRequest({...known,attachmentName:context.attachment?.name},messageText(el,'user')));if(found)active={id:known.id,node:found,text:known.text};}
  }
  if(next.uploadProof&&next.uploadProof.token===next.token&&seenUploadProofId!==next.uploadProof.id){
    const proof=next.uploadProof;
    seenUploadProofId=proof.id;
    selectionRevision++;selectedFile={name:proof.name||selectedFile?.name||'',sha256:proof.sha256,uploadId:proof.id};attachmentSent='';missingSince=0;
  }
  if(!observer&&document.body){observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});}
  inspect();
});
ipcRenderer.on('bridge:control',async(_event,request)=>{
  if(!permitted()||request?.token!==context?.token)return;
  try{
    if(!scope())throw Error('지금 실습 중인 대화로 돌아와 주세요.');
    const composer=findControl('composer');
    if(request.action==='focus-composer'){
      if(!composer)throw Error('ChatGPT 입력창이 보이면 다시 눌러 주세요.');
      const value=text(composer),alreadyPresent=!!request.contains&&normalizeText(value).includes(normalizeText(request.contains));
      composer.focus();composer.scrollIntoView({block:'center'});
      if(typeof composer.setSelectionRange==='function')composer.setSelectionRange(value.length,value.length);
      else{const range=document.createRange();range.selectNodeContents(composer);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);}
      ipcRenderer.send('bridge:control-result',{id:request.id,ok:true,empty:!value.trim(),alreadyPresent});return;
    }
    if(request.action==='verify-insert'&&!normalizeText(text(composer)).includes(normalizeText(request.text)))throw Error('입력창에 자료가 들어갔는지 확인하지 못했어요. 다시 눌러 주세요.');
    if(request.action==='recover'){
      const nodes=roleNodes('user'),last=nodes.at(-1);
      if(!last||nodes.length<=baselineCount||baselineIds.includes(nodeId(last)))throw Error('새로 전송한 요청이 아직 보이지 않아요. ChatGPT의 전송 버튼을 눌러 주세요.');
      confirm({node:last,id:nodeId(last),text:messageText(last,'user')},true);
    }
    ipcRenderer.send('bridge:control-result',{id:request.id,ok:true});
  }catch(error){ipcRenderer.send('bridge:control-result',{id:request.id,ok:false,error:error.message});}
});
ipcRenderer.on('bridge:highlight',(_event,request)=>{if(!request?.target)hideOverlay();ipcRenderer.send('bridge:highlight-result',{id:request?.id,found:true});});
document.addEventListener('keydown',event=>{if(event.isTrusted&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&findControl('composer')?.contains(event.target))startAttempt();},true);
document.addEventListener('submit',event=>{if(event.isTrusted&&event.target.contains(findControl('composer')))startAttempt();},true);
document.addEventListener('click',event=>{
  if(!event.isTrusted||!scope())return;
  const button=event.target.closest('button'),picker=modelButton(),menu=modelMenu();
  if(picker?.contains(event.target))modelOpened=true;
  if(menu?.contains(event.target)&&event.target.closest('[role="menuitemradio"],[role="option"],[role="radio"]'))modelOptionClicked=true;
  if(button&&(/send-button|composer-submit/i.test((button.id||'')+' '+(button.getAttribute('data-testid')||''))||/^(?:전송|보내기|메시지 보내기|Send|Send prompt|Send message)$/i.test(button.getAttribute('aria-label')||'')))startAttempt();
  const resultControl=event.composedPath().find(node=>resultOwners.has(node));
  if(resultControl)trackDownload(resultControl);
  if(button===previewControls().download&&downloadState?.turnId)emit('download-click',{turnId:downloadState.turnId});
  schedule();
},true);
document.addEventListener('input',event=>{if(event.isTrusted&&findControl('composer')?.contains(event.target)){lastInputAt=Date.now();schedule();}},true);
window.addEventListener('input',fileInputEvent,true);
window.addEventListener('change',fileInputEvent,true);
document.addEventListener('drop',event=>{if(event.isTrusted&&event.dataTransfer?.files?.length)void selectedFiles(event.dataTransfer.files);},true);
addEventListener('DOMContentLoaded',inspect);addEventListener('pagehide',()=>{observer?.disconnect();clearTimeout(timer);clearTimeout(replyTimer);hideOverlay();});
setInterval(()=>{if(context?.enabled)inspect();},1500);
