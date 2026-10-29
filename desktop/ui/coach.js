// Hidden, isolated file reader. All learner interaction happens on the real ChatGPT view.
import { readWorkbookFile } from '../../lib/coach/read-xlsx.mjs';
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
  const file=state.downloads.find(d=>d.status==='completed'&&(adaptive?state.flow.turns.some(t=>t.id===d.scope?.turnId):expected.test(d.name)&&d.scope?.turnId===turn?.id)&&!state.flow.artifacts?.[d.id]&&(adaptive||!state.flow.linked.some(l=>l.downloadId===d.id))&&!failed.has(d.id)&&!processing.has(d.id));
  if(!file)return;
  parsing=true;processing.add(file.id);
  try{
    const raw=await bridge.dispatch({type:'USE_DOWNLOAD',id:file.id});
    const upload=raw.upload||await readWorkbookFile(new File([Uint8Array.from(atob(raw.bytes),c=>c.charCodeAt(0))],raw.name));
    state=await bridge.dispatch({type:adaptive?'INGEST_RESULT':'ATTACH_RESULT',downloadId:file.id,upload});
  }catch(error){
    failed.add(file.id);
    await bridge.dispatch({type:'REPORT_RESULT_ERROR',downloadId:file.id,error:error.message}).catch(()=>{});
  }finally{parsing=false;processing.delete(file.id);void consume();}
}
function apply(next){state=next;void consume();}
bridge.onPractice(apply);
bridge.onFlush(async()=>{const start=Date.now();while(parsing){if(Date.now()-start>2400)throw Error('파일 확인 중');await new Promise(resolve=>setTimeout(resolve,30));}});
void bridge.dispatch({type:'PRACTICE'}).then(apply);
