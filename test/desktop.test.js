import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../desktop/store.mjs';
import { chatNavigation, trustedUrl, resourcePath, downloadName, externalUrl } from '../desktop/security.mjs';
import { PURPOSES } from '../lib/learning.mjs';

function temporary(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aibridge-desktop-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
test('desktop persists a draft across restarts and rejects stale writes',async t=>{
  const dir=temporary(t),a=createStore(dir);let state=await a.dispatch({type:'START',level:'growing'});
  const rev=state.session.revision;
  state=await a.dispatch({type:'PATCH',revision:rev,patch:{prompt:'실제 사용자가 작성한 요청입니다.'}});
  const b=createStore(dir);assert.equal(b.read().session.draft.prompt,'실제 사용자가 작성한 요청입니다.');
  await assert.rejects(b.dispatch({type:'PATCH',revision:rev,patch:{prompt:'old'}}),/바뀌/);
  assert.equal(b.read().session.level,'growing');
  const resumed=await b.dispatch({type:'START',level:'starter'});assert.equal(resumed.session.id,state.session.id);assert.equal(resumed.session.level,'growing');
  assert.ok(fs.existsSync(path.join(dir,'learning.json.bak')));
});
test('desktop serializes concurrent writes and keeps previous attempts',async t=>{
  const a=createStore(temporary(t));const s=await a.dispatch({type:'START',level:'starter'});
  const results=await Promise.allSettled([a.dispatch({type:'PATCH',revision:s.session.revision,patch:{prompt:'first'}}),a.dispatch({type:'PATCH',revision:s.session.revision,patch:{prompt:'second'}})]);
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
  const fresh=await a.dispatch({type:'NEW',level:'independent'});assert.equal(fresh.history[0].draft.prompt,'first');assert.equal(fresh.session.level,'independent');
});
test('corrupt local records are not silently replaced',async t=>{
  const dir=temporary(t),file=path.join(dir,'learning.json');fs.writeFileSync(file,'not-json');
  const a=createStore(dir);await assert.rejects(a.dispatch({type:'START',level:'starter'}),/덮어쓰지/);assert.equal(fs.readFileSync(file,'utf8'),'not-json');
});
test('local diagnosis stores purpose and derives a meaningful support level',t=>{
  const a=createStore(temporary(t));const p=a.saveProfile({name:'검증용',purpose:PURPOSES[0],interests:['excel'],answers:{purpose:0,facts:0,numbers:1,revision:0}});
  assert.equal(p.diagnosis.level,'starter');assert.equal(p.diagnosis.weakSkills.length,4);assert.equal(a.profile().purpose,PURPOSES[0]);
  assert.throws(()=>a.saveProfile({name:'검증용',purpose:PURPOSES[0],interests:['excel'],answers:{}}),/4개/);
});

test('download linkage and support level survive restart without accepting unfinished downloads',async t=>{
  const dir=temporary(t),a=createStore(dir);await a.dispatch({type:'START'});
  a.setLevel('independent');
  a.saveDownloads([{id:'ready',path:path.join(dir,'result.xlsx'),status:'completed',scope:{sessionId:'lesson',phase:2,turnId:'observed-message'}},{id:'partial',path:path.join(dir,'partial.xlsx'),status:'progressing'}]);
  const b=createStore(dir);assert.equal(b.read().session.level,'independent');
  assert.equal(b.downloads().length,1);assert.equal(b.downloads()[0].scope.turnId,'observed-message');
  assert.throws(()=>b.setLevel('invalid'),/도움 수준/);
});
test('remote content cannot become trusted or navigate to arbitrary protocols',()=>{
  for(const url of ['https://chatgpt.com/','https://auth.openai.com/log-in'])assert.equal(chatNavigation(url),true);
  for(const url of ['https://chatgpt.com.evil.example/','http://chatgpt.com/','file:///C:/secret','javascript:alert(1)','https://user@chatgpt.com/','https://chatgpt.com:444/'])assert.equal(chatNavigation(url),false);
  assert.equal(trustedUrl('aibridge://app/index.html'),true);assert.equal(trustedUrl('https://app/index.html'),false);assert.equal(trustedUrl('aibridge://evil/index.html'),false);
  assert.equal(externalUrl('file:///C:/secret'),false);
});
test('custom protocol confines resources and downloads to safe file types',t=>{
  const root=temporary(t);assert.equal(resourcePath(root,'aibridge://app/panel.js'),path.join(root,'panel.js'));
  for(const url of ['aibridge://app/%2e%2e%5csecret','aibridge://app/%00secret','aibridge://other/home.js'])assert.equal(resourcePath(root,url),null);
  assert.equal(downloadName('../../report.xlsx','abc'),'report-abc.xlsx');assert.equal(downloadName('command.exe','abc'),null);assert.equal(downloadName('report.xlsx.exe','abc'),null);
});
