import { cleanWorkbook } from './workbook-check.mjs';
import { sha256 } from '../artifact-schema.mjs';

export async function readWorkbookFile(file) {
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > 3*1024*1024) throw Error('3MB 이하의 XLSX 파일을 선택해 주세요.');
  const bytes=await file.arrayBuffer();
  const {default:JSZip}=await import('jszip');
  const zip=await JSZip.loadAsync(bytes);
  const entries=Object.values(zip.files);
  if(entries.length>300||entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>20*1024*1024)throw Error('학습용 파일보다 구조가 큽니다. 필요한 표만 새 XLSX로 저장해 주세요.');
  if(entries.some(e=>/vbaProject|externalLinks/i.test(e.name)))throw Error('매크로나 외부 문서 연결이 없는 XLSX로 제출해 주세요.');
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
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
