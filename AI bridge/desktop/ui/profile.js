import { PURPOSES, DIAGNOSTIC, validateProfile } from '../../lib/learning.mjs';
import { PROGRAMS } from '../../lib/coach/programs.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const levelNames={starter:'초급 · 한 단계씩 함께',growing:'중급 · 작성 틀을 참고하며',independent:'고급 · 직접 요청하고 검증'};

export function createProfileDialog({bridge,onSaved}){
  const dialog=document.getElementById('profile-dialog'),button=document.getElementById('profile');
  let data=null,draft=null,screen='summary',message='',saving=false;
  function update(value,busy){
    data=value;button.disabled=busy;
    document.getElementById('profile-label').textContent=data.profile?.name||'내 프로필';
    button.setAttribute('aria-label',(data.profile?.name?data.profile.name+'님의':'내')+' 프로필 열기');
  }
  function close(){if(dialog.open&&!saving)dialog.close();}
  function startEdit(){
    const profile=data.profile;
    draft={name:profile?.name||'',role:profile?.role||'',purpose:profile?.purpose||'',interests:[...(profile?.interests||[])],answers:{...profile?.answers}};
    screen='edit';message='';
  }
  function error(text){
    const target=dialog.querySelector('[data-profile-error]');target.textContent=text;target.hidden=!text;
    if(text)target.scrollIntoView({block:'nearest'});
  }
  function render(){
    const profile=data.profile;
    const title=screen==='diagnosis'?'나에게 맞는 도움 찾기':screen==='edit'?'나의 학습 프로필':'내 프로필';
    let html='<div class="profile-heading"><div><span class="eyebrow">나의 AI Bridge</span><h2 id="profile-title" tabindex="-1">'+title+'</h2></div><button type="button" class="profile-close" data-close aria-label="프로필 닫기">×</button></div><div class="profile-content"><p class="profile-error" role="alert" data-profile-error hidden></p>';
    if(screen==='summary'){
      html+=(message?'<p class="profile-success" role="status">'+esc(message)+'</p>':'')+'<div class="profile-identity"><span class="profile-avatar large" aria-hidden="true">'+esc(Array.from(profile.name)[0])+'</span><div><h3>'+esc(profile.name)+'님</h3><p>'+(profile.role?esc(profile.role)+' · ':'')+'이 PC에 저장된 프로필</p></div></div><dl class="profile-facts"><div><dt>학습 목적</dt><dd>'+esc(profile.purpose)+'</dd></div><div><dt>도움 수준</dt><dd>'+levelNames[profile.diagnosis.level]+'<small>시작 진단 '+profile.diagnosis.score+'/4 · 새 학습의 기본 안내량에 반영해요.</small></dd></div><div><dt>관심 업무</dt><dd class="profile-tags">'+PROGRAMS.filter(p=>profile.interests.includes(p.id)).map(p=>'<span>'+esc(p.name)+'</span>').join('')+'</dd></div></dl><p class="profile-note">목적과 관심 업무는 샘플 추천 순서에 반영돼요. 실습을 시작하기 전에 도움 수준을 다시 고를 수도 있어요.</p><div class="profile-actions"><button type="button" class="secondary" data-edit>프로필 수정</button><button type="button" class="primary" data-diagnosis>수준 다시 진단</button></div>';
    }else if(screen==='edit'){
      html+='<p class="profile-note">이름과 학습 목표를 알려주세요. 새 실습의 시작점을 맞춰드려요.</p><form id="profile-form"><div class="profile-fields"><label>이름<input name="name" value="'+esc(draft.name)+'" maxlength="40" autocomplete="nickname" placeholder="어떻게 불러드릴까요?" required></label><label>하는 일 <small>선택</small><input name="role" value="'+esc(draft.role)+'" maxlength="60" placeholder="예: 사무·행정"></label></div><label class="profile-field">학습 목적<select name="purpose" required><option value="">가장 가까운 목적을 골라 주세요</option>'+PURPOSES.map(p=>'<option value="'+esc(p)+'" '+(draft.purpose===p?'selected':'')+'>'+esc(p)+'</option>').join('')+'</select></label><fieldset class="profile-interests"><legend>관심 있는 업무 <small>한 가지 이상</small></legend><div>'+PROGRAMS.map(p=>'<label><input type="checkbox" name="interests" value="'+p.id+'" '+(draft.interests.includes(p.id)?'checked':'')+'><span>'+esc(p.name)+'</span></label>').join('')+'</div></fieldset><p class="profile-note">프로필은 이 PC에 저장돼요. ChatGPT 계정과는 별도예요.</p><div class="profile-actions"><button type="button" class="secondary" data-cancel>취소</button><button class="primary" type="submit">'+(profile?'변경 내용 저장':'다음 · 4문항 시작 진단')+'</button></div></form>';
    }else{
      html+='<p class="profile-note">지금 생각하는 답을 골라주세요. 정답 수에 따라 필요한 도움의 양을 추천해요.</p><form id="diagnosis-form">'+DIAGNOSTIC.map((q,i)=>'<fieldset class="profile-question"><legend><span>0'+(i+1)+'</span>'+esc(q.question)+'</legend>'+q.options.map((option,j)=>'<label><input type="radio" name="'+q.id+'" value="'+j+'" '+(draft.answers[q.id]===j?'checked':'')+' required><span>'+esc(option)+'</span></label>').join('')+'</fieldset>').join('')+'<div class="profile-actions"><button type="button" class="secondary" data-previous>이전</button><button class="primary" type="submit">진단하고 저장</button></div></form>';
    }
    dialog.innerHTML=html+'</div>';dialog.scrollTop=0;
    if(dialog.open)dialog.querySelector('#profile-title').focus({preventScroll:true});
  }
  async function save(){
    try{
      const profile=validateProfile(draft);saving=true;
      for(const control of dialog.querySelectorAll('button,input,select'))control.disabled=true;
      const submit=dialog.querySelector('[type="submit"]');if(submit)submit.textContent='저장 중…';
      const saved=await bridge.dispatch({type:'SAVE_PROFILE',profile});data={...data,profile:saved};onSaved(saved);
      screen='summary';message='저장했어요. 다음 새 학습부터 반영돼요.';render();
    }catch(e){
      for(const control of dialog.querySelectorAll('button,input,select'))control.disabled=false;
      const submit=dialog.querySelector('[type="submit"]');if(submit)submit.textContent=screen==='diagnosis'?'진단하고 저장':'변경 내용 저장';
      error(e.message);
    }finally{saving=false;}
  }
  button.addEventListener('click',()=>{
    if(!data||button.disabled)return;
    message='';if(data.profile)screen='summary';else startEdit();render();dialog.showModal();
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('click',event=>{
    if(saving)return;const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-close'))close();
    if(target.hasAttribute('data-edit')){startEdit();render();}
    if(target.hasAttribute('data-diagnosis')){startEdit();draft.answers={};screen='diagnosis';render();}
    if(target.hasAttribute('data-cancel')){if(data.profile){screen='summary';render();}else close();}
    if(target.hasAttribute('data-previous')){screen='edit';render();}
  });
  dialog.addEventListener('input',event=>{
    if(saving||!draft)return;const {name,value,checked}=event.target;
    if(['name','role','purpose'].includes(name)&&screen==='edit')draft[name]=value;
    if(name==='interests')draft.interests=checked?[...new Set([...draft.interests,value])]:draft.interests.filter(id=>id!==value);
    if(screen==='diagnosis'&&DIAGNOSTIC.some(q=>q.id===name))draft.answers[name]=Number(value);
  });
  dialog.addEventListener('submit',event=>{
    event.preventDefault();if(saving)return;
    if(event.target.id==='profile-form'){
      if(!draft.name.trim()){error('이름을 입력해 주세요.');return;}
      if(!draft.interests.length){error('관심 있는 업무를 한 가지 이상 골라 주세요.');return;}
      if(DIAGNOSTIC.some(q=>!Number.isInteger(draft.answers[q.id]))){screen='diagnosis';render();return;}
    }
    void save();
  });
  return {update,close};
}
