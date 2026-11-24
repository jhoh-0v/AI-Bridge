import test from 'node:test';
import assert from 'node:assert/strict';
import { codexArguments, codexEnvironment } from '../desktop/codex-coach.mjs';
import { suggestCurricula } from '../desktop/ai-curriculum.mjs';
import { coachFeedback } from '../desktop/ai-coach.mjs';
import { textSource } from '../lib/coach/source.mjs';

test('Codex gets only OS and authentication locations, never API keys or parent tool endpoints', () => {
  const environment = codexEnvironment({ PATH: 'system-path', USERPROFILE: 'user', CODEX_HOME: 'auth-location', OPENAI_API_KEY: 'must-not-pass', CODEX_API_KEY: 'must-not-pass', OPENAI_BASE_URL: 'must-not-pass', CODEX_THREAD_ID: 'must-not-pass', NODE_OPTIONS: 'must-not-pass', BRIDGE_TOKEN: 'must-not-pass' });
  assert.deepEqual(environment, { PATH: 'system-path', USERPROFILE: 'user', CODEX_HOME: 'auth-location' });
  const args = codexArguments({ directory: 'isolated', schemaPath: 'schema', outputPath: 'output', model: 'test-model' });
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('--ignore-user-config')); assert.ok(args.includes('--ephemeral'));
  for (const feature of ['shell_tool', 'apps', 'plugins', 'multi_agent']) assert.equal(args[args.indexOf(feature) - 1], '--disable');
  assert.ok(args.includes('mcp_servers={}')); assert.ok(args.includes('web_search="disabled"'));
  assert.ok(args.includes('forced_login_method="chatgpt"'));
  assert.equal(args.at(-1), '-');
});

const source = textSource('가상 자료: 문의 20건 중 해결 15건, 미해결 5건. 원인은 조사 중입니다.');
function curriculumValue(payload) {
  return { options: [0, 1, 2].map(i => ({ taskId: 'report', title: `운영 현황 보고 ${i + 1}`, goal: '문의 현황을 원자료와 대조할 수 있는 보고서 만들기', reason: '문의와 처리 상태가 있는 자료예요.', columns: payload.source.headers, steps: ['요청', '결과 확인', '수정', '독립 실습'].map(title => ({ title, action: '자료에서 확인한 내용을 내 말로 정리해요.', why: '원자료와 결과를 대조하는 연습이에요.' })), checks: ['문의 건수를 원자료와 대조하나요?', '미확정 원인을 확정하지 않았나요?'], sourceIds: [payload.knowledge.find(k => k.task === 'common').id] })) };
}

test('Codex curricula retain real provider provenance and the same RAG/structure checks without an API call', async () => {
  let calls = 0;
  const generate = async ({ payload, schema }) => {
    calls++; assert.ok(payload.knowledge.length);
    // Restrict generation itself to the real document field and same-task RAG citations.
    for(const variant of schema.properties.options.items.anyOf){
      assert.deepEqual(variant.properties.columns.items.enum, ['자료']);
      const task=variant.properties.taskId.enum[0];
      assert.ok(variant.properties.sourceIds.items.enum.every(id=>payload.knowledge.some(k=>k.id===id&&(k.task===task||k.task==='common'))));
    }
    return { value: curriculumValue(payload), receipt: { provider: 'Codex CLI', responseId: 'test-only', model: 'test-model' } };
  };
  const fetchImpl = () => { throw Error('API fallback is forbidden'); };
  await assert.rejects(suggestCurricula({ source, level: 'starter', consent: false, generate, fetchImpl }), /동의/);
  assert.equal(calls, 0);
  const plan = await suggestCurricula({ source, level: 'starter', consent: true, generate, fetchImpl });
  assert.equal(plan.receipt.provider, 'Codex CLI'); assert.equal(plan.options.length, 3);
  assert.equal(calls, 1);
  await assert.rejects(suggestCurricula({ source, level: 'starter', consent: true, fetchImpl, generate: async ({ payload }) => { const value = curriculumValue(payload); value.options[0].sourceIds = ['invented']; return { value }; } }), /확인하지 못/);
  await assert.rejects(suggestCurricula({ source, level: 'starter', consent: true, fetchImpl, generate: async ({ payload }) => { const value = curriculumValue(payload); value.options[0].columns = ['문의 건수']; return { value }; } }), /확인하지 못/);
  await assert.rejects(suggestCurricula({ source, level: 'starter', consent: true, fetchImpl, generate: async () => { throw Error('Codex 사용 한도'); } }), /Codex 사용 한도/);
});

test('Codex feedback honors consent, avoids independent assessment, and validates evidence citations', async () => {
  let calls = 0;
  const session = { level: 'starter', exercise: { version: 3, mode: 'own', taskId: 'report', source, goal: '문의 처리 현황 보고서 만들기', aiConsent: true } };
  const evidence = { phase: 0, prompt: '문의 현황을 정리해 줘.', output: '문의 20건, 해결 15건.', checks: { checks: [{ id: 'facts', label: '원자료 수치를 대조', pass: null, manual: true }] } };
  const generate = async ({ payload }) => { calls++; return { value: { summary: '수치를 직접 대조해 봐요.', question: '미해결 건수도 확인했나요?', checkIds: ['facts'], sourceIds: [payload.knowledge[0].id] }, receipt: { provider: 'Codex CLI', model: 'test-model' } }; };
  const result = await coachFeedback({ session, evidence, generate });
  assert.equal(result.receipt.provider, 'Codex CLI');
  await assert.rejects(coachFeedback({ session, evidence: { ...evidence, phase: 3 }, generate }), /전송하지/);
  await assert.rejects(coachFeedback({ session: { ...session, exercise: { ...session.exercise, aiConsent: false } }, evidence, generate }), /전송하지/);
  assert.equal(calls, 1);
  await assert.rejects(coachFeedback({ session, evidence, generate: async ({ payload }) => ({ value: { summary: '확인', question: '왜?', checkIds: ['invented'], sourceIds: [payload.knowledge[0].id] } }) }), /근거/);
});
