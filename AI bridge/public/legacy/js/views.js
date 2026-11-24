import { tasks, tools, levels, reviewItems, exercise } from './content.js';
import { activeAttempt, promptIsStale, makePrompt, MAX_TEXT, MAX_PROMPT } from './state.js';
import { preparationFeedback, reflectionFeedback, outcome } from './feedback.js';
import { recordText } from './records.js';
import { icon, h, bridgeArt } from './ui.js';

const button = (label, action, kind = '', extra = '') => `<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const id = name => 'field-' + name.replaceAll('.', '-');
const textBlock = (label, value) => `<div class="reflection-item"><span>${h(label)}</span><p>${h(value || '아직 기록하지 않았어요.')}</p></div>`;
function field(ctx, name, label, { optional = false, placeholder = '', rows = 3, help = '' } = {}) {
  const value = ctx.a.draft[name];
  const invalid = ctx.error?.field === name;
  return `<div class="field"><label for="${id(name)}">${h(label)} ${optional ? '<small>선택</small>' : '<small>필수</small>'}</label>
    <textarea id="${id(name)}" name="${name}" rows="${rows}" maxlength="${name === 'prompt' ? MAX_PROMPT : MAX_TEXT}" placeholder="${h(placeholder)}" ${optional ? '' : 'aria-required="true"'} aria-invalid="${invalid}" ${help ? `aria-describedby="${id(name)}-help"` : ''}>${h(value)}</textarea>
    ${help ? `<p class="field-help" id="${id(name)}-help">${h(help)}</p>` : ''}</div>`;
}
function check(ctx, name, label) {
  return `<label class="check-line"><input id="${id(name)}" type="checkbox" name="${name}" ${ctx.a.draft[name] ? 'checked' : ''}><span>${h(label)}</span></label>`;
}
function aiLink(a) { return `<a class="button dark" href="${tools[a.tool].url}" target="_blank" rel="noopener noreferrer">${h(a.tool)} 열기 ${icon('external')}</a>`; }
function resource(a, challenge = false) {
  const material = exercise(a.task, a.experience, challenge);
  return `<div class="resource-strip"><div class="resource-left">${icon('file')}<div><strong>${challenge ? '새로운 독립 실습 자료' : tasks[a.task].resource}</strong><span>${h(material.file)}</span></div></div>${button('자료 받기 ' + icon('download'), challenge ? 'download-challenge' : 'download', 'secondary small')}</div>
    <details class="source-data"><summary>연습 자료를 화면에서 읽기</summary><pre>${h(material.data)}</pre></details>`;
}
function actions(ctx, label, last = false) {
  return `<div class="work-actions">${ctx.a.step > 0 && ctx.a.mode !== 'independent' ? button(icon('back') + '이전', 'previous', 'secondary') : '<span class="small-note">입력 내용은 과제별로 보관돼요.</span>'}${button(h(label) + icon('arrow'), last ? 'finish' : 'next')}</div>`;
}
function comparison(leftLabel, left, rightLabel, right) {
  return `<div class="comparison"><div>${textBlock(leftLabel, left)}</div><div>${textBlock(rightLabel, right)}</div></div>`;
}
function syncNotice(ctx) {
  if (!promptIsStale(ctx.a.draft)) return '';
  return `<section class="notice warning" aria-label="요청문 갱신 선택"><strong>준비 내용이 달라졌어요.</strong><p>현재 요청을 덮어쓰기 전에 확인해 주세요. 이전 요청은 변경 이력에 보관합니다.</p>
    <details><summary>현재 요청과 반영할 요청 비교</summary>${comparison('현재 요청', ctx.a.draft.prompt, '준비 내용으로 만든 새 요청', makePrompt(ctx.a.draft))}</details>
    <div class="action-pair">${button('새 준비 내용 반영', 'rebuild-prompt', 'small')}${button('직접 편집한 요청 유지', 'keep-prompt', 'secondary small')}</div></section>`;
}
function promptVersions(d) {
  if (!d.promptVersions.length && !d.previousRuns.length && !d.previousChallenges.length) return '';
  return `<details class="saved-versions"><summary>보관한 요청·결과 이력 (${d.promptVersions.length + d.previousRuns.length + d.previousChallenges.length})</summary>
    ${d.promptVersions.map(v => textBlock(v.reason, v.text)).join('')}
    ${d.previousRuns.map(v => `<details><summary>이전 실행 · ${h(new Date(v.date).toLocaleString('ko-KR'))}</summary>${textBlock('요청', v.prompt)}${textBlock('답변', v.response)}${textBlock('확인 근거', v.evidence)}${textBlock('후속 요청', v.followup)}${textBlock('개선 답변', v.improvedResponse)}${textBlock('성찰', v.improvementNote)}</details>`).join('')}
    ${d.previousChallenges.map(v => `<details><summary>이전 독립 실습</summary>${textBlock('요청', v.prompt)}${textBlock('답변', v.response)}${textBlock('근거', v.evidence)}</details>`).join('')}</details>`;
}
function reference(ctx, challenge = false) {
  const d = ctx.a.draft, seen = challenge ? d.challengeReferenceSeen : d.referenceSeen;
  return `<section class="reference-box"><h3>기준 자료와 대조하기</h3><p>준비된 가상 자료의 확인 기준입니다. AI 답변을 자동으로 판정하지 않습니다.${challenge ? ' 열람하면 도움을 활용한 실습으로 기록됩니다.' : ''}</p>
    ${seen ? `<ol>${exercise(ctx.a.task, ctx.a.experience, challenge).references.map(fact => `<li>${h(fact)}</li>`).join('')}</ol>` : button('기준 답안과 근거 보기', challenge ? 'challenge-reference' : 'reference', 'secondary small')}</section>`;
}
function reviews(ctx, challenge = false) {
  const group = challenge ? 'challengeReview' : 'review', review = ctx.a.draft[group];
  const feedback = reflectionFeedback(review);
  return `<fieldset class="review-fields"><legend>확인 결과를 솔직하게 기록해 주세요.</legend>${reviewItems.map(item => {
    const name = group + '.' + item.key;
    return `<div class="field"><label for="${id(name)}">${h(item.label)}</label><select id="${id(name)}" name="${name}" aria-required="true" aria-invalid="${ctx.error?.field === name}">
      ${[['pending','선택해 주세요'],['confirmed','확인할 수 있었음'],['needs-check','추가 확인이 필요함']].map(([value,label]) => `<option value="${value}" ${review[item.key] === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
  }).join('')}</fieldset><div class="reflection-feedback"><strong>다음 확인에 도움이 되는 안내</strong>${feedback.length ? `<ul>${feedback.map(item => `<li>${h(item.next)}</li>`).join('')}</ul>` : '<p>세 항목의 확인 내용을 아래에 구체적인 근거로 남겨주세요. 선택 결과만으로 정확성을 판정하지 않습니다.</p>'}</div>`;
}

function home(ctx) {
  const { state, a } = ctx;
  return `<section class="hero"><div><div class="eyebrow">AI 실무 연습실</div><h1>업무는 AI와,<br><em>실력은 나에게.</em></h1><p class="hero-copy">직접 요청하고, 근거를 확인하고, 더 나은 답으로 고쳐보세요.<br>작은 실습 하나부터 스스로 하는 힘을 길러요.</p></div>${bridgeArt()}</section>
    <section aria-labelledby="task-heading"><div class="section-heading"><h2 id="task-heading">어떤 업무부터 시작할까요?</h2></div><div class="task-grid">${Object.entries(tasks).map(([key,t]) => `<button type="button" class="task-card ${state.task === key ? 'selected' : ''}" data-action="select-task" data-task="${key}" aria-pressed="${state.task === key}"><div class="card-top"><span class="task-icon ${key}">${icon(t.icon)}</span><span class="selection-indicator">${state.task === key ? icon('check') : ''}</span></div><h3>${t.title}</h3><p>${h(t.subtitle)}</p><div class="card-footer"><span class="tag">${h(t.category)}</span>${state.drafts[key]?.started ? '<span class="tag orange">작성 중 · 이어하기</span>' : ''}</div></button>`).join('')}</div>
    <p class="field-help">과제를 바꿔도 작성하던 내용은 각각 보관돼요.</p>
    <div class="setup-panel"><div class="setup-group"><p class="setup-label">어떤 AI에서 실행할까요?</p><div class="tool-options">${Object.entries(tools).map(([key,t]) => `<button type="button" class="tool-option ${a.tool === key ? 'active' : ''}" data-action="select-tool" data-tool="${key}" aria-pressed="${a.tool === key}">${h(t.symbol)} ${key}</button>`).join('')}</div><p class="field-help">새 창에서 직접 실행해요. AI를 바꾸면 새 도구에서 재실행이 필요해요.</p></div>
    <div class="setup-group"><label class="setup-label" for="experience">나에게 맞는 연습 수준</label><select id="experience" name="experience">${Object.entries(levels).map(([key,l]) => `<option value="${key}" ${a.experience === key ? 'selected' : ''}>${h(l.label)} · ${h(l.difficulty)}</option>`).join('')}</select><p class="field-help">${h(levels[a.experience].description)} 수준을 바꾸면 독립 실습의 조건도 바뀝니다.</p></div></div>
    <div class="start-row"><span class="start-caption">${icon('leaf')}자료와 확인 기준을 함께 준비했어요.</span><div class="action-pair">${a.experience === 'familiar' && !a.started ? button('독립 실습부터', 'start-independent', 'secondary') : ''}${button((a.started ? '이어서 실습하기' : '안내와 함께 시작하기') + icon('arrow'), 'start')}</div></div></section>`;
}
function prepare(ctx) {
  const task = tasks[ctx.a.task];
  return `<div class="card-eyebrow">STEP 01 · PREPARE</div><h2>AI에게 무엇을 부탁할까요?</h2><p class="intro">${h(levels[ctx.a.experience].hint)}</p>${syncNotice(ctx)}${resource(ctx.a)}
    ${ctx.a.experience === 'familiar' ? '<details><summary>필요할 때 예시 참고하기</summary>' : ''}${button('빈 항목만 예시로 채우기', 'fill-example', 'secondary small')}<p class="field-help">이미 적은 문장은 그대로 유지해요.</p>${ctx.a.experience === 'familiar' ? '</details>' : ''}
    ${field(ctx,'goal','어떤 일을 끝내고 싶나요?', {placeholder:task.goalPlaceholder})}${field(ctx,'data','어떤 자료와 상황인가요?', {placeholder:task.dataPlaceholder})}
    ${field(ctx,'format','어떤 형태로 받고 싶나요?', {placeholder:'독자, 표·목록, 분량, 말투 등을 적어주세요.'})}${field(ctx,'checks','특히 확인할 조건이 있나요?',{optional:true,placeholder:'원문 근거, 계산 기준, 미정 사항 처리 등'})}${actions(ctx,'요청 다듬으러 가기')}`;
}
function execute(ctx) {
  const { a } = ctx;
  return `<div class="card-eyebrow">STEP 02 · TRY IT</div><h2>내 요청을 AI에서 실행해요.</h2><p class="intro">요청과 자료를 직접 전달하고 답변을 받아 돌아오세요. 문장을 수정하면 실행 확인이 해제되고 이전 결과는 이력에 보관됩니다.</p>${syncNotice(ctx)}
    ${field(ctx,'prompt','내가 사용할 요청',{rows:9})}
    <details><summary>준비 내용으로 다시 만들기</summary><p>직접 수정한 요청은 이력에 보관한 뒤 반영합니다.</p>${button('준비 내용 다시 반영','rebuild-prompt','secondary small')}</details>
    <ol class="handoff"><li><strong>자료를 준비해요.</strong>${resource(a)}</li><li><strong>요청을 복사해요.</strong>${button(icon('copy')+' 요청 복사','copy-prompt','secondary small')}</li><li><strong>${h(a.tool)}에서 실행해요.</strong><p>새 대화를 열고 자료를 첨부하거나 내용을 붙여넣은 뒤, 요청을 보내세요. 서비스의 계정과 파일 기능을 확인해 주세요.</p>${aiLink(a)}</li><li><strong>이 화면으로 돌아와요.</strong><p>AI 답변을 복사해 다음 단계에 남겨주세요. 요청은 자동 전송되지 않습니다.</p></li></ol>
    ${check(ctx,'ran',`${a.tool}에서 현재 요청을 실행하고 답변을 받았어요.`)}${promptVersions(a.draft)}${actions(ctx,'결과 확인하러 가기')}`;
}
function verify(ctx) {
  const { a } = ctx, d = a.draft;
  return `<div class="card-eyebrow">STEP 03 · CHECK & REFINE</div><h2>답을 확인하고, 더 나은 결과로.</h2><p class="intro">${h(tasks[a.task].verifyTip)}</p>
    ${field(ctx,'response','AI가 준 답변 또는 핵심 부분',{rows:5,help:'개인정보나 회사의 비공개 자료 대신 준비된 가상 자료로 연습해 주세요.'})}${resource(a)}${reference(ctx)}${reviews(ctx)}
    ${field(ctx,'evidence','무엇을 어떻게 확인했나요?',{placeholder:'대조한 원문·수치와, 아직 확인하지 못한 내용을 구분해 적어주세요.'})}
    <div class="field"><label for="needs-revision">답변을 다시 수정할 필요가 있나요?</label><select id="needs-revision" name="needsRevision" aria-required="true"><option value="">선택해 주세요</option><option value="yes" ${d.needsRevision==='yes'?'selected':''}>네, 후속 요청으로 고칠게요</option><option value="no" ${d.needsRevision==='no'?'selected':''}>아니요, 확인한 근거를 남길게요</option></select></div>
    ${d.needsRevision === 'yes' ? `<section class="revision-panel"><h3>후속 요청 → 다시 실행 → 결과 비교</h3><details><summary>후속 요청 예시</summary><p>${h(tasks[a.task].followup)}</p></details>${field(ctx,'followup','수정할 조건을 담은 후속 요청')}
      <div class="action-pair">${button(icon('copy')+' 후속 요청 복사','copy-followup','secondary')}${aiLink(a)}</div><p class="field-help">같은 AI 대화에 후속 요청을 보내고 돌아오세요.</p>${check(ctx,'followupRan','현재 후속 요청을 실행했어요.')}${field(ctx,'improvedResponse','후속 요청으로 받은 답변',{rows:5})}<details><summary>처음 답변과 개선 답변 비교</summary>${comparison('처음 답변',d.response,'개선 답변',d.improvedResponse)}</details></section>` : ''}
    ${d.needsRevision ? field(ctx,'improvementNote',d.needsRevision === 'yes' ? '무엇이 나아졌고, 무엇이 아직 남았나요?' : '추가 수정이 필요 없다고 판단한 근거는 무엇인가요?') : ''}
    ${promptVersions(d)}${actions(ctx,'새 과제에 도전하기')}`;
}
function challenge(ctx) {
  const { a } = ctx, d = a.draft, material = exercise(a.task,a.experience,true);
  const hints = [levels[a.experience].hint, tasks[a.task].verifyTip, `요청에 목적·자료·출력·검증 조건을 모두 담고, 답변의 핵심 항목마다 원자료 근거를 함께 요청하세요. ${tasks[a.task].followup}`];
  return `<div class="card-eyebrow">STEP 04 · ON YOUR OWN <span class="tag">${h(material.difficulty)} 과제</span></div><h2>이번에는 새 자료로 직접.</h2><div class="challenge-brief"><p>${h(material.brief)}</p></div>${resource(a,true)}
    ${field(ctx,'challengePrompt','내가 직접 작성한 요청',{rows:5})}<div class="action-pair">${button(icon('copy')+' 내 요청 복사','copy-challenge','secondary')}${aiLink(a)}</div><p class="field-help">새 자료와 요청을 AI에 전달한 뒤 돌아와 아래에 결과를 남겨주세요. 요청 수정 시 이전 결과는 이력에 보관합니다.</p>
    ${check(ctx,'challengeRan','현재 독립 실습 요청을 AI에서 실행했어요.')}${field(ctx,'challengeResponse','독립 실습에서 받은 답변',{rows:5})}
    <section class="hint-panel"><h3>막힌 부분만 도움받기</h3><p>힌트를 몇 단계 열었는지 기록해요. 필요할 때 편하게 참고하세요.</p>${d.hintLevel ? `<ol>${hints.slice(0,d.hintLevel).map(text=>`<li>${h(text)}</li>`).join('')}</ol>` : ''}${d.hintLevel < 3 ? button(`${d.hintLevel+1}단계 힌트 보기`,'hint','secondary small') : '<p>3단계 힌트를 모두 열었어요.</p>'}</section>
    ${reference(ctx,true)}${reviews(ctx,true)}${field(ctx,'challengeEvidence','결과의 근거와 아직 확인이 필요한 내용')}${promptVersions(d)}${actions(ctx,'전체 실습 기록 남기기',true)}`;
}
function coach(ctx) {
  const d = ctx.a.draft;
  const items = preparationFeedback(d);
  const titles = ['좋은 요청의 네 가지 재료','실행하고 돌아오는 순서','근거가 있는 확인','새 상황에 적용하기'];
  return `<aside class="coach"><div class="coach-top"><span class="coach-mark">${icon('spark')}</span><span class="coach-badge">실습 안내 · ${h(levels[ctx.a.experience].difficulty)}</span></div><h3>${titles[ctx.a.step]}</h3>
    ${ctx.a.step===0 ? `<ul class="coach-checks">${items.map(item=>`<li data-coach-check="${item.key}" class="${item.filled?'filled':''}">${icon(item.filled?'check':'circle')}<span>${h(item.label)}<small>${h(item.advice)}</small></span></li>`).join('')}</ul><p>입력 여부를 확인하는 안내입니다. 요청의 품질 점수가 아닙니다.</p>` : `<p>${h(levels[ctx.a.experience].hint)}</p><p>확인하지 못한 내용은 「추가 확인이 필요함」으로 남겨도 괜찮아요.</p>`}
    <div class="coach-foot">기준 자료와 자기 확인을 돕는 안내입니다. AI 코칭 API는 연결되어 있지 않습니다.</div></aside>`;
}
function practice(ctx) {
  const { a } = ctx;
  const steps = ['요청 준비','AI에서 실행','결과 확인','혼자 해보기'];
  return `<div class="practice-heading"><div>${button(icon('back')+' 업무 선택으로','home','ghost')}<h1>${h(tasks[a.task].short)}</h1></div><span class="tool-badge">${h(a.tool)} · ${h(levels[a.experience].difficulty)}</span></div>
    ${a.mode==='independent' ? '<p class="info-banner">독립 실습부터 진행 중입니다. 요청·답변·확인 근거를 모두 기록해요.</p>' : `<ol class="stepper" aria-label="실습 단계">${steps.map((name,i)=>`<li><button type="button" class="step-button ${a.step===i?'current':''}" data-action="go-step" data-step="${i}" ${i>a.maxStep?'disabled':''} ${a.step===i?'aria-current="step"':''}><span class="step-number">${i+1}</span>${name}</button></li>`).join('')}</ol>`}
    <div class="workspace"><section class="work-card">${ctx.error ? `<p id="form-error" class="form-error" role="alert" tabindex="-1">${h(ctx.error.message)}</p>` : ''}${[prepare,execute,verify,challenge][a.step](ctx)}</section>${coach(ctx)}</div>`;
}
function complete(ctx) {
  const record = ctx.state.history.find(r=>r.id===ctx.state.completedId);
  if (!record) return home(ctx);
  const d=record.draft;
  return `<section class="celebration"><div class="finish-icon">${icon('leaf')}</div><h1>어떻게 해냈는지,<br>기록이 남았어요.</h1><p>${h(record.title)} · ${h(outcome(d))}</p><span class="tag">${d.hintUsed?'도움을 활용한 연습':'도움 없이 시도한 연습'}</span><p>힌트 ${d.hintLevel}단계 · 독립 실습 기준 답안 ${d.challengeReferenceSeen?'열람':'미열람'}</p>
    ${record.mode==='guided' ? `<h2>처음과 다음 요청을 비교해 보세요.</h2>${comparison('처음 요청',d.firstPrompt,'새 과제에서 직접 쓴 요청',d.challengePrompt)}${textBlock('답변 개선 과정에서 배운 점',d.improvementNote)}` : textBlock('내가 직접 쓴 요청',d.challengePrompt)}${textBlock('직접 대조한 근거·남은 확인',d.challengeEvidence)}
    <p>결과의 정확성이나 역량을 인증한 점수가 아닙니다. 같은 기준을 다음 업무에도 적용해 보세요.</p><div class="action-pair">${button('나의 학습 기록','nav-history')}${button('기록 내려받기','download-record','secondary')}</div>${button('다른 업무 연습하기','new-practice','ghost')}</section>`;
}
function backupPanel(ctx) {
  const pending = ctx.pendingRestore;
  return `<section class="backup-panel" aria-labelledby="backup-title"><h2 id="backup-title">전체 백업·복원</h2><p>완료 기록과 모든 과제의 초안을 JSON 파일로 보관하세요. 이 브라우저의 저장 공간 한도까지 기록을 유지하며, 오래된 기록을 자동 삭제하지 않습니다.</p><div class="action-pair">${button(icon('download')+' 전체 백업 받기','export-all','secondary')}<label class="button secondary file-button">백업 파일 선택<input type="file" id="restore-file" accept=".json,application/json" aria-label="복원할 JSON 백업 파일 선택"></label></div><p class="field-help">20MB 이하의 AI Bridge JSON 백업을 복원할 수 있어요. 개별 TXT 기록은 복원용 파일이 아닙니다.</p>
    ${ctx.importError?`<p class="form-error" role="alert">${h(ctx.importError)}</p>`:''}
    ${pending?`<div class="notice warning"><strong>복원 전 확인</strong><p>현재 기록 ${ctx.state.history.length}개·과제 초안 ${Object.keys(ctx.state.drafts).length}개를 파일의 기록 ${pending.history.length}개·초안 ${Object.keys(pending.drafts).length}개로 대체합니다. 현재 내용의 백업 다운로드를 먼저 시작합니다. 파일이 내려받아졌는지 확인해 주세요.</p><div class="action-pair">${button('현재 내용 백업 후 복원','confirm-restore')}${button('취소','cancel-restore','secondary')}</div></div>`:''}
    ${ctx.blocked?`<div class="notice warning"><strong>원래 저장 내용을 보호하고 있어요.</strong><p>원본 파일을 먼저 보관한 뒤, 현재 작업 내용을 새로 저장할 수 있습니다.</p><div class="action-pair">${button('원본 복구 파일 받기','export-raw','secondary')}${button('원본 백업 후 현재 내용 저장','recover-storage','secondary')}</div></div>`:''}</section>`;
}
function history(ctx) {
  return `<div class="practice-heading"><div><h1>나의 학습 기록</h1><p class="hero-copy">요청과 답변, 확인 근거, 다시 고친 결과를 함께 돌아봐요.</p></div><span class="tool-badge">${ctx.state.history.length}개</span></div>${backupPanel(ctx)}
    ${ctx.state.history.length ? `<div class="history-list">${ctx.state.history.map(r=>`<article class="history-card"><div class="history-head"><span class="task-icon ${r.task}">${icon(tasks[r.task].icon)}</span><div><h2>${h(r.title)}</h2><time datetime="${h(r.date)}">${h(new Date(r.date).toLocaleString('ko-KR'))} · ${h(r.tool)}</time></div></div><p><span class="tag">${h(levels[r.experience].difficulty)}</span> ${h(outcome(r.draft))}${r.mode==='legacy'?' · 이전 버전 기록':''}</p><details><summary>요청부터 개선 결과까지 전체 기록 보기</summary><pre>${h(recordText(r))}</pre>${button('이 기록 내려받기','download-history','secondary small',`data-id="${h(r.id)}"`)}</details></article>`).join('')}</div>` : '<div class="empty-state"><h2>첫 번째 실습을 기다리고 있어요.</h2><p>완료 전 내용은 과제별 초안으로 보관됩니다.</p>'+button('실습 선택하기','home')+'</div>'}`;
}
function guide() {
  const steps=[['요청 준비','목표·자료·출력·확인 조건을 적어요. 예시는 빈 칸에만 들어가며 내가 쓴 내용은 유지됩니다.'],['선택한 AI에서 실행','자료를 준비하고 요청을 복사해 새 대화에 전달해요. 답변을 받은 뒤 이 화면으로 돌아오세요.'],['근거 확인과 수정','기준 자료와 답변을 대조해요. 확인이 안 된 항목도 남기고, 필요한 후속 요청을 실행해 결과를 비교하세요.'],['새 과제로 적용','수준에 맞는 새로운 과제로 직접 해봐요. 힌트와 기준 답안은 필요할 때 열 수 있고 사용 내역도 남아요.']];
  return `<h1>함께 시작해서,<br>혼자 할 수 있을 때까지.</h1><div class="guide-grid">${steps.map(([title,text],i)=>`<article class="guide-card"><span class="num">0${i+1}</span><h2>${title}</h2><p>${text}</p></article>`).join('')}</div><div class="info-banner"><p>요청과 답변은 이 브라우저에 저장됩니다. AI Bridge가 외부 AI로 자동 전송하거나 답변을 자동 채점하지 않습니다. 과제별 기준 자료와 자기 확인으로 연습하고, 필요한 기록은 전체 백업으로 보관하세요.</p></div><div class="start-row">${button('실습 시작하기','home')}</div>`;
}

export function renderPage(state, ui = {}) {
  const ctx = { state, a: activeAttempt(state), ...ui };
  const body = ({ home, practice, complete, history, guide }[state.view] || home)(ctx);
  const titles={home:'오늘의 실습',practice:'오늘의 실습',complete:'실습 기록',history:'나의 학습 기록',guide:'이렇게 배워요'};
  const navigation=[['home','오늘의 실습','grid'],['history','나의 학습 기록','book'],['guide','이렇게 배워요','compass']];
  return `<div class="shell"><aside class="sidebar"><a href="#home" class="brand" data-action="home"><span class="brand-mark">${icon('bridge')}</span>AI Bridge</a><p class="brand-caption">YOUR NEXT STEP WITH AI</p><nav class="nav-list" aria-label="주요 메뉴">${navigation.map(([name,label,ico])=>`<button type="button" class="nav-item ${state.view===name||(name==='home'&&['practice','complete'].includes(state.view))?'active':''}" data-action="nav-${name}" ${state.view===name?'aria-current="page"':''}>${icon(ico)}${label}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="bridge-note"><p>처음에는 함께,<br>다음에는 스스로.</p></div><p class="prototype-note">AI 실무 연습실</p></div></aside><div class="app-body"><header class="topbar"><span class="breadcrumb">워크스페이스 / ${titles[state.view]}</span><span class="guest-status">로그인 없이 연습 중</span></header>
    <div class="save-bar"><div id="save-status" role="status" aria-live="polite"></div>${button('전체 백업','export-all','secondary small')}${button('저장 다시 시도','retry-save','secondary small','id="retry-save" hidden')}</div>
    <main id="main" class="content" tabindex="-1">${body}<footer class="page-footer"><strong>AI, 아는 사람만 잘 쓰지 않도록.</strong><span>자료 기반 안내 · 기록은 이 브라우저에 저장</span></footer></main></div></div>`;
}
