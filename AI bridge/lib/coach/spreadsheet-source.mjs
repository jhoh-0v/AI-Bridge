// Preserve actual Excel addresses without allocating millions of empty cells.
// Limits protect memory, not the user's choice of layout or worksheet count.
export const SOURCE_SHEET_LIMITS = { rows:1048576, columns:16384, cells:250000, characters:32*1024*1024, bytes:50*1024*1024 };
export function columnName(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
export function cellPosition(address){
  const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(address||'');
  if(!match)throw Error('자료의 셀 위치를 읽지 못했어요.');
  const column=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),row=Number(match[2]);
  if(row>SOURCE_SHEET_LIMITS.rows||column>SOURCE_SHEET_LIMITS.columns)throw Error('Excel에서 사용할 수 없는 셀 위치예요.');
  return {row,column};
}
const present=value=>value!==''&&value!=null;
export function spreadsheetCells(sheet){
  if(Array.isArray(sheet.cells))return sheet.cells;
  // Migrate persisted 0.14 workbooks and CSV input, retaining formula-only cells.
  const cells=new Map();
  for(const [r,row] of (sheet.rows||[]).entries())for(const [c,value] of row.entries())if(present(value))cells.set(columnName(c)+(r+1),{address:columnName(c)+(r+1),value});
  for(const f of sheet.formulas||[]){const cell=cells.get(f.cell)||{address:f.cell,value:''};cell.formula=f.formula;cells.set(f.cell,cell);}
  for(const f of sheet.formats||[])if(cells.has(f.cell))cells.get(f.cell).format=f.format;
  return [...cells.values()];
}
export function cleanSpreadsheetSource(value){
  if(!value||!Array.isArray(value.sheets)||!value.sheets.length)throw Error('내용이 있는 시트가 필요해요.');
  const names=new Set();let count=0;
  const sheets=value.sheets.map(sheet=>{
    if(typeof sheet.name!=='string'||!sheet.name||sheet.name.length>31||names.has(sheet.name)||/[\[\]*?:/\\]/.test(sheet.name))throw Error('자료의 시트 이름을 확인해 주세요.');
    names.add(sheet.name);const seen=new Set();let top=Infinity,left=Infinity,bottom=0,right=0;
    const include=(row,column)=>{top=Math.min(top,row);left=Math.min(left,column);bottom=Math.max(bottom,row);right=Math.max(right,column);};
    const cells=spreadsheetCells(sheet).map(cell=>{
      const p=cellPosition(cell.address),v=cell.value??'';
      if(seen.has(cell.address))throw Error('같은 셀 위치가 중복되어 있어요.');seen.add(cell.address);
      if(!(typeof v==='string'&&v.length<=32767||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'))throw Error('셀 값을 읽지 못했어요.');
      const result={address:cell.address,value:v};
      if(cell.formula!=null){if(typeof cell.formula!=='string'||cell.formula.length>32767)throw Error('셀 수식 정보를 읽지 못했어요.');result.formula=cell.formula;}
      if(cell.format!=null){if(typeof cell.format!=='string'||cell.format.length>1000)throw Error('셀 표시 형식을 읽지 못했어요.');result.format=cell.format;}
      if(present(v)||result.formula)include(p.row,p.column);
      if(++count>SOURCE_SHEET_LIMITS.cells)throw Error('파일의 실제 셀이 25만 개를 넘어요. 메모리 보호를 위해 이번 파일 읽기를 멈췄어요.');
      return result;
    }).sort((a,b)=>{const p=cellPosition(a.address),q=cellPosition(b.address);return p.row-q.row||p.column-q.column;});
    const merges=(sheet.merges||[]).map(range=>{
      if(typeof range!=='string'||range.split(':').length!==2)throw Error('병합 셀 위치를 확인하지 못했어요.');
      const [a,b]=range.split(':').map(cellPosition);
      if(a.row>b.row||a.column>b.column)throw Error('병합 셀 위치를 확인하지 못했어요.');
      if(seen.has(range.split(':')[0]))include(b.row,b.column);
      return range;
    });
    const range=bottom?`${columnName(left-1)}${top}:${columnName(right-1)}${bottom}`:null;
    return {name:sheet.name,state:['hidden','veryHidden'].includes(sheet.state)?sheet.state:'visible',range,cells,merges};
  });
  const headers=sheets.filter(s=>s.range).map(s=>`'${s.name.replaceAll("'","''")}'!${s.range}`);
  if(!headers.length)throw Error('파일에서 읽을 수 있는 셀 내용을 찾지 못했어요.');
  const charts=(value.charts||[]).map(c=>({part:String(c.part||'').slice(0,200),types:(c.types||[]).map(String),title:String(c.title||'').slice(0,2000),references:(c.references||[]).map(String)}));
  const source={kind:'spreadsheet',schemaVersion:2,title:String(value.title||'내 자료').slice(0,180),headers,rows:[],sheets,charts};
  if(JSON.stringify(source).length>SOURCE_SHEET_LIMITS.characters)throw Error('읽은 셀 내용이 32MB를 넘어요. 메모리 보호를 위해 이번 파일 읽기를 멈췄어요.');
  return source;
}
export function spreadsheetSearchText(source){return source.sheets.map(s=>s.name+' '+spreadsheetCells(s).filter(c=>typeof c.value==='string').map(c=>c.value).join(' ')).join(' ').slice(0,12000);}
export const sourceRowCount=source=>source.kind==='spreadsheet'?source.sheets.reduce((n,s)=>n+new Set(spreadsheetCells(s).map(c=>cellPosition(c.address).row)).size,0):source.rows.length;
export function spreadsheetSummary(source){return {sheets:source.sheets.length,cells:source.sheets.reduce((n,s)=>n+spreadsheetCells(s).length,0),formulas:source.sheets.reduce((n,s)=>n+spreadsheetCells(s).filter(c=>c.formula).length,0),charts:source.charts?.length||0};}
