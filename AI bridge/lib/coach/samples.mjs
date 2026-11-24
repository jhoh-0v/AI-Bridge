// Curated practice inputs, not AI-generated outputs or suggested completed prompts.
const samples = [
  {
    id:'sales',title:'상품 판매 기록',description:'상품별·월별 매출을 정리하거나 판매 추이를 살펴볼 때',
    keywords:['매출','판매','실적','매상','상품','매장','sales'],
    headers:['월','상품','수량','단가'],
    rows:[['7월','노트',10,3000],['7월','펜',20,1500],['8월','노트',15,3000],['8월','펜',30,1500],['9월','노트',12,3000],['9월','펜',24,1500]],
    challenge:[['10월','메모지',8,2500],['10월','파일',12,1800],['11월','메모지',14,2500],['11월','파일',9,1800],['12월','메모지',11,2500],['12월','파일',16,1800]]
  },
  {
    id:'expenses',title:'팀 지출 내역',description:'지출을 항목별로 묶거나 월별 비용·예산을 비교할 때',
    keywords:['지출','경비','비용','예산','가계부','정산','소비','expenses'],
    headers:['날짜','항목','내용','금액','결제수단'],
    rows:[['2026-07-03','사무용품','노트 구입',24000,'법인카드'],['2026-07-08','교통비','출장 버스',32000,'법인카드'],['2026-07-15','식비','팀 회의',56000,'법인카드'],['2026-08-04','사무용품','파일 구입',18000,'계좌이체'],['2026-08-12','교통비','출장 기차',48000,'법인카드'],['2026-08-20','식비','업무 회의',42000,'법인카드']],
    challenge:[['2026-09-02','사무용품','펜 구입',16000,'법인카드'],['2026-09-10','교통비','출장 버스',28000,'법인카드'],['2026-09-16','식비','팀 회의',64000,'법인카드'],['2026-10-06','사무용품','노트 구입',30000,'계좌이체'],['2026-10-13','교통비','출장 기차',52000,'법인카드'],['2026-10-22','식비','업무 회의',38000,'법인카드']]
  },
  {
    id:'inventory',title:'상품 재고 현황',description:'남은 수량을 계산하고 재주문할 상품을 찾아볼 때',
    keywords:['재고','입고','출고','발주','재주문','수량','inventory'],
    headers:['상품','분류','기초재고','입고','출고','안전재고'],
    rows:[['노트','문구',30,20,38,15],['펜','문구',60,30,65,25],['파일','문구',20,15,12,10],['텀블러','생활',18,10,22,8],['파우치','생활',25,5,12,10],['메모지','문구',40,20,48,20]],
    challenge:[['노트','문구',25,15,32,15],['펜','문구',50,20,42,25],['파일','문구',15,10,18,10],['텀블러','생활',20,8,12,8],['파우치','생활',15,10,19,10],['메모지','문구',30,15,26,20]]
  },
  {
    id:'survey',title:'행사 만족도 설문',description:'응답 수·평균 점수를 구하거나 의견을 분류할 때',
    keywords:['설문','만족','응답','평균','점수','의견','행사','survey'],
    headers:['응답번호','참가유형','만족도(5점)','재참여','의견'],
    rows:[['R01','학생',5,'예','설명이 이해하기 쉬웠어요'],['R02','직장인',4,'예','실습 시간이 더 필요해요'],['R03','학생',3,'미정','자료가 더 있으면 좋겠어요'],['R04','직장인',5,'예','업무에 도움이 됐어요'],['R05','일반',4,'예','진행 속도가 적당했어요'],['R06','일반',2,'아니요','처음에는 따라가기 어려웠어요']],
    challenge:[['R11','학생',4,'예','직접 해볼 수 있어 좋았어요'],['R12','직장인',3,'미정','예제가 더 필요해요'],['R13','학생',5,'예','설명이 명확했어요'],['R14','직장인',4,'예','업무에 활용하고 싶어요'],['R15','일반',3,'미정','연습 시간이 부족했어요'],['R16','일반',5,'예','안내가 친절했어요']]
  }
];

export function sampleDefinition(id,phase=0) {
  const value=samples.find(s=>s.id===id);
  if(!value)throw Error('미리보기에서 사용할 샘플을 골라 주세요.');
  return {id:value.id,title:value.title,description:value.description,headers:[...value.headers],rows:structuredClone(phase===3?value.challenge:value.rows)};
}

export function samplesForGoal(goal='') {
  const text=String(goal).toLowerCase();
  return samples.map((s,index)=>({...sampleDefinition(s.id),score:s.keywords.filter(k=>text.includes(k)).length,index}))
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .map(({score,index,...s})=>({...s,recommended:score>0}));
}

export function csvForSource(source) {
  const escape=value=>{const text=String(value??'');return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
  return [source.headers,...source.rows].map(row=>row.map(escape).join(',')).join('\r\n');
}

export function cleanGoal(value) {
  if(typeof value!=='string'||value.trim().length<5||value.trim().length>500)throw Error('하고 싶은 작업을 5~500자로 적어 주세요.');
  return value.trim();
}
