import { LESSON, TEMPLATES } from '../lib/coach/lesson.mjs';
import { lessonQuestions } from '../lib/coach/programs.mjs';
import { templateFor } from './practice.mjs';
import { retrieve } from '../lib/coach/retrieval.mjs';
const phases=['요청하기','결과 확인','수정하기','독립 실습','학습 완료'];
const mark=c=>c?.manual?'직접 확인':c?.pass?'확인됨':'확인 필요';
function standardGuide(context,templateId='repair'){
  const c=context.lesson||{},phase=context.phase,step=context.step,m=context.material||{},plan=m.curriculum;
  const taskId=m.taskId||'excel',format=m.format||'xlsx',goal=m.goal||c.goal||LESSON.goal;
  const questions=lessonQuestions(taskId),checks=c.before?.checks||[];
  const base={key:phase+':'+step,eyebrow:'AI Bridge · '+Math.min(phase+1,4)+' / 4 · '+phases[phase]};
  const ai=c.feedback?.status==='done'?[{title:'내 결과에 대한 AI 코치의 설명',text:c.feedback.summary+'\n\n'+c.feedback.question,source:c.feedback.sources.map(s=>s.title).join(' · ')}]:[];
  if(step==='review')return {...base,wide:true,title:c.before?.allPassed?'잘된 이유도 함께 확인해요':'원자료와 결과를 함께 살펴봐요',
    text:c.before?.manual?'답변이나 파일을 직접 읽어 보세요. 아래 기준 중 확인하고 싶은 항목 하나를 고르면, 다음 요청에 반영하는 방법을 안내할게요.':'원자료와 수식·합계를 확인했어요. 실제 파일을 열어 아래 항목 하나를 살펴보고 골라 주세요.',
    blocks:[{label:'처음 정한 목표',text:goal}],details:ai,
    actions:checks.length?checks.map(check=>({id:'review',value:check.id,label:(check.manual?'직접 확인 · ':check.pass?'✓ ':'○ ')+check.label,description:check.value})):[{id:'review',value:'text',label:'원하는 결과 형식으로 다시 요청하는 법 배우기'}],
    footer:c.feedback?.status==='pending'?'내 자료에 맞는 AI 설명을 준비하고 있어요.':c.feedback?.status==='error'?c.feedback.message:c.before?.manual?'직접 확인 항목은 자동으로 맞다고 판정하지 않아요.':'첫 결과가 좋았다면 그대로 보관해요.'};
  if(step==='compare'||step==='complete')return {...base,wide:true,title:step==='complete'?'이번 학습을 마쳤어요':'바꾼 조건이 결과에 반영됐나요?',
    text:c.after?.manual?'처음 받은 결과와 수정 결과를 같은 목표로 비교해요. 바꾸려던 부분과 유지할 부분을 직접 확인해 보세요.':'처음 '+(c.before?c.before.passed+' / '+c.before.total:'답변만')+' → 수정 후 '+(c.after?c.after.passed+' / '+c.after.total:'아직 없음')+'\n두 결과를 같은 원자료와 기준으로 확인했어요.',
    details:[...(c.evidence||[]).map(e=>({title:e.phase===0?'처음 받은 결과와 내 요청':'수정한 결과와 내 요청',text:'내 요청\n'+e.prompt+'\n\n받은 답변 (최대 1,500자)\n'+(e.output||'파일로 받은 결과')+(e.file?'\n\n결과 파일: '+e.file:'')})),{title:'결과 확인 기준',text:(c.after?.checks||[]).map(check=>check.label+': '+mark(check)).join('\n')},...ai,...(step==='complete'?[{title:'혼자 해본 기록',text:(c.independent?.manual?'실제 결과를 보관했어요. 직접 확인한 기준을 돌아보세요.':'파일 검사: '+(c.independent?.passed||0)+' / '+(c.independent?.total||5))+'\n확인 질문: '+(c.outcome?.answers?'모두 정답':'다시 확인')+'\n도움: '+(c.outcome?.helped?'사용함':'사용하지 않음')}]:[])],
    actions:[...(step==='complete'?[{id:'home',label:'학습 프로그램으로'}]:[{id:'next',label:'확인했어요 · 혼자 해보기'},{id:'again',label:'조금 더 수정해 볼게요',subtle:true}]),...(c.evidence||[]).filter(e=>e.canOpen).map(e=>({id:'open-result',value:String(e.phase),label:e.phase===0?'처음 받은 파일 열기':'수정한 파일 열기',subtle:true}))],
    footer:'내가 실제로 보낸 요청과 받은 결과를 보관했어요. 종합 AI 역량 점수는 아니에요.'};
  if(step==='quiz')return {...base,wide:true,title:'다음에도 스스로 할 수 있나요?',text:'안내 없이 받은 결과를 직접 확인한 뒤, 두 가지 질문에 답해 보세요.',questions:questions.map(q=>({...q,correct:undefined,answer:c.answers?.[q.id]})),actions:[{id:'finish',label:'학습 마치기',disabled:questions.some(q=>!Number.isInteger(c.answers?.[q.id]))},{id:'again',label:'결과를 다시 수정할게요',subtle:true}]};
  if(phase===2&&['prepare','compose'].includes(step)){
    const sources=retrieve((c.selectedCheck||'결과 확인')+' '+goal,{task:taskId,level:context.level,stage:'revise',limit:2}).sources;
    const templates={create:'첨부한 자료로 [원하는 작업]을 해 주세요.\n[사용할 대상과 상황]에 맞게 [조건]을 반영해 주세요.\n[결과 형식]으로 제공해 주세요.',repair:'내가 원하는 결과는 [목표]예요.\n앞서 받은 결과에서 [바꿀 부분과 이유]를 수정해 주세요.\n[유지할 사실이나 조건]은 그대로 남겨 주세요.\n[확인할 기준]을 반영해 [결과 형식]으로 다시 제공해 주세요.',verify:'결과에서 [원자료와 대조할 항목]을 확인해 주세요.\n[검증할 조건]의 근거를 설명하고 확인하기 어려운 부분은 구분해 주세요.\n확인한 내용에 따라 [바꿀 부분]을 고쳐 [결과 형식]으로 다시 제공해 주세요.'};
    const customTemplate=plan?(templates[context.level==='independent'?templateId:'repair']||templates.repair):templateFor(context.level,templateId,c.selectedCheck,!!c.before?.allPassed);
    return {...base,title:'이번에는 조건을 하나 더해 봐요',text:'살펴본 항목: '+(c.selectedCheck||'원하는 결과')+'\n아래 ChatGPT 입력창에 수정 요청을 직접 적어 주세요.',
      blocks:context.level==='starter'?[{label:'어떻게 적으면 되나요?',text:plan?.steps[2].action||'① 바꾸고 싶은 부분  ② 어떻게 바뀌면 좋을지  ③ 그대로 둘 부분을 내 말로 적어요.'},{label:'왜 이렇게 하나요?',text:plan?.steps[2].why||'무엇을 고칠지 구체적으로 말하면 이미 맞는 부분을 유지하면서 개선할 수 있어요.'}]:[],
      details:[...ai,{title:'직접 채워 보는 작성 틀',text:customTemplate},...sources.map(s=>({title:s.title,text:s.text,source:s.source.title}))],
      choices:context.level==='independent'?[{id:'template',label:'참고할 작성 틀',value:templateId,options:TEMPLATES.map(t=>({value:t.id,label:t.title}))}]:[],footer:'결과가 이미 좋다면 더 편하게 사용할 변경 조건을 정해도 돼요.'};
  }
  if(step==='result'){
    const isText=format==='text';
    return {...base,title:isText?'답변을 읽고 확인해 봐요':'받은 결과를 확인해요',text:isText?'ChatGPT 답변에서 원자료의 이름·날짜·숫자를 먼저 찾아보세요. 읽었다면 아래 버튼으로 결과를 보관하고 확인 기준을 살펴봐요.':phase===0?'이번에는 원하는 결과 파일이 보이지 않아요. 이 답변도 첫 결과로 보관하고, 파일을 요청하는 방법을 배울 수 있어요.':'아직 원하는 결과 파일이 보이지 않아요. 받을 형식을 직접 다시 요청해 보세요.',
      actions:[{id:isText||phase===0?'save-response':'again',label:isText?'답변을 읽었어요 · 결과 확인':phase===0?'이 답변에서 배워보기':'요청을 이어서 작성하기'}]};
  }
  if(step==='confirming'||step==='waiting')return {...base,title:step==='confirming'?'보낸 요청을 확인하고 있어요':'ChatGPT가 답변을 준비하고 있어요',text:'이 화면에서 기다리면 돼요. 답변이 나오면 확인할 위치를 이어서 안내할게요.',actions:step==='waiting'?[{id:'again',label:'응답이 멈춰서 다시 요청할게요',subtle:true}]:[]};
  if(phase===3&&!context.independentHelp)return {...base,title:m.mode==='own'?'내 자료로 혼자 해볼 차례예요':'새 샘플로 혼자 해볼 차례예요',
    text:goal+'\n자료: '+(m.file?.name||'새 실습 자료')+'\n첨부부터 요청·수정·확인까지 스스로 진행해 보세요.',
    actions:!m.saved?[{id:'sample',label:'새 실습 자료 받기'}]:[{id:'help',label:'도움을 받아 연습하기',subtle:true}],
    footer:m.saved?'자료 위치: '+(m.location||'다운로드 > AI Bridge')+'. 설명을 접고 시작해도 돼요.':'독립 실습에서는 작성 틀과 버튼 표시를 숨겨요.'};
  return {...base,title:'이제 내 말로 부탁해 볼까요?',text:'자료가 첨부됐어요. 아래 ChatGPT 입력창에 원하는 작업을 직접 적어 보세요.',
    blocks:[{label:'내가 만들어 볼 결과',text:goal},{label:'지금 할 일',text:context.level==='starter'?'첨부한 자료로 무엇을 만들고 싶은지 한두 문장 적으세요. 완벽하게 쓰지 않아도 괜찮아요. 첫 결과를 보고 함께 다듬을 거예요.':'자료와 원하는 결과를 설명하는 첫 요청을 직접 작성하세요.'}],
    footer:'작성한 뒤 표시된 전송 버튼을 직접 눌러 주세요.'};
}

export function lessonGuide(context,templateId='repair'){
  if(!context.dialogueLearning)return standardGuide(context,templateId);
  const {phase,step,liveCoach:coach}=context;
  const files=context.resultFiles||[],hasFiles=context.hasGeneratedFiles||files.length>0;
  let guide=standardGuide(context,templateId);
  const evidence=context.lesson?.evidence||[],changedGoal=evidence.length===2&&evidence[0].goal!==evidence[1].goal;
  if(['compare','complete'].includes(step)&&changedGoal)guide={...guide,text:'대화 중 목표가 바뀌었어요. 처음 결과와 나중 결과를 보관하되, 서로 다른 과제의 점수로 향상됐다고 판정하지 않아요.',details:[{title:'변경된 목표 확인',text:'처음: '+evidence[0].goal+'\n나중: '+evidence[1].goal},...(guide.details||[])]};
  if(step==='result')guide={key:phase+':result',eyebrow:'AI Bridge · '+phases[phase],title:hasFiles?'생성된 파일도 답변으로 확인했어요':'받은 답변에서 이어서 배워요',
    text:hasFiles?(files.some(f=>f.status==='read')?'내려받은 파일을 이 요청과 연결했어요. 내용 확인 상태는 아래에서 볼 수 있어요.':'ChatGPT의 파일 또는 다운로드 버튼을 직접 눌러 받아 보세요. 내려받으면 내용을 읽고 이 대화에 연결해요.'):'문장·표·코드 답변도 실습 결과로 남길 수 있어요. 내용을 읽고, 원하는 조건이 반영됐는지 살펴보세요.',
    actions:[{id:'save-response',label:phase===0?'이 결과 보관하고 확인하기':phase===3?'결과 보관하고 마무리하기':'수정 결과 보관하고 비교하기',disabled:!context.canSaveResponse},{id:'again',label:'ChatGPT에 이어서 요청할게요',subtle:true}]};
  if(phase===3){
    if(!['quiz','result'].includes(step))guide={key:'independent:'+step,eyebrow:'AI Bridge · 독립 실습',title:'이번에는 스스로 진행해 보세요',text:context.material?.goal+'\n자료: '+context.material?.file?.name,actions:!context.material?.saved?[{id:'sample',label:'새 실습 자료 받기'}]:[]};
    return {...guide,footer:'대화와 내려받은 파일은 기록해요. 맞춤 피드백은 학습을 마친 뒤 보여드려요.'};
  }
  const fileDetails=files.map(f=>({title:'결과 파일 · '+f.name,text:f.status==='read'?'내용을 읽어 대화에 연결했어요. 문서·PPT는 텍스트, 엑셀은 셀·수식·저장값을 살펴보고 이미지는 시각적으로 확인해요.':'파일 생성은 확인했지만 내용은 읽지 못했어요. '+(f.error||'다시 내려받아 주세요.')}));
  if(coach?.status==='done')return {...guide,key:guide.key+':'+coach.key,wide:['review','compare','complete'].includes(step),title:coach.title,text:coach.observation,
    blocks:[{label:phase===4?'다음에 연습할 한 가지':'지금 해볼 한 가지',text:coach.action},{label:'왜 이렇게 하나요?',text:coach.why}],
    details:[{title:'학습 방향과 확인 기준',text:'현재 목표: '+coach.goal+'\n\n다음 연습\n'+coach.nextSteps.map((s,i)=>(i+1)+'. '+s).join('\n')+'\n\n확인할 기준\n'+coach.checks.join('\n')},{title:'실제 근거와 참고자료',text:coach.evidence.map(e=>e.ref+'\n“'+e.quote+'”').join('\n\n')+'\n\n교육자료\n'+coach.sources.map(s=>s.title).join('\n')},...fileDetails,...(['compare','complete'].includes(step)?guide.details||[]:[])],
    footer:hasFiles&&!files.length?'생성 파일을 직접 내려받으면 내용까지 확인해 피드백을 갱신해요.':'새 요청을 보내거나 답변·파일이 완성되면 실습 대화를 다시 살펴봐요.'};
  if(!context.aiConsent&&context.aiReady&&context.hasTurns)return {...guide,details:[...fileDetails,...(guide.details||[])],actions:[...(guide.actions||[]),{id:'enable-coach',label:'실습 대화로 맞춤 코치 켜기'}],footer:'켜면 이번 실습의 대화·자료·결과 파일을 Codex를 통해 OpenAI로 보내 맞춤 피드백을 받아요.'};
  return {...guide,details:[...fileDetails,...(guide.details||[])],actions:[...(guide.actions||[]),...(coach?.status==='error'?[{id:'retry-coach',label:'피드백 다시 분석하기',subtle:true}]:[])],footer:coach?.status==='error'?coach.message:coach?.status==='pending'?'실습 대화와 결과를 읽고 맞춤 피드백을 준비하고 있어요. 계속 대화해도 돼요.':guide.footer};
}
