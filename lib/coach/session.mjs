import { COACH_VERSION, LESSON, LEVELS, materialFor, TEMPLATES, TEMPLATE_FIELDS } from './lesson.mjs';
import { cleanWorkbook, checkWorkbook } from './workbook-check.mjs';
import { sha256 } from '../artifact-schema.mjs';

export function createSession(level='starter') {
  if(!LEVELS[level])throw Error('안내 수준을 선택해 주세요.');
  const now=new Date().toISOString();
  return {version:COACH_VERSION,id:crypto.randomUUID(),lessonId:LESSON.id,level,phase:0,revision:0,createdAt:now,updatedAt:now,
    draft:{prompt:'',output:'',review:'',reflection:'',environment:'',answers:{},templateId:'',templateFields:{}},submissions:[],events:[],review:'',reflection:'',independentHelp:false,completedAt:null};
}
function addEvent(s,type,detail={}) {
  if(s.events.length>=300)throw Error('이 실습의 기록 한도에 도달했어요. JSON으로 보관한 뒤 새 실습을 시작해 주세요.');
  s.events.push({type,phase:s.phase,at:new Date().toISOString(),...detail});
}
export function updateDraft(session,patch) {
  const s=structuredClone(session);if(s.completedAt)throw Error('완료한 기록은 수정할 수 없어요.');
  for(const k of ['prompt','output','review','reflection','environment'])if(k in patch)s.draft[k]=String(patch[k]).slice(0,k==='environment'?120:12000);
  if(patch.answers)s.draft.answers={...s.draft.answers,...patch.answers};
  if('templateId' in patch)s.draft.templateId=TEMPLATES.some(t=>t.id===patch.templateId)?patch.templateId:'';
  if(patch.templateFields)for(const f of TEMPLATE_FIELDS)if(f.id in patch.templateFields)s.draft.templateFields[f.id]=String(patch.templateFields[f.id]).slice(0,2000);
  s.revision++;s.updatedAt=new Date().toISOString();return s;
}
export function useHelp(session,kind) {
  const s=structuredClone(session);if(s.completedAt)return s;
  if(s.phase===0)throw Error('첫 요청은 안내 없이 직접 작성해 주세요.');
  if(s.phase===3)s.independentHelp=true;
  addEvent(s,'help',{kind:String(kind).slice(0,80)});s.revision++;s.updatedAt=new Date().toISOString();return s;
}
export async function submitEvidence(session,upload=null) {
  const s=structuredClone(session);if(![0,2,3].includes(s.phase)||s.completedAt)throw Error('지금은 결과 제출 단계가 아니에요.');
  if(s.draft.prompt.trim().length<5)throw Error('ChatGPT에 실제로 보낸 요청을 5자 이상 기록해 주세요.');
  if(!s.draft.environment.trim())throw Error('사용한 계정·모델 조건을 짧게 기록해 주세요.');
  if(!upload&&s.draft.output.trim().length<15)throw Error('실제 결과 파일이나 답변을 제출해 주세요.');
  if(s.phase!==0&&!upload)throw Error('수정·독립 실습에서는 실제 XLSX 파일을 제출해 주세요.');
  if(s.phase===0&&s.submissions.some(x=>x.phase===0))throw Error('첫 결과는 이미 보존되어 있어요.');
  const workbook=upload?cleanWorkbook(upload.workbook):null;
  const evidence={id:crypto.randomUUID(),phase:s.phase,prompt:s.draft.prompt.trim(),output:s.draft.output.trim(),environment:s.draft.environment.trim(),
    workbook,file:upload?.file||null,submittedAt:new Date().toISOString(),sourceHash:await sha256(materialFor(s.phase).csv),
    checks:workbook?checkWorkbook(workbook,s.phase):null,provenance:'user-submitted',helpUsed:s.phase===3?s.independentHelp:false};
  evidence.contentHash=await sha256({prompt:evidence.prompt,output:evidence.output,workbook:evidence.workbook});
  s.submissions.push(evidence);addEvent(s,'submission',{submissionId:evidence.id});
  if(s.phase===0){s.phase=1;s.draft={...s.draft,prompt:'',output:''};}
  s.revision++;s.updatedAt=evidence.submittedAt;return s;
}
export function advance(session) {
  const s=structuredClone(session);if(s.completedAt)throw Error('완료한 기록입니다.');
  if(s.phase===1){
    if(s.draft.review.trim().length<10)throw Error('어떤 부분을 확인했는지 근거를 10자 이상 적어 주세요.');
    s.review=s.draft.review.trim();addEvent(s,'review');s.phase=2;
  }else if(s.phase===2){
    if(!s.submissions.some(x=>x.phase===2))throw Error('수정한 결과 파일을 먼저 제출해 주세요.');
    if(s.draft.reflection.trim().length<10)throw Error('수정한 조건과 결과의 변화를 10자 이상 적어 주세요.');
    s.reflection=s.draft.reflection.trim();addEvent(s,'independent-start');s.phase=3;
    s.draft={...s.draft,prompt:'',output:'',answers:{}};
  }else if(s.phase===3){
    if(!s.submissions.some(x=>x.phase===3))throw Error('새 과제의 결과 파일을 먼저 제출해 주세요.');
    if(LESSON.questions.some(q=>!Number.isInteger(s.draft.answers[q.id])))throw Error('두 가지 확인 질문에 답해 주세요.');
    addEvent(s,'complete');s.completedAt=new Date().toISOString();s.phase=4;
  }else throw Error('현재 단계에서 이동할 수 없습니다.');
  s.revision++;s.updatedAt=new Date().toISOString();return s;
}
export function outcome(session) {
  const last=session.submissions.filter(x=>x.phase===3).at(-1);
  const answers=LESSON.questions.every(q=>session.draft.answers[q.id]===q.correct);
  const helped=Boolean(session.independentHelp)||session.events.some(e=>e.type==='help'&&e.phase===3)||session.submissions.some(e=>e.phase===3&&e.helpUsed);
  const passed=last?.workbook?checkWorkbook(last.workbook,3).allPassed:false;
  return {graduated:Boolean(session.completedAt)&&passed&&answers&&!helped,passed,answers,helped,
    label:!session.completedAt?'진행 중':passed&&answers&&!helped?'엑셀 기초 과제 졸업':'연습 완료 · 다시 도전',
    note:'제출 파일과 확인 문항에 따른 과제별 판정입니다. 다른 도움의 사용 여부·상용 AI 전송 여부를 인증하지 않습니다.'};
}
export function validateSession(input) {
  if(!input||input.version!==COACH_VERSION||input.lessonId!==LESSON.id||!/^[a-z0-9-]{30,40}$/i.test(input.id)||!LEVELS[input.level])throw Error('지원하는 AI Bridge 확장 기록이 아닙니다.');
  if(JSON.stringify(input).length>500000||!Array.isArray(input.submissions)||input.submissions.length>30||!Array.isArray(input.events)||input.events.length>300)throw Error('학습 기록의 크기를 확인해 주세요.');
  const s=createSession(input.level);s.id=input.id;
  for(const key of ['createdAt','updatedAt']){if(!Number.isFinite(Date.parse(input[key])))throw Error('기록의 날짜가 올바르지 않습니다.');s[key]=input[key];}
  if(!Number.isInteger(input.phase)||input.phase<0||input.phase>4)throw Error('학습 단계를 확인해 주세요.');
  s.phase=input.phase;s.revision=Number.isInteger(input.revision)?Math.max(0,input.revision):0;
  s.draft=updateDraft(s,input.draft||{}).draft;s.review=String(input.review||'').slice(0,12000);s.reflection=String(input.reflection||'').slice(0,12000);
  s.events=input.events.map(e=>({type:String(e.type).slice(0,40),phase:Number(e.phase),at:String(e.at).slice(0,40),...(e.kind?{kind:String(e.kind).slice(0,80)}:{})}));
  s.independentHelp=Boolean(input.independentHelp)||s.events.some(e=>e.phase===3&&e.type==='help');
  s.completedAt=input.completedAt&&Number.isFinite(Date.parse(input.completedAt))?input.completedAt:null;
  const baseline=input.submissions.filter(x=>x.phase===0);if(baseline.length>1)throw Error('학습 전 첫 결과가 여러 개입니다.');
  s.submissions=input.submissions.map(e=>{
    if(![0,2,3].includes(e.phase)||typeof e.prompt!=='string'||e.prompt.trim().length<5||e.prompt.length>12000||typeof e.id!=='string'||!e.environment?.trim()||!Number.isFinite(Date.parse(e.submittedAt)))throw Error('제출 결과를 확인해 주세요.');
    const workbook=e.workbook?cleanWorkbook(e.workbook):null;
    if(!workbook&&(e.phase!==0||String(e.output||'').trim().length<15))throw Error('실제 제출 결과가 빠져 있습니다.');
    return {id:e.id.slice(0,50),phase:e.phase,prompt:e.prompt,output:String(e.output||'').slice(0,12000),environment:String(e.environment||'').slice(0,120),
      workbook,file:e.file?{name:String(e.file.name).slice(0,200),size:Number(e.file.size)||0,sha256:String(e.file.sha256).slice(0,64)}:null,
      submittedAt:String(e.submittedAt).slice(0,40),sourceHash:String(e.sourceHash||'').slice(0,64),contentHash:String(e.contentHash||'').slice(0,64),
      checks:workbook?checkWorkbook(workbook,e.phase):null,helpUsed:Boolean(e.helpUsed),provenance:'user-submitted'};
  });
  if(s.phase>0&&!baseline.length)throw Error('첫 결과가 없는 기록입니다.');
  if(s.phase>=2&&s.review.trim().length<10||s.phase>=3&&s.reflection.trim().length<10)throw Error('결과 확인·수정의 근거가 빠져 있습니다.');
  if(s.submissions.some((e,i)=>i>0&&e.phase<s.submissions[i-1].phase))throw Error('제출 순서를 확인해 주세요.');
  if(s.completedAt&&LESSON.questions.some(q=>!Number.isInteger(s.draft.answers[q.id])))throw Error('확인 질문의 답변이 빠져 있습니다.');
  if(s.completedAt&&(!s.submissions.some(e=>e.phase===2)||!s.submissions.some(e=>e.phase===3)||s.phase!==4))throw Error('완료 기록의 실습 결과가 부족합니다.');
  return s;
}
