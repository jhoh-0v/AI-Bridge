import { buildKnowledge } from './knowledge-library.mjs';
export const KNOWLEDGE_VERSION='2026-10-30.2';
const msSum={title:'Microsoft · SUMIF 함수',url:'https://support.microsoft.com/en-us/excel/functions/sumif-function',kind:'official'};
const msCalc={title:'Microsoft · 수식 재계산',url:'https://support.microsoft.com/en-us/excel/change-formula-recalculation-iteration-or-precision-in-excel',kind:'official'};
const web={title:'OpenAI · ChatGPT 웹 사용 안내',url:'https://learn.chatgpt.com/docs/web',kind:'official'};
const authored={title:'AI Bridge · 엑셀 실습 교육 기준 v1',url:'/coach#library',kind:'curriculum'};
const doc=(id,title,text,keywords,source=authored)=>({id,title,text,keywords,source,task:'excel',reviewedAt:'2026-10-29',version:KNOWLEDGE_VERSION});
// Authored teaching excerpts. External links identify references, not copied articles.
const LEGACY=[
  doc('attach-source','계산 전에 원자료 전달하기','이 실습에서는 먼저 내려받은 CSV 파일을 ChatGPT의 첨부 메뉴에서 직접 선택합니다. 입력창 위에 준비한 파일 이름이 표시됐는지 확인합니다. 첨부가 제한되면 화면의 계정·이용 한도 안내를 확인하세요. 앱이 파일이나 요청을 대신 넣지는 않습니다.','첨부 업로드 파일 csv 원자료 버튼 어디 넣기',web),
  doc('request-output','원하는 파일과 계산 조건 말하기','요청에는 사용할 자료, 계산하려는 값, 집계 단위, 결과 파일 형식을 포함합니다. 이 실습은 원자료를 보존하고 수식이 유지되는 XLSX가 목표입니다. 요청 템플릿의 대괄호를 실제 조건으로 바꿔 쓰세요. 완성된 정답 요청을 그대로 복사하기보다 각 조건이 필요한 이유를 설명해 보세요.','요청 프롬프트 형식 xlsx 엑셀 조건 템플릿'),
  doc('formula-value','숫자와 수식의 차이','숫자 120000을 직접 쓴 셀은 원자료 수량을 바꿔도 그대로입니다. =C2*D2처럼 원자료 셀을 참조하는 수식은 수량과 단가로 계산합니다. 화면에 같은 금액이 보이더라도 수식 입력줄에서 =로 시작하는 계산식이 있는지 확인하세요.','수식 숫자 값 고정 차이 자동 계산 입력줄',msCalc),
  doc('row-sales','행별 매출 계산하기','행별 매출은 해당 행의 수량과 단가를 곱합니다. 수량이 C열, 단가가 D열이라면 첫 자료 행에서 =C2*D2 같은 수식을 사용할 수 있습니다. 실제 파일의 열 위치를 먼저 확인해야 합니다. 다른 행도 자기 행의 수량·단가를 참조하는지 확인하세요.','행 매출 곱하기 수량 단가 곱셈 계산'),
  doc('sumif-month','월별 합계와 SUMIF','SUMIF는 조건을 검사할 범위, 찾을 조건, 더할 범위를 연결합니다. 월이 A2:A7, 매출이 E2:E7이라면 =SUMIF(A2:A7,"7월",E2:E7)처럼 한 달의 매출을 합칠 수 있습니다. 두 범위의 시작 행과 끝 행이 맞는지 확인하세요.','sumif 월별 월 합계 조건 범위 집계',msSum),
  doc('sumif-text','SUMIF 결과가 0일 때','조건의 표기와 원자료를 비교하세요. 7월과 7 월처럼 띄어쓰기가 다르거나 숫자와 텍스트가 섞이면 원하는 행을 찾지 못할 수 있습니다. 조건 범위는 월 열, 합계 범위는 매출 열을 가리키는지도 확인하세요.','sumif 0 영 안맞음 조건 문자열 월별 오류',msSum),
  doc('grand-total','전체 합계를 검증하기','전체 합계는 모든 행별 매출의 합과 같아야 합니다. 월별 합계를 다시 합친 값과도 비교하세요. 원자료 행과 월별 소계를 한꺼번에 더하면 중복 합산될 수 있습니다. 숫자가 우연히 맞는지보다 어떤 셀 범위를 합쳤는지 확인합니다.','전체 총합 총계 합계 중복 범위 틀림'),
  doc('recalculate','원자료를 바꿔 다시 계산해 보기','검사용 복사본에서 한 행의 수량을 1개 늘려 보세요. 전체 매출은 그 상품의 단가만큼 늘어나야 합니다. 바뀌지 않으면 합계가 상수인지, 수식이 올바른 셀을 참조하는지, 계산 설정이 수동인지 확인하세요. 확인 후 원본 자료는 유지합니다.','재계산 변경 수량 자동 갱신 안바뀜 참조',msCalc),
  doc('preserve','원자료를 보존하는 이유','검증하려면 AI가 받은 자료와 만든 결과를 대조할 수 있어야 합니다. 원자료 시트를 남기거나 원래 열을 보존한 채 계산 열을 추가하세요. 날짜·상품·수량·단가가 바뀌거나 행이 빠지지 않았는지 살펴보세요.','원자료 원본 보존 행 삭제 누락 비교'),
  doc('revision','문제를 짚어 후속 요청하기','더 잘 만들어 달라는 말 대신 확인한 문제와 필요한 수정을 함께 적습니다. 예: 합계 셀에 숫자만 있습니다. 원자료 수량을 바꾸면 합계가 다시 계산되도록 셀 참조 수식으로 수정해 주세요. 이미 맞는 부분은 유지하도록 요청할 수 있습니다.','수정 후속 다시 요청 개선 문제 구체적'),
  doc('verify-model','AI의 확인 답변과 직접 검증','AI에게 맞는지 물어보는 것만으로 계산 검증이 끝나지 않습니다. 제공한 원자료와 대조하고 직접 계산 가능한 항목을 확인하세요. 이 실습의 자동 검사는 일반 셀 참조·사칙연산·SUM·SUMIF 등 제한된 수식을 지원합니다. 지원하지 않는 수식은 실패로 단정하지 말고 실제 Excel에서도 확인합니다.','검증 정확 확인 오류 맞는지 수식 지원'),
  doc('download','결과 파일을 내려받아 확인하기','완성된 파일이 제공되면 대화에 표시된 다운로드로 저장하고 파일을 열어 확인합니다. 답변 안의 표만으로는 편집 가능한 XLSX 파일이 제공됐다고 볼 수 없습니다. 파일을 받지 못했다면 원하는 파일 형식을 명시해 후속 요청하세요.','다운로드 저장 결과 파일 xlsx 링크',web),
  doc('privacy','샘플 자료와 내 자료의 기록 범위','8개 기본 과정은 가상 자료로 연습합니다. 내 자료 과정에서는 전송할 파일 내용을 먼저 확인합니다. 데스크톱 앱은 현재 실습 대화에 직접 보낸 요청·받은 답변·다운로드 결과를 학습 기록으로 보관합니다. 맞춤 AI 제안과 설명은 동의한 자료와 해당 실습 결과를 API로 보내며 기존의 다른 대화를 학습 자료로 수집하지 않습니다.','개인정보 보안 회사 자료 업로드 저장 기록'),
  doc('graduation','독립 실습과 졸업 기준','독립 실습에서는 새로운 원자료로 같은 종류의 일을 수행합니다. ChatGPT는 계속 사용하되 AI Bridge의 템플릿·버튼 안내·자료 도움은 끕니다. 도움을 열어도 실습을 계속할 수 있지만 도움을 사용한 연습으로 기록합니다. 제출 파일 검사와 확인 문항을 통과한 경우에만 해당 기초 과제 졸업으로 표시합니다.','졸업 독립 실습 힌트 기준 평가 수준'),
  doc('limits','파일 검사 범위 이해하기','학습용 XLSX는 3MB 이하, 최대 6시트, 시트당 200행·20열을 지원합니다. 원자료 머리글은 월·상품·수량·단가처럼 알아볼 수 있게 작성합니다. 검사에서 확인하지 못한 값은 원자료와 실제 Excel 수식 입력줄로 대조하세요. 자동 검사는 종합 AI 역량이나 업무 정확성을 인증하지 않습니다.','파일 크기 제한 오류 지원 검사 안됨 수식 이름')
];
export const KNOWLEDGE=[...LEGACY.map(doc=>({...doc,stage:'review',levels:['starter','growing','independent'],authorship:'AI Bridge 교육 설계'})),...buildKnowledge(KNOWLEDGE_VERSION)];
