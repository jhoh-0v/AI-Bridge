import { TASK_BY_ID, CATALOG_VERSION, sourceFor, freshDraft, validateProfile, validReview } from './learning.mjs';
import { MODEL_SETTINGS, sha256 } from './artifact-schema.mjs';
import { generateArtifact, ServiceError } from './openai.mjs';
import { handleCoach } from './coach/service.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const parse=row=>row?{...row,data:JSON.parse(row.data)}:null;
export function cleanDraft(value){
  const draft=freshDraft();
  for(const k of ['baselinePrompt','afterPrompt','challengePrompt','reflection'])draft[k]=String(value?.[k]||'').slice(0,12000);
  for(const k of Object.keys(draft.fields))draft.fields[k]=String(value?.fields?.[k]||'').slice(0,4000);
  for(const group of ['review','afterReview','challengeReview'])for(let i=0;i<3;i++)draft[group][i]={status:['pass','fix','unsure'].includes(value?.[group]?.[i]?.status)?value[group][i].status:'',evidence:String(value?.[group]?.[i]?.evidence||'').slice(0,3000)};
  draft.hintUsed=value?.hintUsed===true;return draft;
}
export async function handleBridge(request,{db,bucket,key,textModel=String(MODEL_SETTINGS.text),imageModel=String(MODEL_SETTINGS.image),user,dailyTextLimit=40,dailyImageLimit=8}){
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/bridge\/?/,'').split('/').filter(Boolean),method=request.method;
  try{
    if(method!=='GET'){
      const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)throw new ServiceError('요청 출처를 확인할 수 없습니다.',403);
      if(Number(request.headers.get('Content-Length')||0)>(path[0]==='coach'?500000:100000))throw new ServiceError('요청이 너무 큽니다.',413);
    }
    if(path[0]==='coach')return handleCoach(request,{db,user,key,textModel});
    if(path[0]==='bootstrap'&&method==='GET'){
      if(!user)return json({user:null,profile:null,attempts:[],aiReady:Boolean(key),local:false});
      if(!db)throw new ServiceError('회원 저장소 연결이 준비되지 않았습니다.',503);
      const p=parse(await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(user.userId).first());
      const rows=await db.prepare('SELECT id,task_id,step,completed,created_at,updated_at FROM attempts WHERE user_id = ? ORDER BY updated_at DESC').bind(user.userId).all();
      return json({user:{name:user.displayName,email:user.email},profile:p?.data||null,attempts:rows.results.map(a=>({id:a.id,taskId:a.task_id,step:a.step,completed:Boolean(a.completed),createdAt:a.created_at,updatedAt:a.updated_at})),aiReady:Boolean(key),local:user.userId==='local_seedy'});
    }
    if(!user)throw new ServiceError('회원가입 또는 로그인이 필요합니다.',401);
    if(!db)throw new ServiceError('회원 저장소 연결이 준비되지 않았습니다.',503);
    const uid=user.userId;
    async function owned(id){const row=parse(await db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').bind(id,uid).first());if(!row)throw new ServiceError('실습 기록을 찾을 수 없습니다.',404);return row;}
    async function runs(id){
      // A terminated worker cannot finish its catch handler. Release abandoned reservations,
      // without resending a paid request or presenting an unknown outcome as a result.
      const now=new Date().toISOString(),expired=new Date(Date.now()-10*60*1000).toISOString();
      await db.prepare("UPDATE generations SET status='failed',data=json_set(data,'$.error',?,'$.finishedAt',?) WHERE attempt_id=? AND user_id=? AND status='pending' AND created_at<?")
        .bind('생성 작업이 중단되어 결과를 확인하지 못했습니다. 자동으로 다시 요청하지 않았습니다. 다시 생성하면 추가 사용료가 발생할 수 있어요.',now,id,uid,expired).run();
      return(await db.prepare('SELECT * FROM generations WHERE attempt_id = ? AND user_id = ? ORDER BY created_at ASC,id ASC').bind(id,uid).all()).results.map(parse);
    }
    function present(a,g){return{id:a.id,taskId:a.task_id,step:a.step,revision:a.revision,completed:Boolean(a.completed),createdAt:a.created_at,updatedAt:a.updated_at,...a.data,generations:g.map(r=>({id:r.id,phase:r.phase,parentId:r.parent_id,status:r.status,createdAt:r.created_at,...r.data,artifact:r.data.artifact?.kind==='image'?{...r.data.artifact,url:`/api/bridge/images/${r.id}`} :r.data.artifact}))};}
    async function body(){const raw=await request.text();if(raw.length>100000)throw new ServiceError('요청이 너무 큽니다.',413);try{return JSON.parse(raw);}catch{throw new ServiceError('요청 형식을 확인해 주세요.');}}
    if(path[0]==='profile'&&method==='POST'){
      const input=await body();let profile;try{profile=validateProfile(input);}catch(e){throw new ServiceError(e.message,400);}const now=new Date().toISOString();
      await db.prepare('INSERT INTO profiles(user_id,data,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(uid,JSON.stringify(profile),now,now).run();
      return json({profile});
    }
    if(path[0]==='attempts'&&path.length===1&&method==='POST'){
      const input=await body();if(!TASK_BY_ID[input.taskId])throw new ServiceError('업무 분야를 선택해 주세요.');
      const profile=parse(await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(uid).first());if(!profile)throw new ServiceError('시작 진단을 먼저 완료해 주세요.',409);
      const id=crypto.randomUUID(),now=new Date().toISOString();
      const data={catalogVersion:CATALOG_VERSION,material:sourceFor(input.taskId),challenge:sourceFor(input.taskId,true),support:profile.data.diagnosis.level,draft:freshDraft()};
      await db.prepare('INSERT INTO attempts(id,user_id,task_id,data,step,revision,completed,created_at,updated_at) VALUES(?,?,?,?,0,0,0,?,?)').bind(id,uid,input.taskId,JSON.stringify(data),now,now).run();
      return json({attempt:present(await owned(id),[])},201);
    }
    if(path[0]==='attempts'&&path[1]&&method==='GET'){
      const a=await owned(path[1]);return json({attempt:present(a,await runs(a.id))});
    }
    if(path[0]==='attempts'&&path[1]&&method==='PATCH'){
      const a=await owned(path[1]),input=await body();if(a.completed)throw new ServiceError('완료한 기록은 수정할 수 없습니다. 새 실습을 시작해 주세요.',409);
      const g=(await runs(a.id)).filter(r=>r.status==='completed');
      const draft=cleanDraft(input.draft),step=input.step===undefined?a.step:Number(input.step);
      if(!Number.isInteger(step)||step<0||step>3)throw new ServiceError('올바르지 않은 단계입니다.');
      if(step>=1&&!g.some(r=>r.phase==='baseline'))throw new ServiceError('먼저 안내 없이 첫 결과를 만들어 주세요.');
      if(step>=2&&!validReview(draft.review,a.task_id))throw new ServiceError('세 가지 확인 항목의 판단과 근거를 남겨 주세요.');
      if(step>=3&&(!g.some(r=>r.phase==='after')||draft.reflection.trim().length<10))throw new ServiceError('수정 결과를 만들고 변화와 근거를 10자 이상 기록해 주세요.');
      if(step>=3&&!validReview(draft.afterReview,a.task_id))throw new ServiceError('수정한 결과도 세 가지 기준으로 확인해 주세요.');
      if(input.completed&&(!g.some(r=>r.phase==='independent')||!validReview(draft.challengeReview,a.task_id)))throw new ServiceError('독립 실습 결과와 세 가지 확인 근거가 필요합니다.');
      // Baseline prompt is immutable once generated. Its editable draft is never the audit record.
      if(g.some(r=>r.phase==='baseline'))draft.baselinePrompt=g.find(r=>r.phase==='baseline').data.prompt;
      draft.hintUsed=draft.hintUsed||a.data.draft.hintUsed;
      const data={...a.data,draft},now=new Date().toISOString();
      const result=await db.prepare('UPDATE attempts SET data=?,step=?,revision=revision+1,completed=?,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(JSON.stringify(data),step,input.completed?1:0,now,a.id,uid,input.revision).run();
      if(result.meta.changes!==1)throw new ServiceError('다른 창에서 기록이 바뀌었습니다. 현재 입력을 복사한 뒤 실습을 다시 열어 주세요.',409);
      return json({attempt:present(await owned(a.id),await runs(a.id))});
    }
    if(path[0]==='generate'&&method==='POST'){
      if(!key)throw new ServiceError('실시간 생성은 API 연결 후 사용할 수 있습니다. 연결 전에는 실제 생성 결과로 표시하지 않습니다.',503);
      const input=await body(),a=await owned(input.attemptId);
      if(a.completed)throw new ServiceError('완료한 실습입니다. 새 실습을 시작해 주세요.',409);
      const phase=input.phase;if(!['baseline','after','independent'].includes(phase))throw new ServiceError('생성 단계를 확인해 주세요.');
      const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
      if(prompt.length<5||prompt.length>12000)throw new ServiceError('요청을 5~12000자로 작성해 주세요.');
      if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(input.requestId))throw new ServiceError('요청 식별자가 필요합니다.');
      const existing=parse(await db.prepare('SELECT * FROM generations WHERE user_id=? AND request_id=?').bind(uid,input.requestId).first());
      if(existing){if(existing.attempt_id!==a.id)throw new ServiceError('중복 요청입니다.',409);return json({attempt:present(a,await runs(a.id))},existing.status==='pending'?202:200);}
      const all=await runs(a.id),completed=all.filter(r=>r.status==='completed'),baseline=completed.find(r=>r.phase==='baseline');
      if(phase==='baseline'&&baseline)throw new ServiceError('학습 전 첫 결과는 보존됩니다. 다시 시작하려면 새 실습을 만들어 주세요.',409);
      if(phase!=='baseline'&&!baseline)throw new ServiceError('학습 전 결과를 먼저 만들어 주세요.',409);
      if(phase==='after'&&!validReview(a.data.draft.review,a.task_id))throw new ServiceError('결과 확인 단계의 근거를 먼저 저장해 주세요.',409);
      if(phase==='independent'&&(a.step!==3||!completed.some(r=>r.phase==='after')))throw new ServiceError('수정 단계를 마친 뒤 독립 실습을 시작해 주세요.',409);
      if(phase==='independent'&&completed.some(r=>r.phase==='independent'))throw new ServiceError('독립 실습의 첫 시도는 이미 기록되어 있습니다.',409);
      const image=a.task_id==='image';if(image&&!bucket)throw new ServiceError('이미지 저장소 연결이 필요합니다.',503);
      const limit=Math.max(1,Math.min(100,Number(image?dailyImageLimit:dailyTextLimit)||8));
      const now=new Date().toISOString(),day=now.slice(0,10),id=crypto.randomUUID(),source=phase==='independent'?a.data.challenge:a.data.material;
      const previous=phase==='after'?(completed.filter(r=>r.phase==='after').at(-1)||baseline):null;
      const model=baseline?.data.receipt?.settings?.model||(image?imageModel:textModel);
      const startData={prompt,source,sourceHash:await sha256(source),catalogVersion:a.data.catalogVersion,model,error:null};
      // Atomic reservation: blocks simultaneous clicks/tabs and enforces a per-user daily limit.
      const reserve=await db.prepare(`INSERT INTO generations(id,user_id,attempt_id,request_id,phase,parent_id,status,data,created_at)
        SELECT ?,?,?,?,?,?,'pending',?,? WHERE NOT EXISTS(SELECT 1 FROM generations WHERE attempt_id=? AND status='pending')
        AND (?='after' OR NOT EXISTS(SELECT 1 FROM generations WHERE attempt_id=? AND phase=? AND status='completed'))
        AND (SELECT COUNT(*) FROM generations g JOIN attempts a ON a.id=g.attempt_id WHERE g.user_id=? AND g.created_at>=? AND g.status IN ('pending','completed') AND (a.task_id='image')=?) < ?`)
        .bind(id,uid,a.id,input.requestId,phase,previous?.id||null,JSON.stringify(startData),now,a.id,phase,a.id,phase,uid,day,image?1:0,limit).run();
      if(reserve.meta.changes!==1)throw new ServiceError('생성이 이미 진행 중이거나 오늘의 생성 한도에 도달했습니다. 잠시 후 기록을 다시 열어 주세요.',429);
      try{
        const result=await generateArtifact({taskId:a.task_id,source,prompt,model,previous:previous?.data,bucket,key});
        if(result.imageBytes){const objectKey=`${uid}/${a.id}/${id}.png`;await bucket.put(objectKey,result.imageBytes,{httpMetadata:{contentType:'image/png'}});result.artifact.objectKey=objectKey;result.artifact.byteLength=result.imageBytes.byteLength;result.artifact.imageHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',result.imageBytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
        const record={...startData,artifact:result.artifact,receipt:result.receipt,outputHash:await sha256(result.artifact),previousHash:previous?.data.outputHash||null,finishedAt:new Date().toISOString()};
        await db.prepare("UPDATE generations SET status='completed',data=? WHERE id=? AND user_id=?").bind(JSON.stringify(record),id,uid).run();
        if(phase==='after')await db.prepare("UPDATE attempts SET data=json_set(data,'$.draft.afterReview',json('{}'),'$.draft.reflection',''),step=2,revision=revision+1,updated_at=? WHERE id=? AND user_id=?").bind(record.finishedAt,a.id,uid).run();
        else await db.prepare('UPDATE attempts SET updated_at=? WHERE id=? AND user_id=?').bind(record.finishedAt,a.id,uid).run();
      }catch(error){await db.prepare("UPDATE generations SET status='failed',data=? WHERE id=? AND user_id=?").bind(JSON.stringify({...startData,error:error instanceof ServiceError?error.message:'결과를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'}),id,uid).run();throw error;}
      return json({attempt:present(await owned(a.id),await runs(a.id))});
    }
    if(path[0]==='images'&&path[1]&&method==='GET'){
      const g=parse(await db.prepare("SELECT * FROM generations WHERE id=? AND user_id=? AND status='completed'").bind(path[1],uid).first());
      if(!g?.data.artifact?.objectKey||!bucket)throw new ServiceError('이미지를 찾을 수 없습니다.',404);
      const object=await bucket.get(g.data.artifact.objectKey);if(!object)throw new ServiceError('이미지를 찾을 수 없습니다.',404);
      return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff',...(url.searchParams.has('download')?{'Content-Disposition':`attachment; filename="AI-Bridge-${g.phase}.png"`}:{})}});
    }
    throw new ServiceError('요청한 기능을 찾을 수 없습니다.',404);
  }catch(error){return json({error:error instanceof ServiceError||error?.message?.startsWith('사용')||error?.message?.startsWith('진단')||error?.message?.startsWith('관심')?error.message:'요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},error.status||500);}
}
