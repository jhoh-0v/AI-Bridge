import { LESSON, LEVELS, PHASES, materialFor, TEMPLATES, TEMPLATE_FIELDS, supportFor, templatePrompt } from '../lib/coach/lesson.mjs';
import { outcome } from '../lib/coach/session.mjs';
import { retrieve, groundedPrompt } from '../lib/coach/retrieval.mjs';
import { dispatch, preview, desktop } from './platform.js';

const app=document.getElementById('app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let nativeDownloads=[],state={session:null,history:[]},draft={},upload=null,busy=false,error='',notice='',guideOpen=null,guideStep=0,helpOpen=false,question='',search=null,saveTimer=null,saveQueue=Promise.resolve(),dirty=false;
const session=()=>state.session;
const icon='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 26V16a9 9 0 0 1 18 0v10M12 26V16a4 4 0 0 1 8 0v10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
function action(label,name,extra='',primary=false){return `<button class="${primary?'primary':'secondary'}" data-action="${name}" ${busy?'disabled':''} ${extra}>${label}</button>`;}
function checks(record){if(!record?.checks)return '<p class="muted">답변은 보관했어요. 파일이 없어 자동 검사 점수는 없어요.</p>';return `<ul class="checks">${record.checks.checks.map(c=>`<li><span class="${c.pass?'pass':'warn'}">${c.pass?'✓':'·'}</span><span>${esc(c.label)}</span><strong>${esc(c.value)}</strong></li>`).join('')}</ul>${record.checks.errors.length?'<p class="small">자동 검사 범위 밖의 수식이 있어요. Excel에서도 직접 확인해 주세요.</p>':''}`;}
function material(){const m=materialFor(session().phase);return `<p class="task-action">${esc(LESSON.goal)}</p><details class="material"><summary>${session().phase===3?'새로운 실습 자료':'오늘의 실습 자료'} <span>CSV · 가상 자료</span></summary><pre>${esc(m.csv)}</pre><p>${esc(LESSON.goal)}</p></details><div class="row">${action('자료 내려받기','download-source')}${action('자료 복사','copy-source')}</div>`;}
function evidenceForm(){const s=session();return `<label>ChatGPT에 실제로 보낸 요청<textarea data-field="prompt" rows="4" maxlength="12000" placeholder="직접 보낸 요청을 여기에도 남겨 주세요.">${esc(draft.prompt)}</textarea></label><label class="small-label">사용한 계정·모델 조건<input data-field="environment" maxlength="120" value="${esc(draft.environment)}" placeholder="예: 무료 계정 · 화면에 표시된 모델명"/></label><label class="file-picker"><span>＋ ${upload?esc(upload.file.name):'ChatGPT에서 받은 XLSX 선택'}</span><small>파일은 기기 안에서 검사해요 · 3MB 이하</small><input type="file" id="workbook-file" accept=".xlsx" ${busy?'disabled':''}/></label>${s.phase===0?`<details class="text-evidence"><summary>파일을 받지 못했나요?</summary><label>실제로 받은 답변<textarea data-field="output" rows="3" placeholder="답변을 직접 붙여 넣어 첫 결과로 보관하세요.">${esc(draft.output)}</textarea></label></details>`:''}${desktop?`<div class="row">${action('앱에서 받은 파일 선택','recent-files')}</div>${nativeDownloads.length?`<div class="recent-downloads">${nativeDownloads.map(d=>action(esc(d.name),'use-download',`data-id="${esc(d.id)}"`)).join('')}</div>`:''}`:''}<p class="small">대화는 자동으로 읽지 않아요. 직접 제출한 요청과 결과만 기록해요.</p>${action(s.phase===0?'첫 결과 보관하기':s.phase===2?'수정한 결과 확인하기':'새 과제 결과 확인하기','submit','',true)}`;}
function guide(){const s=session();const visible=guideOpen??(s.level==='starter'&&s.phase===2);const step=LESSON.steps[guideStep];return `<div class="guide-toggle">${action(visible?'안내 접기':'단계별 안내 열기','toggle-guide')}</div>${visible?`<section class="guide"><span class="eyebrow">함께 연습 · ${guideStep+1} / 3</span><h3>${esc(step.title)}</h3><p>${esc(step.why)}</p><p class="task-action">${esc(step.action)}</p><div class="row">${step.target?action('화면에서 위치 보기','highlight',`data-target="${step.target}"`):''}${action('이 내용 더 알아보기','ask-guide')}</div><div class="guide-controls">${action('이전','guide-prev',guideStep===0?'disabled':'')}${action('다음','guide-next',guideStep===2?'disabled':'')}</div></section>`:''}`;}
function templateView(){const s=session(),policy=supportFor(s.level,s.phase);if(!policy.enabled)return '';const chosen=policy.choose?TEMPLATES.find(t=>t.id===draft.templateId):TEMPLATES[0];return `<section class="template-support"><span class="eyebrow">${policy.fields?'초급 · 추천 템플릿 + 작성 안내':policy.choose?'고급 · 직접 선택하고 검증':'중급 · 템플릿으로 직접 요청'}</span><h3>${policy.choose?'지금 필요한 템플릿을 고르세요.':'자료로 표 만들기'}</h3>${policy.choose?'<div class="template-choices">'+TEMPLATES.map(t=>`<button data-action="select-template" data-template="${t.id}" aria-pressed="${draft.templateId===t.id}"><b>${t.title}</b><small>${t.use}</small></button>`).join('')+'</div>':''}${chosen?`<details class="template" ${policy.fields?'open':''}><summary data-action="template">${chosen.title} · 빈칸 템플릿</summary><pre>${esc(chosen.text)}</pre>${action('템플릿 복사','copy-template')}</details>`:''}${policy.fields?`<div class="template-fields">${TEMPLATE_FIELDS.map(f=>`<label>${f.label}<small>${f.why}</small><textarea data-template-field="${f.id}" maxlength="2000" rows="2" placeholder="${f.placeholder}">${esc(draft.templateFields?.[f.id])}</textarea></label>`).join('')}${action('내가 채운 조건 복사','copy-filled')}<p class="small">ChatGPT에 직접 보낸 뒤, 아래에 실제 요청과 받은 파일을 남겨 주세요.</p></div>`:''}${policy.choose?'<p class="small">템플릿이 목적에 맞는지 선택하고, 결과의 수식과 합계를 직접 검증하세요.</p>':''}</section>`;}
function help(){const s=session();if(s.phase===0||s.phase===4)return '';return `<section class="help"><button class="help-heading" data-action="toggle-help">${helpOpen?'−':'＋'} 근거를 찾아 이해하기 <span>학습 자료</span></button>${helpOpen?`<div class="help-body"><p class="small">질문과 관련된 자료를 먼저 찾아요. 근거를 붙여 ChatGPT에 물어볼 수도 있어요.</p><label>어떤 부분이 궁금한가요?<input id="help-question" value="${esc(question)}" maxlength="500" placeholder="예: 합계가 수량을 바꿔도 그대로예요"/></label>${action('학습 자료 찾기','search')}${search?`<div class="search-result" aria-live="polite">${search.sources.length?`<span class="eyebrow">관련 근거 ${search.sources.length}개</span>${search.sources.map(d=>`<article><h4>${esc(d.title)}</h4><p>${esc(d.text)}</p><a href="${esc(d.source.url.startsWith('/')?'https://ai-bridge-lab-bd5373.mystic-grape-2563.chatgpt.site'+d.source.url:d.source.url)}" target="_blank" rel="noopener noreferrer">${esc(d.source.title)} ↗</a><small>자료 ID ${esc(d.id)}</small></article>`).join('')}${action('근거와 질문을 복사','copy-grounded')}<p class="small">ChatGPT에 직접 붙여 넣어 설명을 받아 보세요. 이 패널은 검색 근거를 보여주며 AI 답변을 대신 생성하지 않습니다.</p>`:'<p>맞는 근거를 찾지 못했어요. 수식·원자료·파일 검증에 관한 질문으로 바꿔 주세요.</p>'}</div>`:''}</div>`:''}</section>`;}
function comparison(){const s=session(),first=s.submissions.find(x=>x.phase===0),after=s.submissions.filter(x=>x.phase===2).at(-1);return `<section class="comparison"><h3>내가 남긴 실제 변화</h3><div class="compare-pair">${[[first,'처음'],[after,'수정 후']].map(([r,label])=>`<article><span>${label}</span><strong>${r?.checks?`${r.checks.passed} / 5`:'—'}</strong><small>파일 검사 충족</small></article>`).join('')}</div>${first&&after&&first.environment!==after.environment?'<p class="small">계정·모델 조건이 달라요. 결과 차이를 학습 효과로만 해석하지 마세요.</p>':''}<details><summary>처음과 수정 후의 요청 보기</summary><h4>처음</h4><pre>${esc(first?.prompt)}</pre><h4>수정 후</h4><pre>${esc(after?.prompt)}</pre></details><p class="small">사용자가 제출한 결과입니다. 생성 서비스의 원본 여부나 학습 효과의 인과관계를 인증하지 않습니다.</p></section>`;}
function render(){
  const s=session();
  app.innerHTML=`${preview?'<div class="preview-label">가이드 미리보기 · 실제 ChatGPT 아님</div>':''}<header><a class="brand" href="https://ai-bridge-lab-bd5373.mystic-grape-2563.chatgpt.site/coach" target="_blank" rel="noopener"><span>${icon}</span>AI Bridge</a><span class="header-tag">실습 코치</span></header><div class="body">${error?`<div class="error" role="alert">${esc(error)}</div>`:''}${notice?`<div class="notice" role="status">${esc(notice)}</div>`:''}
  ${!s?`<section class="welcome"><span class="eyebrow">실제 화면에서, 나의 실력으로</span><h1>ChatGPT와 함께<br/>엑셀 첫걸음</h1><p>${esc(LESSON.subtitle)}</p><div class="welcome-art"><span>자료</span><i>→</i><span>요청</span><i>→</i><span>확인</span></div><h2>어느 정도의 안내가 편한가요?</h2><div class="level-list">${Object.entries(LEVELS).map(([id,l])=>`<button data-action="new" data-level="${id}"><strong>${esc(l.name)}</strong><span>${esc(l.description)}</span><b>→</b></button>`).join('')}</div><p class="small">첫 요청은 내용 가이드 없이 기록해요. 이후 선택한 수준에 맞춰 도움을 드립니다.</p></section>`:
  `<div class="session-meta"><span>엑셀 · ${esc(LEVELS[s.level].name)}</span><span id="save-status">${dirty?'저장 대기 중':'기기에 저장됨'}</span></div><ol class="steps">${PHASES.slice(0,4).map((p,i)=>`<li class="${s.phase===i?'active':s.phase>i?'done':''}"><span>${s.phase>i?'✓':i+1}</span>${p}</li>`).join('')}</ol>
  ${s.phase===0?`<span class="eyebrow">STEP 01 · 나의 출발점</span><h1>먼저, 내 말로<br/>부탁해 볼까요?</h1><p class="lead">지금 생각나는 요청으로 시작하세요. 첫 결과를 보관한 뒤 함께 개선해요.</p>${material()}<div class="location-row">${action('ChatGPT 열기','open-chat')}${action('첨부 위치','highlight','data-target="attach"')}${action('입력 위치','highlight','data-target="composer"')}</div>${evidenceForm()}`:''}
  ${s.phase===1?`<span class="eyebrow">STEP 02 · 결과 확인</span><h1>무엇이 잘됐고,<br/>무엇을 고칠까요?</h1><p class="lead">제출한 실제 파일을 원자료와 대조했어요. 확인하지 못한 항목부터 살펴보세요.</p>${checks(s.submissions.find(x=>x.phase===0))}<details><summary>처음 보낸 요청과 답변</summary><pre>${esc(s.submissions[0]?.prompt)}</pre><p>${esc(s.submissions[0]?.output)}</p></details><label>확인한 부분과 근거<textarea data-field="review" rows="3" placeholder="예: 합계는 맞지만 셀에 숫자만 있어 수량을 바꿔도 그대로였어요.">${esc(draft.review)}</textarea></label>${action('조건을 보완해 다시 요청하기','next','',true)}`:''}
  ${s.phase===2?`<span class="eyebrow">STEP 03 · 다시 요청</span><h1>확인한 내용을<br/>요청에 담아봐요.</h1><p class="lead">어떤 부분을 왜 바꿀지 직접 정해 주세요.</p>${templateView()}${session().level==='starter'?guide():''}${evidenceForm()}${s.submissions.some(x=>x.phase===2)?`${checks(s.submissions.filter(x=>x.phase===2).at(-1))}<label>내가 바꾼 조건과 확인한 변화<textarea data-field="reflection" rows="3" placeholder="어떤 요청을 추가했고 결과에서 무엇을 확인했나요?">${esc(draft.reflection)}</textarea></label>${action('안내 없이 새 과제 도전','next','',true)}`:''}`:''}
  ${s.phase===3?`<span class="eyebrow">STEP 04 · 독립 실습</span><h1>이번에는<br/>스스로 해봐요.</h1><p class="lead">새 자료로 같은 종류의 일을 해 보세요. ChatGPT는 계속 사용할 수 있어요.</p><div class="independent-badge">${s.independentHelp?'도움을 사용한 연습으로 기록 중':'AI Bridge 안내를 끈 상태'}</div>${material()}${action('ChatGPT 새 대화 열기','open-chat')}${evidenceForm()}${s.submissions.some(x=>x.phase===3)?`<p class="small">새 과제 파일을 보관했어요. 검사 결과는 확인 문항에 답하고 평가를 마친 뒤 공개합니다.</p><div class="quiz">${LESSON.questions.map(q=>`<fieldset><legend>${esc(q.text)}</legend>${q.options.map((o,i)=>`<label><input type="radio" name="${q.id}" value="${i}" ${draft.answers?.[q.id]===i?'checked':''}/> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}</div>${action('나의 학습 결과 확인','next','',true)}`:''}${!s.independentHelp?`<button class="text-button" data-action="independent-help">막혔어요 · 도움 받고 연습하기</button>`:guide()}`:''}
  ${s.phase===4?`<section class="finish"><span class="finish-icon">${outcome(s).graduated?'✓':'↗'}</span><span class="eyebrow">다음 업무로 이어지는 경험</span><h1>${outcome(s).graduated?'엑셀 첫걸음,<br/>스스로 해냈어요.':'연습의 기록이<br/>남았어요.'}</h1><p>${esc(outcome(s).label)}</p><p class="small">${esc(outcome(s).note)}</p></section>${comparison()}<h3>새 과제에서 확인한 것</h3>${checks(s.submissions.filter(x=>x.phase===3).at(-1))}<div class="outcome-detail"><span>확인 문항 ${outcome(s).answers?'통과':'다시 확인'}</span><span>독립 실습 도움 ${outcome(s).helped?'사용':'미사용으로 기록'}</span></div><div class="stack">${action('기록 JSON 내려받기','export','',true)}${action(desktop?'학습 홈으로':'내 계정에 기록 보관하기','open-site')}${action('새 실습 시작하기','restart')}</div>`:''}${help()}`}
  <footer>처음에는 함께, 다음에는 스스로.<br/><span>기록 ${state.history.length+(s?1:0)}개 · ${preview?'미리보기 저장소':desktop?'이 기기에 저장':'이 브라우저에 저장'}</span></footer></div>`;
  app.querySelector('#workbook-file')?.addEventListener('change',readFile);
}
function setSaving(text){const el=document.getElementById('save-status');if(el)el.textContent=text;}
async function persist(){
  clearTimeout(saveTimer);if(!session()||!dirty)return saveQueue;
  const snapshot=structuredClone(draft);dirty=false;setSaving('저장 중…');
  const work=saveQueue.catch(()=>{}).then(async()=>{state=await dispatch({type:'PATCH',revision:session().revision,patch:snapshot});setSaving(dirty?'저장 대기 중':'기기에 저장됨');});
  saveQueue=work;try{await work;}catch(e){dirty=true;error=e.message;setSaving('저장 실패 · 입력을 복사해 주세요');throw e;}
}
async function mutate(type,extra={}){await persist();state=await dispatch({type,revision:session()?.revision,...extra});draft=structuredClone(session()?.draft||{});dirty=false;}
async function recordHelp(kind){if(session()?.phase===0||session()?.phase===4)return;await mutate('HELP',{kind});}
async function saveFile(name,content,type){if(desktop){const r=await dispatch({type:'SAVE_FILE',name,content});notice=`다운로드 폴더의 AI Bridge에 ${r.name} 파일을 저장했어요.`;return;}const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function copy(text){if(desktop)await dispatch({type:'COPY',text});else await navigator.clipboard.writeText(text);notice='복사했어요. ChatGPT 입력창에 직접 붙여 넣어 주세요.';}
async function readFile(event){
  const file=event.target.files?.[0];if(!file)return;busy=true;error='';notice='파일을 기기 안에서 읽고 있어요…';render();
  try{const {readWorkbookFile}=await import('../lib/coach/read-xlsx.mjs');upload=await readWorkbookFile(file);notice='파일을 선택했어요. 결과 확인 버튼을 누르면 기록에 보관됩니다.';}catch(e){upload=null;error=e.message;notice='';}finally{busy=false;render();}
}
app.addEventListener('input',event=>{
  if(event.target.id==='help-question'){question=event.target.value;return;}
  const templateField=event.target.dataset.templateField;const key=event.target.dataset.field;if(templateField){draft.templateFields={...draft.templateFields,[templateField]:event.target.value};}else if(key){draft[key]=event.target.value;}else return;dirty=true;setSaving('저장 대기 중');clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(()=>{}),400);
});
app.addEventListener('change',event=>{if(event.target.type==='radio'){draft.answers={...draft.answers,[event.target.name]:Number(event.target.value)};dirty=true;persist().catch(e=>{error=e.message;render();});}});
app.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled||busy)return;
  const type=button.dataset.action;error='';notice='';
  if(type==='template'){busy=true;try{if(!button.parentElement.open)await recordHelp('template');}catch(e){error=e.message;render();}finally{busy=false;}return;}
  busy=true;
  try{
    if(type==='new'){await mutate('NEW',{level:button.dataset.level});}
    else if(type==='restart'){await mutate('NEW',{level:session().level});upload=null;guideOpen=null;helpOpen=false;search=null;}
    else if(type==='open-chat')await dispatch({type:'OPEN_CHAT'});
    else if(type==='open-site'){await persist();await dispatch({type:'OPEN_SITE'});}
    else if(type==='highlight'){await persist();const r=await dispatch({type:'HIGHLIGHT',target:button.dataset.target||null});notice=r.found?(preview?'왼쪽의 안내 연습 화면에 표시했어요.':'ChatGPT 화면에 표시했어요. 직접 눌러 보세요.'):r.reason;state=await dispatch({type:'GET'});}
    else if(type==='download-source')await saveFile(`AI-Bridge-${session().phase===3?'새과제':'연습자료'}.csv`,'\uFEFF'+materialFor(session().phase).csv,'text/csv;charset=utf-8');
    else if(type==='copy-source')await copy(materialFor(session().phase).csv);
    else if(type==='recent-files'){
      nativeDownloads=(await dispatch({type:'DOWNLOADS'})).filter(d=>d.status==='completed'&&d.name.toLowerCase().endsWith('.xlsx'));
      if(!nativeDownloads.length)notice='앱에서 내려받은 XLSX가 아직 없어요. ChatGPT 결과의 다운로드를 누르거나 파일 선택으로 가져오세요.';
    }
    else if(type==='use-download'){
      const file=await dispatch({type:'USE_DOWNLOAD',id:button.dataset.id});
      const bytes=Uint8Array.from(atob(file.bytes),c=>c.charCodeAt(0));
      const {readWorkbookFile}=await import('../lib/coach/read-xlsx.mjs');
      upload=await readWorkbookFile(new File([bytes],file.name));nativeDownloads=[];notice='파일을 선택했어요. 결과 확인을 눌러 제출하세요.';
    }
    else if(type==='submit'){await mutate('SUBMIT',{upload});upload=null;notice='직접 제출한 결과를 보관했어요.';}
    else if(type==='next'){await mutate('NEXT');upload=null;guideOpen=null;helpOpen=false;search=null;await dispatch({type:'HIGHLIGHT',target:null});window.scrollTo(0,0);}
    else if(type==='toggle-guide'){const visible=guideOpen??(session().level==='starter'&&session().phase===2);if(!visible)await recordHelp('guide');guideOpen=!visible;}
    else if(type==='guide-prev')guideStep=Math.max(0,guideStep-1);
    else if(type==='guide-next')guideStep=Math.min(2,guideStep+1);
    else if(type==='copy-template'){await recordHelp('template');await copy((TEMPLATES.find(t=>t.id===draft.templateId)||TEMPLATES[0]).text);}
    else if(type==='select-template'){await mutate('PATCH',{patch:{templateId:button.dataset.template}});await recordHelp('template-select');}
    else if(type==='copy-filled'){const text=templatePrompt(draft.templateFields);await recordHelp('template-fields');await copy(text);}
    else if(type==='toggle-help'){if(!helpOpen)await recordHelp('knowledge');helpOpen=!helpOpen;}
    else if(type==='independent-help'){await recordHelp('independent-guide');guideOpen=true;notice='도움을 사용한 연습으로 기록해요. 끝까지 계속할 수 있습니다.';}
    else if(type==='ask-guide'){await recordHelp('knowledge');question=LESSON.steps[guideStep].query;search=retrieve(question);helpOpen=true;}
    else if(type==='search'){if(question.trim().length<2)throw Error('궁금한 내용을 두 글자 이상 적어 주세요.');await recordHelp('retrieval');search=retrieve(question);}
    else if(type==='copy-grounded'){await recordHelp('rag-prompt');await copy(groundedPrompt(search,session().level));}
    else if(type==='export')await saveFile(`AI-Bridge-${session().id}.json`,JSON.stringify({format:'ai-bridge-coach',session:session()},null,2),'application/json');
  }catch(e){error=e.message;}finally{busy=false;render();}
});
if(desktop)window.aiBridge.onFlush(()=>persist());
window.addEventListener('beforeunload',event=>{if(dirty){persist().catch(()=>{});event.preventDefault();event.returnValue='';}});
try{state=await dispatch({type:'GET'});draft=structuredClone(session()?.draft||{});render();}catch(e){error=e.message;render();}
