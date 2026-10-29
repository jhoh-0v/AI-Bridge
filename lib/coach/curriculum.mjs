import { cleanGoal } from './samples.mjs';
import { programById } from './programs.mjs';

const bounded=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function cleanCurriculum(value,source){
  if(!value||!['ai','example','manual'].includes(value.origin)||!bounded(value.title,70)||!bounded(value.reason,300))throw Error('학습 제안 내용을 확인하지 못했어요.');
  const goal=cleanGoal(value.goal);
  if(!Array.isArray(value.columns)||!value.columns.length||value.columns.some(c=>!source.headers.includes(c)))throw Error('학습 제안이 실제 자료에 없는 항목을 사용하고 있어요.');
  if(!Array.isArray(value.steps)||value.steps.length!==4||value.steps.some(s=>!bounded(s.title,60)||!bounded(s.action,350)||!bounded(s.why,200)))throw Error('네 단계의 학습 순서를 확인하지 못했어요.');
  if(!Array.isArray(value.checks)||value.checks.length<2||value.checks.length>4||value.checks.some(s=>!bounded(s,220)))throw Error('결과 확인 기준을 확인하지 못했어요.');
  const taskId=value.taskId||'excel',p=programById(taskId);
  return {origin:value.origin,taskId,format:p.format,title:value.title.trim(),goal,reason:value.reason.trim(),columns:[...new Set(value.columns)],steps:value.steps.map(s=>({title:s.title.trim(),action:s.action.trim(),why:s.why.trim()})),checks:value.checks.map(s=>s.trim()),sourceIds:Array.isArray(value.sourceIds)?value.sourceIds.filter(s=>typeof s==='string').slice(0,8):[],...(value.requestedTask?{requestedTask:cleanGoal(value.requestedTask)}:{})};
}

export function manualCurriculum(goal,source,origin='manual',title='내가 정한 작업',checks=null){
  return cleanCurriculum({origin,title,goal:cleanGoal(goal),reason:'선택한 표를 사용해 요청하고, 실제 결과를 대조하며 연습해요.',columns:source.headers,
    steps:[
      {title:'내 말로 요청하기',action:'자료를 직접 첨부하고, 하고 싶은 작업과 받을 파일을 내 말로 요청해요.',why:'사용할 자료와 원하는 결과를 함께 알려야 요청이 분명해져요.'},
      {title:'목표와 결과 대조하기',action:'받은 파일을 열어 원자료의 항목과 숫자를 대조하고, 원하는 작업이 반영됐는지 확인해요.',why:'AI의 답변만으로 결과가 맞다고 판단할 수는 없어요.'},
      {title:'확인한 내용을 다시 요청하기',action:'기대와 다른 부분 또는 더 편하게 바꾸고 싶은 부분을 하나 골라 수정 요청을 직접 적어요.',why:'구체적인 변경 조건을 알려 주는 연습이에요.'},
      {title:'안내 없이 다시 해보기',action:'안내 없이 자료 첨부·요청·결과 확인을 스스로 진행해요.',why:'다른 AI에서도 같은 방법을 사용할 수 있는지 확인해요.'}
    ],checks:checks||['원자료의 열과 값을 결과에서 대조할 수 있나요?','원하는 작업과 결과물의 내용이 일치하나요?','계산이나 요약의 근거를 직접 확인했나요?']},source);
}

export function exampleCurricula(source){
  const headers=source.headers.join(' ');
  const goals=/금액|지출|비용/.test(headers)?[
    ['월별 지출 정리','날짜별 지출을 월별로 합산한 엑셀 표 만들기',['날짜가 올바른 월로 묶였나요?','월별 금액을 원자료와 직접 합산해 비교했나요?']],
    ['항목별 비용 비교','항목별 지출 합계와 비교 차트를 담은 엑셀 파일 만들기',['같은 항목이 하나로 묶였나요?','차트 값과 항목별 합계가 일치하나요?']],
    ['지출 내역 정돈','지출 내역을 날짜순으로 정리하고 필터로 찾기 쉬운 엑셀 표 만들기',['원래 기록이 누락되거나 중복되지 않았나요?','날짜 정렬과 항목 필터를 직접 사용해 봤나요?']]
  ]:/입고|출고|재고/.test(headers)?[
    ['현재 재고 계산','기초재고와 입고·출고로 현재 재고를 계산하는 엑셀 표 만들기',['현재 재고가 기초재고 + 입고 - 출고와 일치하나요?','입고 값을 바꾸면 현재 재고가 다시 계산되나요?']],
    ['재주문 상품 찾기','현재 재고가 안전재고보다 적은 상품을 표시하는 엑셀 파일 만들기',['안전재고와 비교하는 기준이 명확한가요?','기준보다 작은 값과 같은 값을 각각 확인했나요?']],
    ['분류별 재고 비교','상품 분류별 현재 재고를 비교하는 엑셀 요약표 만들기',['분류에 맞는 상품끼리 묶였나요?','분류별 수량을 원자료와 대조했나요?']]
  ]:/만족도|응답|점수/.test(headers)?[
    ['설문 응답 요약','참가유형별 응답 수와 평균 만족도를 보여 주는 엑셀 파일 만들기',['응답 수가 원자료와 일치하나요?','평균의 계산 범위와 분모를 확인했나요?']],
    ['재참여 의향 비교','재참여 답변별 인원과 비율을 비교하는 엑셀 표 만들기',['모든 답변 유형이 포함됐나요?','응답 수와 비율의 합을 확인했나요?']],
    ['의견을 읽기 쉽게 정리','설문 의견을 참가유형별로 정렬한 엑셀 표 만들기',['의견 내용이 바뀌거나 빠지지 않았나요?','응답번호와 의견이 올바르게 연결됐나요?']]
  ]:/수량/.test(headers)&&/단가/.test(headers)?[
    ['월별 매출 살펴보기','판매 자료의 월별 매출을 계산한 엑셀 요약표 만들기',['수량 × 단가로 매출을 계산했나요?','월별 합계를 원자료와 대조했나요?']],
    ['상품별 판매 비교','상품별 판매 수량과 매출을 비교하는 엑셀 파일 만들기',['같은 상품의 기록이 모두 포함됐나요?','판매 수량과 매출을 구분했나요?']],
    ['판매 기록 정리','판매 기록을 월과 상품별로 찾기 쉬운 엑셀 표 만들기',['원래 판매 기록이 모두 남아 있나요?','원하는 월과 상품을 필터로 찾을 수 있나요?']]
  ]:[
    ['자료를 읽기 쉽게 정리','내 자료의 열과 값을 유지하면서 읽기 쉬운 엑셀 표 만들기',['열 제목과 값이 원자료와 일치하나요?','표의 정렬과 서식이 읽기 쉬운가요?']],
    ['항목별로 묶어 보기','내 자료에서 묶어 볼 항목을 정하고 엑셀 요약표 만들기',['어떤 항목으로 묶었는지 명확한가요?','요약에 빠진 기록이 없는지 확인했나요?']],
    ['자료의 빈칸과 중복 살피기','내 자료에서 빈칸과 중복 기록을 표시한 엑셀 파일 만들기',['같은 값이 반복된 이유를 확인했나요?','원자료를 임의로 삭제하거나 바꾸지 않았나요?']]
  ];
  return goals.map(([title,goal,checks])=>manualCurriculum(goal,source,'example',title,checks));
}
