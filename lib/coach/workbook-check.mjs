import { calculator } from '../workbook.mjs';
import { sampleSource, salesMapping, headerName } from './source.mjs';

export function cleanWorkbook(value) {
  if (!value || value.kind !== 'workbook' || !Array.isArray(value.sheets) || !value.sheets.length || value.sheets.length > 6) throw Error('시트가 있는 XLSX 파일을 선택해 주세요.');
  const names = new Set();
  return { kind: 'workbook', title: String(value.title || '제출한 엑셀 파일').slice(0,160), sheets: value.sheets.map(sheet => {
    if (typeof sheet.name !== 'string' || !sheet.name || sheet.name.length > 31 || names.has(sheet.name) || /[\[\]*?:/\\]/.test(sheet.name)) throw Error('시트 이름을 확인해 주세요.');
    names.add(sheet.name);
    if (!Array.isArray(sheet.rows) || sheet.rows.length > 200) throw Error('학습용 파일은 시트마다 200행 이내로 제출해 주세요.');
    return { name: sheet.name, rows: sheet.rows.map(row => {
      if (!Array.isArray(row) || row.length > 20) throw Error('학습용 파일은 20열 이내로 제출해 주세요.');
      return row.map(cell => {
        if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
        if (typeof cell === 'string' && cell.length <= 1200) return cell;
        if (cell == null) return '';
        throw Error('셀 내용이 검사 가능한 형식이 아닙니다.');
      });
    }) };
  }) };
}
const norm = value => String(value ?? '').replace(/[\s,₩원]/g,'').toLowerCase();
const equal = (a,b) => norm(a) === norm(b);
const formula = value => typeof value === 'string' && value.startsWith('=');
const close = (a,b) => typeof a === 'number' && Math.abs(a-b) < .001;

export function checkWorkbook(value, phase = 0, inputSource = null) {
  const book = cleanWorkbook(value), source = inputSource || sampleSource(phase), calc = calculator(book);
  if(source.kind==='table')return checkCustomWorkbook(book,source);
  const rawRows = source.records;
  const matched = [], cells = [], errors = [], dataRows=[];
  for (const sheet of book.sheets) {
    let mapping = null,sourceHeader=null;
    sheet.rows.forEach((row,r) => {
      const potential = salesMapping(row);
      if (potential.every(c=>c>=0)){mapping=potential;sourceHeader=row;}
      if (mapping) {
        const values=mapping.map(c=>calc.safe(sheet.name,r,c).value);
        if(mapping.every(c=>row[c]!=null&&row[c]!=='')&&values[0]!==''&&values[1]!==''&&values.slice(2).every(v=>v!==''&&Number.isFinite(Number(v))))dataRows.push({sheet:sheet.name,r});
        const candidates=rawRows.flatMap((raw,index)=>!matched.some(m=>m.index===index)&&raw.every((v,i)=>equal(calc.safe(sheet.name,r,mapping[i]).value,v))?[index]:[]);
        const exact=candidates.find(index=>source.headers.every((h,i)=>{const core=salesMapping(source.headers).indexOf(i),c=core>=0?mapping[core]:sourceHeader.findIndex(v=>headerName(v)===headerName(h));return c>=0&&equal(calc.safe(sheet.name,r,c).value,source.rows[index][i]);}));
        const index=exact??candidates[0]??-1;
        if(index>=0) matched.push({index,sheet:sheet.name,r,mapping});
      }
      row.forEach((raw,c) => {
        const result=calc.safe(sheet.name,r,c);
        cells.push({sheet:sheet.name,r,c,raw,...result});
        if(result.error) errors.push({sheet:sheet.name,row:r+1,column:c+1,message:result.error});
      });
    });
  }
  const perturbed=matched.map(m=>{const changed=structuredClone(book);changed.sheets.find(s=>s.name===m.sheet).rows[m.r][m.mapping[2]]=Number(rawRows[m.index][2])+1;return {m,calc:calculator(changed),delta:Number(rawRows[m.index][3])};});
  const rowFormulas = perturbed.filter(({m,calc:updated,delta})=>cells.some(c=>c.sheet===m.sheet&&c.r===m.r&&formula(c.raw)&&!c.error&&close(c.value,Number(rawRows[m.index][2])*delta)&&close(updated.safe(c.sheet,c.r,c.c).value,c.value+delta))).length;
  const monthly = source.monthly.map((total,index) => {
    const month=[...new Set(rawRows.map(r=>r[0]))][index];
    return cells.some(c=>formula(c.raw)&&!c.error&&close(c.value,total)&&book.sheets.find(s=>s.name===c.sheet).rows[c.r].some(v=>equal(v,month))&&!matched.some(m=>m.sheet===c.sheet&&m.r===c.r)&&perturbed.every(({m,calc:updated,delta})=>close(updated.safe(c.sheet,c.r,c.c).value,total+(rawRows[m.index][0]===month?delta:0))));
  });
  const totals = cells.filter(c=>formula(c.raw)&&!c.error&&close(c.value,source.total)&&book.sheets.find(s=>s.name===c.sheet).rows[c.r].some(v=>/전체|총합|총계|합계|grand total|total/i.test(String(v))));
  const recalculates=matched.length===rawRows.length&&totals.some(c=>perturbed.every(({calc:updated,delta})=>close(updated.safe(c.sheet,c.r,c.c).value,source.total+delta)));
  // Extra columns in the learner's file must survive too; do not silently grade only the sample's four columns.
  const originalColumns=source.headers.map((h,i)=>({h,i}));
  const allOriginal=matched.every(m=>{
    const sheet=book.sheets.find(s=>s.name===m.sheet);
    const header=sheet.rows.slice(0,m.r).reverse().find(row=>salesMapping(row).every(c=>c>=0));
    return header&&originalColumns.every(({h,i})=>{const core=salesMapping(source.headers).indexOf(i),c=core>=0?m.mapping[core]:header.findIndex(v=>headerName(v)===headerName(h));return c>=0&&equal(calc.safe(m.sheet,m.r,c).value,source.rows[m.index][i]);});
  });
  const checks=[
    {id:'source',label:'원자료 보존',pass:matched.length===rawRows.length&&dataRows.length===rawRows.length&&allOriginal,value:`${matched.length}/${rawRows.length}행${!allOriginal?' · 원래 열 확인':''}${dataRows.length>rawRows.length?' · 추가 행 확인':''}`},
    {id:'formulas',label:'행별 매출 수식',pass:rowFormulas===rawRows.length,value:`${rowFormulas}/${rawRows.length}행`},
    {id:'monthly',label:'월별 합계 수식',pass:monthly.every(Boolean),value:`${monthly.filter(Boolean).length}/${monthly.length}개월`},
    {id:'total',label:'전체 합계 수식',pass:totals.length>0,value:totals.length?`${source.total.toLocaleString('ko-KR')}원`:'확인 필요'},
    {id:'recalculate',label:'수량 변경 시 재계산',pass:recalculates,value:recalculates?'연결 확인':'확인 필요'}
  ];
  return {checks,passed:checks.filter(c=>c.pass).length,total:checks.length,allPassed:checks.every(c=>c.pass),errors:errors.slice(0,10),scope:'제출된 파일의 학습용 매출표 검사. 결과 작성자·실제 ChatGPT 전송 여부는 인증하지 않습니다.'};
}

// A free-form goal is not the old sales exercise. File structure is observable;
// whether a chart, summary, cleanup, etc. satisfies the user's goal is not.
function checkCustomWorkbook(book,source){
  const nonempty=book.sheets.filter(s=>s.rows.some(r=>r.some(v=>v!==''&&v!=null)));
  const checks=[
    {id:'file',label:'엑셀 파일 내용',pass:nonempty.length>0,value:`내용이 있는 시트 ${nonempty.length}개`},
    {id:'source',label:'내 자료와 대조',pass:null,manual:true,value:`원자료 ${source.rows.length}행 · ${source.headers.join(' · ')}`},
    {id:'goal',label:'내 작업 목표 확인',pass:null,manual:true,value:source.goal||'원하는 작업이 결과에 반영됐는지 직접 확인'}
  ];
  return {checks,passed:checks.filter(c=>c.pass===true).length,total:checks.length,allPassed:false,errors:[],manual:true,
    scope:'파일 내용 유무만 자동 확인합니다. 원자료와의 일치, 요청한 계산·차트·정리의 정확성은 직접 확인해야 합니다.'};
}
