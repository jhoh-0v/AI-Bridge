import { materialFor } from './lesson.mjs';
import { cleanGoal, sampleDefinition } from './samples.mjs';
import { programById, programMaterial, programCurriculum } from './programs.mjs';
import { cleanCurriculum } from './curriculum.mjs';

export const SALES_COLUMNS = [
  ['월','판매월','month'], ['상품','상품명','제품','제품명','품목','product'],
  ['수량','판매수량','quantity','qty'], ['단가','판매단가','unitprice','price']
];
export const headerName = value => String(value??'').replace(/\((?:원|개|ea|pcs)\)|\[(?:원|개|ea|pcs)\]/gi,'').replace(/[\s_₩]/g,'').toLowerCase();
export const salesMapping = row => SALES_COLUMNS.map(labels=>row.findIndex(v=>labels.includes(headerName(v))));
const numeric = value => typeof value==='number'?value:Number(String(value).replace(/[,₩원\s]/g,''));

// Parse quoted CSV without executing formulas or silently shifting columns.
export function parseCsv(text) {
  if(typeof text!=='string'||text.length>500000)throw Error('500KB 이하의 CSV 자료를 선택해 주세요.');
  const rows=[];let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}
      else if(quoted||!cell)quoted=!quoted;
      else throw Error('CSV의 따옴표를 확인해 주세요.');
    }else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';
    }else cell+=c;
  }
  if(quoted)throw Error('CSV의 닫히지 않은 따옴표를 확인해 주세요.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length>61||rows.some(r=>r.length>20))throw Error('지금은 60행·20열 이내의 자료로 연습할 수 있어요.');
  return rows;
}
export function salesSource(rows) {
  if(!Array.isArray(rows)||rows.length<2||rows.length>61)throw Error('머리글과 1~60건의 판매 자료가 필요해요.');
  const mapping=salesMapping(rows[0]);
  if(mapping.some(i=>i<0)||new Set(mapping).size!==4)throw Error('이 과정에는 월·상품·수량·단가 열이 필요해요. 다른 종류의 표는 아직 맞춤 검증을 지원하지 않아요.');
  const headers=rows[0].map(String),body=rows.slice(1).filter(r=>r.some(v=>v!==''&&v!=null));
  if(headers.some(h=>!h.trim())||new Set(headers.map(headerName)).size!==headers.length)throw Error('열 제목이 비어 있거나 중복되어 있어요. 제목을 확인해 주세요.');
  const records=body.map((r,index)=>{
    if(r.length>headers.length||r.some(v=>typeof v==='string'&&v.startsWith('=')))throw Error(`${index+2}행은 수식 대신 원자료 값으로 준비해 주세요.`);
    const [month,product,qty,price]=mapping.map(c=>r[c]);
    if(month==null||product==null||!String(month).trim()||!String(product).trim()||qty==null||price==null||String(qty).trim()===''||String(price).trim()==='')throw Error(`${index+2}행의 월·상품·수량·단가를 확인해 주세요.`);
    const n=numeric(qty),p=numeric(price);
    if(!Number.isFinite(n)||!Number.isFinite(p)||n<0||p<0||n>1e8||p>1e9)throw Error(`${index+2}행의 수량과 단가를 0 이상의 숫자로 적어 주세요.`);
    return [String(month).trim(),String(product).trim(),n,p];
  });
  if(!records.length)throw Error('판매 자료가 비어 있어요.');
  if(JSON.stringify(rows).length>80000)throw Error('표 안의 긴 메모를 줄여 주세요. 지금은 작은 판매 표로 연습할 수 있어요.');
  const months=[...new Set(records.map(r=>r[0]))],monthly=months.map(m=>records.filter(r=>r[0]===m).reduce((sum,r)=>sum+r[2]*r[3],0));
  return {records,months,monthly,total:monthly.reduce((a,b)=>a+b,0),headers,rows:body.map(r=>headers.map((_,c)=>r[c]??''))};
}
export function sampleSource(phase=0) { return salesSource(parseCsv(materialFor(phase).csv)); }
export function textSource(text,title='내 자료'){
  if(typeof text!=='string'||text.trim().length<10||text.length>60000)throw Error('10~60,000자의 텍스트가 있는 자료를 선택해 주세요.');
  return {kind:'text',title:String(title).slice(0,180),text:text.trim(),headers:['자료'],rows:[]};
}
export function sourceForProgram(taskId,phase=0){const m=programMaterial(taskId,phase);return taskId==='excel'?salesSource(parseCsv(m.csv)):textSource(m.text,m.title);}
export function curriculumForSession(session,phase=session?.phase||0){
  const e=session?.exercise;
  return e?.version===3?(e.mode==='sample'?programCurriculum(e.taskId,phase):e.curriculum):null;
}
export function tableSource(rows) {
  if(!Array.isArray(rows)||rows.length<2||rows.length>61||rows.some(r=>!Array.isArray(r)||r.length>20))throw Error('열 제목과 1~60행·20열 이내의 표를 선택해 주세요.');
  const headers=rows[0].map(v=>String(v??'').trim());
  if(!headers.length||headers.some(h=>!h||h.length>120)||new Set(headers).size!==headers.length)throw Error('첫 행에는 비어 있거나 중복되지 않는 열 제목이 필요해요.');
  const body=rows.slice(1).filter(r=>r.some(v=>v!==''&&v!=null));
  if(!body.length)throw Error('자료가 비어 있어요.');
  if(JSON.stringify(rows).length>80000)throw Error('표 안의 긴 메모를 줄여 주세요. 지금은 작은 표로 연습할 수 있어요.');
  for(const row of body){
    if(row.length>headers.length)throw Error('자료의 열 수와 첫 행의 열 제목을 확인해 주세요.');
    if(row.some(v=>v!=null&&typeof v!=='string'&&!(typeof v==='number'&&Number.isFinite(v))))throw Error('문자와 숫자로 된 표를 선택해 주세요.');
    if(row.some(v=>typeof v==='string'&&(v.length>1200||v.startsWith('='))))throw Error('수식은 값으로 저장하고, 긴 셀 내용은 줄여 주세요.');
  }
  return {kind:'table',headers,rows:body.map(r=>headers.map((_,i)=>r[i]??''))};
}
export function sourceForSession(session,phase=session?.phase||0) {
  if(session?.exercise?.version===3){
    const e=session.exercise;
    return e.mode==='sample'?sourceForProgram(e.taskId,phase):e.source;
  }
  if(session?.exercise?.version===2){
    const exercise=session.exercise;
    const source=phase===3&&exercise.sampleId?sampleDefinition(exercise.sampleId,3):exercise.source;
    return {...tableSource([source.headers,...source.rows]),goal:exercise.goal};
  }
  return phase!==3&&session?.exercise?.source ? salesSource([session.exercise.source.headers,...session.exercise.source.rows]) : sampleSource(phase);
}
export function cleanExercise(value) {
  if(!value)return null;
  if(![1,2,3].includes(value.version)||!['sample','own'].includes(value.mode))throw Error('실습 준비 정보를 확인해 주세요.');
  if(value.version===3){
    const p=programById(value.taskId);
    if(!value.file||!/^.{1,180}\.(csv|xlsx|txt|md|docx|pptx)$/i.test(value.file.name)||!/^[a-f0-9]{64}$/i.test(value.file.sha256))throw Error('준비한 자료 파일을 확인해 주세요.');
    const source=value.mode==='sample'?sourceForProgram(p.id):value.source?.kind==='text'?textSource(value.source.text,value.source.title):tableSource([value.source?.headers||[],...(value.source?.rows||[])]);
    const curriculum=value.mode==='sample'?programCurriculum(p.id):cleanCurriculum(value.curriculum,source);
    if(curriculum.taskId!==p.id)throw Error('자료와 선택한 학습의 종류가 달라요.');
    return {version:3,mode:value.mode,taskId:p.id,source,curriculum,goal:curriculum.goal,file:{name:value.file.name,size:Number(value.file.size)||0,sha256:value.file.sha256},aiConsent:value.aiConsent===true,...(value.dialogueLearning===true?{dialogueLearning:true}:{})};
  }
  if(!value.file||!/^.{1,180}\.(csv|xlsx)$/i.test(value.file.name)||!(/^[a-f0-9]{64}$/i).test(value.file.sha256))throw Error('준비한 자료 파일을 확인해 주세요.');
  if(value.version===2){
    const source=tableSource([value.source?.headers||[],...(value.source?.rows||[])]),goal=cleanGoal(value.goal);
    const sampleId=value.mode==='sample'?sampleDefinition(value.sampleId).id:null;
    return {version:2,mode:value.mode,source,goal,sampleId,file:{name:value.file.name,size:Number(value.file.size)||0,sha256:value.file.sha256},aiConsent:value.aiConsent===true};
  }
  const source=salesSource([value.source?.headers||[],...(value.source?.rows||[])]);
  return {version:1,mode:value.mode,source,file:{name:value.file.name,size:Number(value.file.size)||0,sha256:value.file.sha256},aiConsent:value.aiConsent===true,goal:'원자료를 유지하고 행별 매출·월별 합계·전체 합계가 자동 계산되는 엑셀 파일 만들기'};
}
