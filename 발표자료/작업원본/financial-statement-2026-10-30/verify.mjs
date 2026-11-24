import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../AI bridge/package.json',import.meta.url));
const JSZip=require('jszip');
import {readSpreadsheetArtifactFile} from '../../../AI bridge/lib/coach/read-xlsx.mjs';
import {spreadsheetSummary} from '../../../AI bridge/lib/coach/spreadsheet-source.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const afterPath=process.argv[2];
if(!afterPath)throw new Error('Pass the actual downloaded after workbook path.');
async function read(p){
  const bytes=fs.readFileSync(p);
  const result=await readSpreadsheetArtifactFile(new File([bytes],path.basename(p)));
  return {bytes,artifact:result.artifact,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const [source,before,after]=await Promise.all(['source.xlsx','before.xlsx',afterPath].map(p=>read(path.isAbsolute(p)?p:path.join(dir,p))));
const sourceDifferences=[];
for(const sheet of source.artifact.sheets){
  const actual=after.artifact.sheets.find(s=>s.name===sheet.name);
  const values=new Map((actual?.cells||[]).map(c=>[c.address,c]));
  for(const cell of sheet.cells){
    const value=values.get(cell.address);
    if(!value||JSON.stringify(value.value)!==JSON.stringify(cell.value)||value.formula!==cell.formula)
      sourceDifferences.push({sheet:sheet.name,address:cell.address,before:cell.value,after:value?.value});
  }
}
const priorSheetChanges=[];
for(const sheet of before.artifact.sheets){
  const actual=after.artifact.sheets.find(s=>s.name===sheet.name);
  if(!actual){priorSheetChanges.push({sheet:sheet.name,missing:true});continue;}
  const values=new Map(actual.cells.map(c=>[c.address,c]));
  for(const cell of sheet.cells.filter(c=>c.value!==''&&c.value!==null)){
    const value=values.get(cell.address);
    if(!value||JSON.stringify(value.value)!==JSON.stringify(cell.value)||value.formula!==cell.formula)
      priorSheetChanges.push({sheet:sheet.name,address:cell.address,before:cell.value,after:value?.value,beforeFormula:cell.formula,afterFormula:value?.formula});
  }
}
const zip=await JSZip.loadAsync(after.bytes);
const workbookXml=await zip.file('xl/workbook.xml').async('string');
const sheetMetadata=[];
for(const entry of Object.values(zip.files).filter(e=>/^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))){
  const xml=await entry.async('string');
  sheetMetadata.push({part:entry.name,links:(xml.match(/<(?:\w+:)?hyperlink\s/g)||[]).length,
    conditionalFormats:(xml.match(/<(?:\w+:)?conditionalFormatting\s/g)||[]).length,
    pageSetup:xml.match(/<(?:\w+:)?pageSetup\b[^>]*>/)?.[0]||null});
}
const report={verifiedAt:new Date().toISOString(),sourceSha256:source.sha256,beforeSha256:before.sha256,afterSha256:after.sha256,
  before:spreadsheetSummary(before.artifact),after:spreadsheetSummary(after.artifact),
  sheetNames:after.artifact.sheets.map(s=>s.name),sourcePreserved:sourceDifferences.length===0,sourceDifferences,
  priorSheetChanges,formulaErrors:after.artifact.sheets.flatMap(s=>s.cells.filter(c=>typeof c.value==='string'&&/^#(?:REF!|DIV\/0!|VALUE!|NAME\?|NUM!|N\/A|SPILL!)/.test(c.value)).map(c=>({sheet:s.name,...c}))),
  addedSheets:after.artifact.sheets.filter(s=>!before.artifact.sheets.some(b=>b.name===s.name)).map(s=>({name:s.name,cells:s.cells})),
  printAreas:[...workbookXml.matchAll(/<(?:\w+:)?definedName\b[^>]*name="_xlnm.Print_Area"[^>]*>([\s\S]*?)<\/(?:\w+:)?definedName>/g)].map(m=>m[1]),
  sheetMetadata,limitations:['Stored values and formulas were inspected. No independent Excel recalculation was performed.']};
fs.writeFileSync(path.join(dir,'comparison-evidence.json'),JSON.stringify(report,null,2));
fs.copyFileSync(afterPath,path.join(dir,'after.xlsx'));
console.log(JSON.stringify({sourcePreserved:report.sourcePreserved,sourceDifferences:sourceDifferences.length,before:report.before,after:report.after,sheets:report.sheetNames,priorSheetChanges:priorSheetChanges.length,formulaErrors:report.formulaErrors.length,printAreas:report.printAreas}));
