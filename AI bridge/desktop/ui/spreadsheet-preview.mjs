import { columnName, cellPosition, spreadsheetCells } from '../../lib/coach/spreadsheet-source.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function spreadsheetPreview(source,index=0,{compact=false}={}){
  const sheet=source.sheets[index]||source.sheets[0],cells=spreadsheetCells(sheet),byAddress=new Map(cells.map(c=>[c.address,c]));
  const positions=cells.map(c=>cellPosition(c.address));
  const bounds=[...positions,...(sheet.merges||[]).map(r=>cellPosition(r.split(':')[1]))];
  const maxRow=bounds.reduce((n,p)=>Math.max(n,p.row),1),maxCol=bounds.reduce((n,p)=>Math.max(n,p.column),1);
  // Bound only the preview DOM. Full contents, including far-away cells, stay stored.
  const rowNumbers=(maxRow<=80?Array.from({length:maxRow},(_,i)=>i+1):[...new Set(positions.map(p=>p.row))].sort((a,b)=>a-b).slice(0,80)).slice(0,compact?6:80);
  const colNumbers=maxCol<=40?Array.from({length:maxCol},(_,i)=>i+1):[...new Set(positions.map(p=>p.column))].sort((a,b)=>a-b).slice(0,40);
  const merged=new Map(),covered=new Set();
  for(const range of sheet.merges||[]){
    const [start,end]=range.split(':'),a=cellPosition(start),b=cellPosition(end);
    const rows=rowNumbers.filter(r=>r>=a.row&&r<=b.row),cols=colNumbers.filter(c=>c>=a.column&&c<=b.column);
    if(!rows.includes(a.row)||!cols.includes(a.column))continue;
    merged.set(start,{rows:rows.length,cols:cols.length});
    for(const r of rows)for(const c of cols)if(r!==a.row||c!==a.column)covered.add(columnName(c-1)+r);
  }
  const selector=source.sheets.length>1&&!compact?'<label class="sheet-select">시트 <select name="sourceSheet" aria-label="미리볼 시트">'+source.sheets.map((s,i)=>'<option value="'+i+'" '+(s===sheet?'selected':'')+'>'+esc(s.name)+(s.state!=='visible'?' (숨김 시트)':'')+'</option>').join('')+'</select></label>':'<strong>'+esc(sheet.name)+'</strong>';
  const rows=rowNumbers.map(r=>'<tr><th scope="row" class="row-number">'+r+'</th>'+colNumbers.map(c=>{
    const address=columnName(c-1)+r;if(covered.has(address))return '';
    const merge=merged.get(address),cell=byAddress.get(address),formula=cell?.formula,value=cell?.value??'';
    const display=formula&&value===''?'계산값 없음':String(value);
    return '<td'+(merge?' rowspan="'+merge.rows+'" colspan="'+merge.cols+'"':'')+(formula?' class="formula-cell" title="'+esc('수식: ='+formula+' · 저장된 계산값')+'"':'')+'>'+esc(display)+(formula?'<span class="formula-mark" aria-label="수식 셀"> ƒ</span>':'')+'</td>';
  }).join('')+'</tr>').join('');
  return '<div class="workbook-preview-heading">'+selector+'<span>'+source.sheets.length+'개 시트 · 원본 셀 위치로 표시</span></div><div class="data-preview workbook-preview" tabindex="0" role="region" aria-label="'+esc(sheet.name)+' 시트 미리보기"><table><thead><tr><th scope="col">행</th>'+colNumbers.map(c=>'<th scope="col">'+columnName(c-1)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div><p class="preview-caption">제목·빈칸을 바꾸지 않고 읽었어요.'+(maxRow>80||maxCol>40?' 미리보기는 최대 80개 행·40개 열을 표시하며 나머지 셀도 보관해요.':'')+' 큰 자료는 AI가 참고한 범위를 피드백에서 알려드려요.'+(cells.some(c=>c.formula)?' ƒ 표시는 수식의 저장된 계산값이며, 파일을 다시 계산한 결과는 아니에요.':'')+'</p>';
}
