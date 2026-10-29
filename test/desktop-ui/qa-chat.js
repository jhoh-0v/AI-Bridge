const form=document.getElementById('composer'),input=document.getElementById('prompt-textarea'),messages=document.getElementById('messages');
let n=0,busy=false;
function add(role,value){const el=document.createElement('article');el.dataset.messageAuthorRole=role;el.dataset.messageId=`qa-${role}-${Date.now()}-${++n}`;el.textContent=value;messages.append(el);el.scrollIntoView({block:'end'});return el;}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!input.value.trim())return;
  if(document.getElementById('fail').checked){document.getElementById('fail').closest('label').classList.add('failed');return;}
  busy=true;const prompt=input.value;add('user',prompt);input.value='';
  const stop=document.createElement('button');stop.dataset.testid='stop-button';stop.textContent='응답 중지';stop.type='button';form.append(stop);
  const answer=add('assistant','검증용 파일을 준비하고 있습니다.');
  await new Promise(resolve=>setTimeout(resolve,1600));
  answer.textContent='이 답변과 첨부 파일은 앱 동작 확인을 위한 검증용 자료입니다. 실제 ChatGPT가 만든 결과가 아닙니다.';
  if(!document.getElementById('text-only').checked){
    const name=prompt.includes('새 과제')?'independent':messages.querySelectorAll('[data-message-author-role="user"]').length===1?'baseline':'revision';
    const a=document.createElement('a');a.href=`qa-${name}.xlsx`;a.download=`qa-${name}.xlsx`;a.textContent=`qa-${name}.xlsx 다운로드`;answer.append(document.createElement('br'),a);
  }
  stop.remove();busy=false;
});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
