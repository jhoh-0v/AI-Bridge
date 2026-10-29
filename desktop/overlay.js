import { placeGuide } from './guide-model.mjs';
let overlay=null,tracked=null,avoid=null,frame=0,lastKey='',dismissed='';
// Preserve an open native menu while its explanatory card is clicked. Prevent
// pointer focus from moving outside the menu; the card's normal click still works.
addEventListener('pointerdown',event=>{
  if(overlay?._guardMenu&&event.composedPath().includes(overlay)){
    event.preventDefault();event.stopImmediatePropagation();
  }
},true);
function position(){
  if(!overlay)return;
  const obstacles=(Array.isArray(avoid)?avoid:[avoid||tracked]).filter(el=>el?.isConnected).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
  const r=obstacles.length?{left:Math.min(...obstacles.map(r=>r.left)),right:Math.max(...obstacles.map(r=>r.right)),top:Math.min(...obstacles.map(r=>r.top)),bottom:Math.max(...obstacles.map(r=>r.bottom))}:null;
  const t=tracked?.isConnected?tracked.getBoundingClientRect():null;
  overlay._box.hidden=!t||!t.width||!t.height||t.bottom<0||t.top>innerHeight;
  if(t)Object.assign(overlay._box.style,{left:`${Math.max(2,t.left-5)}px`,top:`${t.top-5}px`,width:`${t.width+10}px`,height:`${t.height+10}px`});
  const p=placeGuide(r,overlay._tip.getBoundingClientRect(),{width:innerWidth,height:innerHeight});
  Object.assign(overlay._tip.style,{left:`${p.left}px`,top:`${p.top}px`});
}
function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;position();});}
export function resetOverlay(){dismissed='';hideOverlay();}
export function hideOverlay(){overlay?.remove();overlay=null;tracked=null;avoid=null;lastKey='';removeEventListener('resize',schedule);removeEventListener('scroll',schedule,true);if(frame)cancelAnimationFrame(frame);frame=0;}
export function guideOverlay(target,guide,onAction=()=>{},obstacle=null){
  if(!guide){hideOverlay();return;}
  if(dismissed===guide.key)return;
  const key=JSON.stringify(guide);
  if(tracked===target&&key===lastKey&&overlay){avoid=obstacle;position();return;}
  hideOverlay();tracked=target;avoid=obstacle;lastKey=key;
  overlay=document.createElement('div');overlay.id='aibridge-live-guide';overlay._guardMenu=guide.key==='model-menu'||guide.key==='attach-menu';
  Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'2147483600',pointerEvents:'none'});
  const shadow=overlay.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=`*{box-sizing:border-box}[hidden]{display:none!important}.box{position:fixed;border:3px solid #ed8d56;border-radius:12px;box-shadow:0 0 0 6px #ed8d5626;pointer-events:none}.tip{position:fixed;width:min(348px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid #e3d3bb;border-radius:16px;background:#fffcf5;color:#293d33;padding:19px 22px;font:14px/1.65 'Malgun Gothic',system-ui,sans-serif;box-shadow:0 12px 42px #0003;pointer-events:auto;word-break:keep-all}.wide{width:min(500px,calc(100vw - 32px))}.eyebrow{display:block;color:#9b5635;font-size:11px;font-weight:700;margin-bottom:8px;padding-right:25px}h2{font-size:19px;line-height:1.5;letter-spacing:-.6px;margin:0 22px 8px 0}p{margin:0;white-space:pre-line}button,select{font:inherit}button{cursor:pointer}.close{position:absolute;right:12px;top:12px;border:0;background:transparent;color:#597263;font-size:20px}.actions{display:grid;gap:6px;margin-top:13px}.action{border:1px solid #d9e2d3;border-radius:9px;background:#f0f5eb;color:#315d45;padding:9px 12px;text-align:left;font-size:13px}.action:hover{background:#e0ead7}.subtle{background:transparent;color:#6d786f}.action:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #df834b;outline-offset:2px}details{border-top:1px solid #e4e6da;margin-top:13px;padding-top:10px}summary{cursor:pointer;font-size:12px;font-weight:700}details p{font-size:12px;line-height:1.75;margin-top:8px;white-space:pre-wrap;color:#4e6255}.source{font-size:10px;color:#758276;margin-top:6px}select{width:100%;margin-top:10px;padding:8px;border:1px solid #d5dfcf;border-radius:7px;background:white;color:#36543e}fieldset{border:0;padding:0;margin:14px 0}legend{font-weight:700;font-size:13px;margin-bottom:8px}label{display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:9px 0}input{margin-top:5px}.footer{font-size:11px;color:#778374;margin-top:12px}`;
  const el=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e;};
  style.textContent+='.block{margin-top:13px;padding:10px 12px;border-radius:8px;background:#f1f4e9}.block b{display:block;font-size:11px;color:#748060;margin-bottom:4px}.block p{font-size:13px;line-height:1.75}';
  style.textContent+='.action small{display:block;font-size:11px;font-weight:400;color:#627463;margin-top:3px}.tip{scrollbar-width:thin}.tip h2{scroll-margin-top:10px}';
  const box=el('div','box'),tip=el('section',`tip${guide.wide?' wide':''}`);tip.setAttribute('aria-label','AI Bridge 학습 안내');tip.setAttribute('role','region');
  // Reading a tooltip must not be treated as an outside click by ChatGPT's open menu.
  tip.addEventListener('pointerdown',event=>event.stopPropagation());
  tip.addEventListener('click',event=>event.stopPropagation());
  const close=el('button','close','×');close.setAttribute('aria-label','이 설명 잠시 숨기기');close.onclick=event=>{if(event.isTrusted){dismissed=guide.key;hideOverlay();}};
  tip.append(el('span','eyebrow',guide.eyebrow||'AI Bridge · 직접 해 보세요'),el('h2','',guide.title),el('p','',guide.text),close);
  for(const block of guide.blocks||[]){const section=el('div','block');section.append(el('b','',block.label),el('p','',block.text));tip.append(section);}
  for(const detail of guide.details||[]){const d=el('details');d.append(el('summary','',detail.title),el('p','',detail.text));if(detail.source)d.append(el('div','source',detail.source));d.addEventListener('toggle',schedule);tip.append(d);}
  for(const choice of guide.choices||[]){const select=el('select');select.setAttribute('aria-label',choice.label);for(const item of choice.options){const o=el('option','',item.label);o.value=item.value;o.selected=item.value===choice.value;select.append(o);}select.onchange=event=>{if(event.isTrusted)onAction(choice.id,select.value);};tip.append(select);}
  for(const q of guide.questions||[]){const group=el('fieldset');group.append(el('legend','',q.text));q.options.forEach((option,i)=>{const label=el('label'),input=el('input');input.type='radio';input.name=q.id;input.value=String(i);input.checked=q.answer===i;input.onchange=event=>{if(event.isTrusted)onAction('answer',`${q.id}:${i}`);};label.append(input,el('span','',option));group.append(label);});tip.append(group);}
  if(guide.actions?.length){const actions=el('div','actions');for(const a of guide.actions){const b=el('button',`action ${a.subtle?'subtle':''}`,a.label);if(a.description)b.append(el('small','',a.description));b.disabled=!!a.disabled;b.onclick=event=>{if(event.isTrusted&&!b.disabled){b.disabled=true;onAction(a.id,a.value);}};actions.append(b);}tip.append(actions);}
  if(guide.footer)tip.append(el('p','footer',guide.footer));
  shadow.append(style,box,tip);overlay._box=box;overlay._tip=tip;document.documentElement.append(overlay);
  position();addEventListener('resize',schedule);addEventListener('scroll',schedule,true);
}
