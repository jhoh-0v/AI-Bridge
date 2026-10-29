import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createState, transition } from '../public/legacy/js/state.js';
import { Repository, STORAGE_KEY, LEGACY_KEY, BACKUP_LIMIT, backupText, parseBackup } from '../public/legacy/js/storage.js';

// Exercise the real event handlers with in-memory DOM/storage adapters.
// This does not attach to a browser or read/write its profile or localStorage.
const originalBackup = process.env.AIBRIDGE_TEST_BACKUP
  ? readFileSync(process.env.AIBRIDGE_TEST_BACKUP, 'utf8')
  : backupText(createState());
let instance = 0;

function practiceState() {
  let state = createState();
  const act = action => {
    const result = transition(state, action);
    assert.equal(result.error ?? null, null);
    state = result.state;
  };
  act({ type: 'start-independent' });
  for (const [name, value] of Object.entries({
    challengePrompt: '[테스트] 새 자료를 요약해 주세요.', challengeRan: true,
    challengeResponse: '[테스트] 응답', challengeEvidence: '[테스트] 원자료와 대조',
    'challengeReview.source': 'confirmed', 'challengeReview.requirements': 'confirmed',
    'challengeReview.uncertainty': 'needs-check'
  })) act({ type: 'field', name, value });
  act({ type: 'finish', id: 'controller-test-record', now: '2026-10-29T06:00:00.000Z' });
  act({ type: 'select-task', task: 'email' });
  act({ type: 'field', name: 'goal', value: '[테스트] 다른 과제의 초안' });
  act({ type: 'navigate', view: 'history' });
  return state;
}

async function mount(t, initial = practiceState()) {
  const appEvents = new Map(), windowEvents = new Map(), timers = new Map(), urls = new Map();
  const events = [], values = new Map([[STORAGE_KEY, JSON.stringify(initial)], [LEGACY_KEY, 'untouched legacy']]);
  let timerId = 0, failWrite = false;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (failWrite) throw new Error('QuotaExceededError');
      events.push({ type: 'save', key }); values.set(key, value);
    }
  };
  const element = () => ({ textContent: '', classList: { add() {}, remove() {} }, focus() {}, scrollIntoView() {} });
  const app = { innerHTML: '', querySelector: () => null, addEventListener: (type, fn) => appEvents.set(type, fn) };
  const nodes = new Map([['app', app], ...['main', 'toast', 'save-status', 'retry-save', 'form-error'].map(id => [id, element()])]);
  const overrides = {
    window: { localStorage: storage, scrollTo() {}, addEventListener: (type, fn) => windowEvents.set(type, fn) },
    document: {
      getElementById: id => nodes.get(id) ?? null,
      addEventListener() {}, body: { append() {} },
      createElement(tag) {
        assert.equal(tag, 'a');
        return { click() { events.push({ type: 'download', name: this.download, blob: urls.get(this.href) }); }, remove() {} };
      }
    },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  };
  for (const [key, value] of Object.entries(overrides)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  for (const [key, value] of Object.entries({
    createObjectURL: blob => { const url = `blob:test-${urls.size}`; urls.set(url, blob); return url; },
    revokeObjectURL: url => urls.delete(url)
  })) {
    const original = URL[key]; URL[key] = value; t.after(() => { URL[key] = original; });
  }
  await import(`../public/legacy/js/controller.js?test=${++instance}`);
  return {
    app, nodes, events, values, storage,
    failWrites: value => { failWrite = value; },
    stored: () => JSON.parse(values.get(STORAGE_KEY)),
    choose: (contents, size) => appEvents.get('change')({ target: {
      id: 'restore-file', files: [{ size: size ?? Buffer.byteLength(typeof contents === 'string' ? contents : ''),
        text: async () => typeof contents === 'function' ? contents() : contents }]
    } }),
    click: action => appEvents.get('click')({ preventDefault() {}, target: {
      closest: () => ({ disabled: false, dataset: { action } })
    } }),
    flush() {
      const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());
      windowEvents.get('pagehide')();
    }
  };
}

test('backup preview and cancellation do not change saved records or drafts', async t => {
  const h = await mount(t), before = h.values.get(STORAGE_KEY);
  await h.choose(originalBackup);
  assert.match(h.app.innerHTML, /복원 전 확인/);
  assert.equal(h.values.get(STORAGE_KEY), before);
  await h.click('cancel-restore');
  assert.doesNotMatch(h.app.innerHTML, /복원 전 확인/);
  assert.equal(h.values.get(STORAGE_KEY), before);
  assert.equal(h.events.length, 0);
});

test('invalid and oversized files cannot leave an earlier valid restore armed', async t => {
  const h = await mount(t), before = h.values.get(STORAGE_KEY);
  for (const [contents, size] of [['{'], ['{}'], [originalBackup, BACKUP_LIMIT + 1]]) {
    await h.choose(originalBackup);
    await h.choose(contents, size);
    assert.match(h.app.innerHTML, /role="alert"/);
    assert.doesNotMatch(h.app.innerHTML, /data-action="confirm-restore"/);
    await h.click('confirm-restore');
    assert.equal(h.values.get(STORAGE_KEY), before);
    assert.equal(h.events.length, 0);
  }
});

test('restore exports current data first and survives pending autosave, pagehide and reload', async t => {
  const h = await mount(t), before = h.stored();
  await h.choose(originalBackup);
  await h.click('confirm-restore');
  assert.deepEqual(h.events.map(e => e.type), ['download', 'save']);
  assert.deepEqual(parseBackup(await h.events[0].blob.text()), before);
  const expected = { ...parseBackup(originalBackup), view: 'history' };
  assert.deepEqual(h.stored(), expected);
  h.flush();
  const reloaded = new Repository(() => h.storage).load();
  assert.deepEqual(reloaded, expected);
  assert.equal(h.values.get(LEGACY_KEY), 'untouched legacy');
  assert.equal(h.nodes.get('toast').textContent, '백업의 기록과 과제별 초안을 복원했어요.');
});

test('failed restore preserves existing state and supports retrying the same backup', async t => {
  const h = await mount(t), before = h.stored();
  await h.choose(originalBackup); h.failWrites(true);
  await h.click('confirm-restore');
  assert.deepEqual(h.stored(), before);
  assert.match(h.app.innerHTML, /저장하지 못해 복원을 적용하지 않았습니다/);
  assert.match(h.app.innerHTML, /controller-test-record/);
  h.failWrites(false); await h.click('confirm-restore');
  assert.deepEqual(h.stored(), { ...parseBackup(originalBackup), view: 'history' });
});

test('a slow earlier file cannot replace the most recently selected backup', async t => {
  const h = await mount(t);
  let finishOldRead;
  const oldRead = h.choose(() => new Promise(resolve => { finishOldRead = resolve; }));
  await h.choose(originalBackup);
  finishOldRead(backupText(practiceState())); await oldRead;
  await h.click('confirm-restore');
  assert.deepEqual(h.stored(), { ...parseBackup(originalBackup), view: 'history' });
});

test('an earlier read failure cannot overwrite the latest valid preview', async t => {
  const h = await mount(t);
  let rejectOldRead;
  const oldRead = h.choose(() => new Promise((_, reject) => { rejectOldRead = reject; }));
  await h.choose(originalBackup);
  rejectOldRead(new Error('old file read failed')); await oldRead;
  assert.doesNotMatch(h.app.innerHTML, /old file read failed/);
  assert.match(h.app.innerHTML, /복원 전 확인/);
  await h.click('confirm-restore');
  assert.deepEqual(h.stored(), { ...parseBackup(originalBackup), view: 'history' });
});

test('cancelling a pending file read prevents its preview from returning', async t => {
  const h = await mount(t), before = h.values.get(STORAGE_KEY);
  let finishRead;
  const read = h.choose(() => new Promise(resolve => { finishRead = resolve; }));
  await h.click('cancel-restore');
  finishRead(originalBackup); await read;
  assert.doesNotMatch(h.app.innerHTML, /복원 전 확인/);
  await h.click('confirm-restore');
  assert.equal(h.values.get(STORAGE_KEY), before);
});

