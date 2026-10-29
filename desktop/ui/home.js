import { PROGRAMS, programById, programMaterial, programCurriculum } from '../../lib/coach/programs.mjs';
import { sourceForProgram } from '../../lib/coach/source.mjs';
import { recommend } from '../../lib/learning.mjs';
import { createProfileDialog } from './profile.js';
const bridge=window.aiBridge,root=document.getElementById('home-content');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const steps=['요청하기','결과 확인','수정하기','독립 실습'];
const icons={email:['outlook','Outlook'],report:['word','Word'],ppt:['powerpoint','PowerPoint'],excel:['excel','Excel'],minutes:['onenote','OneNote'],plan:['powerpoint','PowerPoint'],official:['word','Word'],image:['chatgpt','ChatGPT']};
const programIcon=id=>'<img src="assets/programs/'+icons[id][0]+'.svg" alt="'+icons[id][1]+'" width="44" height="44">';
let data=null,error='',busy=false,busyAction='',wasWorking=false,setup=null,view='home';
const profileDialog=createProfileDialog({bridge,onSaved:profile=>{data.profile=profile;render();}});
function status(s){
  document.getElementById('tools').hidden=!s.working;root.hidden=s.working;
  document.getElementById('profile').hidden=s.working;
  if(s.working)profileDialog.close();
  document.getElementById('toolbar-status').textContent=s.working?s.chatStatus:'';
  document.getElementById('toggle').textContent=s.coachVisible?'설명 숨기기':'설명 다시 보기';
  const banner=document.getElementById('connection');banner.hidden=!s.error||!s.working;banner.textContent=s.error||'';
  if(wasWorking&&!s.working)void refresh();wasWorking=s.working;
}
function render(){
  if(!data)return;profileDialog.update(data,busy);if(setup){renderSetup();return;}
  if(view==='samples'){renderSamples();return;}
  const s=data.session,ongoing=s&&!s.completedAt;
  const resume=ongoing?'<section class="continue"><div><span class="eyebrow">이어서 학습하기</span><h2>'+esc(s.exercise?.curriculum?.title||s.exercise?.goal||'스스로 만드는 매출 정리표')+'</h2><p>'+Math.min(s.phase+1,4)+' / 4단계 · '+steps[s.phase]+'</p><div class="progress" aria-label="'+(s.phase+1)+'/4단계">'+steps.map((_,i)=>'<span class="'+(i<=s.phase?'active':'')+'"></span>').join('')+'</div></div><button class="primary" data-resume>이어서 학습하기 →</button></section>':'';
  root.innerHTML=alertBox()+'<div class="home-heading"><span class="eyebrow">나의 AI 학습</span><h1 tabindex="-1">오늘은 어떻게 배워볼까요?</h1><p>샘플로 연습하거나, 지금 해야 할 내 업무로 시작하세요.</p></div><section class="learning-paths" aria-label="학습 방법 선택"><button class="learning-path sample-path" data-view="samples"><span class="path-art program-stack" aria-hidden="true">'+['excel','ppt','report'].map(id=>programIcon(id)).join('')+'</span><strong class="path-title">샘플로 학습</strong><span class="path-description">준비된 자료로 차근차근.<br>8가지 업무 중 배우고 싶은 것을 골라요.</span><span class="path-action">8가지 업무 살펴보기 <span aria-hidden="true">→</span></span></button><button class="learning-path own-path" data-program="own"><span class="path-art" aria-hidden="true"><svg class="own-file-icon" viewBox="0 0 76 64" fill="none"><rect x="8" y="11" width="48" height="44" rx="8" fill="#e1ebdc"/><path d="M16 22h41a7 7 0 0 1 7 7v22a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7V29a7 7 0 0 1 7-7Z" fill="#709775"/><path d="M29 22v-7a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v7" stroke="#426a49" stroke-width="3"/><path d="M10 34c13 7 36 7 53 0" stroke="#edf5e8" stroke-width="2"/><rect x="33" y="32" width="9" height="9" rx="3" fill="#edf5e8"/></svg></span><strong class="path-title">내 업무로 학습</strong><span class="path-description">지금 필요한 일을 배우면서 해결해요.<br>내 파일에 맞는 작업과 학습 순서를 제안받아요.</span><span class="path-action">내 자료로 시작하기 <span aria-hidden="true">→</span></span></button></section>'+resume;
}
function renderSamples(){
  const programs=data.profile?recommend(data.profile).map(p=>programById(p.id)):PROGRAMS;
  root.innerHTML=alertBox()+'<button class="back" data-view="home">← 홈으로</button><div class="catalog-heading"><span class="eyebrow">샘플로 학습</span><h1 tabindex="-1">어떤 업무를 배워볼까요?</h1><p>준비된 자료로 실제 ChatGPT에서 요청하고, 확인하고, 고쳐 봐요.</p></div><section class="courses" aria-label="8가지 샘플 학습">'+programs.map(p=>'<article class="course available"><div class="course-top"><span class="course-icon">'+programIcon(p.id)+'</span><span class="course-type">'+esc(p.name)+'</span><span class="course-time">'+p.minutes+'분</span></div><h2>'+esc(p.title)+'</h2><p>'+esc(p.description)+'</p><button class="course-action" data-program="'+p.id+'" aria-label="'+esc(p.name)+' 샘플 학습 시작">샘플로 배우기 <span aria-hidden="true">→</span></button></article>').join('')+'</section>';
}
function focusPage(){window.scrollTo(0,0);root.querySelector('h1')?.focus({preventScroll:true});}
function navigate(next){setup=null;view=next;error='';render();focusPage();
}
function alertBox(){return error?'<div class="error" role="alert">'+esc(error)+'</div>':'';}
function levels(){
  return '<fieldset class="setup-section"><legend>어느 정도의 도움이 필요한가요?</legend><div class="level-options">'+[['starter','초급','첨부 위치부터 한 단계씩 안내'],['growing','중급','작성 틀을 참고해 직접 요청'],['independent','고급','필요한 도움을 고르고 직접 검증']].map(([id,title,description])=>'<label class="option '+(setup.level===id?'selected':'')+'"><input type="radio" name="level" value="'+id+'" '+(setup.level===id?'checked':'')+' '+(busy?'disabled':'')+'><span><strong>'+title+'</strong><small>'+description+'</small></span></label>').join('')+'</div></fieldset>';
}
function preview(source){
  if(source.kind==='text')return '<div class="text-preview" tabindex="0" role="region" aria-label="자료 미리보기"><pre>'+esc(source.text.slice(0,6000))+'</pre></div>'+(source.text.length>6000?'<p class="preview-caption">미리보기는 첫 6,000자예요. 학습 제안에는 읽은 전체 내용이 사용돼요.</p>':'');
  return '<div class="data-preview" tabindex="0" role="region" aria-label="자료 표"><table><thead><tr><th>#</th>'+source.headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+source.rows.slice(0,6).map((r,i)=>'<tr><th scope="row" class="row-number">'+(i+1)+'</th>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(source.rows.length>6?'<p class="preview-caption">전체 '+source.rows.length+'행 중 처음 6행을 보여드려요.</p>':'');
}
function ready(){
  const m=setup.material;
  return m?'<div class="file-ready" role="status"><strong>✓ '+esc(m.file.name)+'</strong><span>'+esc(m.location)+' · 다음 화면에서 이 파일을 ChatGPT에 직접 첨부해요.</span></div>':'';
}
function pathPreview(plan){
  return '<ol class="curriculum">'+plan.steps.map((s,i)=>'<li><span>'+(i+1)+'</span><div><strong>'+esc(s.title)+'</strong><p>'+esc(s.action)+'</p></div></li>').join('')+'</ol>';
}
function customTaskReady(){return !!setup.material&&data.aiReady&&setup.aiConsent&&setup.requestedTask.trim().length>=5&&setup.requestedTask.trim().length<=500&&!busy;}
function taskChanged(){return !!setup.plan?.requestedTask&&setup.requestedTask.trim()!==setup.plan.requestedTask;}
function customTaskPanel(){
  return '<section class="task-entry"><label for="requested-task">'+(setup.plan?'원하는 작업이 없나요? 직접 적어 주세요.':'하고 싶은 작업을 직접 정할 수도 있어요')+'</label><p>입력한 작업과 첨부한 자료에 맞춰 학습 순서와 결과 확인 기준을 만들어요.</p><textarea id="requested-task" name="requestedTask" maxlength="500" '+(busy?'disabled':'')+' placeholder="예: 상품별 매출을 비교하고, 다음 달에 집중할 상품을 정할 수 있는 보고서를 만들고 싶어요.">'+esc(setup.requestedTask)+'</textarea><div class="task-entry-actions"><span data-task-count>'+setup.requestedTask.length+' / 500자 · 5자 이상</span><button class="secondary" data-custom-plan '+(!customTaskReady()?'disabled':'')+'>'+(busyAction==='custom-plan'?'내 작업으로 학습 만드는 중…':'이 작업으로 학습 만들기 →')+'</button></div><p class="task-change-note" data-task-change '+(!taskChanged()?'hidden':'')+'>작업을 바꿨어요. 위 버튼으로 학습 순서를 다시 만들어 주세요.</p>'+(setup.plan?.requestedTask&&setup.suggestions?'<button class="text-button" data-suggestions '+(busy?'disabled':'')+'>처음 제안한 작업 다시 보기</button>':'')+'</section>';
}
function renderSetup(){
  const own=setup.id==='own',m=setup.material,p=own?null:programById(setup.id);
  let html='<div class="setup"><button class="back" data-back '+(busy?'disabled':'')+'>← '+(own?'홈으로':'샘플 학습 목록')+'</button><span class="eyebrow">'+(own?'내 업무로 학습':esc(p.name)+' · 샘플 학습')+'</span><h1 tabindex="-1">'+(own?'내 파일에서 배울 일을 찾아요':esc(p.title))+'</h1><p class="intro">'+(own?'파일을 살펴보고, 가능한 작업과 학습 순서를 제안받으세요.':'준비된 샘플을 직접 첨부하고, 요청·확인·수정을 연습해요.')+'</p>'+alertBox();
  if(!own){
    const plan=programCurriculum(p.id),sample=programMaterial(p.id);
    html+=levels()+'<div class="sample-lesson"><section class="preview-pane"><div class="preview-heading"><div><span class="eyebrow">오늘 사용할 자료</span><h2>'+esc(sample.title)+'</h2></div><span class="sample-badge">가상 샘플</span></div>'+preview(sourceForProgram(p.id))+'<div class="preview-action"><p>위 내용이 담긴 파일을 먼저 받아요.<br>실제 ChatGPT에 첨부하는 방법은 이어서 안내해요.</p><button class="secondary" data-material '+(busy?'disabled':'')+'>'+(m?'샘플 파일 다시 받기':'이 샘플 파일 받기')+' ↓</button></div>'+ready()+'</section><aside class="lesson-outline"><span class="eyebrow">이번에 해볼 일</span><p class="lesson-goal">'+esc(plan.goal)+'</p><ol>'+steps.map(s=>'<li>'+s+'</li>').join('')+'</ol><details><summary>결과에서 확인할 것</summary><ul>'+plan.checks.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul></details></aside></div>';
    if(data.aiReady)html+='<label class="ai-consent"><input name="aiConsent" type="checkbox" '+(setup.aiConsent?'checked':'')+'>실습 대화·자료·결과 파일을 Codex를 통해 OpenAI로 보내 맞춤 피드백을 받겠습니다. 독립 실습은 마친 뒤 분석해요.</label>';
    html+='<div class="setup-bottom"><span>'+(m?'자료 준비 완료 · 다음에는 직접 첨부해요.':'샘플 내용을 확인하고 파일을 받아 주세요.')+'</span><button class="primary" data-begin '+(!m||busy?'disabled':'')+'>ChatGPT에서 실습 시작 →</button></div>';
  }else{
    html+='<div class="connection-note" role="status"><strong>학습 코치 · '+esc(data.aiConnection?.label||'연결 확인 중')+'</strong><details><summary>연결 정보</summary><p>학습 제안과 맞춤 설명은 이 PC의 Codex 계정으로 실행해요.</p><p>OpenAI API 키: '+(data.aiConnection?.apiKeyConfigured?'설정 완료 · 현재 생성에는 사용하지 않음':'설정되지 않음')+'</p></details></div>';
    html+='<section class="own-material"><div class="own-heading"><div><h2>'+(m?'선택한 내 자료':'어떤 자료로 연습할까요?')+'</h2><p>CSV · XLSX · TXT · MD · DOCX · PPTX, 3MB 이하<br>표는 한 시트·60행·20열, 문서는 텍스트 60,000자까지 읽어요.</p></div><button class="secondary" data-material '+(busy?'disabled':'')+'>'+(m?'다른 파일 선택':'내 자료 선택하기')+'</button></div>'+(m?preview(m.source)+ready():'<div class="empty-preview">파일을 선택하면 여기에서 내용을 미리볼 수 있어요.</div>')+'</section>'+levels();
    if(data.aiReady)html+='<label class="ai-consent"><input name="aiConsent" type="checkbox" '+(setup.aiConsent?'checked':'')+' '+(busy?'disabled':'')+'>선택한 자료·실습 대화·결과 파일을 Codex를 통해 OpenAI로 보내 학습 제안과 맞춤 피드백을 받겠습니다. 독립 실습은 마친 뒤 분석해요.</label>';
    else html+='<div class="connection-note" role="status">맞춤 AI 학습은 연결 준비 중이에요. 파일 미리보기와 8개 샘플 학습은 사용할 수 있어요.</div>';
    if(!setup.plan){
      html+='<div class="plan-intro"><strong>이 자료로 무엇을 해볼 수 있을까요?</strong><p>AI가 관련 교육자료를 참고해 작업 3개와 학습 순서를 제안해요. 마음에 드는 작업을 직접 골라요.</p></div>';
      html+=customTaskPanel()+'<div class="setup-bottom"><span>'+(busyAction==='plan'?'자료와 교육자료로 학습을 구성하고 있어요…':'아직 정한 작업이 없다면 제안을 받아보세요.')+'</span><button class="primary" data-plan '+(!m||!data.aiReady||!setup.aiConsent||busy?'disabled':'')+'>'+(busyAction==='plan'?'학습 제안 만드는 중…':'이 자료로 학습 제안받기 →')+'</button></div>';
    }else{
      const chosen=setup.plan.options[setup.planIndex];
      html+='<h2 class="plan-title">'+(setup.plan.requestedTask?'직접 정한 작업으로 배워볼까요?':'어떤 작업을 배워볼까요?')+'</h2>'+(setup.plan.requestedTask?'':'<div class="plan-options">'+setup.plan.options.map((o,i)=>'<label class="option '+(setup.planIndex===i?'selected':'')+'"><input type="radio" name="planIndex" value="'+i+'" '+(setup.planIndex===i?'checked':'')+' '+(busy?'disabled':'')+'><span><strong>'+esc(o.title)+'</strong><small>'+esc(o.reason)+'</small></span></label>').join('')+'</div>')+'<section class="chosen-plan"><span class="eyebrow">'+(setup.plan.requestedTask?'내가 입력한 작업과 학습 순서':'선택한 학습 순서')+'</span><h2>'+esc(chosen.goal)+'</h2>'+pathPreview(chosen)+'<details><summary>결과 확인 기준과 참고한 교육자료</summary><ul>'+chosen.checks.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul><p>'+setup.plan.sources.filter(s=>chosen.sourceIds.includes(s.id)).map(s=>esc(s.title)).join(' · ')+'</p></details></section>'+customTaskPanel()+'<div class="setup-bottom"><span>자료 첨부와 요청 작성은 ChatGPT에서 직접 해봐요.</span><button class="primary" data-begin '+(busy||taskChanged()?'disabled':'')+'>이 학습 시작하기 →</button></div>';
    }
  }
  root.innerHTML=html+'</div>';
}
async function refresh(){data=await bridge.dispatch({type:'PROFILE'});status(data.status);render();}
async function run(fn,action=''){if(busy)return;busy=true;busyAction=action;error='';render();try{await fn();}catch(e){error=e.message;}finally{busy=false;busyAction='';render();}}
function openSetup(id){view=id==='own'?'home':'samples';setup={id,level:data.profile?.diagnosis?.level||data.session?.level||'starter',material:null,aiConsent:id!=='own',plan:null,suggestions:null,requestedTask:'',planIndex:0};error='';render();focusPage();}
root.addEventListener('click',event=>{
  if(busy)return;
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-view'))navigate(button.dataset.view);
  if(button.hasAttribute('data-program'))openSetup(button.dataset.program);
  if(button.hasAttribute('data-back'))navigate(view);
  if(button.hasAttribute('data-resume'))void run(async()=>{if(data.needsSetup)openSetup('excel');else await bridge.dispatch({type:'START'});});
  if(button.hasAttribute('data-material'))void run(async()=>{const current=setup;const m=await bridge.dispatch({type:setup.id==='own'?'CHOOSE_SOURCE':'PREPARE_SAMPLE',taskId:setup.id});if(m&&setup===current){setup.material=m;setup.plan=null;setup.suggestions=null;setup.planIndex=0;}});
  if(button.hasAttribute('data-plan')||button.hasAttribute('data-custom-plan')){const custom=button.hasAttribute('data-custom-plan');void run(async()=>{const current=setup;const plan=await bridge.dispatch({type:'PLAN_LESSON',materialId:setup.material.id,level:setup.level,aiConsent:setup.aiConsent,requestedTask:custom?setup.requestedTask.trim():''});if(setup===current){setup.plan=plan;if(!custom)setup.suggestions=plan;setup.planIndex=0;}},custom?'custom-plan':'plan');}
  if(button.hasAttribute('data-suggestions')){setup.plan=setup.suggestions;setup.planIndex=0;render();}
  if(button.hasAttribute('data-begin'))void run(async()=>{await bridge.dispatch({type:'START_LESSON',level:setup.level,materialId:setup.material.id,planIndex:setup.planIndex,aiConsent:setup.aiConsent,requestedTask:setup.plan?.requestedTask?setup.requestedTask.trim():''});setup=null;});
});
root.addEventListener('input',event=>{
  if(busy||!setup||event.target.name!=='requestedTask')return;
  setup.requestedTask=event.target.value;
  root.querySelector('[data-task-count]').textContent=setup.requestedTask.length+' / 500자 · 5자 이상';
  root.querySelector('[data-custom-plan]').disabled=!customTaskReady();
  root.querySelector('[data-task-change]').hidden=!taskChanged();
  const begin=root.querySelector('[data-begin]');if(begin)begin.disabled=taskChanged();
});
root.addEventListener('change',event=>{
  if(busy||!setup)return;
  if(!['level','aiConsent','planIndex'].includes(event.target.name))return;
  if(event.target.name==='level'){setup.level=event.target.value;setup.plan=null;setup.suggestions=null;}
  if(event.target.name==='aiConsent')setup.aiConsent=event.target.checked;
  if(event.target.name==='planIndex')setup.planIndex=Number(event.target.value);
  error='';render();
});
document.getElementById('home').onclick=()=>run(async()=>{setup=null;view='home';data=await bridge.dispatch({type:'HOME'});});
document.getElementById('toggle').onclick=()=>run(()=>bridge.dispatch({type:'TOGGLE_COACH'}));
document.getElementById('retry').onclick=()=>run(()=>bridge.dispatch({type:'RETURN_CHAT'}));
document.getElementById('downloads').onclick=()=>run(()=>bridge.dispatch({type:'OPEN_DOWNLOADS'}));
bridge.onStatus(status);void refresh().catch(e=>{error=e.message;root.innerHTML=alertBox();});
