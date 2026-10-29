import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createSession, updateDraft, submitEvidence, advance, validateSession } from '../lib/coach/session.mjs';
import { cleanExercise } from '../lib/coach/source.mjs';
import { PROGRAMS, lessonQuestions } from '../lib/coach/programs.mjs';
import { programFile } from '../desktop/materials.mjs';
import { freshFlow, captureTurn, evidencePatch, recordResult, mergeObservedHistory, resultDownloadScope } from '../desktop/practice.mjs';
import { dialogueSnapshot, analyseDialogue, createDialogueQueue } from '../desktop/dialogue-coach.mjs';
import { lessonGuide } from '../desktop/lesson-guide.mjs';
import { guideCommand } from '../desktop/guide-model.mjs';
import { matchKnownTurns, isResultLink } from '../desktop/capture-model.mjs';
import { codexArguments } from '../desktop/codex-coach.mjs';

function session(taskId='excel'){
 const s=createSession();s.exercise=cleanExercise({version:3,dialogueLearning:true,aiConsent:true,mode:'sample',taskId,file:programFile(taskId).file});return s;
}
function turn(flow,id,request,answer,phase=0){
 const f=captureTurn(flow,{id,text:request,phase,url:'https://chatgpt.com/c/our-practice'},phase);
 if(answer!==undefined)f.responses[id]={text:answer,finished:true,links:[]};return f;
}
function valid(payload){const last=payload.transcript.at(-1);return {goal:'지점별 매출 비교 보고서 작성',title:'비교 기준을 정해 봐요',observation:'최근 요청에서 비교할 대상을 바꾸었어요.',action:'매출과 이익 중 무엇을 비교할지 골라 보세요.',why:'같은 기준이어야 차이를 설명할 수 있어요.',kind:'suggestion',checks:['자료의 지점명이 맞나요?','비교 기간이 같나요?'],nextSteps:['비교 기준 직접 정하기','결과에서 원자료와 숫자 대조하기'],evidence:[{ref:'request:'+last.id,quote:last.request}],sourceIds:[payload.knowledge[0].id]};}

test('live feedback includes all prior turns, changed goals, RAG and actual file content',async()=>{
 const s=session();let f=turn(freshFlow(s.id),'a','월별 매출을 정리해줘','1월 매출은 30만 원입니다.');
 f=turn(f,'b','아니 지점별로 비교해서 보고서를 만들어줘','보고서 파일입니다.');
 const upload={file:{name:'보고서.docx',sha256:'a'.repeat(64)},artifact:{kind:'document',text:'동부 300000 서부 200000'}};
 f=recordResult(f,{id:'doc',scope:{sessionId:s.id,phase:0,turnId:'b'}},upload,upload.file.sha256);
 const snap=dialogueSnapshot(s,f);
 const result=await analyseDialogue({snapshot:snap,generate:async({payload})=>{
  assert.equal(payload.transcript.length,2);assert.equal(payload.transcript[0].answer,'1월 매출은 30만 원입니다.');
  assert.equal(payload.transcript[1].files[0].content.text,upload.artifact.text);
  assert.ok(payload.knowledge.length);assert.ok(payload.referenceTexts['file:doc']);return {value:valid(payload),receipt:{provider:'test'}};
 }});
 assert.equal(result.goal,'지점별 매출 비교 보고서 작성');assert.equal(result.receipt.turnCount,2);assert.equal(result.receipt.fileCount,1);
});

test('a one-character follow-up keeps the earlier context and streaming is not treated as a completed answer',()=>{
 const s=session();let f=turn(freshFlow(s.id),'a','지점별 매출을 비교해 주세요.','지점 비교를 도와드릴까요?');
 f=turn(f,'b','네');f.responses.b={text:'아직 작성 중',finished:false,links:[]};
 const snap=dialogueSnapshot(s,f);assert.equal(snap.payload.transcript[1].request,'네');assert.equal(snap.payload.transcript[1].answer,null);
 const key=snap.key;f.responses.b.text='작성 중 내용 변경';assert.equal(dialogueSnapshot(s,f).key,key);
 f.responses.b.finished=true;assert.notEqual(dialogueSnapshot(s,f).key,key);
});

test('file-only responses, multiple formats and late downloads belong to their originating turn',()=>{
 const s=session();let f=turn(freshFlow(s.id),'a','엑셀로 만들어줘','');f.responses.a.links=[{id:'link-a-0',label:'결과.xlsx'}];
 f=turn(f,'b','결과를 보고서로도 만들어줘','문서로 바꾸었습니다.');
 const upload={file:{name:'결과.xlsx',sha256:'b'.repeat(64)},workbook:{kind:'workbook',sheets:[{name:'요약',rows:[['매출',300000]]}]}};
 const d={id:'file-a',scope:{sessionId:s.id,phase:0,turnId:'a'}};
 f=recordResult(f,d,upload,upload.file.sha256);
 const snap=dialogueSnapshot(s,f);assert.equal(snap.payload.transcript[0].generatedFiles.length,1);
 assert.equal(snap.payload.transcript[0].files[0].content.sheets[0].rows[0][1],300000);assert.equal(snap.payload.transcript[1].files.length,0);
 const repeated=recordResult(f,{...d,id:'downloaded-again'},upload,upload.file.sha256);assert.equal(dialogueSnapshot(s,repeated).key,snap.key);
 assert.throws(()=>recordResult(f,{...d,scope:{...d.scope,sessionId:'another'}},upload,upload.file.sha256),/실습/);
 assert.throws(()=>recordResult(f,d,upload,'wrong'),/내용/);
 for(const name of ['결과.xlsx','결과.pptx','결과.docx','결과.png','결과.pdf','결과.csv'])assert.ok(isResultLink(name,'',{flexible:true,format:'xlsx'}));
 assert.equal(isResultLink('원자료.xlsx','',{flexible:true,file:{name:'원자료.xlsx'}}),false);
});

test('downloads from an open file viewer retain the observed result association without adopting unrelated files',()=>{
 const s=session(),f=turn(freshFlow(s.id),'a','표를 엑셀로','파일');f.responses.a.links=[{label:'결과.xlsx 미리보기 열기'}];
 const pending={sessionId:s.id,turnId:'a',phase:0,at:1000};
 const input={pending,flow:f,sessionId:s.id,filename:'결과.xlsx',conversation:f.conversation,now:121000};
 assert.equal(resultDownloadScope(input).turnId,'a');assert.equal(resultDownloadScope({...input,filename:'다른파일.xlsx'}),null);
 assert.equal(resultDownloadScope({...input,conversation:'/c/another'}),null);assert.equal(resultDownloadScope({...input,sessionId:'another'}),null);
 assert.equal(resultDownloadScope({...input,now:2000000}),null);
 assert.equal(resultDownloadScope({...input,pending:null}).turnId,'a');
 const ambiguous=turn(f,'b','다시 만들어줘','파일');ambiguous.responses.b.links=f.responses.a.links;
 assert.equal(resultDownloadScope({...input,flow:ambiguous,pending:null}),null);
});

test('file metadata is explicitly unread and invented quotations or one-sided error claims are rejected',async()=>{
 const s=session();let f=turn(freshFlow(s.id),'a','매출을 확인해줘','매출은 10만 원');
 f.artifacts={p:{downloadId:'p',turnId:'a',file:{name:'결과.pdf'},status:'unread',error:'읽을 수 없음'}};
 const snapshot=dialogueSnapshot(s,f);assert.equal(snapshot.payload.transcript[0].files[0].content,null);
 await assert.rejects(analyseDialogue({snapshot,generate:async({payload})=>({value:{...valid(payload),evidence:[{ref:'answer:a',quote:'없는 숫자 999만원'}]}})}),/근거/);
 await assert.rejects(analyseDialogue({snapshot,generate:async({payload})=>({value:{...valid(payload),kind:'mismatch'}})}),/비교 근거/);
 const result=await analyseDialogue({snapshot,generate:async({payload})=>({value:{...valid(payload),kind:'mismatch',evidence:[{ref:'request:a',quote:'매출을 확인해줘'},{ref:'answer:a',quote:'10만 원'}]}})});
 assert.equal(result.kind,'mismatch');
});

test('consent and independent practice stop analysis at the data boundary, completion permits reflection',()=>{
 const s=session(),f=turn(freshFlow(s.id),'a','실습을 시작해요','결과');s.exercise.aiConsent=false;
 assert.equal(dialogueSnapshot(s,f),null);s.exercise.aiConsent=true;s.phase=3;
 assert.equal(dialogueSnapshot(s,f),null);s.phase=4;s.completedAt=new Date().toISOString();
 assert.equal(dialogueSnapshot(s,f).payload.stage,'after-independent');
});

test('coordinator coalesces updates, discards stale feedback and never publishes during independent work',async()=>{
 let current={key:'a',phase:0},release;const calls=[],published=[];
 const q=createDialogueQueue({delay:1,snapshot:()=>current,analyse:async snap=>{calls.push(snap.key);if(snap.key==='a')await new Promise(r=>release=r);return {action:snap.key};},publish:async(snap,result)=>published.push([snap.key,result.status])});
 q.schedule();await sleep(15);assert.deepEqual(calls,['a']);
 current={key:'b',phase:0};q.schedule();current={key:'c',phase:0};q.schedule();release();await sleep(30);
 assert.deepEqual(calls,['a','c']);assert.ok(!published.some(([key,status])=>key==='a'&&status==='done'));
 q.schedule();await sleep(10);assert.equal(calls.length,2);
 current=null;q.schedule();await sleep(10);assert.equal(calls.length,2);q.close();
});

test('late coach results are hidden when independent practice starts; errors wait for an explicit retry',async()=>{
 let current={key:'a'},release,count=0;const published=[];
 const q=createDialogueQueue({delay:1,snapshot:()=>current,analyse:async()=>{count++;await new Promise(r=>release=r);throw Error('일시 오류');},publish:async(s,r)=>published.push(r.status)});
 q.schedule();await sleep(15);current=null;release();await sleep(15);assert.deepEqual(published,['pending']);
 current={key:'b'};q.schedule();await sleep(15);release();await sleep(15);q.schedule();await sleep(10);assert.equal(count,2);assert.equal(published.at(-1),'error');
 q.schedule({retry:true});await sleep(15);assert.equal(count,3);q.close();release();
});

for(const p of PROGRAMS)test(`${p.id}: dialogue learning completes with text only and freezes evidence criteria`,async()=>{
 let s=session(p.id);
 const patch=()=>({prompt:'네',output:'확인',environment:'ChatGPT',learningContext:{goal:'새 작업',checks:['내가 요청한 조건이 맞나요?','자료와 대조했나요?'],inputHash:'a'.repeat(64)}});
 s=await submitEvidence(updateDraft(s,patch()));const before=structuredClone(s.submissions[0]);
 s=advance(updateDraft(s,{review:'실제 받은 답변에서 확인할 부분을 선택했습니다.'}));
 s=await submitEvidence(updateDraft(s,patch()));
 s=advance(updateDraft(s,{reflection:'바꾼 조건이 실제 답변에 반영되었는지 확인했습니다.'}));
 s=await submitEvidence(updateDraft(s,patch()));s=advance(updateDraft(s,{answers:Object.fromEntries(lessonQuestions(p.id).map(q=>[q.id,q.correct]))}));
 s=validateSession(s);assert.equal(s.phase,4);assert.deepEqual(s.submissions[0],before);assert.equal(s.submissions[2].checks.allPassed,false);
});

test('original baseline and native upload proof survive follow-ups and validation',async()=>{
 let s=session(),f=turn(freshFlow(s.id),'a','첫 요청','첫 답변');
 f.baseline={turnId:'a',response:structuredClone(f.responses.a)};f=turn(f,'b','자세하게 수정해줘','좋아진 답변');f.responses.a.text='재생성된 다른 답변';
 f.attachments={0:{kind:'observed-file-upload',name:'샘플.csv',sha256:'a'.repeat(64),at:new Date().toISOString()}};
 const patch=evidencePatch(f,0,f.turns[0]);assert.equal(patch.prompt,'첫 요청');assert.equal(patch.output,'첫 답변');
 s=await submitEvidence(updateDraft(s,patch));assert.equal(validateSession(s).submissions[0].capture.attachment.kind,'observed-file-upload');
});

test('repeated requests are matched chronologically after reload and outside messages are not adopted',()=>{
 const known=[{id:'a',text:'처음'},{id:'b',text:'네'},{id:'c',text:'네'}];
 const messages=['다른 대화','처음','네','네','무관한 요청'].map((text,i)=>({id:'dom-'+i,text,node:i}));
 assert.deepEqual(matchKnownTurns(known,messages).map(m=>m.node),[1,2,3]);
});

test('resume recovers missing earlier turns in the bound practice without replacing immutable evidence or duplicating turns',()=>{
 const s=session();const f=turn(freshFlow(s.id),'b','엑셀로 내려줘','파일입니다.');f.baseline={turnId:'b',response:structuredClone(f.responses.b)};
 const history=[{id:'a',text:'행별 매출을 뽑아줘'},{id:'b',text:'엑셀로 내려줘'},{id:'c',text:'보고서로도 바꿔줘'}];
 const restored=mergeObservedHistory(f,history,2);
 assert.deepEqual(restored.turns.map(t=>t.id),['a','b','c']);assert.deepEqual(restored.turns.map(t=>t.phase),[0,0,2]);
 assert.deepEqual(restored.baseline,f.baseline);assert.equal(mergeObservedHistory(restored,history,2),restored);
 assert.throws(()=>mergeObservedHistory({...f,conversation:null},history,2),/실습/);
});

test('independent overlay hides even previously available feedback and fileless progress remains available',()=>{
 const c={dialogueLearning:true,phase:3,step:'result',canSaveResponse:true,material:{taskId:'excel',goal:'새 과제'},lesson:{},liveCoach:{status:'done',title:'보이면 안 되는 도움'}};
 const g=lessonGuide(c);assert.ok(!JSON.stringify(g).includes('보이면 안 되는 도움'));assert.equal(g.actions[0].id,'save-response');assert.match(g.footer,/마친 뒤/);
 const s=session();s.phase=3;assert.equal(guideCommand('retry-coach',null,s,{}),null);assert.equal(guideCommand('save-response',null,s,{}).type,'SAVE_RESPONSE');
});

test('Codex receives only explicitly attached image copies with tools still disabled',()=>{
 const args=codexArguments({directory:'work',schemaPath:'schema',outputPath:'answer',model:'test',imagePaths:['work/image-0.png']});
 assert.equal(args[args.indexOf('--image')+1],'work/image-0.png');assert.ok(args.includes('shell_tool'));assert.ok(args.includes('read-only'));assert.ok(args.includes('--ignore-user-config'));
});
