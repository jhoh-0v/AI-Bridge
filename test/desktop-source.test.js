import test from 'node:test';
import assert from 'node:assert/strict';
import { salesSource, parseCsv, sourceForSession, cleanExercise } from '../lib/coach/source.mjs';
import { checkWorkbook } from '../lib/coach/workbook-check.mjs';
import { createSession, updateDraft, submitEvidence, validateSession } from '../lib/coach/session.mjs';
import { ownMaterial, sampleMaterial } from '../desktop/materials.mjs';
import { attachmentState, guideCommand } from '../desktop/guide-model.mjs';
import { lessonGuide } from '../desktop/lesson-guide.mjs';
import { coachFeedback } from '../desktop/ai-coach.mjs';
import { retrieve } from '../lib/coach/retrieval.mjs';

const ownRows=[['월','상품','수량','단가','거래처'],['10월','컵',2,3500,'가게 A'],['10월','컵',2,3500,'가게 A'],['11월','접시',3,2000,'가게 B']];
const own=salesSource(ownRows);
const book={kind:'workbook',sheets:[{name:'매출',rows:[['월','상품','수량','단가','거래처','매출'],...own.rows.map((r,i)=>[...r,`=C${i+2}*D${i+2}`]),['10월','','','','','=F2+F3'],['11월','','','','','=F4'],['전체 합계','','','','','=SUM(F2:F4)']]}]};
const exercise=cleanExercise({version:1,mode:'own',source:own,file:{name:'내매출.csv',sha256:'a'.repeat(64),size:150},aiConsent:true});

test('own source uses actual totals, duplicate records, and extra columns instead of the sample answer',()=>{
  assert.equal(own.total,20000);
  assert.equal(checkWorkbook(book,0,own).passed,5);
  assert.equal(checkWorkbook(book,0).allPassed,false);
  const damaged=structuredClone(book);damaged.sheets[0].rows[1][4]='다른 거래처';
  assert.equal(checkWorkbook(damaged,0,own).checks.find(c=>c.id==='source').pass,false);
  const missing=structuredClone(book);missing.sheets[0].rows.splice(2,1);
  assert.equal(checkWorkbook(missing,0,own).allPassed,false);
});

test('CSV input handles Korean BOM, quoted cells, reordered columns, and refuses unrelated data',async()=>{
  const csv='\uFEFF상품명,판매월,단가,판매수량\r\n"컵, 소형",10월,3500,2\r\n';
  const material=await ownMaterial('내자료.csv',Buffer.from(csv));
  assert.deepEqual(material.source.records,[['10월','컵, 소형',2,3500]]);
  assert.equal(material.source.total,7000);
  assert.throws(()=>salesSource(parseCsv('성명,나이\n홍길동,40')),/월·상품·수량·단가/);
  assert.throws(()=>parseCsv('월,상품\n10월,"닫히지 않음'),/따옴표/);
  assert.throws(()=>salesSource([['월','상품','수량','단가'],['10월','컵','=1+2',2000]]),/수식 대신/);
});

test('custom source survives record reload and only independent assessment changes to the declared new sample',async()=>{
  let s=createSession();s.exercise=exercise;
  s=updateDraft(s,{prompt:'첨부한 내 판매 자료로 매출 엑셀 파일을 만들어 주세요.',environment:'ChatGPT'});
  s=await submitEvidence(s,{workbook:book,file:{name:'결과.xlsx',sha256:'b'.repeat(64)}});
  const restored=validateSession(s);
  assert.equal(restored.submissions[0].sourceHash,exercise.file.sha256);
  assert.equal(restored.submissions[0].checks.passed,5);
  assert.equal(sourceForSession(restored,2).total,20000);
  assert.notEqual(sourceForSession(restored,3).total,20000);
  assert.equal(restored.exercise.aiConsent,true);
});

test('attachment completion requires the prepared bytes and an actual visible attachment',()=>{
  const material=sampleMaterial(),context={material};
  assert.equal(attachmentState(context,null,false).state,'missing');
  assert.equal(attachmentState(context,{...material.file,sha256:'b'.repeat(64)},true).state,'wrong');
  assert.equal(attachmentState(context,material.file,false).state,'uploading');
  assert.equal(attachmentState(context,material.file,true).state,'ready');
  assert.equal(guideCommand('level','starter',{phase:0},{turns:[]}),null);
  assert.equal(guideCommand('sample',null,{phase:0,exercise},{turns:[]}),null);
});

test('first overlay explains the task without a level selector or inserting a ready-made prompt',()=>{
  const g=lessonGuide({phase:0,step:'compose',level:'starter',material:{rows:3,mode:'own'}});
  assert.equal(g.choices,undefined);
  assert.ok(g.blocks.some(b=>b.text.includes('한두 문장')));
  assert.equal(g.details,undefined);
  assert.equal(g.actions,undefined);
  const independent=lessonGuide({phase:3,step:'prepare',level:'starter',material:{saved:false}});
  assert.equal(independent.blocks,undefined);
  assert.deepEqual(independent.actions.map(a=>a.id),['sample']);
});

test('AI feedback sends actual evidence plus retrieval, never overrides numeric checks, and honors consent',async()=>{
  const session={...createSession(),exercise},evidence={id:'e',phase:0,prompt:'내 자료로 매출을 정리해 주세요.',workbook:book,checks:checkWorkbook(book,0,own)};
  const sourceId=retrieve('엑셀 원자료 수식 합계 검증 수정 요청').sources[0].id;
  let calls=0,payload;
  const fetchImpl=async(_url,options)=>{calls++;payload=JSON.parse(options.body);return new Response(JSON.stringify({id:'mock-response',status:'completed',model:'mock-model',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'원자료가 유지되었어요.',question:'파일에서 같은 상품이 두 번 기록된 이유를 확인해 볼까요?',checkIds:['source'],sourceIds:[sourceId]})}]}]}),{headers:{'x-request-id':'mock-request'}});};
  await assert.rejects(coachFeedback({session,evidence,fetchImpl}),/연결/);
  await assert.rejects(coachFeedback({session:{...session,exercise:{...exercise,aiConsent:false}},evidence,key:'test-only',fetchImpl}),/전송하지/);
  await assert.rejects(coachFeedback({session,evidence:{...evidence,phase:3},key:'test-only',fetchImpl}),/전송하지/);
  assert.equal(calls,0);
  const feedback=await coachFeedback({session,evidence,key:'test-only',fetchImpl});
  assert.equal(calls,1);assert.equal(payload.store,false);
  assert.equal(JSON.parse(payload.input[1].content).source.total,20000);
  assert.equal(feedback.receipt.requestId,'mock-request');
  assert.equal(feedback.passed,undefined);
  assert.ok(payload.input[0].content.includes('완성 프롬프트'));
});

test('unverified AI citations or API failure produce no fabricated explanation and no retry',async()=>{
  const session={...createSession(),exercise},evidence={phase:0,checks:checkWorkbook(book,0,own)};
  let calls=0;
  await assert.rejects(coachFeedback({session,evidence,key:'test-only',fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}}),/한도/);
  assert.equal(calls,1);
  await assert.rejects(coachFeedback({session,evidence,key:'test-only',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'확인',question:'왜?',checkIds:['invented'],sourceIds:['invented']})}]}]}))}),/근거/);
});
