import { exercise } from './content.js';
import { activeAttempt, transition } from './state.js';
import { Repository, STORAGE_KEY, backupText, parseBackup, BACKUP_LIMIT } from './storage.js';
import { preparationFeedback } from './feedback.js';
import { recordText } from './records.js';
import { renderPage } from './views.js';
import { icon } from './ui.js';

const repository = new Repository(() => window.localStorage);
let state = repository.load();
const app = document.getElementById('app');
let error = null, pendingRestore = null, importError = '', saveTimer, toastTimer;
let dirty = false;
let restoreRead = 0;

function toast(text) {
  const element = document.getElementById('toast');
  element.textContent = text; element.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
}
function updateSaveStatus() {
  const element = document.getElementById('save-status');
  if (!element) return;
  element.textContent = repository.status.message;
  element.className = 'save-status ' + repository.status.kind;
  document.getElementById('retry-save').hidden = repository.status.kind !== 'error';
}
function flushSave() {
  clearTimeout(saveTimer);
  if (dirty && repository.save(state)) dirty = false;
  updateSaveStatus();
}
function scheduleSave() {
  dirty = true;
  if (repository.blocked) { updateSaveStatus(); return; }
  clearTimeout(saveTimer);
  if (repository.status.kind !== 'error') repository.status = { kind: 'saving', message: '변경 내용을 저장 중이에요…' };
  updateSaveStatus(); saveTimer = setTimeout(flushSave, 300);
}
function render(scroll = false, focusName = null) {
  app.innerHTML = renderPage(state, { error, pendingRestore, importError, blocked: repository.blocked });
  updateSaveStatus();
  if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); document.getElementById('main').focus({ preventScroll: true }); }
  if (focusName) app.querySelector(`[name="${CSS.escape(focusName)}"]`)?.focus({ preventScroll: true });
  if (error) {
    const target = error.field ? app.querySelector(`[name="${CSS.escape(error.field)}"]`) : null;
    const focus = target || document.getElementById('form-error');
    focus?.focus({ preventScroll: true }); focus?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
}
function dispatch(action, { redraw = true, scroll = false, focus = null } = {}) {
  const result = transition(state, action);
  error = result.error || null;
  if (state !== result.state) { state = result.state; scheduleSave(); }
  if (redraw || error) render(scroll, focus);
}
function download(name, text) {
  const mime = name.endsWith('.json') ? 'application/json' : name.endsWith('.csv') ? 'text/csv' : 'text/plain';
  const blob = new Blob([mime === 'application/json' ? text : '\ufeff' + text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('다운로드를 시작했어요. 파일이 저장됐는지 확인해 주세요.');
}
function exportAll() { download('AI_Bridge_전체백업_' + new Date().toISOString().slice(0,10) + '.json', backupText(state)); }
async function copy(text) {
  if (!text.trim()) return toast('먼저 요청을 작성해 주세요.');
  try { await navigator.clipboard.writeText(text); toast('요청을 복사했어요. AI 대화에 붙여넣어 주세요.'); }
  catch { toast('복사 권한을 사용할 수 없어요. 입력창의 요청을 직접 선택해 복사해 주세요.'); }
}
function updateFields(element, eventType) {
  if (element.name === 'experience') {
    if (eventType === 'change') dispatch({ type: 'select-experience', experience: element.value }, { focus: 'experience' });
    return;
  }
  if (!element.name) return;
  const value = element.type === 'checkbox' ? element.checked : element.value;
  dispatch({ type: 'field', name: element.name, value }, { redraw: false });
  if (eventType === 'change' && element.tagName === 'SELECT') render(false, element.name);
  if (activeAttempt(state).step === 0) {
    for (const item of preparationFeedback(activeAttempt(state).draft)) {
      const node = app.querySelector(`[data-coach-check="${item.key}"]`);
      node?.classList.toggle('filled', item.filled);
      if (node?.querySelector('svg')) node.querySelector('svg').outerHTML = icon(item.filled ? 'check' : 'circle');
    }
  }
  for (const name of ['ran','followupRan','challengeRan']) {
    const checkbox = app.querySelector(`[name="${name}"]`);
    if (checkbox) checkbox.checked = activeAttempt(state).draft[name];
  }
  // Keep the displayed values in sync when changing a request archives an old run.
  if (['prompt','followup','challengePrompt'].includes(element.name)) {
    const draft = activeAttempt(state).draft;
    for (const name of ['response','evidence','followup','improvedResponse','improvementNote','challengeResponse','challengeEvidence']) {
      const dependent = app.querySelector(`[name="${name}"]`);
      if (dependent && dependent !== element) dependent.value = draft[name];
    }
    for (const group of ['review','challengeReview']) for (const key of ['source','requirements','uncertainty']) {
      const select = app.querySelector(`[name="${group}.${key}"]`);
      if (select) select.value = draft[group][key];
    }
  }
}
app.addEventListener('input', event => {
  if (event.target.matches('textarea,input[type="text"]')) updateFields(event.target, 'input');
});
app.addEventListener('change', async event => {
  if (event.target.id === 'restore-file') {
    const file = event.target.files[0];
    if (!file) return;
    const request = ++restoreRead;
    pendingRestore = null; importError = '';
    render();
    try {
      if (file.size > BACKUP_LIMIT) throw new Error('백업 파일은 20MB 이하만 복원할 수 있습니다.');
      const text = await file.text();
      // A previous file may finish reading after the user selects another one.
      if (request !== restoreRead) return;
      pendingRestore = parseBackup(text);
    } catch (e) {
      if (request !== restoreRead) return;
      importError = e.message;
    }
    render(); return;
  }
  if (event.target.matches('select,input[type="checkbox"]')) updateFields(event.target, 'change');
});
app.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  event.preventDefault();
  const action = control.dataset.action, a = activeAttempt(state), d = a.draft;
  error = null;
  if (action === 'home' || action.startsWith('nav-')) {
    let view = action === 'home' ? 'home' : action.slice(4);
    if (action === 'nav-home' && a.started) view = 'practice';
    dispatch({ type: 'navigate', view }, { scroll: true });
  } else if (action === 'select-task') dispatch({ type: action, task: control.dataset.task });
  else if (action === 'select-tool') dispatch({ type: action, tool: control.dataset.tool });
  else if (action === 'go-step') dispatch({ type: action, step: Number(control.dataset.step) }, { scroll: true });
  else if (['start','start-independent','new-practice','next','previous','finish'].includes(action)) {
    dispatch({ type: action, id: crypto.randomUUID?.() || String(Date.now()) }, { scroll: true });
    if (action === 'finish' && !error) flushSave();
  } else if (['fill-example','rebuild-prompt','keep-prompt','hint'].includes(action)) dispatch({ type: action });
  else if (action === 'reference' || action === 'challenge-reference') dispatch({ type: 'reference', challenge: action === 'challenge-reference' });
  else if (action.startsWith('copy-')) await copy(d[({ 'copy-prompt':'prompt','copy-followup':'followup','copy-challenge':'challengePrompt' })[action]] || '');
  else if (action === 'download' || action === 'download-challenge') {
    const material = exercise(a.task,a.experience,action === 'download-challenge'); download(material.file,material.data);
  } else if (action === 'download-record' || action === 'download-history') {
    const record = state.history.find(r => r.id === (action === 'download-record' ? state.completedId : control.dataset.id));
    if (record) download('AI_Bridge_실습기록.txt',recordText(record));
  } else if (action === 'export-all') exportAll();
  else if (action === 'retry-save') {
    if (repository.blocked) dispatch({ type:'navigate',view:'history' }, { scroll:true });
    else { dirty = true; flushSave(); }
  } else if (action === 'cancel-restore') { restoreRead++; pendingRestore = null; importError = ''; render(); }
  else if (action === 'confirm-restore' && pendingRestore) {
    exportAll(); clearTimeout(saveTimer);
    if (repository.blocked && repository.raw !== null) download('AI_Bridge_저장소원본.json',repository.raw);
    const restored = { ...pendingRestore, view: 'history' };
    if (repository.save(restored,{ recovery:true })) {
      state = restored; pendingRestore = null; dirty = false;
      importError = ''; render(true); toast('백업의 기록과 과제별 초안을 복원했어요.');
    } else { importError = '저장하지 못해 복원을 적용하지 않았습니다. 기존 작업을 유지합니다.'; render(); }
  } else if (action === 'export-raw') {
    if (repository.raw !== null) download('AI_Bridge_저장소원본.json',repository.raw);
    else toast('원본에 접근하지 못했어요. 현재 내용은 전체 백업으로 보관할 수 있습니다.');
  } else if (action === 'recover-storage') {
    if (repository.raw !== null) download('AI_Bridge_저장소원본.json',repository.raw);
    exportAll();
    if (repository.save(state,{ recovery:true })) dirty = false;
    render();
  }
});
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || event.newValue === repository.raw) return;
  clearTimeout(saveTimer); repository.blocked = true; repository.raw = event.newValue;
  repository.status = { kind:'error',message:'다른 창에서 기록이 변경됐어요. 덮어쓰지 않도록 저장을 멈췄습니다. 현재 작업을 백업하고 백업·복원에서 확인하세요.' };
  updateSaveStatus();
});
render();
if (!repository.blocked) scheduleSave();
