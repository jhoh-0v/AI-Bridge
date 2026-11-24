// Hidden, isolated file reader. All learner interaction happens on the real ChatGPT view.
import { readWorkbookFile, readSpreadsheetArtifactFile } from '../../lib/coach/read-xlsx.mjs';
import { needsResultRead } from '../result-reader.mjs';
const bridge=window.aiBridge;
let state=null,parsing=false;
const failed=new Set(),processing=new Set();
async function consume(){
  if(parsing||!state?.flow)return;
  if(![0,1,2,3,4].includes(state.session?.phase))return;
  const adaptive=state.session.exercise?.dialogueLearning;
  const turn=state.flow.turns.filter(t=>t.phase===state.session.phase).at(-1);
  const format=state.session.exercise?.curriculum?.format||'xlsx';
  const expected={xlsx:/\.xlsx$/i,pptx:/\.pptx$/i,image:/\.(png|jpe?g|webp)$/i,text:/\.(docx|txt)$/i}[format];
  const attempt=state.flow.resultReadAttempt||0;
  const file=state.downloads.find(d=>needsResultRead(d,state.flow,{adaptive,expected,turnId:turn?.id})&&!failed.has(d.id+':'+attempt)&&!processing.has(d.id));
  if(!file)return;
  parsing=true;processing.add(file.id);
  try{
    if(adaptive)state=await bridge.dispatch({type:'REPORT_RESULT_READING',downloadId:file.id});
    const raw=await bridge.dispatch({type:'USE_DOWNLOAD',id:file.id});
    const upload=raw.upload||await (adaptive?readSpreadsheetArtifactFile:readWorkbookFile)(new File([Uint8Array.from(atob(raw.bytes),c=>c.charCodeAt(0))],raw.name));
    state=await bridge.dispatch({type:adaptive?'INGEST_RESULT':'ATTACH_RESULT',downloadId:file.id,upload});
  }catch(error){
    failed.add(file.id+':'+attempt);
    await bridge.dispatch({type:'REPORT_RESULT_ERROR',downloadId:file.id,error:error.message}).catch(()=>{});
  }finally{parsing=false;processing.delete(file.id);void consume();}
}
function apply(next){state=next;void consume();}
bridge.onPractice(apply);
bridge.onFlush(async()=>{const start=Date.now();while(parsing){if(Date.now()-start>2400)throw Error('파일 확인 중');await new Promise(resolve=>setTimeout(resolve,30));}});
void bridge.dispatch({type:'PRACTICE'}).then(apply);
