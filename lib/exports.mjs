import { calculator, colName } from './workbook.mjs';
export const THEME = {paper:'F9F8F4',ink:'243A35',accent:'E56F51',muted:'61736B',sage:'DFE8DA'};
export async function presentationBuffer(artifact,outputType='arraybuffer') {
  const {default:PptxGenJS}=await import('pptxgenjs');
  const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='AI Bridge';pptx.subject='실제 생성한 학습 결과';pptx.title=artifact.title;pptx.company='AI Bridge';pptx.lang='ko-KR';
  pptx.theme={headFontFace:'맑은 고딕',bodyFontFace:'맑은 고딕',lang:'ko-KR'};
  artifact.slides.forEach((item,i)=>{
    const slide=pptx.addSlide();slide.background={color:THEME.paper};
    slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.18,h:7.5,line:{color:THEME.accent},fill:{color:THEME.accent}});
    slide.addText(item.kicker||'AI BRIDGE',{x:0.8,y:0.55,w:10.9,h:0.35,fontSize:12,bold:true,color:THEME.muted,margin:0,breakLine:false});
    slide.addText(item.title,{x:0.8,y:1.15,w:11.7,h:1.35,fontSize:30,bold:true,color:THEME.ink,margin:0,fit:'shrink',valign:'mid'});
    const hasHighlight=Boolean(item.highlight?.trim()),width=hasHighlight?8.1:11.4;
    item.bullets.forEach((bullet,k)=>slide.addText('• '+bullet,{x:0.9,y:2.85+k*0.73,w:width,h:0.64,fontSize:19,color:THEME.ink,margin:0,fit:'shrink',valign:'mid'}));
    if(hasHighlight){slide.addShape(pptx.ShapeType.roundRect,{x:9.65,y:2.9,w:2.7,h:2.7,radius:0.2,line:{color:THEME.sage},fill:{color:THEME.sage}});slide.addText(item.highlight,{x:9.9,y:3.45,w:2.2,h:1.6,fontSize:28,bold:true,color:THEME.ink,align:'center',margin:0,fit:'shrink'});}
    slide.addText(artifact.title,{x:0.8,y:6.9,w:10.5,h:0.25,fontSize:9,color:THEME.muted,margin:0});
    slide.addText(String(i+1).padStart(2,'0'),{x:11.7,y:6.85,w:0.7,h:0.3,fontSize:12,color:THEME.muted,align:'right',margin:0});
    slide.addNotes(item.notes||'');
  });
  return pptx.write({outputType,compression:true});
}
export async function workbookBuffer(artifact){
  const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='AI Bridge';book.title=artifact.title;book.created=new Date();book.calcProperties.fullCalcOnLoad=true;
  const calc=calculator(artifact);
  artifact.sheets.forEach(s=>{
    const sheet=book.addWorksheet(s.name,{views:[{state:'frozen',ySplit:1}],properties:{defaultRowHeight:24}});
    s.rows.forEach((row,r)=>row.forEach((raw,c)=>{
      const cell=sheet.getCell(r+1,c+1);
      if(typeof raw==='string'&&raw.startsWith('=')){
        const result=calc.safe(s.name,r,c);cell.value={formula:raw.slice(1),result:result.error?{error:'#VALUE!'}:result.value};
        cell.font={name:'맑은 고딕',size:11,color:{argb:'FF294D40'}};
        cell.note='AI가 만든 수식입니다. 원자료와 범위를 직접 확인하세요.';
      }else{cell.value=raw;cell.font={name:'맑은 고딕',size:11,color:{argb:typeof raw==='number'?'FF1D4ED8':'FF243A35'}};}
      cell.alignment={vertical:'middle',wrapText:true};
      if(typeof raw==='number'||typeof raw==='string'&&raw.startsWith('='))cell.numFmt='#,##0.##';
      if(r===0){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF294D40'}};cell.font={name:'맑은 고딕',size:11,bold:true,color:{argb:'FFFFFFFF'}};}
      else if(r%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F4ED'}};
    }));
    const cols=Math.max(...s.rows.map(r=>r.length),1);for(let i=1;i<=cols;i++)sheet.getColumn(i).width=i===1?22:19;
    if(s.rows.length>1)sheet.autoFilter={from:'A1',to:colName(cols-1)+'1'};
    sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
  });
  return book.xlsx.writeBuffer();
}
export function saveBlob(name,data,mime){const blob=data instanceof Blob?data:new Blob([data],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function downloadArtifact(generation){
  const a=generation.artifact,suffix=generation.phase==='baseline'?'학습전':generation.phase==='after'?'학습후':'독립실습',name=`AI_Bridge_${suffix}_${a.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)}`;
  if(a.kind==='presentation')saveBlob(name+'.pptx',await presentationBuffer(a),'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  else if(a.kind==='workbook')saveBlob(name+'.xlsx',await workbookBuffer(a),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  else if(a.kind==='image'){const response=await fetch(a.url);if(!response.ok)throw Error('이미지를 내려받지 못했습니다. 다시 로그인해 주세요.');saveBlob(name+'.png',await response.blob(),'image/png');}
  else saveBlob(name+'.txt','\ufeff'+a.title+'\n\n'+a.sections.map(s=>s.heading+'\n'+s.body).join('\n\n'),'text/plain;charset=utf-8');
}
export function evidencePackage(attempt){
  return {format:'AI-Bridge-evidence-v1',exportedAt:new Date().toISOString(),notice:'동일 사용자의 실제 요청과 생성 기록입니다. 개인 내 변화 기록이며 서비스의 인과 효과를 단독으로 증명하지 않습니다. 실패와 재시도를 포함합니다. 이미지 파일은 별도로 내려받으세요.',attempt};
}
