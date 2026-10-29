import test from 'node:test';
import assert from 'node:assert/strict';
import { modelAdvice, hasOwnRequest, placeGuide, guideCommand } from '../desktop/guide-model.mjs';
import { lessonGuide } from '../desktop/lesson-guide.mjs';
import { sourceText } from '../desktop/practice.mjs';

test('model advice uses visible available choices and never recommends a locked upgrade',()=>{
  assert.equal(modelAdvice([{label:'Thinking',disabled:true},{label:'Pro 업그레이드'},{label:'Auto'}]).preferred.label,'Auto');
  assert.equal(modelAdvice([{label:'6'},{label:'GPT-5.6 Sol'}]).preferred.label,'GPT-5.6 Sol');
  assert.equal(modelAdvice([{label:'잠김'},{label:'Unknown model',disabled:true}]).preferred,undefined);
});
test('source material alone is not treated as the learner writing a request',()=>{
  const source=sourceText(0);
  assert.equal(hasOwnRequest(source,source),false);
  assert.equal(hasOwnRequest(source+'이 자료로 매출 파일을 만들어 주세요.',source),true);
  assert.equal(hasOwnRequest('원자료를 유지하고 수식을 수정해 주세요.',''),true);
});
test('explanations fit without covering the open model menu or the composer',()=>{
  for(const r of [{left:830,right:1110,top:290,bottom:620},{left:260,right:1100,top:650,bottom:800}])for(const height of [235,520]){
    const p=placeGuide(r,{width:348,height},{width:1400,height:860});
    assert.ok(p.left>=16&&p.top>=16&&p.left+348<=1384&&p.top+height<=844);
    assert.ok(p.left+348<=r.left||p.left>=r.right||p.top+height<=r.top||p.top>=r.bottom);
  }
});
test('remote overlay can only submit narrowly validated learning choices for the current phase',()=>{
  const s={phase:3,revision:7,submissions:[],draft:{answers:{}}},flow={turns:[]};
  assert.equal(guideCommand('SAVE_FILE','x',s,flow),null);
  assert.equal(guideCommand('download','https://evil.test',s,flow),null);
  assert.equal(guideCommand('review','foo',s,flow),null);
  assert.equal(guideCommand('answer','__proto__:1',s,flow),null);
  assert.equal(guideCommand('answer','verify:6',s,flow),null);
  assert.deepEqual(guideCommand('answer','verify:2',s,flow).patch.answers,{verify:2});
  assert.equal(guideCommand('level','starter',{...s,phase:0},{turns:[{}]}),null);
});
test('baseline remains uncoached, independent practice does not expose the template or answers',()=>{
  const first=lessonGuide({phase:0,step:'compose',level:'starter'});
  assert.equal(first.details,undefined);
  const independent=lessonGuide({phase:3,step:'compose',level:'starter',lesson:{}});
  assert.equal(independent.details,undefined);
  const quiz=lessonGuide({phase:3,step:'quiz',lesson:{}});
  assert.ok(quiz.questions.every(q=>q.correct===undefined));
  assert.equal(quiz.actions[0].disabled,true);
});
