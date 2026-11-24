import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { PROGRAMS, programCurriculum, lessonQuestions } from '../lib/coach/programs.mjs';
import { KNOWLEDGE, KNOWLEDGE_VERSION } from '../lib/coach/knowledge.mjs';
import { retrieve } from '../lib/coach/retrieval.mjs';
import { cleanExercise, sourceForSession, textSource, tableSource } from '../lib/coach/source.mjs';
import { createSession, updateDraft, submitEvidence, advance, validateSession, outcome } from '../lib/coach/session.mjs';
import { programFile, ownMaterial, officeText } from '../desktop/materials.mjs';
import { suggestCurricula, curriculumRequestKey } from '../desktop/ai-curriculum.mjs';
import { lessonGuide } from '../desktop/lesson-guide.mjs';
import { guideCommand } from '../desktop/guide-model.mjs';
import { matchesUserRequest, isResultLink } from '../desktop/capture-model.mjs';

const file=(name)=>({name,sha256:'b'.repeat(64),size:123});
const patch=(s,phase)=>updateDraft(s,{prompt:`실제 요청 ${phase}: 첨부한 자료를 읽고 원하는 결과를 만들어 주세요.`,output:'실제 ChatGPT에서 받은 답변입니다. 숫자와 조건은 자료와 대조해야 합니다.',environment:'ChatGPT · 테스트 모델'});
function uploadFor(p,source){
  if(p.format==='text')return null;
  if(p.format==='pptx')return {file:file('결과.pptx'),artifact:{kind:'presentation',text:'원자료로 만든 발표',slideCount:5}};
  if(p.format==='image')return {file:file('결과.png'),artifact:{kind:'image',width:1536,height:1024}};
  return {file:file('결과.xlsx'),workbook:{kind:'workbook',sheets:[{name:'원자료',rows:[source.headers,...source.rows]}]}};
}
for(const p of PROGRAMS)test(`${p.id}: fixed sample, actual evidence and all four steps survive record reload`,async()=>{
  const material=programFile(p.id);let s=createSession();
  s.exercise=cleanExercise({version:3,mode:'sample',taskId:p.id,file:material.file,goal:'외부에서 덮어쓴 목표'});
  assert.equal(s.exercise.goal,programCurriculum(p.id).goal);
  assert.equal(s.exercise.curriculum.steps.length,4);
  s=await submitEvidence(patch(s,0),uploadFor(p,sourceForSession(s)));
  const baseline=structuredClone(s.submissions[0]);
  s=advance(updateDraft(s,{review:'실제 결과를 원자료와 대조해서 수정할 항목을 선택했습니다.'}));
  s=await submitEvidence(patch(s,2),uploadFor(p,sourceForSession(s)));
  assert.equal(s.submissions[0].sourceHash,s.submissions[1].sourceHash);
  assert.deepEqual(s.submissions[0],baseline);
  s=advance(updateDraft(s,{reflection:'바꿀 조건이 반영되었는지 실제 결과와 대조해서 확인했습니다.'}));
  assert.notDeepEqual(sourceForSession(s),material.source);
  s=await submitEvidence(patch(s,3),uploadFor(p,sourceForSession(s)));
  assert.notEqual(s.submissions.at(-1).sourceHash,baseline.sourceHash);
  s=advance(updateDraft(s,{answers:Object.fromEntries(lessonQuestions(p.id).map(q=>[q.id,q.correct]))}));
  const restored=validateSession(s);
  assert.equal(restored.phase,4);assert.equal(restored.submissions.length,3);
  assert.equal(restored.exercise.taskId,p.id);
  if(p.id!=='excel'){
    assert.equal(outcome(restored).graduated,false);
    assert.ok(restored.submissions[0].checks.checks.some(c=>c.manual&&c.pass===null));
  }
});

test('RAG contains versioned coverage for all eight tasks and level/stage-filtered retrieval',()=>{
  assert.equal(KNOWLEDGE.length,87);assert.equal(new Set(KNOWLEDGE.map(d=>d.id)).size,87);
  for(const p of PROGRAMS){
    const docs=KNOWLEDGE.filter(d=>d.task===p.id);assert.ok(docs.length>=8);
    for(const d of docs){assert.equal(d.version,KNOWLEDGE_VERSION);assert.ok(d.source.title&&d.source.url&&d.stage&&d.levels.length&&d.authorship);}
    const r=retrieve(programCurriculum(p.id).goal+' 결과 확인 수정 요청',{task:p.id,level:'starter',stage:'revise',limit:4});
    assert.ok(r.sources.length);assert.ok(r.sources.every(d=>[p.id,'common'].includes(d.task)));
  }
  assert.equal(retrieve('알 수 없는 천체의 외계어 zqxjv').sources.length,0);
});

test('Office text preserves literal angle brackets, paragraph boundaries, and actual slide counts',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','<w:document><w:p><w:r><w:t>행사 &lt;미정&gt;</w:t></w:r></w:p><w:p><w:r><w:t>예산 50만 원</w:t></w:r></w:p></w:document>');
  const bytes=await zip.generateAsync({type:'nodebuffer'}),m=await ownMaterial('행사.docx',bytes,{general:true});
  assert.match(m.source.text,/행사 <미정>\n예산 50만 원/);
  const ppt=new JSZip();ppt.file('ppt/slides/slide1.xml','<a:p><a:r><a:t>첫 장입니다.</a:t></a:r></a:p>');ppt.file('ppt/slides/slide2.xml','<a:p><a:r><a:t>두 번째 장입니다.</a:t></a:r></a:p>');ppt.file('ppt/notesSlides/notesSlide1.xml','<a:p><a:r><a:t>발표자 메모</a:t></a:r></a:p>');
  assert.equal((await officeText(await ppt.generateAsync({type:'nodebuffer'}),'pptx')).slideCount,2);
  zip.file('word/document.xml','<!DOCTYPE x><w:t>지원하지 않음</w:t>');
  await assert.rejects(officeText(await zip.generateAsync({type:'nodebuffer'}),'docx'),/일반 Office/);
});

function mockProvider({mutate=()=>{},capture=()=>{}}={}){
  return async(_url,request)=>{
    const body=JSON.parse(request.body),input=JSON.parse(body.input[1].content);capture(body,input);
    const sourceIds=[input.knowledge.find(d=>d.task==='common').id];
    const options=Array.from({length:3},(_,i)=>({taskId:'report',title:`운영 보고 ${i+1}`,goal:'자료의 기간과 성과를 구분해 운영 현황 보고서 만들기',reason:'자료에 날짜와 실적이 있어 보고서 연습에 사용할 수 있어요.',columns:input.source.headers,steps:['요청','확인','수정','독립'].map(title=>({title,action:'자료를 직접 읽고 내 말로 실행해요.',why:'사용자 스스로 판단하는 연습이에요.'})),checks:['날짜가 원자료와 일치하나요?','미확정 수치를 사실로 쓰지 않았나요?'],sourceIds}));
    mutate(options);
    return new Response(JSON.stringify({id:'mock-only',model:'mock-only',status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({options})}]}]}),{headers:{'x-request-id':'mock-only'}});
  };
}
const source=textSource('10월 운영 현황입니다. 문의는 20건이고 해결은 15건입니다. 미해결 원인은 확인 중입니다.');
test('personal curriculum API sends actual data and retrieved evidence, with strict output and consent gates',async()=>{
  let calls=0,payload;
  const fetchImpl=mockProvider({capture:(body,input)=>{calls++;payload={body,input};}});
  await assert.rejects(suggestCurricula({source,level:'starter',consent:false,key:'test-only',fetchImpl}),/동의/);
  await assert.rejects(suggestCurricula({source,level:'starter',consent:true,fetchImpl}),/연결/);
  assert.equal(calls,0);
  const result=await suggestCurricula({source,level:'starter',consent:true,key:'test-only',fetchImpl});
  assert.equal(calls,1);assert.equal(payload.body.store,false);assert.equal(payload.body.text.format.strict,true);
  assert.deepEqual(payload.input.source,source);assert.equal(payload.input.availableTasks.length,8);
  assert.equal(result.options.length,3);assert.equal(result.options[0].format,'text');
  assert.equal(result.receipt.requestId,'mock-only');assert.match(result.receipt.inputHash,/^[a-f0-9]{64}$/);
  const own=cleanExercise({version:3,mode:'own',taskId:'report',source,curriculum:result.options[0],file:file('내자료.txt'),aiConsent:true});
  assert.deepEqual(sourceForSession({exercise:own},3),source);
  assert.equal(own.curriculum.sourceIds.length,1);
});

test('curriculum rejects invented columns, missing steps, unrelated citations and provider failures without retries',async()=>{
  for(const mutate of [o=>o[0].columns=['없는 열'],o=>o[0].steps.pop(),o=>o[0].sourceIds=['없는 근거'],o=>o[0].taskId='없는 과정']){
    await assert.rejects(suggestCurricula({source,level:'growing',consent:true,key:'test-only',fetchImpl:mockProvider({mutate})}),/확인하지 못/);
  }
  let calls=0;
  await assert.rejects(suggestCurricula({source,level:'starter',consent:true,key:'test-only',fetchImpl:async()=>{calls++;return new Response('',{status:429});}}),/한도/);
  assert.equal(calls,1);
});

test('learner-written task becomes one tailored curriculum and survives record reload',async()=>{
  const requestedTask='미해결 문의 5건의 처리 현황을 팀 회의 보고서로 정리하고 싶어요.';
  let payload,calls=0;
  const result=await suggestCurricula({source,level:'starter',consent:true,key:'test-only',requestedTask,fetchImpl:mockProvider({capture:(body,input)=>{calls++;payload={body,input};},mutate:options=>{options.splice(1);options[0].checks=['미해결 문의가 5건으로 표시되어 있나요?','확인 중인 원인을 사실처럼 단정하지 않았나요?'];}})});
  assert.equal(calls,1);assert.equal(payload.input.requestedTask,requestedTask);
  assert.equal(payload.body.text.format.schema.properties.options.maxItems,1);
  assert.ok(payload.input.knowledge.length);
  assert.equal(result.options.length,1);assert.equal(result.options[0].goal,requestedTask);
  let session=createSession();session.exercise=cleanExercise({version:3,mode:'own',taskId:'report',source,curriculum:result.options[0],file:file('운영자료.txt'),aiConsent:true});
  const restored=validateSession(session);
  assert.equal(restored.exercise.curriculum.requestedTask,requestedTask);
  assert.equal(restored.exercise.goal,requestedTask);
  assert.match(restored.exercise.curriculum.checks[0],/미해결 문의/);
  assert.notEqual(curriculumRequestKey('starter'),curriculumRequestKey('starter',requestedTask));
  assert.notEqual(curriculumRequestKey('growing',requestedTask),curriculumRequestKey('starter',requestedTask));
  assert.equal(curriculumRequestKey('starter','  '+requestedTask+'  '),curriculumRequestKey('starter',requestedTask));
  for(const invalid of ['짧음','x'.repeat(501),42])await assert.rejects(suggestCurricula({source,level:'starter',consent:true,key:'test-only',requestedTask:invalid,fetchImpl:mockProvider({capture:()=>calls++})}));
  assert.equal(calls,1);
  await assert.rejects(suggestCurricula({source,level:'starter',consent:true,key:'test-only',requestedTask,fetchImpl:mockProvider()}),/확인하지 못/);
});

test('own generic table keeps actual columns; unsupported data is never forced into a sales exercise',async()=>{
  const m=await ownMaterial('설문.csv',Buffer.from('대상,점수\n학생,4\n직장인,5'),{general:true});
  assert.deepEqual(m.source.headers,['대상','점수']);assert.equal(m.source.total,undefined);
  assert.throws(()=>tableSource([['대상','점수'],['학생','=1+1']]),/수식/);
  await assert.rejects(ownMaterial('너무짧음.txt',Buffer.from('단어'),{general:true}),/10~60,000/);
});

test('guides follow task, level and artifact type and preserve independent assistance rules',()=>{
  const curriculum=programCurriculum('ppt'),material={taskId:'ppt',format:'pptx',goal:curriculum.goal,curriculum,saved:true};
  const baseline=lessonGuide({phase:0,step:'compose',level:'starter',material});
  assert.ok(baseline.blocks.some(b=>b.text===curriculum.goal));assert.equal(baseline.choices,undefined);
  const repair=lessonGuide({phase:2,step:'compose',level:'independent',material},'repair');
  const verify=lessonGuide({phase:2,step:'compose',level:'independent',material},'verify');
  assert.notEqual(repair.details.find(d=>d.title.includes('작성 틀')).text,verify.details.find(d=>d.title.includes('작성 틀')).text);
  assert.equal(lessonGuide({phase:3,step:'compose',material}).details,undefined);
  assert.equal(guideCommand('save-response',null,{phase:2,exercise:{curriculum:{format:'pptx'}}},{}),null);
  assert.equal(guideCommand('save-response',null,{phase:3,exercise:{curriculum:{format:'text'}}},{}).type,'SAVE_RESPONSE');
  assert.equal(guideCommand('open-result','../../../secret',{phase:2},{}),null);
  assert.equal(matchesUserRequest({text:'이 문서를 보고서로 정리해 줘',attachmentName:'운영자료.docx'},'운영자료.docx 문서 이 문서를 보고서로 정리해 줘'),true);
});

test('input-file citations are never treated as generated results; only the requested artifact format is linked',()=>{
  const material={format:'text',file:{name:'AI-Bridge_자료_전달_일정_변경.txt'}};
  assert.equal(isResultLink('AI-Bridge_자료_전달_일정_변경.txt 미리보기 열기','',material),false);
  assert.equal(isResultLink('새로운_메일.docx 미리보기 열기','',material),true);
  assert.equal(isResultLink('매출.xlsx','/file/abc',{...material,format:'pptx'}),false);
  assert.equal(isResultLink('발표자료.pptx','/file/abc',{...material,format:'pptx'}),true);
  assert.equal(isResultLink('홍보.png','javascript:alert(1)',{format:'image'}),false);
});
