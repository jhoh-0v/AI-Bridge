'use strict';

const paths = {
  bridge:'<path d="M4 20V11a8 8 0 0 1 16 0v9M8 20v-9a4 4 0 0 1 8 0v9"/><path d="M2 20h20"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4zM13 7a3 3 0 0 1 3-3h5v14h-5a3 3 0 0 0-3 3"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  chart:'<path d="M4 3v17h17M8 15v-4M13 15V6M18 15V9"/>',
  file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  circle:'<circle cx="12" cy="12" r="8"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  external:'<path d="M14 3h7v7M21 3l-10 10M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/>',
  leaf:'<path d="M20 3c-1 9-2 15-9 16-5 0-8-3-7-7C5 5 13 7 20 3zM4 21l10-10"/>'
};
const icon = (name, extra='') => '<svg class="icon '+extra+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.spark)+'</svg>';
const h = value => String(value??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const tools = {
  ChatGPT:{symbol:'◉',url:'https://chatgpt.com/'},
  Gemini:{symbol:'✦',url:'https://gemini.google.com/'},
  Claude:{symbol:'✳',url:'https://claude.ai/'}
};
const tasks = {
  sales:{
    title:'매출 데이터로<br>보고서 작성하기',short:'매출 분석과 보고서',icon:'chart',category:'데이터 · 보고서',subtitle:'숫자에서 의미를 찾는 요청을 연습해요.',time:'약 15분',file:'매출_연습자료.csv',challengeFile:'매출_독립실습.csv',
    data:'날짜,상품,매출액(원)\n2026-07-05,데스크 노트,120000\n2026-07-15,펜 세트,80000\n2026-08-05,데스크 노트,150000\n2026-08-15,펜 세트,60000\n2026-09-05,데스크 노트,135000\n2026-09-15,펜 세트,95000',
    challengeData:'날짜,상품,매출액(원)\n2026-04-05,캔버스 파우치,240000\n2026-04-15,카드 지갑,180000\n2026-05-05,캔버스 파우치,210000\n2026-05-15,카드 지갑,225000\n2026-06-05,캔버스 파우치,280000\n2026-06-15,카드 지갑,190000',
    resource:'가상 기업의 3개월 매출 자료',resourceType:'CSV · 학습용 가상 데이터',
    example:{goal:'팀장님께 공유할 최근 3개월의 매출 흐름과 상품별 변화 요약을 만들고 싶어요.',data:'2026년 7~9월 매출 자료입니다. 날짜, 상품, 매출액 열이 있고 금액 단위는 원입니다.',format:'월별 합계표와 핵심 변화 3가지, 5문장 이내의 보고서',checks:'비교 기간과 계산 기준을 밝히고, 데이터에 없는 매출 변화의 원인은 단정하지 않기'},
    goalPlaceholder:'예: 팀장님께 공유할 3개월 매출 보고서를 만들고 싶어요.',
    dataPlaceholder:'예: 7~9월 매출 자료이며 날짜·상품·매출액 열이 있어요.',
    verifyTip:'보고서의 분석 기간이 맞는지, 핵심 수치가 원자료와 연결되는지 살펴보세요. 매출 변화의 이유를 데이터 없이 단정하지 않았는지도 확인해요.',
    followup:'월별 집계에 포함한 기간과 계산 기준을 설명해 줘. 데이터로 확인할 수 있는 사실과 추가 확인이 필요한 해석을 구분해 줘.',
    challenge:'이번에는 다른 상품의 4~6월 매출 자료예요. 상품별 변화와 월별 흐름을 팀원이 읽을 짧은 보고서로 정리해 보세요. 요청 작성부터 결과 확인까지 직접 진행해요.'
  },
  summary:{
    title:'긴 문서의<br>핵심만 정리하기',short:'문서 핵심 요약',icon:'file',category:'문서 · 요약',subtitle:'읽는 사람에게 필요한 내용을 골라내요.',time:'약 10분',file:'회의록_연습자료.txt',challengeFile:'회의록_독립실습.txt',
    data:'[학습용 가상 회의록]\n프로젝트: 사내 지식 공유 행사\n일시: 10월 12일\n결정: 행사는 11월 5일 오후 2시에 진행한다. 참석 예상 인원은 30명이다.\n담당: 유나는 장소 예약을 10월 20일까지 완료한다. 민호는 발표자 3명을 10월 22일까지 섭외한다.\n미정: 다과 예산과 온라인 중계 여부는 다음 회의에서 결정한다.\n논의: 점심시간 개최 의견도 있었지만 오후 시간으로 확정했다.',
    challengeData:'[학습용 가상 회의록]\n프로젝트: 고객 안내 자료 개편\n일시: 10월 19일\n결정: 신규 고객용 안내 문서를 11월 10일 공개한다.\n담당: 지수는 초안을 10월 28일까지 작성한다. 태오는 문서 디자인을 11월 3일까지 마친다.\n미정: 영어 버전 제작은 아직 결정하지 않았다.\n논의: 영상 자료도 제안됐으나 이번 공개 범위에서는 제외했다.',
    resource:'결정 사항과 미정 사항이 섞인 회의록',resourceType:'TXT · 학습용 가상 문서',
    example:{goal:'회의에 참석하지 못한 팀원이 결정 사항과 해야 할 일을 빠르게 파악할 수 있게 요약하고 싶어요.',data:'사내 행사를 준비하는 가상의 회의록입니다. 결정 사항, 담당자, 기한, 미정 사항이 섞여 있어요.',format:'결정 사항 3줄과 담당자·할 일·기한 표, 미정 사항 목록',checks:'논의 중인 의견을 확정 사항처럼 쓰지 않고, 원문에 없는 담당자나 날짜를 만들지 않기'},
    goalPlaceholder:'예: 회의에 못 온 팀원에게 결정 사항과 할 일을 전달하고 싶어요.',
    dataPlaceholder:'예: 담당자·기한·미정 사항이 섞인 회의록이에요.',
    verifyTip:'담당자와 날짜를 원문에서 직접 찾아보세요. 제안에 그친 내용이 결정 사항으로 바뀌지 않았는지도 확인해요.',
    followup:'결정 사항마다 근거가 되는 원문을 함께 표시해 줘. 아직 결정되지 않은 내용은 별도 항목으로 옮겨 줘.',
    challenge:'새로운 프로젝트 회의록을 준비했어요. 회의에 참석하지 않은 동료에게 전달할 요약을 만들어 보세요. 결정과 제안, 담당자와 기한을 직접 확인해요.'
  },
  email:{
    title:'상황에 맞는<br>업무 메일 쓰기',short:'업무 이메일 작성',icon:'mail',category:'커뮤니케이션',subtitle:'목적과 맥락이 잘 전달되는 글을 써요.',time:'약 8분',file:'메일_상황카드.txt',challengeFile:'메일_독립상황.txt',
    data:'[학습용 가상 상황]\n수신자: 협업 중인 다른 부서 담당자\n목적: 자료 전달 일정 변경 요청\n기존 일정: 11월 3일\n희망 일정: 11월 5일\n이유: 최종 수치 확인에 시간이 더 필요함\n포함할 내용: 일정 변경 사유, 상대 일정에 영향이 있는지 확인, 감사\n주의: 상대의 동의가 아직 없으므로 확정된 일정처럼 쓰지 말 것',
    challengeData:'[학습용 가상 상황]\n수신자: 처음 연락하는 협력사 담당자\n목적: 제품 소개 회의 일정 제안\n후보: 11월 9일 오전 10시 또는 11월 10일 오후 2시\n소요 시간: 30분\n진행 방식: 온라인\n포함할 내용: 자기소개, 회의 목적, 후보 일정, 가능한 시간 회신 요청\n주의: 참석 확정으로 표현하지 말 것',
    resource:'수신자와 요청 사항이 담긴 상황 카드',resourceType:'TXT · 학습용 가상 상황',
    example:{goal:'다른 부서 담당자에게 자료 전달 일정을 이틀 늦출 수 있는지 정중하게 요청하고 싶어요.',data:'기존 전달일은 11월 3일이고 희망일은 11월 5일입니다. 최종 수치 확인에 시간이 더 필요하며 아직 상대의 동의는 받지 않았어요.',format:'메일 제목과 6문장 이내의 본문, 정중하고 간결한 말투',checks:'변경 일정을 확정처럼 쓰지 않고, 상대 일정에 영향이 있는지 확인하는 문장 넣기'},
    goalPlaceholder:'예: 다른 부서에 자료 전달 일정 변경을 정중하게 요청하고 싶어요.',
    dataPlaceholder:'예: 기존 일정, 변경 희망일, 변경 사유와 상대방과의 관계를 설명해요.',
    verifyTip:'날짜와 요청 내용이 상황에 맞는지 확인하세요. 상대가 동의하지 않은 일을 확정된 사실로 쓰거나, 약속하지 않은 조건을 추가하지 않았는지 살펴봐요.',
    followup:'일정은 아직 합의되지 않았어. 확정처럼 읽히는 표현을 요청하는 문장으로 수정하고, 상대의 가능한 일정도 물어봐 줘.',
    challenge:'처음 연락하는 협력사에 온라인 회의 일정을 제안해야 해요. 새 상황 카드로 직접 요청을 작성하고, 상대에게 필요한 정보가 빠지지 않았는지 확인해 보세요.'
  }
};
const KEY='aibridge-prototype-v1';
const emptyDraft=()=>({goal:'',data:'',format:'',checks:'',prompt:'',ran:false,response:'',evidence:'',followup:'',checkSource:false,checkRequirements:false,checkUncertainty:false,challengePrompt:'',challengeEvidence:'',challengeRan:false,hintUsed:false});
const initial=()=>({view:'home',task:'sales',tool:'ChatGPT',experience:'new',step:0,maxStep:0,started:false,draft:emptyDraft(),history:[],completed:null});
let state=initial();
try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved && tasks[saved.task] && tools[saved.tool]){
    state={...initial(),...saved,draft:{...emptyDraft(),...saved.draft},history:Array.isArray(saved.history)?saved.history.slice(0,30):[]};
    if(!['home','practice','history','guide','complete'].includes(state.view)) state.view='home';
    state.step=Math.max(0,Math.min(3,Number(state.step)||0));
    state.maxStep=Math.max(0,Math.min(3,Number(state.maxStep)||0));
  }
}catch{}
let formError='';
let followupExample=false;
let toastTimer;
const app=document.getElementById('app');
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2600);}
function action(label,name,kind='',extra=''){return '<button type="button" class="button '+kind+'" data-action="'+name+'" '+extra+'>'+label+'</button>';}
function aiLink(label='상용 AI 열기'){return '<a class="button dark" href="'+tools[state.tool].url+'" target="_blank" rel="noopener noreferrer" data-action="open-ai">'+h(label)+icon('external')+'</a>';}
function field(name,label,placeholder,rows=2,optional=false){
  return '<div class="field"><label for="'+name+'">'+label+(optional?'<small>선택</small>':'<span class="required">·</span>')+'</label><textarea id="'+name+'" name="'+name+'" rows="'+rows+'" maxlength="5000" placeholder="'+h(placeholder)+'">'+h(state.draft[name])+'</textarea></div>';
}
function check(name,label,sub=''){return '<label class="check-line"><input type="checkbox" name="'+name+'" '+(state.draft[name]?'checked':'')+'><span>'+label+(sub?'<small>'+sub+'</small>':'')+'</span></label>';}
function resource(challenge=false){
 const t=tasks[state.task];
 return '<div class="resource-strip"><div class="resource-left">'+icon('file')+'<div><strong>'+(challenge?'새로운 독립 실습 자료':t.resource)+'</strong><span>'+t.resourceType+'</span></div></div><button type="button" class="text-button" data-action="'+(challenge?'download-challenge':'download')+'">자료 받기 '+icon('download')+'</button></div>';
}
function nav(name,label,ico){const active=state.view===name||(name==='home'&&['practice','complete'].includes(state.view));return '<button class="nav-item '+(active?'active':'')+'" type="button" data-action="nav-'+name+'" '+(active?'aria-current="page"':'')+'>'+icon(ico)+label+(name==='history'&&state.history.length?'<span class="count">'+state.history.length+'</span>':'')+'</button>';}
function shell(body){
 const title=state.view==='history'?'나의 학습 기록':state.view==='guide'?'이렇게 배워요':'오늘의 실습';
 return '<div class="shell"><aside class="sidebar"><a href="#home" class="brand" data-action="home"><span class="brand-mark">'+icon('bridge')+'</span>AI Bridge</a><p class="brand-caption">YOUR NEXT STEP WITH AI</p><p class="nav-label">MY WORKSPACE</p><nav class="nav-list" aria-label="주요 메뉴">'+nav('home','오늘의 실습','grid')+nav('history','나의 학습 기록','book')+nav('guide','이렇게 배워요','compass')+'</nav><div class="sidebar-bottom"><div class="bridge-note"><div class="eyebrow">A LITTLE BRIDGE</div><p>처음에는 함께,<br>다음에는 스스로.</p><div class="note-line"></div></div><div class="prototype-note"><span class="dot"></span>인터랙티브 프로토타입</div></div></aside><div class="app-body"><header class="topbar"><div class="breadcrumb">워크스페이스 <span>/</span> <strong>'+title+'</strong></div><div class="top-right"><span class="guest-status"><span class="dot"></span>로그인 없이 체험 중</span><span class="avatar">ME</span></div></header><main id="main" class="content fade-in" tabindex="-1">'+body+'<footer class="page-footer"><strong>AI, 아는 사람만 잘 쓰지 않도록.</strong><div class="footer-links"><span>예시 가이드 · AI 코칭 연결 전</span><span>기록은 이 브라우저에만 저장돼요</span></div></footer></main></div></div>';
}
function bridgeArt(){
 return '<div class="hero-visual" aria-hidden="true"><svg viewBox="0 0 400 245" fill="none"><path d="M21 195h358" stroke="#dde3d2"/><path d="M57 194v-30c0-78 62-132 143-132s143 54 143 132v30" fill="#e8eddf"/><path d="M92 194v-30c0-59 46-99 108-99s108 40 108 99v30" fill="#f7f7f2"/><path d="M60 194v-30c0-77 61-129 140-129s140 52 140 129v30" stroke="#bbc9aa" stroke-width="2" stroke-dasharray="5 7"/><circle cx="200" cy="35" r="20" fill="#e96b4d"/><path d="m193 35 5 5 9-10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="20" y="151" width="82" height="37" rx="9" fill="white" stroke="#dfe5d6"/><text x="61" y="175" text-anchor="middle" fill="#7e8c6d" font-size="12" font-family="sans-serif">요청하기</text><rect x="159" y="102" width="82" height="37" rx="9" fill="white" stroke="#dfe5d6"/><text x="200" y="126" text-anchor="middle" fill="#7e8c6d" font-size="12" font-family="sans-serif">확인하기</text><rect x="299" y="151" width="82" height="37" rx="9" fill="#ed6b4d"/><text x="340" y="175" text-anchor="middle" fill="white" font-size="12" font-family="sans-serif">혼자 하기</text><path d="M116 172h17m-4-4 4 4-4 4M267 172h17m-4-4 4 4-4 4" stroke="#abb99c" stroke-width="1.4" stroke-linecap="round"/><path d="M24 92h12m-6-6v12M361 72h12m-6-6v12" stroke="#c2cdb5" stroke-width="1.5"/><circle cx="321" cy="45" r="3" fill="#e6c5af"/><circle cx="98" cy="59" r="3" fill="#c9d4ba"/></svg><span class="visual-caption">작은 실습 하나가, 스스로 하는 힘으로.</span></div>';
}
function home(){
 const cards=Object.entries(tasks).map(([id,t])=>'<button type="button" class="task-card '+(id===state.task?'selected':'')+'" data-action="select-task" data-task="'+id+'" aria-pressed="'+(id===state.task)+'"><div class="card-top"><span class="task-icon '+id+'">'+icon(t.icon)+'</span><span class="selection-indicator">'+(id===state.task?icon('check'):'')+'</span></div><h3>'+t.title+'</h3><p>'+t.subtitle+'</p><div class="card-footer"><span class="tag">'+t.category+'</span><span>·</span><span>'+t.time+' 연습</span></div></button>').join('');
 const toolOptions=Object.entries(tools).map(([name,t])=>'<button type="button" class="tool-option '+(state.tool===name?'active':'')+'" data-action="select-tool" data-tool="'+name+'" aria-pressed="'+(state.tool===name)+'"><span class="tool-symbol">'+t.symbol+'</span>'+name+'</button>').join('');
 return '<section class="hero"><div><div class="eyebrow"><span class="tiny-line"></span>AI 실무 연습실</div><h1>업무는 AI와,<br><em>실력은 나에게.</em></h1><p class="hero-copy">어떻게 물어볼지 막막했던 업무, 여기서 시작해요.<br>직접 요청하고 확인하며, 혼자 할 수 있는 힘을 길러요.</p></div>'+bridgeArt()+'</section><section aria-labelledby="task-heading"><div class="section-heading"><h2 id="task-heading">어떤 업무부터 시작할까요?<small>01 / 03</small></h2><button class="text-button" data-action="nav-guide">실습은 어떻게 하나요? '+icon('arrow')+'</button></div><div class="task-grid">'+cards+'</div><div class="setup-panel"><div class="setup-group"><div class="setup-label">어떤 AI와 함께할까요?<span>별도 창에서 직접 사용해요</span></div><div class="tool-options">'+toolOptions+'</div></div><div class="setup-group"><label class="setup-label" for="experience">AI와 얼마나 친한가요?<span>안내의 출발점을 정해요</span></label><select id="experience" name="experience"><option value="new" '+(state.experience==='new'?'selected':'')+'>아직 낯설어요. 차근차근 알려주세요.</option><option value="tried" '+(state.experience==='tried'?'selected':'')+'>써봤지만, 업무에 적용하기 어려워요.</option><option value="familiar" '+(state.experience==='familiar'?'selected':'')+'>익숙해요. 직접 실습부터 해볼게요.</option></select></div></div><div class="start-row"><span class="start-caption">'+icon('leaf')+'내 자료가 없어도 괜찮아요. 연습 자료를 준비했어요.</span>'+action((state.started?'이어서 실습하기':'선택한 업무로 시작하기')+icon('arrow'),'start')+'</div></section>';
}
const stepNames=['요청 준비','AI에서 실행','결과 확인','혼자 해보기'];
function stepper(){return '<ol class="stepper" aria-label="실습 단계">'+stepNames.map((name,i)=>'<li><button type="button" class="step-button '+(i===state.step?'current':i<state.step?'done':'')+'" data-action="go-step" data-step="'+i+'" '+(i>state.maxStep?'disabled':'')+' '+(i===state.step?'aria-current="step"':'')+'><span class="step-number">'+(i<state.step?icon('check'):'0'+(i+1))+'</span>'+name+'</button></li>').join('')+'</ol>';}
function coach(){
 const text=[
  ['좋은 요청에는<br>상황이 보여요.','무엇을 끝내고 싶은지, 어떤 자료가 있는지 함께 알려주세요. AI가 내 상황을 이해하는 출발점이에요.'],
  ['직접 고쳐보는<br>순간이 실력이 돼요.','정리된 요청을 내 상황에 맞게 수정해 보세요. 선택한 AI에서 직접 실행하고, 부족하면 한 번 더 물어봐요.'],
  ['그럴듯한 답도<br>한 번 더 확인해요.','AI가 맞다고 말하는 것만으로 충분하지 않아요. 원자료나 출처를 직접 확인하고, 확인하지 못한 부분은 남겨두세요.'],
  ['이번에는<br>내 힘으로 해봐요.','새로운 자료로 같은 원리를 적용해 보세요. 이 단계에서는 직접 요청을 만들고, 확인할 방법도 스스로 정해요.']
 ][state.step];
 const labels=['목표가 분명한가요?','자료의 맥락이 있나요?','원하는 결과를 설명했나요?','확인할 조건이 있나요?'];
 const checklist=state.step===0?'<ul class="coach-checks">'+['goal','data','format','checks'].map((key,i)=>'<li data-coach-check="'+key+'" class="'+(state.draft[key].trim()?'filled':'')+'">'+icon(state.draft[key].trim()?'check':'circle')+labels[i]+'</li>').join('')+'</ul>':'';
 const experience=state.experience==='new'?'처음이라면 예시를 참고해도 괜찮아요.':state.experience==='tried'?'지난번에 잘 안 됐던 요청에 어떤 조건이 빠졌는지 떠올려보세요.':'아는 설명은 건너뛰고 직접 작성해 보세요.';
 return '<aside class="coach"><div class="coach-top"><span class="coach-mark">'+icon('spark')+'</span><span class="coach-badge">예시 가이드</span></div><h3>'+text[0]+'</h3><p>'+text[1]+'</p>'+checklist+'<div class="coach-foot">'+(state.step===0?experience:'실제 AI의 답변을 분석한 피드백이 아닌, 이 단계에서 참고할 예시 안내예요.')+'</div></aside>';
}
function formActions(nextLabel='다음 단계',last=false){
 return (formError?'<p class="form-error" role="alert">'+h(formError)+'</p>':'')+'<div class="work-actions">'+(state.step>0?action(icon('back')+'이전','previous','ghost'):'<span class="small-note">내 말로 적어도 충분해요.</span>')+action(nextLabel+icon('arrow'),last?'finish':'next')+'</div>';
}
function stagePrepare(){
 const t=tasks[state.task];
 return '<div class="card-eyebrow">STEP 01 · PREPARE<button class="text-button" data-action="fill-example">예시로 채워보기 '+icon('spark')+'</button></div><h2>AI에게 무엇을 부탁할까요?</h2><p class="intro">완벽한 문장보다 내 상황이 중요해요.<br>아래 내용을 정리하면, 실행할 요청을 직접 다듬을 수 있어요.</p>'+resource()+field('goal','어떤 일을 끝내고 싶나요?',t.goalPlaceholder)+field('data','어떤 자료와 상황인가요?',t.dataPlaceholder)+'<div class="field-row">'+field('format','어떤 형태로 받고 싶나요?','예: 핵심 3가지와 표, 짧은 보고서',2)+field('checks','특히 확인할 부분이 있나요?','예: 원문에 없는 사실은 만들지 않기',2,true)+'</div>'+formActions('요청 다듬으러 가기');
}
function stageExecute(){
 return '<div class="card-eyebrow">STEP 02 · TRY IT</div><h2>이제, '+h(state.tool)+'에서 직접 해봐요.</h2><p class="intro">내가 입력한 내용을 요청으로 묶었어요. 읽어보고 직접 수정한 뒤,<br>자료와 함께 선택한 AI에 전달해 보세요.</p><div class="field"><label for="prompt">내가 사용할 요청<button type="button" class="text-button" data-action="rebuild-prompt">준비한 내용 다시 반영</button></label><textarea class="prompt-area" id="prompt" name="prompt" maxlength="8000" rows="10">'+h(state.draft.prompt)+'</textarea></div><div class="action-pair">'+action(icon('copy')+'요청 복사','copy-prompt','secondary')+aiLink(state.tool+' 열기')+'</div>'+resource()+'<p class="field-help">계정과 자료 전달 기능은 선택한 AI에서 확인해 주세요. 요청은 자동 전송되지 않아요.</p>'+check('ran','상용 AI에서 요청을 실행하고 답변을 받아봤어요.','실제로 실행한 뒤 직접 체크해 주세요.')+formActions('결과 확인하러 가기');
}
function stageVerify(){
 const t=tasks[state.task];
 return '<div class="card-eyebrow">STEP 03 · CHECK & REFINE</div><h2>좋은 답인지, 내가 확인해요.</h2><p class="intro">'+t.verifyTip+'</p>'+field('response','확인하고 싶은 답변 부분','상용 AI의 답변 중 확인할 부분만 가져오세요.',3,true)+'<label class="setup-label">확인한 항목만 체크해 주세요.</label>'+check('checkSource','핵심 사실을 원자료 또는 출처와 대조했어요.')+check('checkRequirements','요청한 조건이 빠지지 않았는지 확인했어요.')+check('checkUncertainty','확인되지 않은 설명과 사실을 구분했어요.')+'<div style="margin-top:23px">'+field('evidence','무엇을 어떻게 확인했나요?','예: 보고서의 기간을 원자료와 대조했고, 근거가 없는 원인 설명은 다시 물어보기로 했어요.',3)+'</div>'+field('followup','다시 물어볼 내용을 적어보세요.','확인이 더 필요한 부분이나 수정할 조건을 적어보세요.',2,true)+'<button class="text-button" data-action="show-followup">'+icon('spark')+'후속 요청 예시 보기</button>'+(followupExample?'<div class="example-box"><strong>참고용 예시 · 내 결과에 맞게 바꿔보세요.</strong>'+h(t.followup)+'</div>':'')+formActions('새 과제에 도전하기');
}
function stageChallenge(){
 const t=tasks[state.task];
 return '<div class="card-eyebrow">STEP 04 · ON YOUR OWN<span class="tag '+(state.draft.hintUsed?'orange':'')+'">'+(state.draft.hintUsed?'도움을 받는 연습':'독립 실습')+'</span></div><h2>새로운 업무, 이번엔 스스로.</h2><p class="intro">방금 익힌 방법을 새로운 상황에도 적용할 수 있을까요?<br>요청을 작성하고, '+h(state.tool)+'에서 실행한 뒤 확인 기록을 남겨요.</p><div class="challenge-brief"><span class="eyebrow">YOUR NEXT MISSION</span><p>'+t.challenge+'</p></div>'+resource(true)+field('challengePrompt','내가 직접 작성한 요청','이번 과제의 목적과 자료, 원하는 결과를 내 말로 설명해 보세요.',4)+'<div class="action-pair">'+action(icon('copy')+'내 요청 복사','copy-challenge','secondary')+aiLink(state.tool+' 열기')+'</div>'+field('challengeEvidence','결과를 어떻게 확인했나요?','직접 확인한 근거와 아직 확인하지 못한 내용을 구분해 적어보세요.',3)+check('challengeRan','상용 AI에서 실행하고 결과를 직접 확인했어요.')+'<button type="button" class="hint-toggle" data-action="challenge-hint">'+(state.draft.hintUsed?'힌트를 사용한 연습으로 기록돼요.':'막혔나요? 힌트를 받고 연습하기')+'</button>'+(state.draft.hintUsed?'<div class="example-box"><strong>요청의 네 가지 재료</strong>업무 목표, 자료의 특성, 원하는 출력, 확인할 조건을 하나씩 적어보세요. 답을 받은 뒤에는 원자료나 출처에서 중요한 항목을 직접 대조해 보세요.</div>':'<p class="field-help">힌트를 열면 독립 실습 대신 도움받은 연습으로 기록돼요.</p>')+formActions('실습 기록 남기기',true);
}
function practice(){
 const t=tasks[state.task];
 return '<div class="practice-heading"><div><button class="back-link" data-action="home">'+icon('back')+'업무 선택으로</button><div class="eyebrow">TODAY’S PRACTICE</div><h1>'+t.short+'</h1></div><span class="tool-badge">'+tools[state.tool].symbol+' '+h(state.tool)+'와 실습 중</span></div>'+stepper()+'<div class="workspace"><section class="work-card">'+[stagePrepare,stageExecute,stageVerify,stageChallenge][state.step]()+'</section>'+coach()+'</div>';
}
function makePrompt(){const d=state.draft;return ['[업무 목표]',d.goal,'','[자료와 상황]',d.data,'','[원하는 결과]',d.format,d.checks?'\n[확인할 조건]\n'+d.checks:''].join('\n').trim();}
function recordText(r){return 'AI Bridge 실습 기록\n'+r.title+' · '+r.tool+'\n'+new Date(r.date).toLocaleString('ko-KR')+'\n\n[준비한 요청]\n'+r.prompt+'\n\n[확인한 내용]\n'+r.evidence+'\n\n[새 과제에서 직접 작성한 요청]\n'+r.challengePrompt+'\n\n[새 과제 확인 기록]\n'+r.challengeEvidence+'\n\n힌트 사용: '+(r.hintUsed?'사용함':'사용하지 않음')+'\n\n이 기록은 사용자가 작성한 자기 확인 기록이며 결과물의 정확성 인증이 아닙니다.';}
function complete(){
 const r=state.completed;
 if(!r)return home();
 return '<div class="celebration"><div class="finish-icon">'+icon('leaf')+'</div><div class="eyebrow" style="color:#82916e;font-size:10px;margin-bottom:13px">ONE STEP FURTHER</div><h1>직접 해본 경험,<br>이제 내 것이 됐어요.</h1><p>'+h(r.title)+' 실습의 기록을 남겼어요.<br>다음 업무에서도 오늘 확인한 방법을 떠올려보세요.</p><span class="tag '+(r.hintUsed?'orange':'')+'">'+(r.hintUsed?'힌트를 활용한 연습':'힌트 없이 시도한 독립 실습')+'</span><div class="reflection"><div class="reflection-item"><span>내가 직접 만든 요청</span><p>'+h(r.challengePrompt)+'</p></div><div class="reflection-item"><span>내가 확인한 근거</span><p>'+h(r.challengeEvidence)+'</p></div></div><p>자기 확인 내용을 기록했어요. 결과의 정확성을 판정한 점수는 아니에요.</p><div class="action-pair">'+action('나의 학습 기록'+icon('arrow'),'nav-history')+action(icon('download')+'기록 내려받기','download-record','secondary')+'</div><button class="text-button" data-action="new-practice">다른 업무 연습하기</button></div>';
}
function history(){
 const list=state.history.map(r=>'<article class="history-card"><div class="history-head"><span class="task-icon '+h(r.task)+'">'+icon(tasks[r.task]?.icon||'file')+'</span><div><h3>'+h(r.title)+'</h3><time>'+h(new Date(r.date).toLocaleDateString('ko-KR',{month:'long',day:'numeric'}))+' · '+h(r.tool)+'</time></div><span class="tag '+(r.hintUsed?'orange':'')+'">'+(r.hintUsed?'힌트 사용':'직접 시도')+'</span></div><details><summary>내 요청과 확인 기록 보기</summary><pre>'+h(recordText(r))+'</pre><button class="text-button" data-action="download-history" data-id="'+h(r.id)+'">'+icon('download')+'이 기록 내려받기</button></details></article>').join('');
 return '<div class="practice-heading"><div><div class="eyebrow">MY LEARNING JOURNAL</div><h1>작은 경험이 쌓이는 곳.</h1><p class="hero-copy">어떤 요청을 했고, 무엇을 직접 확인했는지 돌아봐요.</p></div><span class="tool-badge">실습 기록 '+state.history.length+'개</span></div>'+(list?'<div class="history-list">'+list+'</div>':'<div class="empty-state">'+icon('book')+'<h2>첫 번째 기록을 기다리고 있어요.</h2><p>실습을 마치면 내가 작성한 요청과 확인 과정이 여기에 남아요.</p>'+action('첫 실습 시작하기'+icon('arrow'),'home')+'</div>')+'<div class="info-banner">'+icon('lock')+'<span>기록은 현재 브라우저에만 저장돼요. 필요한 기록은 파일로 내려받아 보관하세요.<br>이 화면의 기록은 학습 과정에 대한 자기 기록이며, AI 활용 능력이나 결과 정확성의 인증은 아니에요.</span></div>';
}
function guide(){
 const items=[['01','내 상황을 설명해요.','목표, 자료의 특성, 원하는 결과를 정리해요. 처음에는 예시를 참고하고, 내 상황에 맞게 직접 고쳐보세요.'],['02','평소 쓰는 AI에서 실행해요.','ChatGPT, Gemini, Claude 중 선택한 AI를 별도 창에서 열어요. 내 요청과 자료로 직접 작업을 시작해요.'],['03','답을 믿기 전에 확인해요.','원자료나 출처를 직접 대조해요. 빠진 조건이나 근거 없는 설명이 있다면 무엇을 수정할지 다시 요청해요.'],['04','새로운 과제는 혼자 해봐요.','도움 없이도 같은 방법을 적용할 수 있는지 시도해요. 막히면 힌트를 사용하고, 배운 방법과 확인한 근거를 남겨요.']];
 return '<div class="practice-heading"><div><div class="eyebrow">HOW WE LEARN</div><h1>함께 시작해서,<br>혼자 할 수 있을 때까지.</h1><p class="hero-copy">AI Bridge에서 익힌 방법을, 내가 쓰는 AI로 가져가세요.</p></div></div><div class="guide-grid">'+items.map(x=>'<article class="guide-card"><span class="num">'+x[0]+'</span><h2>'+x[1]+'</h2><p>'+x[2]+'</p></article>').join('')+'</div><div class="info-banner">'+icon('info')+'<span>지금은 예시 안내로 흐름을 체험하는 프로토타입이에요. 실제 AI 코칭 API는 연결되지 않았어요. 원본 자료는 AI Bridge에 업로드하지 않으며, 계산이나 정답 판정도 하지 않아요.</span></div><div class="start-row"><span class="start-caption">준비된 가상 자료로 가볍게 시작해 보세요.</span>'+action('실습 선택하기'+icon('arrow'),'home')+'</div>';
}
function render(scroll=false){
 const body=state.view==='practice'?practice():state.view==='history'?history():state.view==='guide'?guide():state.view==='complete'?complete():home();
 app.innerHTML=shell(body);
 persist();
 if(scroll){window.scrollTo({top:0,behavior:'instant'});document.getElementById('main').focus({preventScroll:true});}
}
function updateField(el){
 if(el.name==='experience'){state.experience=el.value;persist();return;}
 if(Object.hasOwn(state.draft,el.name)){
  state.draft[el.name]=el.type==='checkbox'?el.checked:el.value;
  persist();
  if(state.step===0){
   const item=document.querySelector('[data-coach-check="'+el.name+'"]');
   if(item){const filled=Boolean(String(state.draft[el.name]).trim());item.classList.toggle('filled',filled);const svg=item.querySelector('svg');if(svg)svg.outerHTML=icon(filled?'check':'circle');}
  }
 }
}
app.addEventListener('input',e=>{if(e.target.matches('input,textarea,select'))updateField(e.target);});
app.addEventListener('change',e=>{if(e.target.matches('input,textarea,select'))updateField(e.target);});
function error(message,name){formError=message;render();const el=document.querySelector('[name="'+name+'"]');if(el){el.focus();el.scrollIntoView({block:'center',behavior:'smooth'});}}
async function copy(textValue){
 if(!textValue.trim()){toast('먼저 내 요청을 작성해 주세요.');return;}
 try{await navigator.clipboard.writeText(textValue);toast('요청을 복사했어요. 선택한 AI에 붙여넣어 보세요.');}
 catch{const el=document.createElement('textarea');el.value=textValue;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();const ok=document.execCommand('copy');el.remove();toast(ok?'요청을 복사했어요.':'복사 권한이 없어요. 요청을 직접 선택해 복사해 주세요.');}
}
function download(name,textValue){const blob=new Blob(['\ufeff',textValue],{type:name.endsWith('.csv')?'text/csv;charset=utf-8':'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('파일을 내려받았어요. 다운로드 폴더를 확인해 주세요.');}
app.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');
 if(!button||button.disabled)return;
 const a=button.dataset.action;
 if(a==='open-ai'){persist();return;}
 event.preventDefault();
 formError='';
 if(a==='home'){state.view='home';render(true);}
 else if(a.startsWith('nav-')){const page=a.slice(4);state.view=page==='home'&&state.started?'practice':page;render(true);}
 else if(a==='select-task'){
  if(state.task!==button.dataset.task){state.task=button.dataset.task;state.draft=emptyDraft();state.started=false;state.step=0;state.maxStep=0;}
  render();
 }
 else if(a==='select-tool'){state.tool=button.dataset.tool;render();}
 else if(a==='start'){
  if(!state.started){state.draft=emptyDraft();state.step=0;state.maxStep=0;}
  state.started=true;state.view='practice';render(true);
 }
 else if(a==='fill-example'){Object.assign(state.draft,tasks[state.task].example);state.draft.prompt='';render();toast('예시를 채웠어요. 내 상황에 맞게 직접 고쳐보세요.');}
 else if(a==='next'){
  const d=state.draft;
  if(state.step===0){
   if(!d.goal.trim())return error('끝내고 싶은 업무를 내 말로 적어주세요.','goal');
   if(!d.data.trim())return error('사용할 자료나 상황을 설명해 주세요.','data');
   if(!d.format.trim())return error('받고 싶은 결과의 형태를 적어주세요.','format');
   if(!d.prompt.trim())d.prompt=makePrompt();
  }
  if(state.step===1){
   if(!d.prompt.trim())return error('상용 AI에 전달할 요청을 작성해 주세요.','prompt');
   if(!d.ran)return error('상용 AI에서 실행한 뒤 확인 항목을 체크해 주세요.','ran');
  }
  if(state.step===2&&!d.evidence.trim())return error('직접 확인한 근거 또는 아직 확인하지 못한 부분을 기록해 주세요.','evidence');
  state.step=Math.min(3,state.step+1);state.maxStep=Math.max(state.maxStep,state.step);followupExample=false;render(true);
 }
 else if(a==='previous'){state.step=Math.max(0,state.step-1);render(true);}
 else if(a==='go-step'){const step=Number(button.dataset.step);if(step<=state.maxStep){state.step=step;render(true);}}
 else if(a==='rebuild-prompt'){state.draft.prompt=makePrompt();render();toast('준비 단계의 내용을 다시 반영했어요.');}
 else if(a==='copy-prompt'){await copy(state.draft.prompt);}
 else if(a==='copy-challenge'){await copy(state.draft.challengePrompt);}
 else if(a==='download'){download(tasks[state.task].file,tasks[state.task].data);}
 else if(a==='download-challenge'){download(tasks[state.task].challengeFile,tasks[state.task].challengeData);}
 else if(a==='show-followup'){followupExample=!followupExample;render();}
 else if(a==='challenge-hint'){state.draft.hintUsed=true;render();}
 else if(a==='finish'){
  const d=state.draft;
  if(!d.challengePrompt.trim())return error('새 과제에서 직접 작성한 요청을 남겨주세요.','challengePrompt');
  if(!d.challengeEvidence.trim())return error('새 과제에서 확인한 근거를 기록해 주세요.','challengeEvidence');
  if(!d.challengeRan)return error('상용 AI에서 실행하고 결과를 확인한 뒤 체크해 주세요.','challengeRan');
  const r={id:String(Date.now()),date:new Date().toISOString(),task:state.task,title:tasks[state.task].short,tool:state.tool,prompt:d.prompt,evidence:d.evidence,challengePrompt:d.challengePrompt,challengeEvidence:d.challengeEvidence,hintUsed:d.hintUsed};
  state.history.unshift(r);state.history=state.history.slice(0,30);state.completed=r;state.started=false;state.view='complete';render(true);
 }
 else if(a==='download-record'&&state.completed){download('AI_Bridge_실습기록.txt',recordText(state.completed));}
 else if(a==='download-history'){const r=state.history.find(x=>x.id===button.dataset.id);if(r)download('AI_Bridge_실습기록.txt',recordText(r));}
 else if(a==='new-practice'){state.started=false;state.draft=emptyDraft();state.step=0;state.maxStep=0;state.view='home';render(true);}
});
render();
