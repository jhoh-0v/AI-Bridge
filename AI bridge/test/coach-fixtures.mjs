import ExcelJS from 'exceljs';
import { materialFor } from '../lib/coach/lesson.mjs';
import { createSession, updateDraft, submitEvidence, advance } from '../lib/coach/session.mjs';
export function workbook(phase=0,withFormulas=true){
  const source=materialFor(phase),raw=source.csv.split('\n').slice(1).map(r=>{const [m,p,q,u]=r.split(',');return [m,p,Number(q),Number(u)];});
  const rows=[['월','상품','수량','단가','매출'],...raw.map((r,i)=>[...r,withFormulas?`=C${i+2}*D${i+2}`:r[2]*r[3]]),[],['월','월별 합계'],...[...new Set(raw.map(r=>r[0]))].map((m,i)=>[m,withFormulas?`=SUMIF(A2:A7,A${10+i},E2:E7)`:source.monthly[i]]),['전체 합계',withFormulas?'=SUM(E2:E7)':source.total]];
  return {kind:'workbook',title:'QA용 매출표',sheets:[{name:'매출',rows}]};
}
export const upload=(phase=0,formulas=true)=>({workbook:workbook(phase,formulas),file:{name:`qa-${phase}.xlsx`,size:5000,sha256:'a'.repeat(64)}});
export async function xlsx(phase=0,withFormulas=true){const b=workbook(phase,withFormulas),x=new ExcelJS.Workbook();for(const s of b.sheets){const sheet=x.addWorksheet(s.name);for(const row of s.rows)sheet.addRow(row.map(c=>typeof c==='string'&&c.startsWith('=')?{formula:c.slice(1),result:0}:c));}return x.xlsx.writeBuffer();}
export async function completed(){let s=createSession('starter');s=updateDraft(s,{prompt:'QA용 첫 요청입니다. 매출표를 만들어 주세요.',environment:'QA 가상 계정'});s=await submitEvidence(s,upload(0,false));s=advance(updateDraft(s,{review:'QA에서 원자료와 수식 유무를 대조했습니다.'}));s=updateDraft(s,{prompt:'QA 수정 요청입니다. 셀을 참조한 수식과 월별 합계를 넣어 주세요.'});s=await submitEvidence(s,upload(0));s=advance(updateDraft(s,{reflection:'QA에서 참조 수식을 추가한 뒤 합계가 변하는 것을 확인했습니다.'}));s=updateDraft(s,{prompt:'QA 새 과제입니다. 이 판매 자료도 수식으로 정리해 주세요.',answers:{recalculate:1,verify:2}});s=await submitEvidence(s,upload(3));return advance(s);}
