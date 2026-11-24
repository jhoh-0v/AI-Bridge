import { cleanWorkbook } from './workbook-check.mjs';
import { sha256 } from '../artifact-schema.mjs';
import { normalizeOfficeXml } from './xlsx-namespaces.mjs';
import { cleanSpreadsheetSource, SOURCE_SHEET_LIMITS } from './spreadsheet-source.mjs';

async function loadWorkbookFile(file) {
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > SOURCE_SHEET_LIMITS.bytes) throw Error('50MB 이하의 XLSX 파일을 선택해 주세요.');
  const bytes=await file.arrayBuffer();
  const {default:JSZip}=await import('jszip');
  let zip;
  try{zip=await JSZip.loadAsync(bytes);}catch{throw Error('암호가 없는 XLSX 파일인지, 엑셀에서 정상적으로 열리는지 확인해 주세요.');}
  const entries=Object.values(zip.files);
  if(entries.length>10000||entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>200*1024*1024)throw Error('압축을 푼 내용이 메모리 보호 범위를 넘어요(200MB). 파일 읽기를 멈췄어요.');
  if(entries.some(e=>/vbaProject|externalLinks/i.test(e.name)))throw Error('매크로나 외부 문서 연결이 없는 XLSX로 제출해 주세요.');
  let adapted=false;
  for(const entry of entries.filter(e=>!e.dir&&/\.(?:xml|rels)$/.test(e.name))){
    const original=await entry.async('string');
    if(/<!DOCTYPE|<!ENTITY/i.test(original))throw Error('외부 엔터티가 없는 일반 XLSX 파일을 사용해 주세요.');
    const normalized=normalizeOfficeXml(original);
    if(normalized!==original){zip.file(entry.name,normalized);adapted=true;}
  }
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(adapted?await zip.generateAsync({type:'uint8array'}):bytes);}catch{throw Error('이 파일의 엑셀 구조를 읽지 못했어요. 일반 XLSX 파일로 다시 저장해 주세요.');}
  return {workbook,bytes,zip};
}

async function extractSpreadsheet(file,{workbook,zip}){
  const scalar=value=>{
    if(value==null)return '';
    if(value instanceof Date)return value.toISOString();
    if(['string','number','boolean'].includes(typeof value))return value;
    if(value.richText)return value.richText.map(t=>t.text).join('');
    if(typeof value.text==='string')return value.text;
    if(value.error)return String(value.error);
    throw Error('읽을 수 없는 셀 형식이 있어요. 일반 XLSX 형식인지 확인해 주세요.');
  };
  const sheets=workbook.worksheets.map(sheet=>{
    const cells=[];
    sheet.eachRow(row=>row.eachCell(cell=>{
      if(cell.isMerged&&cell.master.address!==cell.address)return;
      if(cell.value==null||cell.value==='')return;
      cells.push({address:cell.address,value:scalar(cell.formula?cell.result:cell.value),...(cell.formula?{formula:cell.formula}:{}),...(cell.numFmt&&cell.numFmt!=='General'?{format:cell.numFmt}:{})});
    }));
    return {name:sheet.name,state:sheet.state,cells,merges:sheet.model.merges||[]};
  });
  // Chart definitions disclose their source ranges; they do not prove visual quality.
  const decode=s=>s.replace(/&#x([a-f0-9]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
  const charts=[];
  for(const entry of Object.values(zip.files).filter(e=>/^xl\/(?:[^/]+\/)*charts\/[^/]+\.xml$/.test(e.name))){
    const xml=await entry.async('string');
    if(!/<(?:\w+:)?chartSpace\b/.test(xml))continue;
    const title=xml.match(/<(?:\w+:)?title\b[^>]*>([\s\S]*?)<\/(?:\w+:)?title>/)?.[1]||'';
    charts.push({part:entry.name,types:[...new Set([...xml.matchAll(/<(?:\w+:)?(\w+Chart)\b/g)].map(m=>m[1]))],title:[...title.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decode(m[1])).join(''),references:[...new Set([...xml.matchAll(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/g)].map(m=>decode(m[1])))]});
  }
  return cleanSpreadsheetSource({title:file.name,sheets,charts});
}

export async function readSpreadsheetSourceFile(file){return extractSpreadsheet(file,await loadWorkbookFile(file));}
export const RESULT_READER_VERSION=2;
export async function readSpreadsheetArtifactFile(file){
  const loaded=await loadWorkbookFile(file),artifact=await extractSpreadsheet(file,loaded);
  const fileHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',loaded.bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {artifact,file:{name:file.name,size:file.size,sha256:fileHash},contentHash:await sha256(artifact)};
}

export async function readWorkbookFile(file) {
  const {workbook,bytes}=await loadWorkbookFile(file);
  if(workbook.worksheets.length>6||workbook.worksheets.some(s=>s.rowCount>200||s.columnCount>20))throw Error('6시트·시트당 200행·20열 이내의 학습용 파일을 사용해 주세요.');
  const book=cleanWorkbook({kind:'workbook',title:file.name,sheets:workbook.worksheets.map(s=>({name:s.name,rows:Array.from({length:s.rowCount},(_,r)=>Array.from({length:s.columnCount},(_,c)=>{
    const cell=s.getCell(r+1,c+1),value=cell.value;
    if(cell.formula)return '='+cell.formula;
    if(value==null)return '';
    if(typeof value==='string'||typeof value==='number')return value;
    if(value.richText)return value.richText.map(t=>t.text).join('');
    if(value.text)return String(value.text);
    throw Error('지원하지 않는 셀 형식입니다. 숫자·문자·일반 수식으로 저장해 주세요.');
  }))}))});
  const fileHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {workbook:book,file:{name:file.name,size:file.size,sha256:fileHash},contentHash:await sha256(book)};
}
