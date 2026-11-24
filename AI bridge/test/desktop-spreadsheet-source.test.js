import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { ownMaterial, fileDigest } from '../desktop/materials.mjs';
import { cleanSpreadsheetSource, spreadsheetSearchText, sourceRowCount } from '../lib/coach/spreadsheet-source.mjs';
import { cleanExercise, sourceForSession } from '../lib/coach/source.mjs';
import { createSession, validateSession } from '../lib/coach/session.mjs';
import { manualCurriculum } from '../lib/coach/curriculum.mjs';
import { suggestCurricula } from '../desktop/ai-curriculum.mjs';
import { checkWorkbook } from '../lib/coach/workbook-check.mjs';
import { spreadsheetPreview } from '../desktop/ui/spreadsheet-preview.mjs';
import { dialogueSnapshot, analyseDialogue } from '../desktop/dialogue-coach.mjs';
import { readSpreadsheetArtifactFile } from '../lib/coach/read-xlsx.mjs';
import { spreadsheetContext, spreadsheetEvidence, compactSpreadsheetContext, compactEvidenceCatalog } from '../lib/coach/spreadsheet-context.mjs';
import { retrieve } from '../lib/coach/retrieval.mjs';
const at=(sheet,address)=>sheet.cells.find(c=>c.address===address);

async function documentBytes(){
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('재무');
  sheet.getCell('B2').value='예시기업';sheet.mergeCells('B2:F2');
  sheet.getCell('B4').value='재무상태표';sheet.getCell('D4').value=2024;sheet.getCell('E4').value=2025;
  sheet.getCell('B6').value='현금';sheet.getCell('C6').value='십억원';sheet.getCell('D6').value=-25.5;
  sheet.getCell('D6').numFmt='#,##0.0';
  sheet.getCell('B7').value='현금';sheet.getCell('D7').value={formula:'D6*2',result:-51};
  sheet.getCell('E7').value={formula:'D7*2'};
  sheet.getCell('B18').value='손익계산서';sheet.getCell('D18').value=2024;sheet.getCell('E18').value=2025;
  sheet.getCell('B19').value='영업이익률';sheet.getCell('C19').value='%';sheet.getCell('D19').value=0.125;sheet.getCell('D19').numFmt='0.0%';
  sheet.getCell('B32').value='현금흐름표';sheet.getCell('B33').value='영업활동현금흐름';sheet.getCell('D33').value=0;
  const notes=book.addWorksheet('주석',{state:'hidden'});notes.getCell('B3').value='잠정 수치입니다.';
  notes.getCell('C4').value=new Date('2025-12-31T00:00:00.000Z');notes.getCell('D4').value=false;
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('personal XLSX accepts blank leading rows, titles, duplicate labels and multiple statements without rewriting bytes',async()=>{
  const bytes=await documentBytes(),hash=fileDigest(bytes),{source,file}=await ownMaterial('사업자료.xlsx',bytes,{general:true});
  assert.equal(source.kind,'spreadsheet');assert.equal(source.sheets.length,2);
  assert.equal(at(source.sheets[0],'A1'),undefined);
  assert.equal(at(source.sheets[0],'B2').value,'예시기업');
  assert.equal(at(source.sheets[0],'B18').value,'손익계산서');
  assert.equal(at(source.sheets[0],'B32').value,'현금흐름표');
  assert.equal(at(source.sheets[0],'D6').value,-25.5);
  assert.equal(at(source.sheets[0],'D33').value,0);
  assert.deepEqual(source.headers,["'재무'!B2:F33","'주석'!B3:D4"]);
  assert.equal(file.sha256,hash);assert.equal(fileDigest(bytes),hash);
  assert.ok(sourceRowCount(source)>0);assert.match(spreadsheetSearchText(source),/현금흐름표.*잠정 수치/);
});

test('personal source preserves merges, formulas and cached values separately, plus dates and hidden sheets',async()=>{
  const {source}=await ownMaterial('사업자료.xlsx',await documentBytes(),{general:true});
  const [sheet,notes]=source.sheets;
  assert.deepEqual(sheet.merges,['B2:F2']);assert.equal(at(sheet,'C2'),undefined);
  assert.equal(at(sheet,'D7').formula,'D6*2');assert.equal(at(sheet,'E7').formula,'D7*2');
  assert.equal(at(sheet,'D7').value,-51);assert.equal(at(sheet,'E7').value,'');
  assert.equal(at(sheet,'D19').format,'0.0%');
  assert.equal(notes.state,'hidden');assert.equal(at(notes,'C4').value,'2025-12-31T00:00:00.000Z');assert.equal(at(notes,'D4').value,false);
  assert.deepEqual(cleanSpreadsheetSource(JSON.parse(JSON.stringify(source))),source);
});

test('personal spreadsheet survives practice reload and independent learning; it is never checked against sales-sample totals',async()=>{
  const material=await ownMaterial('사업자료.xlsx',await documentBytes(),{general:true});
  const curriculum=manualCurriculum('기간별 재무 수치와 변화를 비교하는 엑셀 만들기',material.source);
  const exercise=cleanExercise({version:3,mode:'own',taskId:'excel',...material,curriculum,aiConsent:true,dialogueLearning:true});
  const session=validateSession({...createSession(),exercise});
  assert.deepEqual(sourceForSession(session,3),material.source);
  assert.equal(session.exercise.file.sha256,material.file.sha256);
  const check=checkWorkbook({kind:'workbook',sheets:[{name:'비교',rows:[['기간','현금'],[2024,-25.5]]}]},0,material.source);
  assert.equal(check.manual,true);assert.equal(check.allPassed,false);assert.equal(check.checks.find(c=>c.id==='source').pass,null);
});

test('curriculum gets every statement, units and real ranges, rejecting invented ranges',async()=>{
  const {source}=await ownMaterial('사업자료.xlsx',await documentBytes(),{general:true});
  let calls=0;
  const generate=async({instruction,payload})=>{
    calls++;assert.deepEqual(payload.source.headers,source.headers);assert.equal(payload.source.coverage.includedCells,source.sheets.reduce((n,s)=>n+s.cells.length,0));assert.match(instruction,/빈칸은 0이나 오류로 간주하지 않는다/);
    assert.match(instruction,/파일명과 본문/);assert.match(JSON.stringify(payload.source),/현금흐름표/);
    const plan=manualCurriculum('기간별 재무 수치와 변화를 비교하는 엑셀 만들기',source);
    return {value:{options:Array.from({length:3},()=>({...plan,sourceIds:[payload.knowledge.find(k=>k.task==='common').id]}))},receipt:{provider:'test'}};
  };
  const plan=await suggestCurricula({source,level:'starter',consent:true,generate});
  assert.equal(calls,1);assert.equal(plan.options.length,3);
  await assert.rejects(suggestCurricula({source,level:'starter',consent:true,generate:async args=>{const result=await generate(args);result.value.options[0].columns=['없는 열'];return result;}}),/확인하지 못/);
});

test('document-shaped CSV preserves leading blanks, repeat headings and literal formula text without executing it',async()=>{
  const bytes=Buffer.from('\uFEFF\r\n,예시기업\r\n,재무상태표,,2024,2025\r\n,현금,십억원,0,-5\r\n\r\n,손익계산서,,2024,2025\r\n,이익,십억원,=D4*2,3');
  const {source}=await ownMaterial('자료.csv',bytes,{general:true});
  assert.equal(source.kind,'spreadsheet');assert.equal(at(source.sheets[0],'A1'),undefined);
  assert.equal(at(source.sheets[0],'D7').value,'=D4*2');assert.ok(source.sheets[0].cells.every(c=>!c.formula));
  assert.deepEqual((await ownMaterial('일반.csv',Buffer.from('항목,값\n하나,3'),{general:true})).source.headers,['항목','값']);
});

test('live coaching receives the full personal workbook and waits until independent practice is finished',async()=>{
  const material=await ownMaterial('사업자료.xlsx',await documentBytes(),{general:true});
  const curriculum=manualCurriculum('기간별 재무 수치와 변화를 비교하는 엑셀 만들기',material.source);
  const session={...createSession(),exercise:cleanExercise({version:3,mode:'own',taskId:'excel',...material,curriculum,aiConsent:true,dialogueLearning:true})};
  const flow={turns:[{id:'t1',phase:0,text:'첨부한 자료의 현금흐름을 정리해 줘.'}],responses:{t1:{finished:true,text:'영업활동현금흐름을 확인했습니다.'}}};
  const snapshot=dialogueSnapshot(session,flow);
  assert.deepEqual(snapshot.payload.source,material.source);
  const feedback=await analyseDialogue({snapshot,generate:async({instruction,payload})=>{
    assert.match(instruction,/첫 행을 열 제목으로 바꾸도록 요구하지 말고/);
    assert.match(JSON.stringify(payload.evidenceCatalog),/영업활동현금흐름/);
    return {value:{goal:curriculum.goal,title:'단위를 확인해 봐요',observation:'원자료에는 십억원 단위가 있어요.',action:'답변과 원자료의 단위를 직접 대조해 봐요.',why:'같은 숫자라도 단위가 다르면 뜻이 달라져요.',kind:'needs_check',checks:['연도가 맞나요?','단위가 같나요?'],nextSteps:['셀 위치를 찾아요.','차이가 있으면 직접 수정 요청해요.'],evidenceIds:[payload.evidenceCatalog.find(e=>e.cells?.some(c=>c[1]==='십억원')).id],sourceIds:[payload.knowledge[0].id]},receipt:{provider:'test'}};
  }});
  assert.equal(feedback.kind,'needs_check');
  assert.equal(dialogueSnapshot({...session,phase:3},flow),null);
  const after=dialogueSnapshot({...session,phase:4,completedAt:new Date().toISOString()},flow);
  assert.equal(after.payload.stage,'after-independent');assert.deepEqual(after.payload.independentSource,material.source);
});

test('spreadsheet preview keeps row coordinates, sheet choices, merges and formula uncertainty, and escapes file content',async()=>{
  const {source}=await ownMaterial('자료.xlsx',await documentBytes(),{general:true});
  at(source.sheets[0],'B2').value='<script>alert(1)</script>';
  const html=spreadsheetPreview(source);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/name="sourceSheet"/);
  assert.match(html,/colspan="5"/);assert.match(html,/계산값 없음/);assert.match(html,/현금흐름표/);assert.match(html,/>33<\/th>/);
  assert.match(spreadsheetPreview(source,1),/잠정 수치입니다/);
});

test('flexible layout accepts far cells while rejecting empty, unsafe and malformed inputs',async()=>{
  const bytes=await documentBytes();
  await assert.rejects(ownMaterial('broken.xlsx',Buffer.from('not a zip'),{general:true}),/암호가 없는 XLSX/);
  await assert.rejects(ownMaterial('empty.csv',Buffer.from('\n\n'),{general:true}),/내용/);
  const zip=await JSZip.loadAsync(bytes);zip.file('xl/externalLinks/externalLink1.xml','<externalLink/>');
  await assert.rejects(ownMaterial('external.xlsx',await zip.generateAsync({type:'nodebuffer'}),{general:true}),/외부 문서 연결/);
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('큰자료');sheet.getCell('A201').value='내용';
  const large=await ownMaterial('large.xlsx',Buffer.from(await book.xlsx.writeBuffer()),{general:true});assert.equal(at(large.source.sheets[0],'A201').value,'내용');
  const source=(await ownMaterial('자료.xlsx',bytes,{general:true})).source;source.sheets[0].cells.push({address:'XFD1048576',value:2,formula:'1+1'});
  const cleaned=cleanSpreadsheetSource(source);assert.equal(at(cleaned.sheets[0],'XFD1048576').value,2);
  assert.ok(spreadsheetPreview(cleaned).length<50000);
  source.sheets[0].cells.push({address:'XFE1',value:1});assert.throws(()=>cleanSpreadsheetSource(source),/사용할 수 없는/);
});

test('generated Excel with 29 columns, 301 rows and eight sheets is read with formulas, caches and chart references',async()=>{
  const book=new ExcelJS.Workbook();for(let i=0;i<8;i++){const s=book.addWorksheet('자료'+i);s.getCell('B2').value='회사';s.getCell('AC301').value={formula:'1+1',result:2};}
  const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());
  zip.file('xl/charts/chart1.xml','<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:lineChart><c:ser><c:val><c:numRef><c:f>자료0!$AC$2:$AC$301</c:f></c:numRef></c:val></c:ser></c:lineChart></c:plotArea></c:chart></c:chartSpace>');
  const bytes=await zip.generateAsync({type:'nodebuffer'}),upload=await readSpreadsheetArtifactFile(new File([bytes],'결과.xlsx'));
  assert.equal(upload.artifact.sheets.length,8);assert.equal(at(upload.artifact.sheets[7],'AC301').formula,'1+1');assert.equal(at(upload.artifact.sheets[7],'AC301').value,2);
  assert.equal(upload.artifact.charts[0].types[0],'lineChart');assert.deepEqual(upload.artifact.charts[0].references,['자료0!$AC$2:$AC$301']);assert.equal(upload.file.sha256,fileDigest(bytes));
  const evidence=spreadsheetEvidence(upload.artifact,'file:test','결과');assert.ok(evidence.some(e=>e.locations.includes('자료0!B2')&&e.quote.includes('회사')));assert.ok(!evidence.some(e=>e.locations.includes('자료0!B3')));
});

test('large workbook context discloses selection and retains every local cell and every sheet',()=>{
  const source=cleanSpreadsheetSource({sheets:Array.from({length:8},(_,s)=>({name:'시트'+s,cells:Array.from({length:1000},(_,i)=>({address:'A'+(i+1),value:'항목 '+i+' '.repeat(20)}))}))});
  const view=spreadsheetContext(source,{maxCharacters:10000,query:'항목 999'});assert.equal(view.coverage.complete,false);assert.equal(view.coverage.totalCells,8000);assert.ok(view.coverage.includedCells<8000);assert.ok(view.sheets.every(s=>s.cells.length>0));assert.equal(source.sheets[7].cells.length,1000);
});

test('compact model transport preserves every value, formula, format, merge and chart without changing source evidence',async()=>{
  const {source}=await ownMaterial('사업자료.xlsx',await documentBytes(),{general:true});
  source.charts=[{part:'chart1',types:['lineChart'],title:'추세',references:["'재무'!D6:E7"]}];
  const before=structuredClone(source),packed=compactSpreadsheetContext(source);
  const decode=tuple=>({address:tuple[0],value:tuple[1],...(tuple[2]?{formula:tuple[2]}:{}),...(tuple[3]!==undefined?{format:packed.formats[tuple[3]]}:{})});
  packed.sheets.forEach((sheet,i)=>{assert.deepEqual(sheet.cells.map(decode),source.sheets[i].cells);assert.deepEqual(sheet.merges,source.sheets[i].merges);assert.equal(sheet.state,source.sheets[i].state);});
  assert.deepEqual(packed.charts,source.charts);assert.equal(packed.coverage.complete,true);assert.deepEqual(source,before);
  const catalog=spreadsheetEvidence(source,'file:test','긴 이름의 실제 결과 파일',{includeCells:true});
  const transport=compactEvidenceCatalog(catalog);
  for(const [i,entry] of transport.entries.entries()){
    const {cells,sheet,...expected}=catalog[i];assert.deepEqual(transport.resolve(entry.id),expected);
  }
  assert.equal(transport.resolve('e9999'),null);
  assert.ok(JSON.stringify({entries:transport.entries,formats:transport.formats}).length<JSON.stringify(catalog.map(({cells,sheet,...e})=>e)).length);
});

test('personal retrieval does not transplant the sales sample into unrelated source tasks',()=>{
  const query='행별 매출 수량 단가 월별 합계 SUMIF 수식';
  assert.ok(retrieve(query,{task:'excel',materialMode:'sample',limit:12}).sources.some(s=>s.sampleOnly));
  const personal=retrieve(query,{task:'excel',materialMode:'own',limit:12});
  assert.ok(personal.sources.length);assert.ok(personal.sources.every(s=>!s.sampleOnly));
});

test('repeated Excel formats do not discard cells that fit the compact AI budget',()=>{
  const source=cleanSpreadsheetSource({sheets:[{name:'대조표',cells:Array.from({length:400},(_,i)=>({address:'A'+(i+1),value:i,formula:'1+'+(i-1),format:'#,##0.000000;[Red](#,##0.000000);"-"'}))}]});
  const packed=compactSpreadsheetContext(source,{maxCharacters:1000000}),budget=JSON.stringify(packed).length+100;
  assert.ok(JSON.stringify(source).length>budget);
  const view=spreadsheetContext(source,{maxCharacters:budget});
  assert.equal(view,source);assert.equal(compactSpreadsheetContext(source,{maxCharacters:budget}).coverage.complete,true);
});

test('partial spreadsheet evidence selects complete rows so labels retain their values and formulas',()=>{
  const source=cleanSpreadsheetSource({sheets:[{name:'대조표',cells:Array.from({length:300},(_,i)=>['A','B','C'].map((column,j)=>({address:column+(i+1),value:j?i:'항목 '+i}))).flat()}]});
  const view=spreadsheetContext(source,{maxCharacters:4000,query:'항목 299'});
  assert.equal(view.coverage.complete,false);
  const rows=new Map();for(const cell of view.sheets[0].cells){const row=cell.address.match(/\d+$/)[0];rows.set(row,(rows.get(row)||0)+1);}
  assert.ok(rows.size>0);assert.ok([...rows.values()].every(n=>n===3));
});
