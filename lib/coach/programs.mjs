import { TASKS, TASK_BY_ID } from '../learning.mjs';
const titles={email:'정중하게 일정 변경 요청하기',report:'메모로 주간 보고서 만들기',ppt:'설득력 있는 5장 발표자료',excel:'스스로 만드는 매출 정리표',minutes:'결정 사항과 할 일 정리하기',plan:'실행할 수 있는 행사 기획안',official:'양식에 맞는 협조 요청 공문',image:'행사에 어울리는 홍보 이미지'};
const formats={email:'text',report:'text',ppt:'pptx',excel:'xlsx',minutes:'text',plan:'text',official:'text',image:'image'};
export const PROGRAMS=TASKS.map(t=>({id:t.id,name:t.id==='plan'?'기획안 / 발표 초안':t.name.replace(' 작성','').replace('·발표 준비','').replace(' 활용','').replace('업무용 ',''),title:titles[t.id],description:t.description,minutes:t.minutes,format:formats[t.id],criteria:t.criteria}));
export const programById=id=>{const p=PROGRAMS.find(p=>p.id===id);if(!p)throw Error('학습 프로그램을 선택해 주세요.');return p;};
export function programMaterial(id,phase=0){
  const task=TASK_BY_ID[programById(id).id],m=phase===3?task.challenge:task.material;
  return {...m,goal:id==='excel'?'원자료를 유지하고 수식으로 행별 매출·월별 합계·전체 합계가 계산되는 엑셀 파일 만들기':m.text.split('\n').filter(l=>l.startsWith('목표:')).at(-1)?.slice(3).trim()||task.suggested.goal};
}
export function programCurriculum(id,phase=0){
  const p=programById(id),task=TASK_BY_ID[id],m=programMaterial(id,phase);
  const nextChecks={email:['자기소개와 회의 목적이 들어 있나요?','두 후보 시간과 30분 온라인 회의 조건이 맞나요?','참석을 확정하지 않고 회신을 요청하나요?'],ppt:['시범 운영을 제안하는 5장 발표자료인가요?','인원·기간·예산과 미확정 담당자가 원자료와 맞나요?','미측정 문의 빈도를 확정 성과로 쓰지 않았나요?'],image:['상품을 촬영하는 성인 한 명과 가로 구도가 맞나요?','행사명·일시·장소가 정확한가요?','없는 참가비·할인 문구를 추가하지 않았나요?'],official:['발신·수신·희망일·인원이 원자료와 맞나요?','승인을 확정하지 않고 가능 여부를 요청하나요?','회신 기한과 주소가 정확한가요?']};
  return {origin:'sample',taskId:id,title:phase===3?m.title:p.title,goal:m.goal,reason:task.description,format:p.format,columns:[],steps:[
    {title:'자료를 전달하고 요청하기',action:`${m.title} 파일을 직접 첨부하고, ${m.goal.replace(/[.。]$/,'')}라는 뜻을 내 말로 요청해요.`,why:task.coach[0]},
    {title:'원자료와 결과 확인하기',action:task.criteria.join(' / '),why:task.coach[1]},
    {title:'조건을 더해 수정하기',action:'확인한 내용 중 바꿀 부분 하나와 유지할 부분을 구분해 직접 다시 요청해요.',why:task.coach[2]},
    {title:'새 자료로 혼자 해보기',action:`${task.challenge.title} 자료로 첨부부터 요청·결과 확인까지 스스로 해봐요.`,why:'새 상황에 맞게 조건을 정하는 연습이에요.'}
  ],checks:phase===3?(nextChecks[id]||task.criteria):task.criteria};
}
export function lessonQuestions(taskId='excel'){
  return [{id:'recalculate',text:taskId==='excel'?'자료의 값을 바꿨을 때 합계도 바뀌게 하려면?':'AI의 결과가 기대와 다를 때 어떻게 요청할까요?',options:taskId==='excel'?['합계를 숫자로 직접 적는다','원자료 셀을 참조하는 수식을 사용한다','색상만 바꾼다']:['그냥 더 잘해 달라고 한다','바꿀 부분과 유지할 조건을 구체적으로 말한다','같은 요청을 반복한다'],correct:1},{id:'verify',text:'AI가 만든 결과를 확인하는 방법은?',options:['보기 좋으면 그대로 쓴다','같은 AI가 맞다고 하면 끝낸다','원자료와 목표를 대조하고 확인할 수 있는 항목을 직접 점검한다'],correct:2}];
}
