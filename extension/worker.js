import { createSession, updateDraft, submitEvidence, advance, useHelp, outcome } from '../lib/coach/session.mjs';
import { COACH_VERSION, SITE_ORIGIN, LEVELS } from '../lib/coach/lesson.mjs';
const KEY='aibridge-coach-v1';
let queue=Promise.resolve();
const isChat=url=>{try{return new URL(url).origin==='https://chatgpt.com';}catch{return false;}};
const isSite=url=>{try{return new URL(url).origin===SITE_ORIGIN;}catch{return false;}};
async function current(){return (await chrome.storage.local.get(KEY))[KEY]||{session:null,history:[]};}
async function write(value){await chrome.storage.local.set({[KEY]:value});return value;}

chrome.action.onClicked.addListener(tab=>{chrome.sidePanel.open({tabId:tab.id}).catch(()=>{});});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const fromPanel=!sender.tab&&sender.url?.startsWith(chrome.runtime.getURL(''));
  const fromSite=sender.tab&&isSite(sender.url);
  if(!fromPanel&&!fromSite){respond({ok:false,error:'허용된 학습 화면에서 요청해 주세요.'});return;}
  if(fromSite&&!['PING','LAUNCH','EXPORT'].includes(message?.type)){respond({ok:false,error:'지원하지 않는 연결입니다.'});return;}
  const work=queue.catch(()=>{}).then(async()=>{
    if(message.type==='PING')return {version:COACH_VERSION};
    let state=await current();
    if(message.type==='GET')return state;
    if(message.type==='LAUNCH'){
      if(!state.session){state.session=createSession(LEVELS[message.level]?message.level:'starter');await write(state);}
      const tab=await chrome.tabs.create({url:'https://chatgpt.com/'});
      return {launched:true,tabId:tab.id,message:'ChatGPT에서 확장 프로그램 아이콘을 눌러 코치를 열어 주세요.'};
    }
    if(message.type==='OPEN_CHAT')return {tabId:(await chrome.tabs.create({url:'https://chatgpt.com/'})).id};
    if(message.type==='OPEN_SITE'){await chrome.tabs.create({url:SITE_ORIGIN+'/coach#records'});return {opened:true};}
    if(message.type==='EXPORT'){
      const record=state.session?.completedAt?state.session:[...state.history].reverse().find(s=>s.completedAt);
      if(!record)throw Error('아직 완료한 실습이 없어요. 확장 프로그램에서 독립 실습까지 마쳐 주세요.');
      return {session:record,outcome:outcome(record)};
    }
    if(message.type==='NEW'){
      if(state.session)state.history.push(state.session);
      state.session=createSession(message.level||'starter');return write(state);
    }
    if(message.type==='HIGHLIGHT'){
      if(!['attach','composer',null].includes(message.target))throw Error('지원하지 않는 안내입니다.');
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.id||!isChat(tab.url))return {found:false,reason:'ChatGPT 탭을 선택한 뒤 다시 눌러 주세요.'};
      if(state.session?.phase===3&&message.target){state.session=useHelp(state.session,'button-location');await write(state);}
      try{return await chrome.tabs.sendMessage(tab.id,{type:'AIBRIDGE_HIGHLIGHT',target:message.target});}
      catch{return {found:false,reason:'ChatGPT 화면을 새로고침한 뒤 버튼 안내를 다시 열어 주세요.'};}
    }
    if(!state.session)throw Error('먼저 실습을 시작해 주세요.');
    if(message.revision!==state.session.revision)throw Error('다른 창에서 기록이 바뀌었어요. 현재 입력을 복사하고 코치를 다시 열어 주세요.');
    if(message.type==='PATCH')state.session=updateDraft(state.session,message.patch||{});
    else if(message.type==='SUBMIT')state.session=await submitEvidence(state.session,message.upload);
    else if(message.type==='NEXT')state.session=advance(state.session);
    else if(message.type==='HELP')state.session=useHelp(state.session,message.kind||'guide');
    else throw Error('지원하지 않는 작업입니다.');
    return write(state);
  });
  queue=work;
  work.then(data=>respond({ok:true,...data})).catch(error=>respond({ok:false,error:error.message?.includes('QUOTA')?'저장 공간이 부족합니다. 현재 기록을 JSON으로 내려받아 보관해 주세요.':error.message}));
  return true;
});
