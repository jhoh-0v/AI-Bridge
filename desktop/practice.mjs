import { materialFor, LESSON, TEMPLATES } from '../lib/coach/lesson.mjs';

export const normalizeText = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
export function conversationPath(url) {
  try { const u = new URL(url);if(u.origin!=='https://chatgpt.com'||u.username||u.password)return null; return /^\/c\/[a-zA-Z0-9-]+$/.test(u.pathname) ? u.pathname : u.pathname === '/' ? '/' : null; } catch { return null; }
}
export function freshFlow(sessionId) {
  return { sessionId, conversation: null, prepared: {}, turns: [], responses: {}, linked: [], pending: null, selectedCheck: null, error: '', version: 1 };
}
export function captureTurn(flow, event, phase) {
  if (![0,2,3].includes(phase) || event.phase !== phase || !event.id || typeof event.text !== 'string' || event.text.trim().length < 1 || event.text.length > 60000) throw Error('전송 확인 정보를 읽지 못했어요.');
  if (flow.turns.some(t => t.id === event.id)) return flow;
  if (flow.turns.length >= 100) throw Error('이 실습의 요청 기록 100회를 모두 보관했어요. 새 실습에서 이어가 주세요.');
  const location = conversationPath(event.url);
  if (!location || flow.conversation && flow.conversation !== location) throw Error('현재 실습 대화에서만 기록할 수 있어요.');
  const next = structuredClone(flow);
  if (location !== '/') next.conversation = location;
  next.turns.push({ id: String(event.id).slice(0,100), text: event.text, phase, model: String(event.model || '').slice(0,60), at: new Date().toISOString(), conversation: location, source: 'observed-in-app' });
  next.prepared[phase] = true; next.pending = null; next.pendingConversation=null; next.error = ''; next.retry = false;
  return next;
}
export function lastTurn(flow, phase) { return flow.turns.filter(t => t.phase === phase).at(-1) || null; }
export function resultDownloadScope({pending,flow,sessionId,filename,conversation,now=Date.now()}){
  if(!flow||flow.sessionId!==sessionId||(flow.conversation||'/')!==conversation)return null;
  const name=normalizeText(filename).toLowerCase();
  const matching=flow.turns.filter(turn=>turn.conversation===conversation&&name&&flow.responses[turn.id]?.links?.some(l=>normalizeText(l.label).toLowerCase().includes(name)));
  // Downloads inside an embedded viewer can have no top-frame click at all.
  // Associate only an unambiguous filename already observed in this conversation.
  if(!pending&&matching.length===1)return {sessionId,phase:matching[0].phase,turnId:matching[0].id,at:now,association:'unique-observed-result-filename'};
  if(!pending||pending.sessionId!==sessionId||now-pending.at>30*60*1000||now<pending.at)return null;
  const turn=flow.turns.find(t=>t.id===pending.turnId&&t.phase===pending.phase);
  if(!turn||turn.conversation!==conversation)return null;
  const sameName=matching.includes(turn);
  // A child-frame file viewer may not expose its click to our isolated preload.
  // After the direct-click window, require the selected response's exact filename.
  if(!sameName&&now-pending.at>60000)return null;
  return {...pending,association:sameName?'observed-result-and-filename':'observed-result-click'};
}
export function recordResult(flow,download,upload,digest){
  const turn=flow.turns.find(t=>t.id===download.scope?.turnId);
  if(download.scope?.sessionId!==flow.sessionId||!turn||download.scope.phase!==turn.phase)throw Error('실습 대화에서 받은 파일만 확인할 수 있어요.');
  if(upload.file?.sha256!==digest)throw Error('다운로드한 파일 내용이 바뀌었어요. 다시 받아 주세요.');
  const next=structuredClone(flow);next.artifacts??={};
  next.artifacts[download.id]={downloadId:download.id,turnId:turn.id,phase:turn.phase,file:upload.file,upload,status:'read'};
  return next;
}
export function mergeObservedHistory(flow,messages,phase){
  if(!flow.conversation||!Array.isArray(messages)||messages.length>100)throw Error('현재 실습 대화의 기록 범위를 확인해 주세요.');
  const next=structuredClone(flow);let changed=false;
  for(let i=0;i<messages.length;i++){
    const message=messages[i];if(next.turns.some(t=>t.id===message.id))continue;
    if(!message.id||typeof message.text!=='string'||!message.text.trim()||message.text.length>60000)continue;
    const following=messages.slice(i+1).map(m=>next.turns.find(t=>t.id===m.id)).find(Boolean);
    const turn={id:String(message.id).slice(0,100),text:message.text,phase:following?.phase??phase,model:'',at:new Date().toISOString(),conversation:flow.conversation,source:'observed-in-app',recovered:true};
    if(![0,2,3].includes(turn.phase))continue;
    if(next.turns.length>=100)throw Error('이 실습의 요청 기록 100회를 모두 보관했어요. 새 실습에서 이어가 주세요.');
    if(following)next.turns.splice(next.turns.indexOf(following),0,turn);else next.turns.push(turn);
    changed=true;
  }
  return changed?next:flow;
}
export function displayStep(session, flow) {
  if (!session) return 'empty';
  if (session.phase === 4) return 'complete';
  if (session.phase === 1) return 'review';
  if (flow.pending) return 'confirming';
  if (flow.retry) return 'compose';
  const turn = lastTurn(flow, session.phase);
  const last = session.submissions.filter(s => s.phase === session.phase).at(-1);
  const linked = last && flow.linked.find(l => l.submissionId === last.id);
  if (last && (!turn || !linked || linked.turnId === turn.id)) return session.phase === 2 ? 'compare' : 'quiz';
  if (!turn && !flow.prepared[session.phase]) return 'prepare';
  if (!turn) return flow.pending ? 'confirming' : 'compose';
  return flow.responses[turn.id]?.finished ? 'result' : 'waiting';
}
export function sourceText(phase) {
  return `[AI Bridge 실습 자료 · ${phase === 3 ? '새 과제' : '첫 과제'}]\n${materialFor(phase).csv}\n\n`;
}
export function templateFor(level, id, selectedCheck, alreadyPassed=false,customGoal='') {
  if(customGoal){
    const templates={create:'첨부한 자료로 [원하는 작업]을 해 주세요.\n[누가 사용할지]에 맞게 [필요한 결과와 조건]을 반영하고, [파일 형식]으로 제공해 주세요.',repair:'앞서 받은 파일에서 [내 목표와 다른 부분]을 수정해 주세요.\n[유지할 내용]은 유지하고 [바꿀 내용]을 반영해 주세요.\n[확인할 기준]에 맞는 엑셀 파일로 제공해 주세요.',verify:'내 목표인 [원하는 작업]이 결과에 반영됐는지 확인해 주세요.\n원자료의 [대조할 값이나 항목]과 비교하고, [확인할 계산이나 조건]의 근거를 설명해 주세요.\n확인하기 어려운 부분은 구분해 주세요.'};
    return templates[level==='independent'?id:'repair']||templates.repair;
  }
  const chosen = TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
  if (level === 'independent') return chosen.text;
  if (level === 'growing') return TEMPLATES[1].text;
  if(alreadyPassed)return `앞서 만든 파일의 [확인할 항목: ${selectedCheck||'수량 변경 시 재계산'}]이 어떻게 작동하는지 설명해 주세요.\n원자료와 이미 맞는 수식은 유지하고, [더 편리하게 사용할 수 있도록 바꿀 부분]을 반영해 주세요.\n수정한 파일도 XLSX로 제공해 주세요.`;
  return `앞서 만든 매출 정리표를 수정해 주세요.\n[어떤 부분을 고칠지: ${selectedCheck || '확인한 문제를 적으세요'}]\n원자료의 [그대로 유지할 항목]을 보존해 주세요.\n[필요한 계산]을 수식으로 작성하고, 수량을 바꾸면 합계도 다시 계산되게 해 주세요.\n[필요한 파일 형식]으로 제공해 주세요.`;
}
export function evidencePatch(flow, phase, selectedTurn=null) {
  const turn = selectedTurn || lastTurn(flow, phase);
  if (!turn) throw Error('ChatGPT에서 보낸 요청이 아직 확인되지 않았어요. 전송 확인을 다시 해 주세요.');
  const phaseTurns = flow.turns.slice(0,flow.turns.findIndex(t=>t.id===turn.id)+1).filter(t => t.phase === phase);
  const attachment=flow.attachments?.[phase===2?0:phase]||null;
  const response=phase===0&&flow.baseline?.turnId===turn.id?flow.baseline.response:flow.responses[turn.id];
  return { prompt: phaseTurns.map(t => t.text).join('\n\n[후속 요청]\n').slice(-12000), output: String(response?.text || '').slice(0,12000), environment: turn.model ? `ChatGPT · 화면에 표시된 모델: ${turn.model}` : 'ChatGPT · 모델명 자동 확인 불가', capture: { kind: 'observed-in-app', messageId: turn.id, conversation: turn.conversation, observedAt: turn.at, count: phaseTurns.length,attachment:attachment?{...attachment,reused:phase===2}:null } };
}
export function reviewText(session, id) {
  const baseline = session.submissions.find(s => s.phase === 0);
  const check = baseline?.checks?.checks.find(c => c.id === id);
  if (!check && id !== 'text') throw Error('확인할 항목을 선택해 주세요.');
  return check ? `검사 결과에서 '${check.label}' 항목을 살펴보기로 선택했습니다. 표시된 검사 결과: ${check.value}.` : '실제로 받은 답변을 확인했고, 요청과 다른 부분이나 보완할 조건을 다음 요청에 반영하기로 선택했습니다.';
}
export function reflectionText(session, choice) {
  if (!['changed','again'].includes(choice)) throw Error('확인한 변화를 선택해 주세요.');
  const before=session.submissions.find(s=>s.phase===0),after=session.submissions.filter(s=>s.phase===2).at(-1);
  if(!after)throw Error('수정한 결과를 먼저 확인해 주세요.');
  return `사용자가 '${choice==='changed'?'변화를 확인하고 새 과제에 도전':'아직 연습이 더 필요하지만 새 과제에 도전'}'을 선택했습니다. 파일 검사 충족: 처음 ${before?.checks?.passed??'없음'}, 수정 후 ${after.checks?.passed??'없음'}.`;
}
export const phases = ['처음 요청','결과 확인','다시 요청','혼자 해보기'];
export { LESSON };
