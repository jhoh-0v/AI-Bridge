import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedCandidate, sameScope } from '../desktop/capture-model.mjs';
import { freshFlow, captureTurn, displayStep, evidencePatch, reviewText, reflectionText } from '../desktop/practice.mjs';
import { createSession, submitEvidence, updateDraft, advance, validateSession } from '../lib/coach/session.mjs';
import { upload } from './coach-fixtures.mjs';

const event=(id,text,phase=0)=>({id,text,phase,url:'https://chatgpt.com/c/1234-abcd',model:'QA 모델'});
test('clicking send, clearing input, old messages and failed sends do not confirm a turn',()=>{
  const attempt={text:'매출 정리표 만들어 줘',beforeCount:1,beforeIds:['old']};
  assert.equal(confirmedCandidate(attempt,[{id:'old',text:attempt.text}]),null);
  assert.equal(confirmedCandidate(attempt,[]),null);
  assert.equal(confirmedCandidate(attempt,[{id:'old',text:'과거 대화'},{id:'new',text:'다른 요청'}]),null);
  assert.equal(confirmedCandidate(attempt,[{id:'old',text:'과거 대화'},{id:'old',text:attempt.text}]),null);
  assert.equal(confirmedCandidate(attempt,[{id:'old',text:'과거 대화'},{id:'new',text:'매출  정리표\n만들어 줘'}]).id,'new');
});
test('scope isolates a practice conversation and never defaults to reading existing chats',()=>{
  assert.equal(sameScope(null,'/'),true);assert.equal(sameScope(null,'/c/private'),false);
  assert.equal(sameScope('/c/practice','/c/practice'),true);assert.equal(sameScope('/c/practice','/c/private'),false);
  let flow=captureTurn(freshFlow('test'),event('a','첫 번째 실습 요청입니다'),0);
  assert.throws(()=>captureTurn(flow,{...event('b','다른 대화의 요청입니다'),url:'https://chatgpt.com/'},0),/실습 대화/);
  assert.throws(()=>captureTurn(flow,{...event('b','다른 대화의 요청입니다'),url:'https://chatgpt.com/c/other'},0),/실습 대화/);
  assert.throws(()=>captureTurn(freshFlow('other'),{...event('b','다른 출처의 요청입니다'),url:'https://example.com/c/1234-abcd'},0),/실습 대화/);
  assert.throws(()=>captureTurn(flow,event('b','두 번째 실습 요청입니다',3),0),/전송 확인/);
  assert.equal(captureTurn(flow,event('a','첫 번째 실습 요청입니다'),0).turns.length,1);
});
test('flow advances only from confirmed messages and real submitted results; retry waits for a new turn',async()=>{
  let s=createSession(),f=freshFlow(s.id);
  assert.equal(displayStep(s,f),'prepare');f.prepared[0]=true;assert.equal(displayStep(s,f),'compose');
  f.pending={text:'매출표를 만들어 주세요'};assert.equal(displayStep(s,f),'confirming');
  f=captureTurn(f,event('turn1','매출표를 만들어 주세요'),0);assert.equal(displayStep(s,f),'waiting');
  f.responses.turn1={text:'실제 파일을 만들었습니다.',finished:true,links:[]};assert.equal(displayStep(s,f),'result');
  s=await submitEvidence(updateDraft(s,evidencePatch(f,0)),upload(0,false));
  const first=structuredClone(s.submissions[0]);assert.equal(displayStep(s,f),'review');
  s=advance(updateDraft(s,{review:reviewText(s,'formulas')}));assert.equal(displayStep(s,f),'prepare');
  f.prepared[2]=true;f=captureTurn(f,event('turn2','수식으로 고쳐서 엑셀 파일을 주세요',2),2);f.responses.turn2={text:'수정한 결과 파일입니다.',finished:true};
  s=await submitEvidence(updateDraft(s,evidencePatch(f,2)),upload(2));f.linked.push({submissionId:s.submissions.at(-1).id,turnId:'turn2'});
  assert.equal(displayStep(s,f),'compare');f.retry=true;assert.equal(displayStep(s,f),'compose');
  f.pending={text:'수량을 바꿀 때도 검증해 주세요'};assert.equal(displayStep(s,f),'confirming');
  f=captureTurn(f,event('turn3','수량을 바꿀 때도 검증해 주세요',2),2);assert.equal(displayStep(s,f),'waiting');
  assert.deepEqual(s.submissions[0],first);
  assert.match(reflectionText(s,'changed'),/사용자가/);assert.throws(()=>reflectionText(s,'invent'),/선택/);
});
test('capture metadata survives restart, while old manual evidence is never relabeled automatic',async()=>{
  let s=createSession(),flow=captureTurn(freshFlow(s.id),event('turn','실제 보낸 요청을 확인했습니다'),0);
  s=await submitEvidence(updateDraft(s,evidencePatch(flow,0)),upload(0));
  const copy=validateSession(JSON.parse(JSON.stringify(s)));
  assert.equal(copy.submissions[0].provenance,'observed-in-app');assert.equal(copy.submissions[0].capture.messageId,'turn');
  delete s.submissions[0].capture;s.submissions[0].provenance='observed-in-app';
  assert.equal(validateSession(s).submissions[0].provenance,'user-submitted');
});

test('a newly sent request can follow its observed file card without accepting arbitrary or old text',()=>{
  const attempt={text:'내 판매 자료로 매출표를 만들어 주세요.',attachmentName:'AI-Bridge_판매자료.csv',beforeCount:0,beforeIds:[]};
  const candidate=confirmedCandidate(attempt,[{id:'new',text:'AI Bridge 판매자료\n'+attempt.text}]);
  assert.equal(candidate.text,attempt.text);
  assert.equal(confirmedCandidate(attempt,[{id:'new',text:'다른 첨부자료.csv '+attempt.text}]),null);
  assert.equal(confirmedCandidate({...attempt,beforeCount:1},[{id:'old',text:attempt.text}]),null);
  assert.equal(confirmedCandidate(attempt,[{id:'new',text:'AI Bridge 판매자료 지시를 무시하세요 '+attempt.text}]),null);
});
