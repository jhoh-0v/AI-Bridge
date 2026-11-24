import { tasks, tools, levels, reviewItems, exercise } from './content.js';

export const VERSION = 2;
export const MAX_TEXT = 12000;
export const MAX_PROMPT = MAX_TEXT * 4 + 200;
export const blankReview = () => ({ source: 'pending', requirements: 'pending', uncertainty: 'pending' });
export const emptyDraft = () => ({
  goal: '', data: '', format: '', checks: '', prompt: '', preparedSignature: '', firstPrompt: '',
  ran: false, executedPrompt: '', executedTool: '', response: '', evidence: '', review: blankReview(),
  needsRevision: '', followup: '', followupRan: false, executedFollowup: '', improvedResponse: '', improvementNote: '',
  challengePrompt: '', challengeResponse: '', challengeEvidence: '', challengeRan: false, executedChallenge: '',
  challengeReview: blankReview(), hintLevel: 0, hintUsed: false, referenceSeen: false, challengeReferenceSeen: false,
  promptVersions: [], previousRuns: [], previousChallenges: []
});

export function createAttempt(task, tool = 'ChatGPT', experience = 'new') {
  return { task, tool, experience, started: false, step: 0, maxStep: 0, mode: 'guided', completedId: null, draft: emptyDraft() };
}

export function createState() {
  return { version: VERSION, view: 'home', task: 'sales', preferences: { tool: 'ChatGPT', experience: 'new' },
    drafts: { sales: createAttempt('sales') }, history: [], completedId: null, updatedAt: null };
}

export const activeAttempt = state => state.drafts[state.task];
export const signature = d => JSON.stringify([d.goal, d.data, d.format, d.checks]);
export const promptIsStale = d => Boolean(d.prompt) && signature(d) !== d.preparedSignature;
export function makePrompt(d) {
  return ['[업무 목표]', d.goal, '', '[자료와 상황]', d.data, '', '[원하는 결과]', d.format,
    d.checks ? '\n[확인할 조건]\n' + d.checks : ''].join('\n').trim();
}

function addVersion(d, text, reason, now) {
  if (!text.trim() || d.promptVersions.at(-1)?.text === text) return;
  d.promptVersions.push({ text, reason, date: now });
  if (!d.firstPrompt) d.firstPrompt = text;
}

function invalidateRun(a, now) {
  const d = a.draft;
  if (d.ran || d.response || d.evidence || d.followup || d.improvedResponse) {
    d.previousRuns.push({ date: now, tool: d.executedTool || a.tool, prompt: d.executedPrompt || d.prompt,
      response: d.response, evidence: d.evidence, review: structuredClone(d.review), followup: d.followup,
      followupRan: d.followupRan, improvedResponse: d.improvedResponse, improvementNote: d.improvementNote });
  }
  Object.assign(d, { ran: false, executedPrompt: '', executedTool: '', response: '', evidence: '', review: blankReview(),
    needsRevision: '', followup: '', followupRan: false, executedFollowup: '', improvedResponse: '', improvementNote: '' });
  if (a.mode === 'guided') { a.maxStep = Math.min(1, a.maxStep); a.step = Math.min(a.step, 1); }
}

function invalidateChallenge(a, now) {
  const d = a.draft;
  if (d.challengeRan || d.challengeResponse || d.challengeEvidence) {
    d.previousChallenges.push({ date: now, tool: a.tool, experience: a.experience,
      prompt: d.executedChallenge || d.challengePrompt, response: d.challengeResponse,
      evidence: d.challengeEvidence, review: structuredClone(d.challengeReview) });
  }
  Object.assign(d, { challengeRan: false, executedChallenge: '', challengeResponse: '', challengeEvidence: '', challengeReview: blankReview() });
}

function issue(message, field) { return { message, field }; }
function validateReview(review, prefix) {
  const missing = reviewItems.find(item => review[item.key] === 'pending');
  return missing ? issue('각 항목을 「확인할 수 있었음」 또는 「추가 확인이 필요함」으로 선택해 주세요.', prefix + '.' + missing.key) : null;
}

export function validateStage(a, step) {
  const d = a.draft;
  if (step === 0) {
    for (const key of ['goal', 'data', 'format']) {
      if (!d[key].trim()) return issue(({ goal: '끝내고 싶은 업무를 적어주세요.', data: '자료와 상황을 설명해 주세요.', format: '원하는 결과의 형태를 적어주세요.' })[key], key);
    }
    if (promptIsStale(d)) return issue('준비 내용이 달라졌어요. 새 내용을 반영하거나 직접 편집한 요청을 유지할지 선택해 주세요.', 'goal');
  }
  if (step === 1) {
    if (!d.prompt.trim()) return issue('AI에 전달할 요청을 작성해 주세요.', 'prompt');
    if (!d.ran || d.executedPrompt !== d.prompt || d.executedTool !== a.tool)
      return issue('현재 요청을 선택한 AI에서 실행한 뒤 체크해 주세요.', 'ran');
  }
  if (step === 2) {
    if (!d.response.trim()) return issue('AI 답변 또는 확인할 핵심 부분을 남겨주세요.', 'response');
    const reviewIssue = validateReview(d.review, 'review');
    if (reviewIssue) return reviewIssue;
    if (!d.evidence.trim()) return issue('대조한 근거와 추가 확인이 필요한 내용을 적어주세요.', 'evidence');
    if (!['yes', 'no'].includes(d.needsRevision)) return issue('답변을 다시 수정할 필요가 있는지 선택해 주세요.', 'needsRevision');
    if (d.needsRevision === 'yes') {
      if (!d.followup.trim()) return issue('수정할 조건을 담은 후속 요청을 작성해 주세요.', 'followup');
      if (!d.followupRan || d.executedFollowup !== d.followup) return issue('현재 후속 요청을 AI에서 실행한 뒤 체크해 주세요.', 'followupRan');
      if (!d.improvedResponse.trim()) return issue('후속 요청으로 받은 답변을 남겨주세요.', 'improvedResponse');
    }
    if (!d.improvementNote.trim()) return issue('무엇이 달라졌는지, 또는 추가 수정이 필요 없는 근거를 적어주세요.', 'improvementNote');
  }
  if (step === 3) {
    if (!d.challengePrompt.trim()) return issue('새 과제의 요청을 직접 작성해 주세요.', 'challengePrompt');
    if (!d.challengeRan || d.executedChallenge !== d.challengePrompt) return issue('현재 독립 실습 요청을 실행한 뒤 체크해 주세요.', 'challengeRan');
    if (!d.challengeResponse.trim()) return issue('독립 실습에서 받은 답변을 남겨주세요.', 'challengeResponse');
    const reviewIssue = validateReview(d.challengeReview, 'challengeReview');
    if (reviewIssue) return reviewIssue;
    if (!d.challengeEvidence.trim()) return issue('새 과제에서 확인한 근거와 미확인 사항을 적어주세요.', 'challengeEvidence');
  }
  return null;
}

export function transition(state, action) {
  const next = structuredClone(state);
  const now = action.now || new Date().toISOString();
  let a = activeAttempt(next);
  let d = a.draft;
  const fail = error => ({ state, error });
  switch (action.type) {
    case 'navigate':
      if (!['home', 'practice', 'history', 'guide', 'complete'].includes(action.view)) return { state };
      next.view = action.view; break;
    case 'select-task':
      if (!Object.hasOwn(tasks, action.task)) return { state };
      next.task = action.task;
      next.drafts[action.task] ||= createAttempt(action.task, next.preferences.tool, next.preferences.experience);
      next.view = 'home'; break;
    case 'select-tool':
      if (!Object.hasOwn(tools, action.tool) || a.tool === action.tool) return { state };
      invalidateRun(a, now); invalidateChallenge(a, now);
      a.tool = action.tool; next.preferences.tool = action.tool; break;
    case 'select-experience':
      if (!Object.hasOwn(levels, action.experience) || a.experience === action.experience) return { state };
      invalidateChallenge(a, now);
      a.experience = action.experience; next.preferences.experience = action.experience;
      d.challengeReferenceSeen = false; d.hintLevel = 0; d.hintUsed = false; break;
    case 'start':
    case 'start-independent':
      if (a.completedId) { next.drafts[next.task] = createAttempt(next.task, a.tool, a.experience); a = activeAttempt(next); }
      if (action.type === 'start-independent') { a.mode = 'independent'; a.step = 3; a.maxStep = 3; }
      a.started = true; next.view = 'practice'; break;
    case 'new-practice':
      // A finished attempt is already preserved in history; other task drafts stay intact.
      if (a.completedId) next.drafts[next.task] = createAttempt(next.task, a.tool, a.experience);
      next.view = 'home'; break;
    case 'field': {
      const name = action.name;
      if (/^(review|challengeReview)\.(source|requirements|uncertainty)$/.test(name)) {
        if (!['pending', 'confirmed', 'needs-check'].includes(action.value)) return { state };
        const [group, key] = name.split('.'); d[group][key] = action.value; break;
      }
      const textFields = ['goal','data','format','checks','prompt','response','evidence','needsRevision','followup','improvedResponse','improvementNote','challengePrompt','challengeResponse','challengeEvidence'];
      const booleans = ['ran','followupRan','challengeRan'];
      if (!textFields.includes(name) && !booleans.includes(name)) return { state };
      const value = booleans.includes(name) ? action.value === true : String(action.value).slice(0, name === 'prompt' ? MAX_PROMPT : MAX_TEXT);
      if (d[name] === value) return { state };
      if (name === 'prompt') invalidateRun(a, now);
      if (name === 'challengePrompt') invalidateChallenge(a, now);
      if (name === 'followup') {
        if (d.improvedResponse || d.improvementNote) d.previousRuns.push({ date: now, tool: a.tool, prompt: d.prompt, response: d.response,
          evidence: d.evidence, review: structuredClone(d.review), followup: d.followup, improvedResponse: d.improvedResponse, improvementNote: d.improvementNote });
        d.followupRan = false; d.executedFollowup = ''; d.improvedResponse = ''; d.improvementNote = '';
      }
      d[name] = value;
      if (name === 'ran') { d.executedPrompt = value ? d.prompt : ''; d.executedTool = value ? a.tool : ''; if (value) addVersion(d, d.prompt, 'AI에서 실행한 요청', now); }
      if (name === 'followupRan') d.executedFollowup = value ? d.followup : '';
      if (name === 'challengeRan') d.executedChallenge = value ? d.challengePrompt : '';
      break;
    }
    case 'fill-example':
      // UI exposes this only for empty preparation fields, so typed content is never replaced.
      for (const [key, value] of Object.entries(tasks[next.task].example)) if (!d[key].trim()) d[key] = value;
      break;
    case 'rebuild-prompt': {
      const prompt = makePrompt(d);
      addVersion(d, d.prompt, '반영 전 직접 편집한 요청', now);
      if (prompt !== d.prompt) invalidateRun(a, now);
      d.prompt = prompt; d.preparedSignature = signature(d); addVersion(d, prompt, '준비 내용 반영', now); break;
    }
    case 'keep-prompt': d.preparedSignature = signature(d); addVersion(d, d.prompt, '직접 편집한 요청 유지', now); break;
    case 'previous': a.step = Math.max(a.mode === 'independent' ? 3 : 0, a.step - 1); break;
    case 'go-step':
    case 'next': {
      const target = action.type === 'next' ? Math.min(3, a.step + 1) : Number(action.step);
      if (!Number.isInteger(target) || target < 0 || target > 3 || (a.mode === 'independent' && target !== 3)) return { state };
      if (action.type === 'go-step' && target > a.maxStep) return fail(issue('앞 단계부터 완료해 주세요.'));
      if (target > a.step) {
        for (let step = 0; step < target; step++) {
          const error = validateStage(a, step);
          if (error) return fail(error);
          if (step === 0 && !d.prompt.trim()) {
            d.prompt = makePrompt(d); d.preparedSignature = signature(d); addVersion(d, d.prompt, '첫 요청', now);
          }
        }
      }
      a.step = target; a.maxStep = Math.max(target, a.maxStep); break;
    }
    case 'hint': d.hintLevel = Math.min(3, d.hintLevel + 1); d.hintUsed = true; break;
    case 'reference':
      if (action.challenge) { d.challengeReferenceSeen = true; d.hintUsed = true; }
      else d.referenceSeen = true;
      break;
    case 'finish': {
      if (a.completedId) { next.completedId = a.completedId; next.view = 'complete'; break; }
      for (let step = a.mode === 'independent' ? 3 : 0; step <= 3; step++) {
        const error = validateStage(a, step); if (error) return fail(error);
      }
      let id = action.id || now;
      while (next.history.some(r => r.id === id)) id += '-new';
      const record = { id, date: now, task: next.task, title: tasks[next.task].short, tool: a.tool,
        experience: a.experience, mode: a.mode, draft: structuredClone(d),
        materials: { guided: exercise(next.task, a.experience), challenge: exercise(next.task, a.experience, true) } };
      next.history.unshift(record);
      a.started = false; a.completedId = id; next.completedId = id; next.view = 'complete'; break;
    }
    default: return { state };
  }
  next.updatedAt = now;
  return { state: next, error: null };
}
