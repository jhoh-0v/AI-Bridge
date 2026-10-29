import { reviewItems } from './content.js';

export const preparationFields = [
  ['goal', '업무 목표', '누가 어떤 판단이나 행동에 쓸 결과인지 적어보세요.'],
  ['data', '자료의 맥락', '자료의 기간, 항목, 단위 또는 상황을 설명하세요.'],
  ['format', '원하는 출력', '표·분량·독자·말투 등 결과의 형태를 정하세요.'],
  ['checks', '확인 조건', '원문 근거, 계산 기준, 미정 사항 처리처럼 검증할 조건을 적어보세요.']
];

export function preparationFeedback(draft) {
  return preparationFields.map(([key, label, advice]) => ({ key, label, advice, filled: Boolean(draft[key].trim()) }));
}

export function reflectionFeedback(review) {
  return reviewItems.filter(item => review[item.key] !== 'confirmed').map(item => ({ ...item, status: review[item.key] }));
}

export function outcome(draft) {
  const needsCheck = Object.values(draft.challengeReview).filter(v => v === 'needs-check').length;
  return needsCheck ? `추가 확인 ${needsCheck}개` : '확인 과정을 기록했어요';
}
