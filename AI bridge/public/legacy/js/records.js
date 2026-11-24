import { levels, reviewItems } from './content.js';
const status = { pending: '아직 확인하지 않음', confirmed: '확인할 수 있었음', 'needs-check': '추가 확인이 필요함' };
const reviewText = review => reviewItems.map(item => `${item.label} ${status[review[item.key]]}`).join('\n');
export function recordText(record) {
  const d = record.draft;
  const sections = [
    ['업무 목표', d.goal], ['자료와 상황', d.data], ['원하는 결과', d.format], ['확인 조건', d.checks],
    ['최초 요청', d.firstPrompt], ['최종 실행 요청', d.prompt], ['AI 답변', d.response],
    ['확인 항목', reviewText(d.review)], ['확인 근거·미확인 사항', d.evidence],
    ['추가 수정 필요', d.needsRevision === 'yes' ? '필요함' : d.needsRevision === 'no' ? '불필요함' : '미기록'],
    ['후속 요청', d.followup], ['후속 요청 실행', d.followupRan ? '실행했다고 기록함' : '미기록'],
    ['개선된 답변', d.improvedResponse], ['개선 내용 또는 수정 불필요 근거', d.improvementNote],
    ['독립 실습 요청', d.challengePrompt], ['독립 실습 답변', d.challengeResponse],
    ['독립 실습 확인 항목', reviewText(d.challengeReview)], ['독립 실습 확인 근거', d.challengeEvidence],
    ['도움 사용', `힌트 ${d.hintLevel}단계 · 기준 답안 ${d.challengeReferenceSeen ? '열람' : '미열람'}`],
    ['안내 실습 자료', record.materials.guided.data], ['독립 실습 과제', record.materials.challenge.brief], ['독립 실습 자료', record.materials.challenge.data]
  ];
  const prior = [...d.previousRuns.map(r => ['이전 요청과 결과', r]), ...d.previousChallenges.map(r => ['이전 독립 실습', r])]
    .map(([label, r]) => `[${label} · ${r.date}]\n요청: ${r.prompt}\n답변: ${r.response}\n확인: ${r.evidence}\n후속 요청: ${r.followup || ''}\n개선 결과: ${r.improvedResponse || ''}\n성찰: ${r.improvementNote || ''}`);
  const versions = d.promptVersions.map(v => `${v.date} · ${v.reason}\n${v.text}`).join('\n\n');
  return `AI Bridge 실습 기록\n${record.title} · ${record.tool} · ${levels[record.experience].difficulty}\n${new Date(record.date).toLocaleString('ko-KR')}\n` +
    (record.mode === 'legacy' ? '\n이전 버전에서 옮긴 기록입니다. 당시 저장되지 않은 항목은 미기록으로 표시합니다.\n' : '') +
    sections.map(([label, text]) => `\n[${label}]\n${text || '(미기록)'}`).join('\n') + `\n\n[요청 변경 이력]\n${versions || '(없음)'}\n\n${prior.join('\n\n')}\n\n사용자의 자기 확인 기록입니다. AI 답변의 정확성이나 역량을 인증하지 않습니다.`;
}
