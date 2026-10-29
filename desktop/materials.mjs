import { createHash } from 'node:crypto';
import { readWorkbookFile } from '../lib/coach/read-xlsx.mjs';
import { parseCsv, salesSource, sampleSource, tableSource, textSource, sourceForProgram } from '../lib/coach/source.mjs';
import { sampleDefinition, csvForSource } from '../lib/coach/samples.mjs';
import { programMaterial } from '../lib/coach/programs.mjs';
import { materialFor } from '../lib/coach/lesson.mjs';

export const fileDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function programFile(taskId,phase=0){
  const m=programMaterial(taskId,phase),source=sourceForProgram(taskId,phase),content=taskId==='excel'?m.csv:m.text;
  const bytes=Buffer.from('\uFEFF'+content+'\r\n','utf8');
  return {bytes,source,taskId,file:{name:`AI-Bridge_${m.title.replace(/[^가-힣a-zA-Z0-9_-]/g,'_')}${phase===3?'_독립실습':''}.${taskId==='excel'?'csv':'txt'}`,size:bytes.length,sha256:fileDigest(bytes)}};
}
export async function officeText(bytes,kind){
  const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(bytes),entries=Object.values(zip.files);
  if(entries.length>800||entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>25*1024*1024||entries.some(e=>/vbaProject|externalLinks/i.test(e.name)))throw Error('문서가 너무 크거나 외부 연결이 있어요. 필요한 부분만 별도 파일로 준비해 주세요.');
  const files=entries.filter(e=>kind==='docx'?e.name==='word/document.xml':/^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  const decode=s=>s.replace(/&#x([a-f0-9]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
  let text='';
  for(const file of files){const xml=await file.async('string');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('일반 Office 문서로 저장한 파일을 사용해 주세요.');const tokens=xml.matchAll(/<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>|<\/(?:w|a):p>|<(?:w|a):(tab|br)\s*\/>/g);for(const token of tokens)text+=token[1]!==undefined?decode(token[1]):token[2]==='tab'?'\t':'\n';text+='\n';if(text.length>60000)throw Error('문서가 길어요. 60,000자 이내의 부분으로 연습해 주세요.');}
  return {text:text.trim(),slideCount:files.filter(f=>/^ppt\/slides\//.test(f.name)).length};
}
export function sampleMaterial(phase=0,sampleId=null) {
  if(sampleId){
    const sample=sampleDefinition(sampleId,phase),source=tableSource([sample.headers,...sample.rows]);
    const bytes=Buffer.from('\uFEFF'+csvForSource(source)+'\r\n','utf8');
    return {bytes,source,sampleId,file:{name:`AI-Bridge_${sample.title.replaceAll(' ','_')}${phase===3?'_독립실습':''}.csv`,size:bytes.length,sha256:fileDigest(bytes)}};
  }
  const bytes=Buffer.from('\uFEFF'+materialFor(phase).csv+'\r\n','utf8');
  return {bytes,source:sampleSource(phase),file:{name:phase===3?'AI-Bridge_독립실습.csv':'AI-Bridge_판매자료.csv',size:bytes.length,sha256:fileDigest(bytes)}};
}
export async function ownMaterial(name,bytes,{general=false}={}) {
  if(general&&/\.(txt|md|docx|pptx)$/i.test(name)){
    if(bytes.length>3*1024*1024)throw Error('3MB 이하의 파일을 선택해 주세요.');
    let text;
    if(/\.(docx|pptx)$/i.test(name))text=(await officeText(bytes,name.split('.').at(-1).toLowerCase())).text;
    else {try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('텍스트 파일은 UTF-8로 저장해 주세요.');}}
    return {source:textSource(text,name),file:{name,size:bytes.length,sha256:fileDigest(bytes)}};
  }
  if(!/\.(csv|xlsx)$/i.test(name)||bytes.length>3*1024*1024)throw Error('3MB 이하의 CSV 또는 XLSX 자료를 선택해 주세요.');
  let rows;
  if(/\.csv$/i.test(name)){
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('CSV UTF-8 형식으로 저장한 파일을 선택해 주세요.');}
    rows=parseCsv(text);
  }else{
    const parsed=await readWorkbookFile(new File([bytes],name));
    if(parsed.workbook.sheets.length!==1)throw Error('연습할 표 한 시트만 새 파일로 저장해 주세요.');
    rows=parsed.workbook.sheets[0].rows;
  }
  return {source:(general?tableSource:salesSource)(rows),file:{name,size:bytes.length,sha256:fileDigest(bytes)}};
}
