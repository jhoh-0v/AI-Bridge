import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleBridge } from '../lib/service.mjs';
import { TASK_BY_ID, PURPOSES } from '../lib/learning.mjs';
function setup(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_perfect_legion.sql',import.meta.url),'utf8'));
  const db={prepare:sql=>({bind:(...params)=>({
    first:async()=>sqlite.prepare(sql).get(...params)||null,
    all:async()=>({results:sqlite.prepare(sql).all(...params)}),
    run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}})
  })})};
  const user={userId:'test-user',email:'learner@example.test',displayName:'학습자'};
  const env={db,user,key:'test-key-placeholder'};
  const call=async(path,method='GET',data,overrides={})=>{
    const response=await handleBridge(new Request('https://bridge.test/api/bridge/'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://bridge.test'},...(data?{body:JSON.stringify(data)}:{})}),{...env,...overrides});return {status:response.status,data:await response.json()};
  };
  return{sqlite,env,call};
}
const profile={name:'학습자',role:'사무',purpose:PURPOSES[0],interests:['email','excel'],answers:{purpose:2,facts:1,numbers:0,revision:2}};
const review=()=>Object.fromEntries([0,1,2].map(i=>[i,{status:'pass',evidence:'자료의 날짜와 조건을 직접 대조했습니다.'}]));
function fakeAI(t){const original=globalThis.fetch;let count=0;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const request=JSON.parse(options.body);count++;return Response.json({id:'resp_'+count,model:request.model,status:'completed',usage:{input_tokens:30,output_tokens:40},output:[{content:[{type:'output_text',text:JSON.stringify({kind:'document',title:'검증용 메일',sections:[{heading:'본문',body:'11월 3일에서 11월 5일로 변경을 요청합니다.'}]})}]}]},{headers:{'x-request-id':'upstream-'+count}});};t.after(()=>{globalThis.fetch=original;});return()=>count;}
test('authenticated signup persists server-scored diagnosis and isolates accounts',async()=>{const{call,sqlite}=setup();assert.equal((await call('profile','POST',profile,{user:null})).status,401);assert.equal((await call('profile','POST',{...profile,diagnosis:{score:0}})).status,200);let b=(await call('bootstrap')).data;assert.equal(b.profile.diagnosis.score,4);assert.equal(b.profile.name,'학습자');b=(await call('bootstrap','GET',null,{user:{userId:'other',email:'other@example.test'}})).data;assert.equal(b.profile,null);assert.equal(b.attempts.length,0);sqlite.close();});
test('profile and cross-origin payloads fail before any mutation',async()=>{const{call,env,sqlite}=setup();assert.equal((await call('profile','POST',{...profile,interests:['bad']})).status,400);const response=await handleBridge(new Request('https://bridge.test/api/bridge/profile',{method:'POST',headers:{Origin:'https://evil.test'},body:JSON.stringify(profile)}),env);assert.equal(response.status,403);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,0);sqlite.close();});
test('full real service state path preserves immutable first result, revision evidence and independent attempt',async t=>{
  const count=fakeAI(t),{call,sqlite}=setup();await call('profile','POST',profile);let a=(await call('attempts','POST',{taskId:'email'})).data.attempt;
  assert.equal((await call('attempts/'+a.id,'PATCH',{revision:a.revision,step:2,draft:a.draft})).status,400);
  let r=await call('generate','POST',{attemptId:a.id,phase:'baseline',prompt:'일정 변경 메일을 써주세요.',requestId:'baseline-request-0001'});assert.equal(r.status,200);a=r.data.attempt;
  const first=structuredClone(a.generations[0]);assert.ok(first.receipt.requestId);assert.equal(first.sourceHash.length,64);
  assert.equal((await call('generate','POST',{attemptId:a.id,phase:'baseline',prompt:'다른 첫 요청입니다.',requestId:'baseline-request-0002'})).status,409);
  assert.equal((await call('generate','POST',{attemptId:a.id,phase:'baseline',prompt:'중복 전송 테스트입니다.',requestId:'baseline-request-0001'})).status,200);assert.equal(count(),1);
  a.draft.review=review();a.draft.baselinePrompt='원본을 바꾸려는 요청';a=(await call('attempts/'+a.id,'PATCH',{revision:a.revision,step:2,draft:a.draft})).data.attempt;
  assert.equal(a.draft.baselinePrompt,first.prompt);
  a=(await call('generate','POST',{attemptId:a.id,phase:'after',prompt:'상대 동의가 아직 없으므로 확정이 아니라 정중한 요청으로 수정해 주세요.',requestId:'after-request-0001'})).data.attempt;
  assert.deepEqual(a.generations[0],first);assert.equal(a.generations[1].sourceHash,first.sourceHash);assert.equal(a.generations[1].receipt.model,first.receipt.model);assert.equal(a.generations[1].parentId,first.id);assert.equal(a.generations[1].previousHash,first.outputHash);
  assert.equal((await call('attempts/'+a.id,'PATCH',{revision:a.revision,step:3,draft:a.draft})).status,400);
  a.draft.afterReview=review();a.draft.reflection='확정 표현을 요청 표현으로 바꾼 것을 확인했습니다.';
  a=(await call('attempts/'+a.id,'PATCH',{revision:a.revision,step:3,draft:a.draft})).data.attempt;
  a=(await call('generate','POST',{attemptId:a.id,phase:'independent',prompt:'새로운 협력사에게 두 후보 일정을 제안하는 메일을 작성해 주세요.',requestId:'independent-request-0001'})).data.attempt;
  assert.notEqual(a.generations[2].sourceHash,first.sourceHash);
  a.draft.challengeReview=review();a=(await call('attempts/'+a.id,'PATCH',{revision:a.revision,step:3,draft:a.draft,completed:true})).data.attempt;assert.equal(a.completed,true);
  assert.equal((await call('attempts/'+a.id,'PATCH',{revision:a.revision,draft:a.draft})).status,409);assert.equal(count(),3);sqlite.close();
});
test('another member cannot read an attempt or its image',async()=>{const{call,sqlite}=setup();await call('profile','POST',profile);const a=(await call('attempts','POST',{taskId:'image'})).data.attempt;const other={user:{userId:'other',email:'other@example.test'}};assert.equal((await call('attempts/'+a.id,'GET',null,other)).status,404);assert.equal((await call('images/not-mine','GET',null,other)).status,404);sqlite.close();});
test('optimistic revision refuses stale tab writes and preserves current content',async()=>{const{call,sqlite}=setup();await call('profile','POST',profile);let a=(await call('attempts','POST',{taskId:'ppt'})).data.attempt;const old=a.revision;a.draft.baselinePrompt='저장해야 하는 최신 요청입니다.';a=(await call('attempts/'+a.id,'PATCH',{revision:old,draft:a.draft})).data.attempt;const stale=await call('attempts/'+a.id,'PATCH',{revision:old,draft:{baselinePrompt:'오래된 요청입니다.'}});assert.equal(stale.status,409);assert.equal((await call('attempts/'+a.id)).data.attempt.draft.baselinePrompt,'저장해야 하는 최신 요청입니다.');sqlite.close();});
test('no key produces no result; per-user quota blocks additional model calls',async t=>{const count=fakeAI(t),{call,sqlite}=setup();await call('profile','POST',profile);const a=(await call('attempts','POST',{taskId:'email'})).data.attempt;const data={attemptId:a.id,phase:'baseline',prompt:'메일을 작성해 주세요.',requestId:'quota-request-00001'};assert.equal((await call('generate','POST',data,{key:''})).status,503);assert.equal(count(),0);assert.equal((await call('generate','POST',data,{dailyTextLimit:1})).status,200);const b=(await call('attempts','POST',{taskId:'email'})).data.attempt;assert.equal((await call('generate','POST',{...data,attemptId:b.id,requestId:'quota-request-00002'},{dailyTextLimit:1})).status,429);assert.equal(count(),1);sqlite.close();});
test('abandoned generation releases its reservation without an automatic paid retry',async t=>{
  const count=fakeAI(t),{call,sqlite,env}=setup();await call('profile','POST',profile);
  const a=(await call('attempts','POST',{taskId:'email'})).data.attempt;
  sqlite.prepare('INSERT INTO generations(id,user_id,attempt_id,request_id,phase,status,data,created_at) VALUES(?,?,?,?,?,?,?,?)').run('abandoned',env.user.userId,a.id,'abandoned-request','baseline','pending',JSON.stringify({prompt:'중단된 요청입니다.'}),new Date(Date.now()-11*60*1000).toISOString());
  const loaded=(await call('attempts/'+a.id)).data.attempt;assert.equal(loaded.generations[0].status,'failed');assert.match(loaded.generations[0].error,/중단/);assert.equal(count(),0);
  const result=await call('generate','POST',{attemptId:a.id,phase:'baseline',prompt:'사용자가 직접 새로 요청한 메일입니다.',requestId:'explicit-retry-0001'});assert.equal(result.status,200);assert.equal(count(),1);sqlite.close();
});
