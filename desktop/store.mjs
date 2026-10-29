import fs from 'node:fs';
import path from 'node:path';
import { createWebDispatcher, readWebState } from '../lib/coach/browser-store.mjs';
import { validateProfile } from '../lib/learning.mjs';
import { LEVELS } from '../lib/coach/lesson.mjs';
import { cleanExercise } from '../lib/coach/source.mjs';
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(temp, file);
}
export function createStore(directory) {
  const stateFile = path.join(directory, 'learning.json');
  const profileFile = path.join(directory, 'profile.json');
  const flowsFile = path.join(directory, 'practice-flows.json');
  const downloadsFile = path.join(directory, 'downloads.json');
  const storage = {
    getItem() { return fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null; },
    setItem(_key, value) { atomicJson(stateFile, JSON.parse(value)); }
  };
  return {
    dispatch: createWebDispatcher(storage),
    read: () => readWebState(storage),
    downloads() {
      if(!fs.existsSync(downloadsFile))return [];
      const data=JSON.parse(fs.readFileSync(downloadsFile,'utf8'));
      if(!Array.isArray(data))throw Error('파일 연결 기록을 읽지 못했어요.');
      return data.filter(d=>d&&typeof d.id==='string'&&typeof d.path==='string'&&d.status==='completed');
    },
    saveDownloads(downloads) { atomicJson(downloadsFile,downloads); },
    reserveAIUsage(kind){
      const live=kind==='dialogue',file=path.join(directory,live?'dialogue-usage.json':'ai-usage.json'),day=new Date().toISOString().slice(0,10);
      const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
      const calls=previous.day===day?Number(previous.calls)||0:0;
      if(calls>=(live?80:20))throw Error(live?'오늘의 대화 코치 80회를 사용했어요. 대화와 결과 기록은 계속 보관해요.':'오늘의 AI 학습 제안 20회를 사용했어요. 샘플 과정은 계속 사용할 수 있어요.');
      atomicJson(file,{day,calls:calls+1,lastKind:kind});
    },
    enableDialogue(consent=false){
      const state=readWebState(storage),s=state.session;
      if(!s?.exercise||s.exercise.version!==3||s.completedAt)return state;
      s.exercise.dialogueLearning=true;
      if(consent)s.exercise.aiConsent=true;
      s.revision++;atomicJson(stateFile,state);return state;
    },
    configure(level,exercise) {
      const state=readWebState(storage);
      if(!LEVELS[level]||!state.session||state.session.phase!==0||state.session.submissions.length)throw Error('진행 중인 실습의 자료와 수준은 바꿀 수 없어요.');
      state.session.exercise=cleanExercise(exercise);state.session.level=level;state.session.revision++;
      atomicJson(stateFile,state);return state;
    },
    setLevel(level) {
      const state=readWebState(storage);
      if (!LEVELS[level] || !state.session || state.session.phase!==0 || state.session.submissions.length) throw Error('첫 요청 전에 도움 수준을 바꿀 수 있어요.');
      state.session.level=level;state.session.revision++;state.session.updatedAt=new Date().toISOString();
      atomicJson(stateFile,state);return state;
    },
    flows() {
      if (!fs.existsSync(flowsFile)) return {};
      const data=JSON.parse(fs.readFileSync(flowsFile,'utf8'));
      if (data.version!==1 || !data.flows || typeof data.flows!=='object') throw Error('실습 연결 기록을 읽지 못했어요. 기존 기록은 보존했습니다.');
      return data.flows;
    },
    saveFlow(flow) {
      const flows=this.flows();flows[flow.sessionId]=flow;atomicJson(flowsFile,{version:1,flows});return flow;
    },
    profile() {
      if (!fs.existsSync(profileFile)) return null;
      return validateProfile(JSON.parse(fs.readFileSync(profileFile, 'utf8')));
    },
    saveProfile(input) { const profile = validateProfile(input); atomicJson(profileFile, profile); return profile; }
  };
}
