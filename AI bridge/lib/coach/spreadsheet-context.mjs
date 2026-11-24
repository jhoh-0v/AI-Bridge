import { spreadsheetCells, spreadsheetSummary } from './spreadsheet-source.mjs';

// Read the complete file locally. For large workbooks, send a disclosed selection
// to the model instead of rejecting the file or claiming all cells were reviewed.
export function spreadsheetContext(source,{maxCharacters=120000,query=''}={}){
  if(source?.kind!=='spreadsheet')return source;
  // Budget the compact payload actually sent to AI, not the verbose local copy.
  // Repeated number formats must not cause otherwise-small files to be sampled.
  const packed=encodeSpreadsheetContext(source);
  if(JSON.stringify(packed).length<=maxCharacters)return source;
  const tokens=String(query).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[];
  const candidates=source.sheets.flatMap((s,si)=>{
    const rows=new Map();
    spreadsheetCells(s).forEach((cell,i)=>{
      const row=cell.address.match(/\d+$/)[0];
      if(!rows.has(row))rows.set(row,{si,i,cells:[],size:0,score:0});
      const group=rows.get(row);group.cells.push(cell);group.size+=JSON.stringify(packed.sheets[si].cells[i]).length+1;
      group.score=Math.max(group.score,(i<30?3:0)+tokens.reduce((n,t)=>n+(String(cell.value).toLowerCase().includes(t)?4:0),0));
    });
    return [...rows.values()];
  });
  // A distributed sample preserves later periods even when no labels match.
  for(let i=0;i<candidates.length;i+=Math.max(1,Math.floor(candidates.length/300)))candidates[i].score+=2;
  candidates.sort((a,b)=>b.score-a.score||a.i-b.i||a.si-b.si);
  const sheets=source.sheets.map(s=>({...s,cells:[],rows:undefined,formulas:undefined,formats:undefined}));
  let used=JSON.stringify({...packed,sheets:packed.sheets.map(s=>({...s,cells:[]}))}).length,included=0;
  for(const {si,cells,size} of candidates){if(used+size>maxCharacters)continue;sheets[si].cells.push(...cells);used+=size;included+=cells.length;}
  for(const sheet of sheets)sheet.cells.sort((a,b)=>Number(a.address.match(/\d+$/)[0])-Number(b.address.match(/\d+$/)[0])||a.address.localeCompare(b.address));
  const summary=spreadsheetSummary(source);
  return {...source,sheets,coverage:{complete:false,includedCells:included,totalCells:summary.cells,summary,note:'파일 전체는 로컬에 보관했으며 AI 입력은 제목·관련 항목·분산 표본 행입니다. 포함되지 않은 셀을 파일의 빈칸·누락·계산값 부재로 판단하지 마세요.'}};
}

// Each evidence quote is assembled from the actual cell address and value.
// The model only selects a stable ID; it cannot invent a quotation or cell index.
export function spreadsheetEvidence(source,ref,label,{includeCells=false}={}){
  const entries=[];
  source.sheets.forEach((sheet,si)=>{
    let row=null,group=[],part=0;
    const flush=()=>{if(!group.length)return;const addresses=group.map(c=>c.address);entries.push({id:`${ref}:s${si}:r${row}:p${part++}`,ref,label:label+' · '+sheet.name+'!'+addresses[0]+(addresses.length>1?':'+addresses.at(-1):''),locations:addresses.map(a=>`${sheet.name}!${a}`),quote:group.map(c=>c.address+' = '+JSON.stringify(c.value)+(c.formula?' [수식: ='+c.formula+'; 값은 저장된 계산값]':'')+(c.format?' [표시 형식: '+c.format+']':'')).join(' | '),...(includeCells?{sheet:sheet.name,cells:group}: {})});group=[];};
    for(const cell of spreadsheetCells(sheet)){const next=cell.address.match(/\d+$/)[0];if(next!==row||group.length>=8){flush();row=next;}group.push(cell);}flush();
  });
  (source.charts||[]).forEach((chart,i)=>entries.push({id:`${ref}:chart${i}`,ref,label:label+' · 차트 '+(i+1),locations:chart.references,quote:JSON.stringify(chart)}));
  return entries;
}

// Lossless transport only: original cells and human-readable evidence stay local.
// Repeated format strings and explanatory prose are sent once, not for every cell.
function cellEncoder(){
  const formats=[],indices=new Map();
  const encode=cell=>{
    const tuple=[cell.address,cell.value];
    if(cell.formula||cell.format)tuple.push(cell.formula||null);
    if(cell.format){if(!indices.has(cell.format)){indices.set(cell.format,formats.length);formats.push(cell.format);}tuple.push(indices.get(cell.format));}
    return tuple;
  };
  return {encode,formats};
}
export const CELL_ENCODING='cells: [address, value, formula?, formatIndex?]. formula is not executed; value is the saved result. formatIndex refers to formats. Missing addresses are not zero; when coverage is partial their values are unknown.';

export function compactSpreadsheetContext(source,options){
  const view=spreadsheetContext(source,options);
  return encodeSpreadsheetContext(view);
}
function encodeSpreadsheetContext(view){
  if(view?.kind!=='spreadsheet')return view;
  const {encode,formats}=cellEncoder();
  const sheets=view.sheets.map(sheet=>({name:sheet.name,state:sheet.state,range:sheet.range,merges:sheet.merges||[],cells:spreadsheetCells(sheet).map(encode)}));
  return {kind:view.kind,title:view.title,headers:view.headers,encoding:CELL_ENCODING,formats,sheets,charts:view.charts||[],coverage:view.coverage||{complete:true,includedCells:spreadsheetSummary(view).cells,totalCells:spreadsheetSummary(view).cells}};
}

export function compactEvidenceCatalog(catalog){
  const {encode,formats}=cellEncoder();
  const entries=catalog.map((entry,index)=>entry.cells?{id:'e'+index,ref:entry.ref,sheet:entry.sheet,cells:entry.cells.map(encode)}:{id:'e'+index,ref:entry.ref,quote:entry.quote});
  const resolve=id=>{
    const entry=entries.find(e=>e.id===id);
    if(!entry)return null;
    const {cells,sheet,...original}=catalog[entries.indexOf(entry)];
    return original;
  };
  return {entries,formats,encoding:CELL_ENCODING,resolve};
}
