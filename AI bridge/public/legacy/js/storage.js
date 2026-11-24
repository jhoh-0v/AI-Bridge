import { tasks, tools, levels, exercise } from './content.js';
import { VERSION, MAX_TEXT, MAX_PROMPT, createState, createAttempt, emptyDraft, signature, blankReview } from './state.js';

export const STORAGE_KEY = 'aibridge-state-v2';
export const LEGACY_KEY = 'aibridge-prototype-v1';
export const BACKUP_LIMIT = 20 * 1024 * 1024;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const invalid = () => { throw new Error('지원하지 않거나 손상된 기록 형식입니다. 기존 기록은 변경하지 않았습니다.'); };
function string(v, fallback = '', limit = MAX_TEXT) {
  if (v === undefined) return fallback;
  if (typeof v !== 'string' || v.length > limit) invalid();
  return v;
}
function review(v = blankReview()) {
  if (!object(v)) invalid();
  return Object.fromEntries(Object.keys(blankReview()).map(k => {
    const value = v[k] ?? 'pending';
    if (!['pending', 'confirmed', 'needs-check'].includes(value)) invalid();
    return [k, value];
  }));
}
function array(v, map) {
  if (!Array.isArray(v)) invalid();
  return v.map(map);
}
function previous(v) {
  if (!object(v)) invalid();
  const result = {};
  for (const k of ['date','tool','experience','prompt','response','evidence','followup','improvedResponse','improvementNote']) result[k] = string(v[k], '', k === 'prompt' ? MAX_PROMPT : MAX_TEXT);
  result.review = review(v.review);
  result.followupRan = v.followupRan === true;
  return result;
}
export function normalizeDraft(value) {
  if (!object(value)) invalid();
  const result = emptyDraft();
  for (const [key, defaultValue] of Object.entries(result)) {
    if (typeof defaultValue === 'string') {
      if (key === 'preparedSignature') {
        if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > MAX_TEXT * 24 + 20)) invalid();
        result[key] = value[key] ?? '';
      } else result[key] = string(value[key], '', ['prompt','firstPrompt','executedPrompt'].includes(key) ? MAX_PROMPT : MAX_TEXT);
    }
    if (typeof defaultValue === 'boolean') {
      if (value[key] !== undefined && typeof value[key] !== 'boolean') invalid();
      result[key] = value[key] ?? defaultValue;
    }
  }
  result.review = review(value.review); result.challengeReview = review(value.challengeReview);
  result.hintLevel = value.hintLevel ?? 0;
  if (!Number.isInteger(result.hintLevel) || result.hintLevel < 0 || result.hintLevel > 3) invalid();
  if (!['', 'yes', 'no'].includes(result.needsRevision)) invalid();
  result.promptVersions = array(value.promptVersions ?? [], v => {
    if (!object(v)) invalid();
    return { text: string(v.text, '', MAX_PROMPT), reason: string(v.reason), date: string(v.date) };
  });
  result.previousRuns = array(value.previousRuns ?? [], previous);
  result.previousChallenges = array(value.previousChallenges ?? [], previous);
  return result;
}
function selection(value, catalog) { if (!Object.hasOwn(catalog, value)) invalid(); return value; }
function materials(value, fallback) {
  if (value === undefined) return fallback;
  if (!object(value)) invalid();
  return { data: string(value.data), file: string(value.file), brief: string(value.brief), difficulty: string(value.difficulty), references: array(value.references, v => string(v)) };
}
export function normalizeState(value) {
  if (!object(value) || value.version !== VERSION || !object(value.drafts) || !object(value.preferences)) invalid();
  const result = createState();
  result.task = selection(value.task, tasks);
  result.preferences = { tool: selection(value.preferences.tool, tools), experience: selection(value.preferences.experience, levels) };
  if (!['home','practice','history','guide','complete'].includes(value.view)) invalid();
  result.view = value.view;
  result.updatedAt = value.updatedAt == null ? null : string(value.updatedAt);
  result.drafts = {};
  for (const [task, entry] of Object.entries(value.drafts)) {
    selection(task, tasks);
    if (!object(entry)) invalid();
    const a = createAttempt(task, selection(entry.tool, tools), selection(entry.experience, levels));
    for (const key of ['step','maxStep']) {
      if (!Number.isInteger(entry[key]) || entry[key] < 0 || entry[key] > 3) invalid();
      a[key] = entry[key];
    }
    if (a.step > a.maxStep || !['guided','independent'].includes(entry.mode) || typeof entry.started !== 'boolean') invalid();
    a.mode = entry.mode; a.started = entry.started; a.completedId = entry.completedId == null ? null : string(entry.completedId);
    a.draft = normalizeDraft(entry.draft);
    result.drafts[task] = a;
  }
  if (!result.drafts[result.task]) invalid();
  const seen = new Set();
  result.history = array(value.history, r => {
    if (!object(r)) invalid();
    const task = selection(r.task, tasks), level = selection(r.experience, levels), id = string(r.id);
    if (!id || seen.has(id) || !['guided','independent','legacy'].includes(r.mode)) invalid();
    if (!Number.isFinite(Date.parse(r.date))) invalid();
    if (r.materials !== undefined && !object(r.materials)) invalid();
    seen.add(id);
    return { id, date: string(r.date), task, title: string(r.title), tool: selection(r.tool, tools), experience: level, mode: r.mode,
      draft: normalizeDraft(r.draft), materials: {
        guided: materials(r.materials?.guided, exercise(task, level)), challenge: materials(r.materials?.challenge, exercise(task, level, true))
      } };
  });
  result.completedId = value.completedId == null ? null : string(value.completedId);
  if (result.completedId && !seen.has(result.completedId)) invalid();
  for (const a of Object.values(result.drafts)) if (a.completedId && !seen.has(a.completedId)) invalid();
  if (result.view === 'complete' && !result.completedId) result.view = 'home';
  return result;
}

export function migrateLegacy(old) {
  if (!object(old) || !Object.hasOwn(tasks, old.task) || !Object.hasOwn(tools, old.tool)) invalid();
  const next = createState();
  next.task = old.task;
  next.preferences = { tool: old.tool, experience: Object.hasOwn(levels, old.experience) ? old.experience : 'new' };
  const migrateDraft = original => {
    const input = object(original) ? original : {};
    const d = emptyDraft();
    for (const key of ['goal','data','format','checks','prompt','response','evidence','followup','challengePrompt','challengeEvidence']) d[key] = string(input[key]);
    d.ran = input.ran === true; d.hintUsed = input.hintUsed === true; d.hintLevel = d.hintUsed ? 1 : 0;
    d.challengeRan = input.challengeRan === true; d.preparedSignature = signature(d); d.firstPrompt = d.prompt;
    d.executedPrompt = d.ran ? d.prompt : ''; d.executedTool = d.ran ? old.tool : '';
    d.executedChallenge = d.challengeRan ? d.challengePrompt : '';
    for (const [key, legacy] of [['source','checkSource'],['requirements','checkRequirements'],['uncertainty','checkUncertainty']]) if (input[legacy]) d.review[key] = 'confirmed';
    return d;
  };
  const a = createAttempt(old.task, old.tool, next.preferences.experience);
  a.draft = migrateDraft(old.draft);
  a.started = old.started === true;
  // New required evidence is not silently treated as satisfied by old completion flags.
  a.step = a.started ? Math.min(2, Math.max(0, Math.floor(Number(old.step) || 0))) : 0;
  a.maxStep = a.step;
  next.drafts = { [old.task]: a };
  next.view = a.started ? 'practice' : 'home';
  const usedIds = new Set();
  next.history = array(old.history ?? [], (r, index) => {
    if (!object(r) || !Object.hasOwn(tasks, r.task) || !Object.hasOwn(tools, r.tool)) invalid();
    const date = Number.isFinite(Date.parse(r.date)) ? r.date : new Date(0).toISOString();
    let id = string(r.id, `legacy-${index}`);
    while (usedIds.has(id)) id += '-legacy';
    usedIds.add(id);
    return { id, date, task: r.task, title: string(r.title, tasks[r.task].short), tool: r.tool, experience: 'tried', mode: 'legacy',
      draft: migrateDraft(r), materials: { guided: exercise(r.task, 'tried'), challenge: exercise(r.task, 'tried', true) } };
  });
  return normalizeState(next);
}

export function backupText(state, now = new Date().toISOString()) {
  return JSON.stringify({ format: 'aibridge-backup', version: VERSION, exportedAt: now, state }, null, 2);
}
export function parseBackup(text) {
  if (new TextEncoder().encode(text).length > BACKUP_LIMIT) throw new Error('백업 파일은 20MB 이하만 복원할 수 있습니다.');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('JSON 백업 파일을 읽을 수 없습니다. 기존 기록은 그대로입니다.'); }
  if (!object(data) || data.format !== 'aibridge-backup' || data.version !== VERSION) invalid();
  return normalizeState(data.state);
}

export class Repository {
  constructor(getStorage) { this.getStorage = getStorage; this.blocked = false; this.raw = null; this.status = { kind: 'idle', message: '저장 준비 중' }; }
  load() {
    try {
      const storage = this.getStorage();
      const current = storage.getItem(STORAGE_KEY);
      const legacy = current === null ? storage.getItem(LEGACY_KEY) : null;
      this.raw = current ?? legacy;
      const state = current !== null ? normalizeState(JSON.parse(current)) : legacy !== null ? migrateLegacy(JSON.parse(legacy)) : createState();
      this.status = { kind: 'ready', message: legacy !== null ? '이전 기록을 불러왔어요. 원본도 보존돼요.' : '이 브라우저에 자동 저장돼요.' };
      return state;
    } catch (error) {
      this.blocked = true;
      this.status = { kind: 'error', message: '저장된 기록을 불러오지 못했어요. 원본을 덮어쓰지 않고 임시로 작업 중입니다. 백업·복원에서 확인하세요.' };
      return createState();
    }
  }
  save(state, { recovery = false } = {}) {
    if (this.blocked && !recovery) return false;
    try {
      const text = JSON.stringify(state);
      this.getStorage().setItem(STORAGE_KEY, text);
      this.raw = text; this.blocked = false;
      this.status = { kind: 'saved', message: '이 브라우저에 저장했어요.', date: new Date().toISOString() };
      return true;
    } catch {
      this.status = { kind: 'error', message: '브라우저에 저장하지 못했어요. 저장 공간이나 브라우저 설정을 확인하고, 지금 전체 백업을 받아두세요.' };
      return false;
    }
  }
}
