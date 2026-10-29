import { createSession, updateDraft, submitEvidence, advance, useHelp, outcome, validateSession } from './session.mjs';

export const WEB_STORAGE_KEY='aibridge-web-practice-v1';
const empty=()=>({version:1,session:null,history:[]});
export function readWebState(storage){
  let raw;try{raw=storage.getItem(WEB_STORAGE_KEY);}catch{throw Error('기록 저장소에 접근하지 못했어요. 입력한 내용을 복사해 보관해 주세요.');}
  if(!raw)return empty();
  try{
    const state=JSON.parse(raw);
    if(state.version!==1||!Array.isArray(state.history))throw Error();
    return {version:1,session:state.session?validateSession(state.session):null,history:state.history.map(validateSession)};
  }catch{throw Error('저장된 실습 기록을 읽지 못했어요. 기존 기록은 덮어쓰지 않았습니다.');}
}
export function localRecords(storage){
  const state=readWebState(storage);
  return [...state.history,...(state.session?[state.session]:[])].filter(s=>s.completedAt).reverse().map(session=>({id:session.id,createdAt:session.completedAt,session,outcome:outcome(session),local:true}));
}
function save(storage,state){
  if(state.session&&JSON.stringify(state.session).length>500000)throw Error('이 실습의 기록이 너무 커요. 자료와 결과를 더 작은 파일로 준비해 주세요. 이전 기록은 보존했어요.');
  try{storage.setItem(WEB_STORAGE_KEY,JSON.stringify(state));}catch{throw Error('이 기기에 기록을 저장하지 못했어요. 입력을 복사하거나 기록 파일로 보관해 주세요.');}
  return state;
}
export function createWebDispatcher(storage,locks){
  let queue=Promise.resolve();
  async function act(message){
    const state=readWebState(storage);
    if(message.type==='GET')return state;
    if(message.type==='START'){
      if(state.session&&!state.session.completedAt)return state;
      if(state.session)state.history.push(state.session);
      state.session=createSession(message.level||'starter');return save(storage,state);
    }
    if(message.type==='NEW'){
      if(state.session)state.history.push(state.session);
      state.session=createSession(message.level||'starter');return save(storage,state);
    }
    if(message.type==='EXPORT'){
      const session=state.session?.completedAt?state.session:[...state.history].reverse().find(s=>s.completedAt);
      if(!session)throw Error('아직 완료한 실습이 없어요.');return {session,outcome:outcome(session)};
    }
    if(!state.session)throw Error('먼저 실습을 시작해 주세요.');
    if(message.revision!==state.session.revision)throw Error('다른 창에서 실습이 바뀌었어요. 현재 입력을 복사한 뒤 새로고침해 주세요.');
    const original={id:state.session.id,revision:state.session.revision};
    if(message.type==='PATCH')state.session=updateDraft(state.session,message.patch||{});
    else if(message.type==='SUBMIT')state.session=await submitEvidence(state.session,message.upload);
    else if(message.type==='NEXT')state.session=advance(state.session);
    else if(message.type==='HELP')state.session=useHelp(state.session,message.kind||'guide');
    else throw Error('지원하지 않는 작업입니다.');
    const latest=readWebState(storage).session;
    if(latest?.id!==original.id||latest.revision!==original.revision)throw Error('다른 창에서 실습이 바뀌었어요. 입력을 복사한 뒤 새로고침해 주세요.');
    return save(storage,state);
  }
  return message=>{
    const work=queue.catch(()=>{}).then(()=>locks?locks.request(WEB_STORAGE_KEY,()=>act(message)):act(message));queue=work;return work;
  };
}
