import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition, activeAttempt, promptIsStale, validateStage, MAX_TEXT } from '../public/legacy/js/state.js';
import { normalizeState, backupText, parseBackup, Repository, STORAGE_KEY, LEGACY_KEY } from '../public/legacy/js/storage.js';
import { exercise, tasks } from '../public/legacy/js/content.js';
import { recordText } from '../public/legacy/js/records.js';
import { renderPage } from '../public/legacy/js/views.js';

const now = '2026-10-29T06:00:00.000Z';
function act(state, type, data = {}) {
  const result = transition(state, { type, now, ...data });
  assert.equal(result.error ?? null, null, result.error?.message);
  return result.state;
}
const field = (state, name, value) => act(state, 'field', { name, value });
function prepared(state = createState()) {
  state = act(state,'start'); state = act(state,'fill-example'); return act(state,'next');
}
function checked(state, group = 'review') {
  for (const key of ['source','requirements','uncertainty']) state = field(state,`${group}.${key}`,'confirmed');
  return state;
}
function challengeDone(state) {
  state = field(state,'challengePrompt','새 자료를 표로 정리하고 원자료 근거를 표시해 주세요.');
  state = field(state,'challengeRan',true);
  state = field(state,'challengeResponse','새 과제의 AI 답변');
  state = checked(state,'challengeReview');
  return field(state,'challengeEvidence','날짜와 수치를 새 자료와 대조한 근거');
}
function completed(state = createState(), revision = true) {
  state = prepared(state); state = field(state,'ran',true); state = act(state,'next');
  state = field(state,'response','최초 AI 답변'); state = checked(state);
  state = field(state,'evidence','원자료와 대조한 근거'); state = field(state,'needsRevision',revision?'yes':'no');
  if (revision) {
    state = field(state,'followup','원문에 없는 이유를 제거해 주세요.'); state = field(state,'followupRan',true);
    state = field(state,'improvedResponse','개선된 AI 답변');
  }
  state = field(state,'improvementNote',revision?'근거 없는 원인 설명을 지웠습니다.':'날짜와 조건이 모두 자료와 일치합니다.');
  state = act(state,'next'); return act(challengeDone(state),'finish');
}
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value) };
}

test('switching tasks and reloading restores independent drafts, tools and progress', () => {
  let state = prepared(); state = field(state,'prompt','내가 직접 다듬은 매출 요청');
  state = act(state,'select-task',{task:'email'}); state = act(state,'select-tool',{tool:'Claude'});
  state = act(state,'start'); state = field(state,'goal','메일 초안');
  state = normalizeState(JSON.parse(JSON.stringify(state)));
  state = act(state,'select-task',{task:'sales'});
  assert.equal(activeAttempt(state).draft.prompt,'내가 직접 다듬은 매출 요청');
  assert.equal(activeAttempt(state).step,1); assert.equal(activeAttempt(state).tool,'ChatGPT');
  state = act(state,'select-task',{task:'email'});
  assert.equal(activeAttempt(state).draft.goal,'메일 초안'); assert.equal(activeAttempt(state).tool,'Claude');
});
test('example fill preserves every user-authored field', () => {
  let state=field(createState(),'goal','내가 쓴 목표'); state=act(state,'fill-example');
  assert.equal(activeAttempt(state).draft.goal,'내가 쓴 목표'); assert.ok(activeAttempt(state).draft.data);
});
test('changed preparation cannot silently advance with an old prompt', () => {
  let state=prepared(); const original=activeAttempt(state).draft.prompt;
  state=act(state,'previous'); state=field(state,'goal','변경된 목표');
  assert.ok(promptIsStale(activeAttempt(state).draft));
  const blocked=transition(state,{type:'next'}); assert.ok(blocked.error); assert.equal(blocked.state,state);
  assert.equal(activeAttempt(state).draft.prompt,original);
  state=act(state,'rebuild-prompt'); state=act(state,'next');
  assert.match(activeAttempt(state).draft.prompt,/변경된 목표/);
  assert.ok(activeAttempt(state).draft.promptVersions.some(v=>v.text===original));
});
test('explicit keep choice preserves a manually edited prompt', () => {
  let state=prepared(); state=field(state,'prompt','수동 요청'); state=act(state,'previous'); state=field(state,'goal','새 목표');
  state=act(state,'keep-prompt'); state=act(state,'next');
  assert.equal(activeAttempt(state).draft.prompt,'수동 요청'); assert.equal(promptIsStale(activeAttempt(state).draft),false);
});
test('editing an executed prompt requires re-execution and archives the old answer', () => {
  let state=prepared(); state=field(state,'ran',true); state=act(state,'next');
  state=field(state,'response','잃으면 안 되는 답변'); state=field(state,'evidence','기존 근거'); state=act(state,'previous');
  state=field(state,'prompt','새 요청'); const a=activeAttempt(state);
  assert.equal(a.draft.ran,false); assert.equal(a.draft.response,''); assert.equal(a.maxStep,1);
  assert.equal(a.draft.previousRuns[0].response,'잃으면 안 되는 답변');
  assert.equal(a.draft.previousRuns[0].evidence,'기존 근거'); assert.ok(transition(state,{type:'next'}).error);
});
test('changing AI invalidates execution and preserves old result with its original tool', () => {
  let state=prepared(); state=field(state,'ran',true); state=field(state,'response','ChatGPT 답변');
  state=act(state,'select-tool',{tool:'Gemini'});
  assert.equal(activeAttempt(state).draft.ran,false);
  assert.equal(activeAttempt(state).draft.previousRuns[0].tool,'ChatGPT');
});
test('previously unlocked step cannot bypass changed preparation', () => {
  let state=prepared(); state=field(state,'ran',true); state=act(state,'next'); state=act(state,'go-step',{step:0});
  state=field(state,'data','바뀐 자료'); assert.ok(transition(state,{type:'go-step',step:2}).error);
});
test('review requires concrete evidence and permits honest uncertainty', () => {
  let state=prepared(); state=field(state,'ran',true); state=act(state,'next');
  state=field(state,'response','답변'); state=checked(state); state=field(state,'review.source','needs-check');
  state=field(state,'needsRevision','no'); state=field(state,'improvementNote','현재 자료로 확인할 수 없는 점은 미확인으로 남깁니다.');
  assert.ok(transition(state,{type:'next'}).error);
  state=field(state,'evidence','원자료에 없어 추가 확인이 필요한 항목이 있습니다.');
  assert.equal(activeAttempt(act(state,'next')).step,3);
});
test('follow-up branch requires execution, improved answer and reflection', () => {
  let state=prepared(); state=field(state,'ran',true); state=act(state,'next'); state=field(state,'response','원 답변');
  state=checked(state); state=field(state,'evidence','대조 근거'); state=field(state,'needsRevision','yes');
  state=field(state,'followup','수정 요청'); assert.equal(transition(state,{type:'next'}).error.field,'followupRan');
  state=field(state,'followupRan',true); assert.equal(transition(state,{type:'next'}).error.field,'improvedResponse');
  state=field(state,'improvedResponse','수정 답변'); assert.equal(transition(state,{type:'next'}).error.field,'improvementNote');
});
test('editing follow-up invalidates completion and archives its improved result', () => {
  let state=completed(); state=act(state,'new-practice'); state=prepared(state);
  state=field(state,'followup','기존 후속 요청'); state=field(state,'followupRan',true);
  state=field(state,'improvedResponse','이전 개선 결과'); state=field(state,'followup','새 후속 요청');
  assert.equal(activeAttempt(state).draft.followupRan,false);
  assert.equal(activeAttempt(state).draft.previousRuns[0].improvedResponse,'이전 개선 결과');
});
test('full completed history remains intact after starting another practice', () => {
  let state=completed(); const record=structuredClone(state.history[0]); state=act(state,'new-practice'); state=act(state,'start');
  assert.deepEqual(state.history[0],record); assert.equal(activeAttempt(state).draft.response,'');
  assert.equal(record.draft.response,'최초 AI 답변'); assert.equal(record.draft.followup,'원문에 없는 이유를 제거해 주세요.');
  assert.equal(record.draft.review.source,'confirmed'); assert.equal(record.draft.improvedResponse,'개선된 AI 답변');
  assert.match(recordText(record),/개선된 AI 답변/); assert.match(recordText(record),/새 과제의 AI 답변/);
});
test('double completion cannot create duplicate records', () => {
  let state=completed(); state=act(state,'finish'); assert.equal(state.history.length,1);
});
test('no automatic history truncation after 30 completions, including backup restore', () => {
  let state=createState();
  for(let i=0;i<35;i++){ state=completed(state,false); state=act(state,'new-practice'); }
  assert.equal(state.history.length,35); assert.equal(parseBackup(backupText(state)).history.length,35);
  assert.equal(new Set(state.history.map(r=>r.id)).size,35);
});
test('independent mode completes without inventing a guided run', () => {
  let state=act(createState(),'select-experience',{experience:'familiar'}); state=act(state,'start-independent');
  state=act(challengeDone(state),'finish'); assert.equal(state.history[0].mode,'independent');
  assert.equal(state.history[0].draft.response,''); assert.ok(state.history[0].draft.challengeResponse);
});
test('editing independent prompt keeps previous results but requires a fresh run', () => {
  let state=act(createState(),'start-independent'); state=challengeDone(state); state=field(state,'challengePrompt','바꾼 독립 요청');
  assert.equal(activeAttempt(state).draft.challengeRan,false); assert.equal(activeAttempt(state).draft.previousChallenges.length,1);
  assert.ok(transition(state,{type:'finish'}).error);
});
test('hint levels and reference access are preserved separately', () => {
  let state=act(createState(),'start-independent'); state=act(state,'hint'); state=act(state,'hint'); state=act(state,'reference',{challenge:true});
  state=act(challengeDone(state),'finish'); const d=state.history[0].draft;
  assert.equal(d.hintLevel,2); assert.equal(d.hintUsed,true); assert.equal(d.challengeReferenceSeen,true);
});
test('all three tasks and levels complete using their actual materials', () => {
  for (const task of Object.keys(tasks)) for (const experience of ['new','tried','familiar']) {
    let state=act(createState(),'select-task',{task}); state=act(state,'select-experience',{experience}); state=completed(state);
    const record=state.history[0]; assert.equal(record.task,task); assert.equal(record.experience,experience);
    assert.equal(record.materials.challenge.data,exercise(task,experience,true).data);
    assert.doesNotThrow(()=>normalizeState(state));
  }
});
test('different levels change exercise requirements and/or data', () => {
  for(const task of Object.keys(tasks)) {
    const first=exercise(task,'new',true), middle=exercise(task,'tried',true), advanced=exercise(task,'familiar',true);
    assert.notEqual(first.brief,middle.brief); assert.notEqual(middle.brief,advanced.brief);
  }
});
test('sales references agree with downloadable CSV totals', () => {
  const sum = csv=>csv.split('\n').slice(1).reduce((n,line)=>n+Number(line.split(',')[2]),0);
  assert.equal(sum(exercise('sales').data),640000);
  assert.equal(sum(exercise('sales','new',true).data),855000);
  assert.equal(sum(exercise('sales','tried',true).data),1325000);
});
test('backup round-trip includes multiple drafts and complete records', () => {
  let state=completed(); state=act(state,'select-task',{task:'summary'}); state=field(state,'goal','백업할 초안');
  assert.deepEqual(parseBackup('\ufeff'+backupText(state)),state);
});
test('maximum-length preparation and generated prompts survive saving and restoring', () => {
  let state=act(createState(),'start');
  for(const name of ['goal','data','format','checks']) state=field(state,name,'가'.repeat(MAX_TEXT));
  state=act(state,'next');
  assert.ok(activeAttempt(state).draft.prompt.length > MAX_TEXT);
  assert.deepEqual(parseBackup(backupText(state)),state);
});
test('malformed, future-version and invalid-type backups fail without altering current state', () => {
  const state=completed(), original=JSON.stringify(state);
  for(const text of ['{','{}',backupText({...state,version:99}),backupText({...state,view:'unknown'})]) assert.throws(()=>parseBackup(text));
  const malicious=structuredClone(state); malicious.drafts.sales.draft.goal={html:'bad'};
  assert.throws(()=>parseBackup(backupText(malicious))); assert.equal(JSON.stringify(state),original);
});
test('fractional steps, invalid catalog ids, duplicate records and oversized fields are rejected', () => {
  const state=completed();
  for(const mutate of [s=>s.drafts.sales.step=1.5,s=>s.task='__proto__',s=>s.history.push(s.history[0]),s=>s.drafts.sales.draft.goal='x'.repeat(MAX_TEXT+1)]) {
    const s=structuredClone(state); mutate(s); assert.throws(()=>normalizeState(s));
  }
});
test('storage quota failures are visible and a successful retry clears the failure', () => {
  let fail=true; const storage=memory(); const set=storage.setItem; storage.setItem=(...args)=>{if(fail)throw Error('QuotaExceededError');set(...args);};
  const repo=new Repository(()=>storage); const state=repo.load(); assert.equal(repo.save(state),false); assert.equal(repo.status.kind,'error');
  fail=false; assert.equal(repo.save(state),true); assert.equal(repo.status.kind,'saved');
});
test('failed restore writes leave the existing stored state intact', () => {
  const original=createState(), incoming=completed();
  const storage=memory({[STORAGE_KEY]:JSON.stringify(original)});
  storage.setItem=()=>{throw Error('QuotaExceededError');};
  const repo=new Repository(()=>storage); repo.load();
  assert.equal(repo.save(parseBackup(backupText(incoming)),{recovery:true}),false);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)),original);
});
test('corrupt storage is never silently overwritten', () => {
  const storage=memory({[STORAGE_KEY]:'{broken'}); const repo=new Repository(()=>storage); const state=repo.load();
  assert.equal(repo.blocked,true); assert.equal(repo.save(state),false); assert.equal(storage.values.get(STORAGE_KEY),'{broken');
  assert.equal(repo.save(state,{recovery:true}),true); assert.doesNotThrow(()=>normalizeState(JSON.parse(storage.values.get(STORAGE_KEY))));
});
test('unavailable localStorage still allows a temporary in-memory session', () => {
  const repo=new Repository(()=>{throw Error('SecurityError');}); const state=repo.load();
  assert.equal(state.view,'home'); assert.equal(repo.status.kind,'error'); assert.doesNotThrow(()=>renderPage(state,{blocked:repo.blocked}));
});
test('legacy migration preserves saved drafts and history while retaining the original storage key', () => {
  const old={task:'sales',tool:'ChatGPT',experience:'tried',view:'practice',step:3,maxStep:3,started:true,
    draft:{goal:'이전 목표',prompt:'이전 요청',response:'이전 답변',followup:'이전 후속',ran:true,checkSource:true},
    history:[{id:'old',date:now,task:'email',title:'메일',tool:'Claude',prompt:'보관 요청',evidence:'보관 근거',challengePrompt:'새 요청',challengeEvidence:'새 근거',hintUsed:true}]};
  const raw=JSON.stringify(old), storage=memory({[LEGACY_KEY]:raw}), repo=new Repository(()=>storage); const state=repo.load();
  assert.equal(state.drafts.sales.draft.response,'이전 답변'); assert.equal(state.drafts.sales.draft.followup,'이전 후속');
  assert.equal(state.history[0].mode,'legacy'); assert.equal(state.history[0].draft.prompt,'보관 요청');
  assert.ok(repo.save(state)); assert.equal(storage.values.get(LEGACY_KEY),raw);
});
test('user-supplied markup stays escaped in live views and history', () => {
  const payload='<img src=x onerror=alert(1)>';
  let state=field(createState(),'goal',payload); state=act(state,'start');
  assert.ok(!renderPage(state).includes(payload)); assert.match(renderPage(state),/&lt;img/);
  state=completed(); state.history[0].draft.response=payload; state.view='history';
  assert.ok(!renderPage(state).includes(payload)); assert.match(renderPage(state),/&lt;img/);
});
test('every workflow view renders from a normalized state without network dependencies', () => {
  let state=createState();
  for(const view of ['home','guide','history']) assert.match(renderPage({...state,view}),/id="main"/);
  state=prepared(); assert.match(renderPage(state),/내 요청을 AI에서 실행/);
  state=completed(); assert.match(renderPage(normalizeState(state)),/기록이 남았어요/);
});

