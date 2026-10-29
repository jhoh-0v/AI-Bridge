import { validateSession, outcome } from './session.mjs';
import { retrieve } from './retrieval.mjs';
import { explainWithRag } from './rag.mjs';
import { sha256 } from '../artifact-schema.mjs';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleCoach(request,{db,user,key,textModel}) {
  const path=new URL(request.url).pathname.split('/').filter(Boolean).slice(3),method=request.method;
  async function body(max=500000){const raw=await request.text();if(raw.length>max)throw Error('요청이 너무 큽니다.');try{return JSON.parse(raw);}catch{throw Error('요청 형식을 확인해 주세요.');}}
  try{
    if(path[0]==='rag'&&method==='POST'){
      const input=await body(3000),question=String(input.question||'').trim();
      if(question.length<2||question.length>500)return json({error:'질문을 2~500자로 작성해 주세요.'},400);
      const retrieval=retrieve(question);let authorizedKey;
      if(input.generate===true&&key&&retrieval.sources.length){
        if(!user||!db)return json({error:'AI 설명은 로그인 후 사용할 수 있어요. 자료 검색은 로그인 없이 사용할 수 있습니다.'},401);
        const id=`${user.userId}:${new Date().toISOString().slice(0,10)}`;
        const reserve=await db.prepare('INSERT INTO coach_rag_usage(id,calls) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET calls=calls+1 WHERE calls<20').bind(id).run();
        if(reserve.meta.changes!==1)return json({error:'오늘의 AI 설명 20회를 사용했어요. 자료 검색은 계속 이용할 수 있습니다.'},429);
        authorizedKey=key;
      }
      const result=await explainWithRag({question,level:['starter','growing','independent'].includes(input.level)?input.level:'starter',key:authorizedKey,model:textModel});
      return json({...result,aiReady:Boolean(key)});
    }
    if(!user)return json({error:'계정에 학습 기록을 저장하려면 로그인해 주세요.'},401);
    if(!db)return json({error:'학습 저장소를 준비하고 있어요.'},503);
    if(path[0]==='records'&&method==='GET'){
      const records=await db.prepare('SELECT record_id,data,created_at FROM coach_records WHERE user_id=? ORDER BY created_at DESC').bind(user.userId).all();
      return json({records:records.results.map(r=>{const session=JSON.parse(r.data);return {id:r.record_id,createdAt:r.created_at,session,outcome:outcome(session)};})});
    }
    if(path[0]==='records'&&method==='POST'){
      const input=await body(),session=validateSession(input.session||input);
      if(!session.completedAt)return json({error:'완료한 실습을 계정에 보관할 수 있어요. 진행 중인 실습은 확장 프로그램에 자동 저장됩니다.'},400);
      const data=JSON.stringify(session),hash=await sha256(data);
      const existing=await db.prepare('SELECT data,content_hash FROM coach_records WHERE user_id=? AND record_id=?').bind(user.userId,session.id).first();
      if(existing){if(existing.content_hash!==hash)return json({error:'같은 실습 ID의 다른 기록으로 덮어쓸 수 없습니다.'},409);return json({session:JSON.parse(existing.data),outcome:outcome(session),alreadySaved:true});}
      const now=new Date().toISOString();
      await db.prepare('INSERT INTO coach_records(id,user_id,record_id,data,content_hash,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),user.userId,session.id,data,hash,now).run();
      return json({session,outcome:outcome(session),savedAt:now},201);
    }
    return json({error:'요청한 학습 기능을 찾을 수 없습니다.'},404);
  }catch(error){return json({error:error instanceof Error?error.message:'기록을 처리하지 못했어요.'},400);}
}
