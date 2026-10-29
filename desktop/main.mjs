import { app, BrowserWindow, WebContentsView, ipcMain, protocol, net, session, shell, dialog, clipboard, Menu, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createStore } from './store.mjs';
import { APP_ORIGIN, trustedUrl, chatNavigation, externalUrl, resourcePath, downloadName } from './security.mjs';
import { outcome } from '../lib/coach/session.mjs';
import { freshFlow, captureTurn, lastTurn, displayStep, evidencePatch, reviewText, reflectionText, conversationPath, recordResult, mergeObservedHistory, normalizeText, resultDownloadScope } from './practice.mjs';
import { guideCommand } from './guide-model.mjs';
import { sampleMaterial, ownMaterial, fileDigest, programFile, officeText } from './materials.mjs';
import { sourceForSession, cleanExercise, curriculumForSession } from '../lib/coach/source.mjs';
import { coachFeedback } from './ai-coach.mjs';
import { suggestCurricula, requestedTaskText, curriculumRequestKey } from './ai-curriculum.mjs';
import { programById } from '../lib/coach/programs.mjs';
import { KNOWLEDGE } from '../lib/coach/knowledge.mjs';
import { loadLocalAI } from './ai-config.mjs';
import { codexConnection, generateWithCodex, stopCodexJobs } from './codex-coach.mjs';
import { createUploadObserver } from './upload-observer.mjs';
import { dialogueSnapshot, analyseDialogue, createDialogueQueue } from './dialogue-coach.mjs';
import { cleanArtifact } from '../lib/coach/evidence.mjs';
import { cleanWorkbook } from '../lib/coach/workbook-check.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'aibridge', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('AI Bridge');
const qa = process.argv.includes('--qa');
const fixture = qa && process.argv.includes('--fixture') && !app.isPackaged;
const overlayCheck = process.argv.includes('--overlay-check') && !app.isPackaged;
const manualCheck = process.argv.includes('--manual-check') && !app.isPackaged;
const liveCheck = (process.argv.includes('--live-check') || overlayCheck || manualCheck) && !app.isPackaged;
app.setPath('userData', path.join(app.getPath('appData'), fixture ? 'AI-Bridge-Flow-QA' : qa ? 'AI-Bridge-QA' : 'AI Bridge'));
loadLocalAI({ userData: app.getPath('userData') });
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
const base = path.dirname(__filename);
const uiRoot = path.join(base, 'ui');
let win, chat, coach, store, working = false, coachVisible = true, chatLoaded = false, closeAllowed = false;
let chatStatus = 'ChatGPT를 준비했어요', lastError = '';
const trusted = new Set(), popups = new Set(), pendingHighlights = new Map();
const downloads = [];
let captureToken=randomUUID(), composerReady=false, scopeMatches=true, pendingDownload=null, actionQueue=Promise.resolve();
const pendingControls=new Map();
const enqueue=fn=>{const task=actionQueue.catch(()=>{}).then(fn);actionQueue=task;return task;};
let flushCallback = null;
let downloadsRoot;
let uploadObserver=null;
let dialogueQueue=null;
const preparedMaterials=new Map();
let coachConnection={ready:false,provider:'codex-cli',label:'학습 코치 연결 확인 중'};
const aiReady=()=>coachConnection.ready;
function saveSample(phase=0,sampleId=null,taskId=null) {
  const material=taskId?programFile(taskId,phase):sampleMaterial(phase,sampleId);let filename=path.join(downloadsRoot,material.file.name);
  if(fs.existsSync(filename)&&fileDigest(fs.readFileSync(filename))!==material.file.sha256){const ext=path.extname(material.file.name);material.file.name=material.file.name.slice(0,-ext.length)+`-${randomUUID().slice(0,6)}`+ext;filename=path.join(downloadsRoot,material.file.name);}
  if(!fs.existsSync(filename))fs.writeFileSync(filename,material.bytes,{flag:'wx'});
  return {...material,path:filename,mode:'sample',location:'다운로드 > AI Bridge'};
}
function publicMaterial(material) {
  return {id:material.id,file:material.file,mode:material.mode,taskId:material.taskId||null,sampleId:material.sampleId||null,source:material.source,location:material.location};
}
function practiceMaterial(s,flow) {
  const phase=s?.phase===3?3:0,source=sourceForSession(s,phase);
  const ownRepeat=phase===3&&s?.exercise?.version>=2&&s.exercise.mode==='own',saved=flow?.sourceFiles?.[ownRepeat?0:phase],curriculum=curriculumForSession(s,phase);
  const file=saved?.file||((phase===0||ownRepeat)&&s?.exercise?s.exercise.file:s?.exercise?.version===3?programFile(s.exercise.taskId,phase).file:sampleMaterial(phase,s?.exercise?.sampleId).file);
  return {file,mode:ownRepeat?'own':phase===3?'sample':s?.exercise?.mode||'sample',rows:source.rows.length,sourceKind:source.kind||'table',sourceTitle:source.title||'',goal:phase===3&&flow?.independentGoal?flow.independentGoal:curriculum?.goal||s?.exercise?.goal||'',taskId:s?.exercise?.taskId||'excel',format:curriculum?.format||'xlsx',curriculum,custom:s?.exercise?.mode==='own',months:source.months||[],products:[...new Set((source.records||[]).map(r=>r[1]))].slice(0,3),saved:!!saved,location:saved?.location||'다운로드 > AI Bridge'};
}
function requestFeedback(session,evidence) {
  if(session.exercise?.dialogueLearning)return;
  if(!evidence?.checks||evidence.phase===3||!session.exercise?.aiConsent)return;
  const flow=store.flows()[session.id];if(!flow||flow.feedback?.[evidence.id])return;
  const at=new Date().toISOString(),used=Object.values(store.flows()).flatMap(f=>Object.values(f.feedback||{})).filter(f=>f.at?.startsWith(at.slice(0,10))).length;
  flow.feedback??={};flow.feedback[evidence.id]=used>=20?{status:'error',message:'오늘의 맞춤 설명 20회를 모두 사용했어요. 파일 검사는 계속 사용할 수 있어요.'}:{status:'pending',at};store.saveFlow(flow);syncPractice();
  if(used>=20)return;
  // One request per submitted result; a timeout or API error never triggers a paid retry.
  void coachFeedback({session,evidence,generate:generateWithCodex}).then(result=>({status:'done',...result}),error=>({status:'error',message:error.message})).then(result=>enqueue(()=>{
    const current=store.flows()[session.id];if(!current)return;current.feedback??={};current.feedback[evidence.id]={...result,at};store.saveFlow(current);syncPractice();
  }));
}
const localPrefs = () => ({ preload: path.join(base, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true });
const remotePrefs = () => ({ partition: 'persist:aibridge-chatgpt', nodeIntegration: false, contextIsolation: true, sandbox: true });
function status() { return { working, coachVisible, chatStatus, error: lastError, qa, downloadCount: downloads.filter(d => d.status === 'completed').length }; }
function broadcast() { for (const wc of trusted) if (!wc.isDestroyed()) wc.send('bridge:status', status()); }
function flowFor() {
  const s=store.read().session;if(!s)return null;
  return store.flows()[s.id] || store.saveFlow({...freshFlow(s.id),legacyDraft:s.draft.prompt||''});
}
function practiceData() {
  const state=store.read(),flow=flowFor();
  return {...state,flow,step:flow?displayStep(state.session,flow):'empty',ready:composerReady,scopeMatches,qa:fixture,liveCheck,
    downloads:downloads.filter(d=>d.scope?.sessionId===state.session?.id).map(({path:_path,...d})=>d)};
}
function observedOrigin(wc) { return wc===chat?.webContents && (wc.getURL().startsWith('https://chatgpt.com/') || fixture && wc.getURL()===`${APP_ORIGIN}/qa-chat.html`); }
function syncPractice() {
  if(!store||!coach||coach.webContents.isDestroyed())return;
  const data=practiceData(),s=data.session,flow=data.flow;
  coach.webContents.send('bridge:practice-state',data);
  if(!chat.webContents.isDestroyed()&&observedOrigin(chat.webContents))chat.webContents.send('bridge:practice-config',{
    token:captureToken,sessionId:s?.id,phase:s?.phase,level:s?.level,enabled:working&&!!s,
    prepared:!!flow?.prepared[s?.phase],conversation:flow?.conversation||null,step:data.step,
    knownTurns:flow?.turns.filter(t=>!flow.conversation?t.phase===s?.phase:t.conversation===flow.conversation).map(t=>({id:t.id,text:t.text}))||[],
    pending:flow?.pending?{...flow.pending,attachmentName:flow.attachments?.[s?.phase]?.name}:null,showGuide:coachVisible,fixture,independentHelp:!!s?.independentHelp,
    modelReviewed:!!flow?.modelReview,hasTurns:!!flow?.turns.length,hasPhaseTurn:!!flow&&!!lastTurn(flow,s?.phase),
    material:{...practiceMaterial(s,flow),flexible:s?.exercise?.dialogueLearning===true},attachment:flow?.attachments?.[s?.phase]||null,uploadProof:uploadObserver?.get()||null,
    liveCoach:s?.phase===3?null:flow?.liveCoach?.key===dialogueSnapshot(s,flow)?.key?flow.liveCoach:flow?.liveCoach?.status==='pending'?{status:'pending'}:null,
    dialogueLearning:s?.exercise?.dialogueLearning===true,aiConsent:s?.exercise?.aiConsent===true,aiReady:aiReady(),
    resultFiles:Object.values(flow?.artifacts||{}).filter(f=>f.turnId===lastTurn(flow,s?.phase)?.id).map(f=>({name:f.file.name,status:f.status,error:f.error})),
    hasGeneratedFiles:!!flow?.responses[lastTurn(flow,s?.phase)?.id]?.links?.length||flow?.responses[lastTurn(flow,s?.phase)?.id]?.hasImage===true,
    canSaveResponse:!!flow?.responses[lastTurn(flow,s?.phase)?.id]?.text?.trim()||Object.values(flow?.artifacts||{}).some(f=>f.turnId===lastTurn(flow,s?.phase)?.id&&f.status==='read'),
    lesson:{goal:s?.exercise?.goal||'',custom:s?.exercise?.mode==='own',before:s?.submissions.find(e=>e.phase===0)?.checks||null,after:s?.submissions.filter(e=>e.phase===2).at(-1)?.checks||null,independent:s?.submissions.filter(e=>e.phase===3).at(-1)?.checks||null,evidence:[0,2].map(phase=>s?.submissions.filter(e=>e.phase===phase).at(-1)).filter(Boolean).map(e=>({phase:e.phase,prompt:e.prompt,output:e.output.slice(0,1500),goal:e.learningContext?.goal||s.exercise?.goal,file:e.file?.name||null,canOpen:!!flow?.linked.find(l=>l.submissionId===e.id&&l.downloadId)})),answers:s?.draft.answers||{},selectedCheck:flow?.selectedCheck,error:flow?.error||'',outcome:s?.completedAt?outcome(s):null,feedback:flow?.feedback?.[s?.submissions.at(-1)?.id]||null}
  });
}
function remoteControl(action,extra={}) {
  if(!observedOrigin(chat.webContents))return Promise.reject(Error('ChatGPT 대화 화면이 열리면 다시 눌러 주세요.'));
  return new Promise((resolve,reject)=>{
    const id=randomUUID(),timer=setTimeout(()=>{pendingControls.delete(id);reject(Error('화면이 아직 준비되지 않았어요. 잠시 뒤 다시 눌러 주세요.'));},5000);
    pendingControls.set(id,r=>{clearTimeout(timer);r.ok?resolve(r):reject(Error(r.error||'화면에서 이 작업을 찾지 못했어요.'));});
    chat.webContents.send('bridge:control',{id,token:captureToken,action,...extra});
  });
}
ipcMain.on('bridge:control-result',(event,result)=>{
  if(event.senderFrame!==event.sender.mainFrame||!observedOrigin(event.sender)||!result)return;
  const complete=pendingControls.get(result.id);if(complete){pendingControls.delete(result.id);complete(result);}
});
ipcMain.on('bridge:observation',(event,message)=>{
  if(event.senderFrame!==event.sender.mainFrame||!observedOrigin(event.sender)||!message||JSON.stringify(message).length>400000)return;
  if(message.type==='ready'){composerReady=!!message.composer;scopeMatches=message.scopeMatches!==false;syncPractice();return;}
  if(message.token!==captureToken||!working)return;
  void enqueue(async()=>{
    if(message.token!==captureToken||!working)return;
    let s=store.read().session;if(!s||message.phase!==s.phase)return;
    let flow=flowFor();
    if(message.type==='guide-action'){
      const request=guideCommand(message.action,message.value,s,flow);
      if(request)await command(request);syncPractice();return;
    }
    if(s.completedAt&&message.type!=='download-click')return;
    if(message.type==='model-reviewed'){
      if(s.phase!==0||flow.turns.length||typeof message.model!=='string'||!message.model.trim())return;
      flow.modelReview={label:message.model.slice(0,60),interaction:message.selected?'option-selected':'menu-inspected',at:new Date().toISOString()};
    }else if(message.type==='attachment-ready'){
      const expected=practiceMaterial(s,flow).file;
      if(![0,3].includes(s.phase)||lastTurn(flow,s.phase)||message.sha256!==expected.sha256)return;
      if(message.uploadId&&uploadObserver?.get()?.id!==message.uploadId)return;
      flow.attachments??={};flow.attachments[s.phase]={name:String(message.name||'').slice(0,180),sha256:expected.sha256,at:new Date().toISOString(),kind:message.uploadId?'observed-file-upload':'observed-file-selection'};flow.prepared[s.phase]=true;
    }else if(message.type==='attachment-removed'||message.type==='attachment-invalid'){
      if(![0,3].includes(s.phase)||lastTurn(flow,s.phase))return;
      if(message.type==='attachment-removed')uploadObserver?.clear();
      if(flow.attachments)delete flow.attachments[s.phase];flow.prepared[s.phase]=false;
    }else if(message.type==='attempt'){
      if(typeof message.text!=='string'||message.text.length>60000)return;
      flow.pending={text:message.text,phase:s.phase,beforeCount:Number(message.beforeCount)||0,beforeIds:(message.beforeIds||[]).slice(-200),at:new Date().toISOString()};flow.error='';
    } else if(message.type==='confirmed') {
      if(!fixture&&conversationPath(message.url)!==conversationPath(chat.webContents.getURL()))return;
      if(s.phase===1&&s.exercise?.dialogueLearning){
        s=(await store.dispatch({type:'PATCH',revision:s.revision,patch:{review:'처음 받은 결과를 보관한 뒤 사용자가 직접 후속 요청을 작성했습니다.'}})).session;
        s=(await store.dispatch({type:'NEXT',revision:s.revision})).session;
        captureToken=randomUUID();
      }
      flow=captureTurn(flow,{...message,phase:s.phase},s.phase);
    } else if(message.type==='history') {
      if(!s.exercise?.dialogueLearning||!flow.conversation||conversationPath(message.url)!==flow.conversation||conversationPath(chat.webContents.getURL())!==flow.conversation||!Array.isArray(message.messages))return;
      const lastKnown=message.messages.findLastIndex(m=>flow.turns.some(t=>t.id===m.id));
      if(s.phase===1&&lastKnown>=0&&lastKnown<message.messages.length-1){
        s=(await store.dispatch({type:'PATCH',revision:s.revision,patch:{review:'사용자가 실습 대화에서 후속 요청을 직접 작성했습니다.'}})).session;
        s=(await store.dispatch({type:'NEXT',revision:s.revision})).session;captureToken=randomUUID();
      }
      flow=mergeObservedHistory(flow,message.messages,s.phase);
    } else if(message.type==='conversation-bound') {
      const location=conversationPath(message.url),turn=lastTurn(flow,s.phase);
      if(flow.conversation||!turn||turn.id!==message.turnId||!location?.startsWith('/c/')||location!==conversationPath(chat.webContents.getURL()))return;
      flow.conversation=location;turn.conversation=location;
    }
    else if(message.type==='response'){
      if(!flow.turns.some(t=>t.id===message.turnId&&(t.conversation===flow.conversation||t.phase===s.phase)))return;
      const previous=flow.responses[message.turnId],text=String(message.text||'').slice(0,60000);
      flow.responses[message.turnId]={text:previous&&normalizeText(previous.text)===normalizeText(text)?previous.text:text,finished:message.finished===true,hasImage:message.hasImage===true,links:(message.links||[]).filter(l=>/^link-[a-z0-9-]+$/.test(l.id)&&typeof l.label==='string').slice(0,8).map(l=>({id:l.id,label:normalizeText(l.label).slice(0,160)}))};
      if(s.exercise?.dialogueLearning&&s.phase===0&&!flow.baseline&&message.finished&&flow.turns[0]?.id===message.turnId)flow.baseline={turnId:message.turnId,response:structuredClone(flow.responses[message.turnId])};
    } else if(message.type==='download-click'){
      const turn=flow.turns.find(t=>t.id===message.turnId);if(!turn||turn.conversation!==flow.conversation&&turn.phase!==s.phase)return;
      pendingDownload={sessionId:s.id,phase:turn.phase,turnId:turn.id,at:Date.now()};return;
    } else if(message.type==='capture-error')flow.error=String(message.error||'전송을 확인하지 못했어요.').slice(0,200);
    else return;
    store.saveFlow(flow);syncPractice();
    if(message.type==='confirmed'||message.type==='history'||message.type==='response'&&message.finished)dialogueQueue?.schedule();
  }).catch(error=>{const flow=flowFor();if(flow){flow.error=error.message;store.saveFlow(flow);syncPractice();}});
});
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  chat.setVisible(working); coach.setVisible(false);
  if (working) {
    chat.setBounds({ x: 12, y: 84, width: width-24, height: Math.max(200, height-96) });
  }
}
async function external(url) {
  if (!externalUrl(url)) return;
  const host = new URL(url).hostname;
  const result = await dialog.showMessageBox(win, { type: 'question', title: '외부 링크', message: `${host}를 기본 브라우저에서 열까요?`, buttons: ['열기', '취소'], defaultId: 1, cancelId: 1, noLink: true });
  if (result.response === 0) await shell.openExternal(url);
}
function guardRemote(wc) {
  wc.on('will-navigate', (event, url) => { if (!chatNavigation(url)) { event.preventDefault(); void external(url); } });
  wc.on('will-redirect', (event, url, _inPlace, isMainFrame) => { if (isMainFrame && !chatNavigation(url)) event.preventDefault(); });
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.setWindowOpenHandler(({ url }) => {
    // ChatGPT also opens its inline file viewer. Keep result retrieval in that view.
    if(working&&url.startsWith('https://chatgpt.com/library?'))return {action:'deny'};
    if (!chatNavigation(url)) { void external(url); return { action: 'deny' }; }
    return { action: 'allow', overrideBrowserWindowOptions: { width: 980, height: 760, parent: win, autoHideMenuBar: true, webPreferences: remotePrefs() } };
  });
  wc.on('did-create-window', popup => {
    popups.add(popup); guardRemote(popup.webContents);
    popup.on('closed', () => popups.delete(popup));
  });
}
function guardLocal(wc) {
  trusted.add(wc);
  wc.on('destroyed', () => trusted.delete(wc));
  wc.on('will-navigate', (event, url) => { if (!trustedUrl(url)) { event.preventDefault(); void external(url); } });
  wc.setWindowOpenHandler(({ url }) => { void external(url); return { action: 'deny' }; });
}
function highlight(target) {
  if (!target && !chatLoaded) return Promise.resolve({ found: true });
  if (!chatLoaded) return Promise.resolve({ found: false, reason: 'ChatGPT 화면을 불러온 뒤 다시 눌러 주세요.' });
  return new Promise(resolve => {
    const id = randomUUID();
    const timer = setTimeout(() => { pendingHighlights.delete(id); resolve({ found: false, reason: '화면이 아직 준비되지 않았어요. 로그인 또는 로딩이 끝난 뒤 다시 눌러 주세요.' }); }, 3000);
    pendingHighlights.set(id, result => { clearTimeout(timer); resolve(result); });
    chat.webContents.send('bridge:highlight', { id, target });
  });
}
ipcMain.on('bridge:highlight-result', (event, result) => {
  if (event.sender !== chat?.webContents || event.senderFrame !== event.sender.mainFrame || !result || typeof result.id !== 'string') return;
  const accept = pendingHighlights.get(result.id); if (!accept) return;
  pendingHighlights.delete(result.id);
  accept({ found: result.found === true, reason: String(result.reason || '').slice(0, 300) });
});
ipcMain.on('bridge:flushed', (event, result) => {
  if (event.sender === coach?.webContents && event.senderFrame === event.sender.mainFrame && trustedUrl(event.senderFrame.url)) flushCallback?.(result === true);
});
async function loadChat(resume=true) {
  lastError = ''; composerReady=false; chatStatus = fixture?'검증용 대화 화면':'ChatGPT에 연결 중'; broadcast();
  const flow=flowFor();const location=resume?(flow?.conversation||flow?.pendingConversation):null;
  try { await chat.webContents.loadURL(fixture?`${APP_ORIGIN}/qa-chat.html`:`https://chatgpt.com${location||'/'}`); } catch { /* did-fail-load provides the UI state. */ }
}
function homeData() {
  const state = store.read();
  return { ...state, profile: store.profile(), aiReady:aiReady(),aiConnection:{...coachConnection,apiKeyConfigured:Boolean(process.env.OPENAI_API_KEY)},needsSetup:state.session?.phase===0&&!state.session.exercise&&!flowFor()?.turns.length, records: [...state.history, ...(state.session ? [state.session] : [])].filter(s => s.completedAt).reverse().map(s => ({ id: s.id, completedAt: s.completedAt, level: s.level, outcome: outcome(s) })), status: status() };
}
function knownDownload(id) {
  const entry = downloads.find(d => d.id === id && d.status === 'completed');
  if (!entry) throw Error('완료된 다운로드를 선택해 주세요.');
  const relative = path.relative(downloadsRoot, entry.path);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('허용되지 않은 파일입니다.');
  return entry;
}
async function command(message) {
  const type = message.type;
  if (type === 'PROFILE') return homeData();
  if (type === 'PRACTICE') return practiceData();
  if (type === 'SAVE_PROFILE') return store.saveProfile(message.profile);
  if(type==='PREPARE_SAMPLE'||type==='CHOOSE_SOURCE'){
    let material;
    if(type==='PREPARE_SAMPLE'){
      programById(message.taskId);material=saveSample(0,null,message.taskId);
    }
    else {
      const result=await dialog.showOpenDialog(win,{title:'연습할 내 자료 선택',properties:['openFile'],filters:[{name:'학습 자료',extensions:['csv','xlsx','txt','md','docx','pptx']}]});
      if(result.canceled)return null;
      const filename=result.filePaths[0],info=fs.lstatSync(filename);
      if(!info.isFile()||info.isSymbolicLink()||info.size>3*1024*1024)throw Error('3MB 이하의 지원하는 자료 파일을 선택해 주세요.');
      material={...await ownMaterial(path.basename(filename),fs.readFileSync(filename),{general:true}),path:filename,mode:'own',location:path.basename(path.dirname(filename))};
    }
    material.id=randomUUID();preparedMaterials.set(material.id,material);return publicMaterial(material);
  }
  if(type==='PLAN_LESSON'){
    const m=preparedMaterials.get(message.materialId);
    if(!m||m.mode!=='own'||fileDigest(fs.readFileSync(m.path))!==m.file.sha256)throw Error('선택한 자료가 바뀌었어요. 다시 선택해 주세요.');
    if(!aiReady())throw Error('AI 학습 제안은 연결 준비 중이에요. 현재는 8개 샘플 과정으로 학습할 수 있어요.');
    if(message.aiConsent!==true)throw Error('선택한 자료를 OpenAI로 보내 학습 제안을 받는 데 동의해 주세요.');
    const requestedTask=requestedTaskText(message.requestedTask),key=curriculumRequestKey(message.level,requestedTask);
    m.plans??=new Map();
    if(m.plans.has(key))return m.plans.get(key);
    store.reserveAIUsage('curriculum');
    const result=await suggestCurricula({source:m.source,level:message.level,consent:true,generate:generateWithCodex,requestedTask});
    m.plan={...result,level:message.level,sources:KNOWLEDGE.filter(d=>result.options.some(o=>o.sourceIds.includes(d.id))).map(({id,title,source,task,version})=>({id,title,source,task,version}))};
    m.plans.set(key,m.plan);
    return m.plan;
  }
  if(type==='START_LESSON'){
    const material=preparedMaterials.get(message.materialId);
    if(!material||!fs.existsSync(material.path)||fileDigest(fs.readFileSync(material.path))!==material.file.sha256)throw Error('자료 파일을 다시 준비해 주세요. 내용이 변경되었을 수 있어요.');
    if(!['starter','growing','independent'].includes(message.level))throw Error('도움 수준을 선택해 주세요.');
    const plan=material.mode==='own'?material.plans?.get(curriculumRequestKey(message.level,message.requestedTask)):null;
    const chosen=plan&&Number.isInteger(message.planIndex)?plan.options[message.planIndex]:null;
    if(material.mode==='own'&&!chosen)throw Error('자료에 맞는 학습 제안을 먼저 선택해 주세요.');
    const exercise=cleanExercise({version:3,dialogueLearning:true,taskId:material.mode==='sample'?material.taskId:chosen.taskId,curriculum:chosen,mode:material.mode,source:material.source,file:material.file,aiConsent:message.aiConsent===true&&aiReady()});
    const old=store.read().session,oldFlow=flowFor();
    const state=await store.dispatch({type:old&&(old.completedAt||old.submissions.length||oldFlow?.turns.length)?'NEW':'START',level:message.level});
    const value=store.configure(message.level,exercise);
    const flow=freshFlow(state.session.id);flow.sourceFiles={0:{path:material.path,location:material.location,file:material.file}};
    if(chosen)flow.curriculumGeneration={...plan.receipt,requestedTask:plan.requestedTask,sourceIds:chosen.sourceIds};
    store.saveFlow(flow);
    preparedMaterials.clear();captureToken=randomUUID();working=true;coachVisible=true;layout();broadcast();syncPractice();void loadChat(false);return value;
  }
  if(type==='SAVE_PRACTICE_SOURCE'){
    const s=store.read().session,flow=flowFor();
    if(!s||![0,3].includes(s.phase)||s.exercise?.mode==='own'&&(s.phase===0||s.exercise.version>=2))throw Error('샘플 자료를 받는 단계가 아니에요.');
    const material=saveSample(s.phase,s.exercise?.sampleId,s.exercise?.version===3?s.exercise.taskId:null);flow.sourceFiles??={};flow.sourceFiles[s.phase]={path:material.path,location:material.location};
    // Keep the displayed name identical to the actual downloaded file, including collision suffixes.
    flow.sourceFiles[s.phase].file=material.file;store.saveFlow(flow);syncPractice();return practiceData();
  }
  if(type==='OPEN_RESULT'){
    const s=store.read().session,flow=flowFor();
    if(!s||![2,4].includes(s.phase)||![0,2].includes(message.phase))throw Error('비교할 결과를 선택해 주세요.');
    const evidence=s.submissions.filter(e=>e.phase===message.phase).at(-1),link=flow.linked.find(l=>l.submissionId===evidence?.id);
    const entry=knownDownload(link?.downloadId);
    if(fileDigest(fs.readFileSync(entry.path))!==evidence.file?.sha256)throw Error('보관한 결과 파일이 변경됐어요. 현재 파일을 원래 결과로 비교할 수 없어요.');
    const error=await shell.openPath(entry.path);if(error)throw Error('이 파일을 여는 앱이 없어요. 내려받은 파일 폴더에서 확인해 주세요.');return {};
  }
  if (type === 'HOME') { working = false; await highlight(null); layout(); broadcast();syncPractice(); return homeData(); }
  if (type === 'START' || type === 'NEW') {
    if(type==='START'&&homeData().needsSetup)throw Error('실습 전에 수준과 자료를 선택해 주세요.');
    const oldId=store.read().session?.id;
    let value = await store.dispatch({...message,level:message.level||store.profile()?.diagnosis?.level||'starter'});
    if(value.session?.exercise?.version===3&&!value.session.completedAt)value=store.enableDialogue();
    captureToken=randomUUID();flowFor();
    working = true; coachVisible = true; layout(); broadcast();
    syncPractice();
    dialogueQueue?.schedule();
    if (!chatLoaded||oldId!==value.session.id) void loadChat();
    return value;
  }
  if(type==='SET_LEVEL'){
    const flow=flowFor();if(flow?.turns.length||flow?.pending)throw Error('첫 요청을 보낸 뒤에는 같은 수준으로 비교해요.');
    store.setLevel(message.level);syncPractice();return practiceData();
  }
  if(type==='RECOVER_SENT'){await remoteControl('recover');return practiceData();}
  if(type==='RETURN_CHAT'){
    const flow=flowFor();if(flow){flow.error='';store.saveFlow(flow);}
    await loadChat();
    return practiceData();
  }
  if(type==='ATTACH_RESULT'||type==='SAVE_RESPONSE'){
    let s=store.read().session,flow=flowFor();
    if(type==='ATTACH_RESULT'&&flow.linked.some(l=>l.downloadId===message.downloadId))return practiceData();
    const turn=s.phase===0&&flow.baseline?flow.turns.find(t=>t.id===flow.baseline.turnId):lastTurn(flow,s.phase);if(!turn)throw Error('보낸 요청을 먼저 확인할게요.');
    if(type==='ATTACH_RESULT'){
      const file=knownDownload(message.downloadId);
      if(file.scope?.sessionId!==s.id||file.scope?.phase!==s.phase||file.scope?.turnId!==turn.id)throw Error('현재 요청에서 받은 파일을 선택해 주세요.');
      const digest=createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
      if(message.upload?.file?.sha256!==digest)throw Error('다운로드한 파일과 검사 파일이 달라요.');
    }else if((!s.exercise?.dialogueLearning&&s.phase!==0&&curriculumForSession(s)?.format!=='text')||!flow.responses[turn.id]?.finished)throw Error('완성된 답변을 확인한 뒤 진행해 주세요.');
    const resultFile=Object.values(flow.artifacts||{}).filter(f=>f.turnId===turn.id&&f.status==='read').at(-1);
    const currentCoach=flow.liveCoach?.status==='done'&&flow.liveCoach.key===dialogueSnapshot(s,flow)?.key?flow.liveCoach:null;
    const plan=curriculumForSession(s),patch=evidencePatch(flow,s.phase,turn);
    if(s.exercise?.dialogueLearning)patch.learningContext={goal:s.phase===3?flow.independentGoal||plan.goal:s.phase===0?plan.goal:currentCoach?.goal||plan.goal,checks:s.phase===0||s.phase===3?plan.checks:currentCoach?.checks||plan.checks,inputHash:s.phase===0?'':currentCoach?.key||''};
    s=(await store.dispatch({type:'PATCH',revision:s.revision,patch})).session;
    const result=await store.dispatch({type:'SUBMIT',revision:s.revision,upload:type==='ATTACH_RESULT'?message.upload:resultFile?.upload||null});
    flow.linked.push({submissionId:result.session.submissions.at(-1).id,turnId:turn.id,downloadId:message.downloadId||resultFile?.downloadId||null});flow.pending=null;flow.error='';store.saveFlow(flow);
    if(result.session.phase!==s.phase)captureToken=randomUUID();syncPractice();requestFeedback(result.session,result.session.submissions.at(-1));return practiceData();
  }
  if(type==='INGEST_RESULT'){
    const s=store.read().session,flow=flowFor(),file=knownDownload(message.downloadId);
    const turn=flow.turns.find(t=>t.id===file.scope?.turnId);
    if(file.scope?.sessionId!==s.id||!turn||file.scope.phase!==turn.phase)throw Error('실습 대화에서 받은 파일만 확인할 수 있어요.');
    if(fileDigest(fs.readFileSync(file.path))!==message.upload?.file?.sha256)throw Error('다운로드한 파일 내용이 바뀌었어요. 다시 받아 주세요.');
    const upload={file:message.upload.file,workbook:message.upload.workbook?cleanWorkbook(message.upload.workbook):null,artifact:cleanArtifact(message.upload.artifact)};
    if(!upload.workbook&&!upload.artifact)throw Error('파일 내용을 읽지 못했어요.');
    store.saveFlow(recordResult(flow,file,upload,fileDigest(fs.readFileSync(file.path))));syncPractice();dialogueQueue?.schedule();return practiceData();
  }
  if(type==='RETRY_COACH'||type==='ENABLE_COACH'){
    if(store.read().session?.phase===3)throw Error('독립 실습의 피드백은 학습을 마친 뒤 제공해요.');
    if(type==='ENABLE_COACH')store.enableDialogue(true);
    const flow=flowFor();if(flow){flow.liveCoach=null;store.saveFlow(flow);}
    dialogueQueue?.schedule({retry:true});syncPractice();return practiceData();
  }
  if(type==='REPORT_RESULT_ERROR'){
    const s=store.read().session,flow=flowFor(),file=knownDownload(message.downloadId);
    if(file.scope?.sessionId!==s.id)throw Error('현재 실습의 파일이 아니에요.');
    flow.artifacts??={};flow.artifacts[file.id]={downloadId:file.id,turnId:file.scope.turnId,phase:file.scope.phase,file:{name:file.name},status:'unread',error:String(message.error||'파일을 확인하지 못했어요.').slice(0,200)};
    store.saveFlow(flow);syncPractice();dialogueQueue?.schedule();return practiceData();
  }
  if(type==='REVIEW_CHOICE'||type==='REFLECTION_CHOICE'||type==='FINISH'){
    let s=store.read().session,flow=flowFor();let patch;
    if(type==='REVIEW_CHOICE'){
      if(s.phase!==1)throw Error('결과 확인 단계에서 선택해 주세요.');
      patch={review:reviewText(s,message.checkId)};flow.selectedCheck=s.submissions[0].checks?.checks.find(c=>c.id===message.checkId)?.label||'요청한 형식의 결과 받기';
    }else if(type==='REFLECTION_CHOICE'){
      if(s.phase!==2)throw Error('수정 결과를 확인한 뒤 선택해 주세요.');
      patch={reflection:reflectionText(s,message.choice)};flow.conversation=null;flow.pendingConversation=null;
      flow.independentGoal=s.exercise?.mode==='own'?(flow.liveCoach?.status==='done'?flow.liveCoach.goal:s.exercise.goal):curriculumForSession(s,3)?.goal;
    }else{if(s.phase!==3)throw Error('독립 실습 결과를 먼저 확인해 주세요.');patch={answers:message.answers};}
    s=(await store.dispatch({type:'PATCH',revision:s.revision,patch})).session;
    const result=await store.dispatch({type:'NEXT',revision:s.revision});captureToken=randomUUID();store.saveFlow(flow);syncPractice();
    if(result.session.phase===2)await store.dispatch({type:'HELP',revision:result.session.revision,kind:'overlay-template'});
    syncPractice();dialogueQueue?.schedule();if(result.session.phase===3)void loadChat(false);return practiceData();
  }
  if(type==='ENABLE_HELP'){
    const s=store.read().session;if(s.phase!==3)throw Error('독립 실습에서만 선택할 수 있어요.');
    await store.dispatch({type:'HELP',revision:s.revision,kind:'learner-requested-help'});syncPractice();return practiceData();
  }
  if(type==='TRY_AGAIN'){
    const s=store.read().session,flow=flowFor();if(![0,2,3].includes(s.phase))throw Error('요청 단계에서 다시 시도해 주세요.');
    flow.prepared[s.phase]=true;flow.pending=null;flow.retry=true;flow.error='';store.saveFlow(flow);chat.webContents.focus();await remoteControl('focus-composer',{contains:''});syncPractice();return practiceData();
  }
  if (['GET', 'PATCH', 'SUBMIT', 'NEXT', 'HELP', 'EXPORT'].includes(type)) {
    const result = await store.dispatch(message);
    if (type === 'NEXT' && result.session?.phase === 3) { await highlight(null); }
    return result;
  }
  if (type === 'OPEN_CHAT') { working = true; layout(); if (!chatLoaded || store.read().session?.phase === 3) await loadChat(); chat.webContents.focus(); return {}; }
  if (type === 'RETRY_CHAT') { await loadChat(); return {}; }
  if (type === 'BROWSER_CHAT') { await shell.openExternal('https://chatgpt.com/'); return {}; }
  if (type === 'OPEN_SITE') { working = false; layout(); broadcast(); return homeData(); }
  if (type === 'TOGGLE_COACH') { coachVisible = !coachVisible; if (!coachVisible) await highlight(null); layout(); broadcast();syncPractice(); return status(); }
  if (type === 'HIGHLIGHT') {
    if (!['attach', 'composer', null].includes(message.target)) throw Error('지원하지 않는 안내입니다.');
    const current = store.read().session;
    if (current?.phase === 3 && message.target) await store.dispatch({ type: 'HELP', revision: current.revision, kind: 'button-location' });
    return highlight(message.target);
  }
  if (type === 'COPY') {
    if (typeof message.text !== 'string' || message.text.length > 80000) throw Error('복사할 내용이 너무 길어요.');
    clipboard.writeText(message.text); return {};
  }
  if (type === 'SAVE_FILE') {
    if (typeof message.content !== 'string' || message.content.length > 8_000_000 || !/\.(csv|json)$/.test(message.name || '')) throw Error('내려받을 파일을 확인해 주세요.');
    const id = randomUUID().slice(0, 8), name = downloadName(message.name, id);
    if (!name) throw Error('지원하지 않는 파일입니다.');
    const file = path.join(downloadsRoot, name);
    fs.writeFileSync(file, message.content, { encoding: 'utf8', flag: 'wx' });
    downloads.unshift({ id, name, path: file, status: 'completed', size: Buffer.byteLength(message.content) });
    broadcast(); return { name };
  }
  if (type === 'DOWNLOADS') return downloads.map(({ path: _path, ...d }) => d);
  if (type === 'OPEN_DOWNLOADS') { await shell.openPath(downloadsRoot); return {}; }
  if (type === 'USE_DOWNLOAD') {
    const entry = knownDownload(message.id);
    const ext=path.extname(entry.path).toLowerCase();
    const info = fs.lstatSync(entry.path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 20 * 1024 * 1024) throw Error('20MB 이하의 결과 파일을 사용해 주세요.');
    const bytes=fs.readFileSync(entry.path),file={name:entry.name,size:bytes.length,sha256:fileDigest(bytes)};
    if(ext==='.pptx'||ext==='.docx'){const parsed=await officeText(bytes,ext.slice(1));return {upload:{file,artifact:{...parsed,kind:ext==='.pptx'?'presentation':'document'}}};}
    if(['.png','.jpg','.jpeg','.webp'].includes(ext)){const img=nativeImage.createFromBuffer(bytes);if(img.isEmpty())throw Error('이미지 내용을 읽지 못했어요.');return {upload:{file,artifact:{kind:'image',...img.getSize()}}};}
    if(['.txt','.md','.csv','.json'].includes(ext)){const text=new TextDecoder().decode(bytes);if(text.length>60000)throw Error('이 텍스트 파일은 60,000자를 넘어 내용 분석을 하지 않았어요.');return {upload:{file,artifact:{kind:'document',text}}};}
    if(ext!=='.xlsx')throw Error('이 결과는 XLSX·PPTX·DOCX·TXT 또는 이미지 파일로 받아 주세요.');
    return { name: entry.name, bytes: fs.readFileSync(entry.path).toString('base64') };
  }
  throw Error('지원하지 않는 작업입니다.');
}
ipcMain.handle('bridge:command', async (event, message) => {
  try {
    if (!trusted.has(event.sender) || event.senderFrame !== event.sender.mainFrame || !trustedUrl(event.senderFrame.url)) throw Error('허용되지 않은 요청입니다.');
    if (!message || typeof message.type !== 'string' || JSON.stringify(message).length > 10_000_000) throw Error('요청 크기를 확인해 주세요.');
    return { ok: true, value: await enqueue(()=>command(message)) };
  } catch (e) { return { ok: false, error: e.message || '작업을 완료하지 못했어요.' }; }
});
function setupDownloads(chatSession) {
  chatSession.on('will-download', (event, item, wc) => {
    if (wc !== chat.webContents && ![...popups].some(w => w.webContents === wc)) { event.preventDefault(); return; }
    const id = randomUUID().slice(0, 8), name = downloadName(item.getFilename(), id);
    if (!name) { event.preventDefault(); lastError = '문서·스프레드시트·이미지 파일만 앱에서 내려받을 수 있어요.'; broadcast(); return; }
    const resolveScope=()=>resultDownloadScope({pending:pendingDownload,flow:flowFor(),sessionId:store.read().session?.id,filename:item.getFilename(),conversation:fixture?'/':conversationPath(chat.webContents.getURL())});
    const scope=resolveScope();
    const file = path.join(downloadsRoot, name), entry = { id, name, path: file, status: 'downloading', size: 0,scope };
    downloads.unshift(entry); item.setSavePath(file); broadcast();
    item.on('done', (_event, state) => { entry.status = state; entry.size = item.getReceivedBytes(); entry.scope??=resolveScope(); if (state !== 'completed') lastError = '다운로드가 완료되지 않았어요. ChatGPT에서 다시 내려받아 주세요.';store.saveDownloads(downloads); broadcast();syncPractice(); });
  });
}
function setupUploads(chatSession){
  uploadObserver=createUploadObserver({
    getScope:()=>{
      if(!working||!chat||chat.webContents.isDestroyed()||!observedOrigin(chat.webContents))return null;
      const s=store.read().session,flow=flowFor();
      if(!s||s.completedAt||![0,3].includes(s.phase)||lastTurn(flow,s.phase)||flow?.pending)return null;
      if(flow?.conversation&&conversationPath(chat.webContents.getURL())!==flow.conversation)return null;
      return {token:captureToken,sessionId:s.id,phase:s.phase,webContentsId:chat.webContents.id};
    },
    getBlobData:id=>chatSession.getBlobData(id),onChange:()=>syncPractice()
  });
  const filter={urls:['https://chatgpt.com/*','https://*.oaiusercontent.com/*','https://*.blob.core.windows.net/*']};
  chatSession.webRequest.onBeforeSendHeaders(filter,(details,callback)=>{
    callback({});
    try{uploadObserver.begin(details);}catch{/* Observing must never interrupt a ChatGPT upload. */}
  });
  chatSession.webRequest.onCompleted(filter,details=>uploadObserver.complete(details));
  chatSession.webRequest.onErrorOccurred(filter,details=>uploadObserver.fail(details));
}
async function boot() {
await app.whenReady();
if(primaryInstance)coachConnection=await codexConnection();
app.on('before-quit',stopCodexJobs);
if(qa||manualCheck)console.log('QA: app ready');
Menu.setApplicationMenu(null);
store = createStore(liveCheck?path.join(app.getPath('userData'),manualCheck?'manual-validation':overlayCheck?'overlay-validation':'live-validation'):app.getPath('userData'));
dialogueQueue=createDialogueQueue({
  snapshot:()=>{
    if(!working||!aiReady())return null;
    const flow=flowFor(),snapshot=dialogueSnapshot(store.read().session,flow);
    return snapshot&&flow.liveCoach?.key===snapshot.key&&['done','error'].includes(flow.liveCoach.status)?null:snapshot;
  },
  analyse:async snapshot=>{
    store.reserveAIUsage('dialogue');
    const images=[];
    for(const turn of snapshot.payload.transcript)for(const file of turn.files)if(file.status==='read'&&file.content?.kind==='image'){
      const entry=knownDownload(file.id),bytes=fs.readFileSync(entry.path);
      if(fileDigest(bytes)!==file.file.sha256)throw Error('보관한 이미지가 변경됐어요. 파일을 다시 받아 주세요.');
      images.push({id:file.id,name:entry.name,bytes});
    }
    return analyseDialogue({snapshot,generate:generateWithCodex,images});
  },
  publish:(snapshot,result)=>enqueue(()=>{
    const s=store.read().session,flow=flowFor();
    if(dialogueSnapshot(s,flow)?.key!==snapshot.key)return;
    flow.liveCoach={...result,at:new Date().toISOString()};store.saveFlow(flow);syncPractice();
  })
});
app.on('before-quit',()=>dialogueQueue.close());
for(const flow of Object.values(store.flows())){
  let changed=false;
  if(flow.liveCoach?.status==='pending'){flow.liveCoach={...flow.liveCoach,status:'error',message:'앱이 닫혀 분석이 중단됐어요. 다시 분석을 눌러 주세요.'};changed=true;}
  for(const feedback of Object.values(flow.feedback||{}))if(feedback.status==='pending'){feedback.status='error';feedback.message='앱이 닫혀 맞춤 설명 수신이 중단됐어요. 파일 검사와 학습 기록은 보존했어요.';changed=true;}
  if(changed)store.saveFlow(flow);
}
downloadsRoot = path.join(app.getPath('downloads'), qa ? 'AI Bridge QA' : 'AI Bridge');
fs.mkdirSync(downloadsRoot, { recursive: true });
downloads.push(...store.downloads().filter(d=>{const relative=path.relative(downloadsRoot,d.path);return !relative.startsWith('..')&&!path.isAbsolute(relative)&&fs.existsSync(d.path);}));
protocol.handle('aibridge', request => {
  const file = resourcePath(uiRoot, request.url);
  return file ? net.fetch(pathToFileURL(file).href) : new Response('Not found', { status: 404 });
});
const chatSession = session.fromPartition('persist:aibridge-chatgpt');
chatSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
chatSession.setPermissionCheckHandler(() => false);
win = new BrowserWindow({ width: 1440, height: 940, minWidth: 1100, minHeight: 740, title: 'AI Bridge', icon: path.join(base, 'icon.png'), backgroundColor: '#f5f5ef', autoHideMenuBar: true, show: false, webPreferences: localPrefs() });
guardLocal(win.webContents);
chat = new WebContentsView({ webPreferences: { ...remotePrefs(), preload: path.join(base, 'chat-preload.cjs'),additionalArguments:fixture?['--aibridge-fixture']:[] } });
coach = new WebContentsView({ webPreferences: {...localPrefs(),backgroundThrottling:false} });
guardRemote(chat.webContents); guardLocal(coach.webContents);
if(qa||manualCheck)for(const [name,wc] of [['home',win.webContents],['coach',coach.webContents],['chat',chat.webContents]]){
  wc.on('did-finish-load',()=>console.log(`QA: ${name} loaded`));
  wc.on('preload-error',(_event,_path,error)=>console.error(`QA: ${name} preload`,error.message));
  wc.on('console-message',(_event,details)=>{if(details.level==='error')console.error(`QA: ${name}`,details.message);});
}
if(fixture)chat.webContents.session.protocol.handle('aibridge',request=>{const file=resourcePath(uiRoot,request.url);return file?net.fetch(pathToFileURL(file).href):new Response('Not found',{status:404});});
win.contentView.addChildView(chat); win.contentView.addChildView(coach);
chat.setVisible(false); coach.setVisible(false);
chat.webContents.on('did-start-loading', () => { chatStatus = 'ChatGPT를 불러오는 중'; broadcast(); });
chat.webContents.on('did-stop-loading', () => { chatStatus = lastError ? '연결을 확인해 주세요' : 'ChatGPT · 실제 서비스'; broadcast(); });
chat.webContents.on('did-finish-load', () => { chatLoaded = true; lastError = ''; broadcast();syncPractice(); });
function rememberPendingNavigation(url){
  const location=conversationPath(url),flow=flowFor();
  if(working&&location?.startsWith('/c/')&&flow?.pending&&!flow.conversation&&Date.now()-Date.parse(flow.pending.at)<600000){flow.pendingConversation=location;store.saveFlow(flow);}
  syncPractice();
}
chat.webContents.on('did-navigate-in-page',(_event,url)=>rememberPendingNavigation(url));
chat.webContents.on('did-navigate',(_event,url)=>rememberPendingNavigation(url));
chat.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { chatLoaded = false; lastError = 'ChatGPT에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'; chatStatus = '연결 실패'; broadcast(); } });
chat.webContents.on('page-title-updated', event => event.preventDefault());
setupDownloads(chatSession);
setupUploads(chatSession);
win.on('resize', layout);
win.on('close', event => {
  if (closeAllowed) return;
  event.preventDefault(); if (flushCallback) return;
  const timer = setTimeout(() => flushCallback?.(false), 3000);
  flushCallback = async saved => {
    clearTimeout(timer); flushCallback = null;
    if (!saved) { await dialog.showMessageBox(win, { type: 'warning', message: '입력 내용을 저장하지 못했어요. 코치의 내용을 확인한 뒤 다시 닫아 주세요.', buttons: ['확인'] }); return; }
    closeAllowed = true; win.close();
  };
  coach.webContents.send('bridge:flush');
});
win.on('closed', () => { for (const popup of popups) popup.destroy(); for (const view of [chat, coach]) if (!view.webContents.isDestroyed()) view.webContents.close(); win = null; });
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
await win.loadURL(`${APP_ORIGIN}/index.html`);
if(qa||manualCheck)console.log('QA: loading coach');
await coach.webContents.loadURL(`${APP_ORIGIN}/panel.html`);
win.show();
app.on('window-all-closed', () => app.quit());

}
if (primaryInstance) boot().catch(error=>{dialog.showErrorBox("AI Bridge 시작 오류",String(error.message));app.exit(1);});
