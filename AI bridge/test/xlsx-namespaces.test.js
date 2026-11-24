import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {xlsx} from './coach-fixtures.mjs';
import {readWorkbookFile} from '../lib/coach/read-xlsx.mjs';
import {checkWorkbook} from '../lib/coach/workbook-check.mjs';
import {normalizeOfficeXml} from '../lib/coach/xlsx-namespaces.mjs';
import {calculator} from '../lib/workbook.mjs';
import {workbook} from './coach-fixtures.mjs';

test('valid namespace-prefixed workbooks from commercial AI retain formulas and original byte hashes',async()=>{
  const zip=await JSZip.loadAsync(await xlsx(0));
  for(const entry of Object.values(zip.files).filter(e=>!e.dir&&e.name.startsWith('xl/')&&e.name.endsWith('.xml')&&!e.name.includes('theme'))){
    let xml=await entry.async('string');
    if(!xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'))continue;
    xml=xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(/<(\/?)([a-zA-Z][\w.-]*)(?=[\s/>])/g,'<$1x:$2');
    zip.file(entry.name,xml);
  }
  const bytes=await zip.generateAsync({type:'uint8array'}),file=new File([bytes],'prefixed.xlsx');
  const result=await readWorkbookFile(file);assert.equal(checkWorkbook(result.workbook,0).allPassed,true);
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');assert.equal(result.file.sha256,hash);
});
test('namespace adapter preserves unrelated tags and relationship attributes',()=>{
  const xml='<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheet r:id="rId1"/></x:workbook>';
  assert.ok(normalizeOfficeXml(xml).includes('<sheet r:id="rId1"/>'));
  const other='<z:custom xmlns:z="urn:custom"/>';assert.equal(normalizeOfficeXml(other),other);
});

test('realistic unit headers and SUMIFS pass the same source perturbation checks',()=>{
  const b=workbook(0);b.sheets[0].rows[0][3]='단가 (원)';b.sheets[0].rows[0][4]='매출액 (원)';
  for(let r=9;r<12;r++)b.sheets[0].rows[r][1]=`=SUMIFS(E2:E7,A2:A7,A${r+1})`;
  assert.equal(checkWorkbook(b,0).allPassed,true);
  const calc=calculator(b);assert.equal(calc.evaluate('SUMIFS(E2:E7,A2:A7,"7월",B2:B7,"노트")','매출'),120000);
  assert.throws(()=>calc.evaluate('SUMIFS(E2:E7,A2:A3,"7월")','매출'),/범위 크기/);
  assert.throws(()=>calc.evaluate('SUMIFS(E2:E7,C2:C7,">20")','매출'),/직접 확인/);
});

test('count-unit headers below a report title retain the correct baseline checks',()=>{
  const b=workbook(0),sheet=b.sheets[0];sheet.rows[0][2]='수량(개)';sheet.rows[0][3]='단가(원)';
  sheet.rows=Array.from({length:16},(_,i)=>i===0?['판매 요약']:[]).concat(sheet.rows.map(row=>row.map(c=>typeof c==='string'&&c.startsWith('=')?c.replace(/([A-Z]+)(\d+)/g,(_,col,r)=>col+(Number(r)+16)):c)));
  assert.equal(checkWorkbook(b,0).allPassed,true);
  sheet.rows[16][2]='수량(박스)';
  assert.equal(checkWorkbook(b,0).checks.find(c=>c.id==='source').pass,false);
});
