import { TASK_BY_ID } from '../learning.mjs';

export const COACH_VERSION = '1.0.0';
export const SITE_ORIGIN = 'https://ai-bridge-lab-bd5373.mystic-grape-2563.chatgpt.site';
export const LEVELS = {
  starter: { name: '초급 · 처음부터 함께', description: '추천 템플릿과 항목별 작성 방법을 안내해요.' },
  growing: { name: '중급 · 직접 요청', description: '템플릿을 바탕으로 AI에게 직접 요청해요.' },
  independent: { name: '고급 · 스스로 선택', description: '템플릿을 직접 선택하고 결과를 검증해요.' }
};
export const PHASES = ['첫 요청', '결과 확인', '다시 요청', '독립 실습', '학습 기록'];
export const LESSON = {
  id: 'excel-sales-v1', taskId: 'excel', title: '스스로 만드는 매출 정리표',
  subtitle: 'ChatGPT에서 직접 요청하고, 수식과 합계를 확인해요.',
  goal: '원자료를 유지하고, 수식으로 행별 매출·월별 합계·전체 합계가 계산되는 XLSX 파일을 만드세요.',
  outcome: '새로운 판매 자료로도 도움 없이 요청하고 계산 결과를 검증할 수 있어요.',
  material: TASK_BY_ID.excel.material, challenge: TASK_BY_ID.excel.challenge,
  steps: [
    { target: 'attach', title: '원자료를 먼저 전달해요', why: 'AI가 실제 숫자를 계산하려면 판매 자료가 필요해요. 파일을 첨부하거나 자료를 입력창에 붙여 넣을 수 있어요.', action: '자료 파일을 내려받아 ChatGPT에 첨부하세요.', query: 'ChatGPT 파일 첨부 원자료 업로드' },
    { target: 'composer', title: '원하는 결과를 직접 부탁해요', why: '엑셀 파일이 필요한지, 어떤 계산을 해야 하는지 알려 주세요. 수량을 바꾸었을 때도 계산되어야 하는지 생각해 보세요.', action: '입력창에 나의 요청을 쓰고 직접 보내세요.', query: '엑셀 수식 요청 원자료 월별 합계' },
    { target: null, title: '숫자만 보고 끝내지 않아요', why: '같은 합계여도 숫자만 적힌 표와 수식이 있는 표는 달라요. 내려받은 파일을 제출하면 두 가지를 구분해 볼 수 있어요.', action: 'ChatGPT가 만든 XLSX 파일을 내려받아 아래에 제출하세요.', query: '엑셀 수식 값 차이 재계산 검증' }
  ],
  template: '첨부한 자료로 [누가 사용할지]를 위한 엑셀 파일을 만들어 주세요.\n원자료는 [어떻게 보존할지], 행별 매출은 [계산 방법]으로 작성해 주세요.\n[필요한 집계]를 포함하고, 수량이 바뀌면 [어떻게 작동해야 하는지]를 반영해 주세요.\n결과는 [파일 형식]으로 제공해 주세요.',
  questions: [
    { id: 'recalculate', text: '수량을 바꿨을 때 합계가 자동으로 바뀌려면?', options: ['합계를 숫자로 직접 적는다', '원자료 셀을 참조하는 수식을 사용한다', '색상을 바꾼다'], correct: 1 },
    { id: 'verify', text: 'AI가 만든 표의 정확성을 확인하는 방법은?', options: ['표가 예쁘면 사용한다', '같은 AI에게 맞냐고만 물어본다', '원자료를 대조하고 일부 값을 바꿔 계산을 확인한다'], correct: 2 }
  ]
};
export function materialFor(phase) { return phase === 3 ? LESSON.challenge : LESSON.material; }

export const TEMPLATES=[
  {id:'create',title:'자료로 표 만들기',use:'새 파일을 만들 때',text:LESSON.template},
  {id:'repair',title:'결과의 문제 수정하기',use:'이미 받은 파일을 고칠 때',text:'앞서 받은 엑셀 파일의 [발견한 문제]를 수정해 주세요.\n원자료의 [보존할 항목]은 유지하고 [바꿀 계산 조건]을 반영해 주세요.\n[수정 여부를 확인할 기준]을 충족하는 [파일 형식]으로 제공해 주세요.'},
  {id:'verify',title:'계산 검증 요청하기',use:'수식과 합계의 근거를 확인할 때',text:'이 파일을 원자료와 대조해 [검증할 항목]을 확인해 주세요.\n[변경할 값]을 바꿨을 때 [기대하는 계산 변화]가 생기는지 설명해 주세요.\n확인이 어려운 항목은 추측하지 말고 구분해 주세요.\n발견한 문제는 [수정 조건]에 맞춰 고치고 수정된 파일을 제공해 주세요.'}
];
export const TEMPLATE_FIELDS=[
  {id:'goal',label:'목표 · 누구에게 필요한 표인가요?',why:'사용하는 사람과 용도를 알려주면 필요한 정보가 분명해져요.',placeholder:'예: 팀장이 월별 판매 실적을 확인할 표'},
  {id:'source',label:'자료 · 무엇을 그대로 유지하나요?',why:'월·상품·수량·단가 같은 원자료를 보존해야 결과를 대조할 수 있어요.',placeholder:'보존해야 할 원자료 열을 직접 적어 보세요.'},
  {id:'calculation',label:'조건 · 어떤 계산이 필요한가요?',why:'행별 계산과 월별 집계를 구분해 적고, 값이 바뀔 때의 동작도 생각해 보세요.',placeholder:'계산 방법과 재계산 조건을 내 말로 적어 보세요.'},
  {id:'format',label:'결과 · 어떤 파일로 받나요?',why:'파일로 받아야 수식과 원자료를 직접 열어 확인할 수 있어요.',placeholder:'필요한 파일 형식과 확인 기준을 적어 보세요.'}
];
export function supportFor(level,phase){return {enabled:phase===2,recommended:phase===2&&level!=='independent',fields:phase===2&&level==='starter',guide:phase===2&&level==='starter',choose:phase===2&&level==='independent'};}
export function templatePrompt(fields){if(TEMPLATE_FIELDS.some(f=>!fields?.[f.id]?.trim()))throw Error('네 가지 항목을 내 조건으로 채워 주세요.');return TEMPLATE_FIELDS.map(f=>`[${f.label.split(' · ')[0]}]\n${fields[f.id].trim()}`).join('\n\n');}
