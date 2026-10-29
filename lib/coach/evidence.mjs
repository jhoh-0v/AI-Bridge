import { curriculumForSession } from './source.mjs';
export function cleanArtifact(value){
 if(!value)return null;
 if(!['presentation','image','document'].includes(value.kind))throw Error('결과 파일의 종류를 확인해 주세요.');
 return {kind:value.kind,text:String(value.text||'').slice(0,60000),slideCount:Math.max(0,Math.min(200,Number(value.slideCount)||0)),width:Math.max(0,Math.min(50000,Number(value.width)||0)),height:Math.max(0,Math.min(50000,Number(value.height)||0))};
}
export function checkArtifact(session,{artifact,output,file},phase=session.phase){
 const plan=curriculumForSession(session,phase),format=plan?.format||'text';
 const present=format==='text'?output?.length>=15||artifact?.text?.length>=15:format==='pptx'?artifact?.kind==='presentation'&&artifact.slideCount>0:format==='image'?artifact?.kind==='image'&&artifact.width>0:!!file;
 const checks=[{id:'result',label:'실제 결과 확인',pass:!!present,value:format==='text'?'받은 답변 보관':file?.name||'파일 확인 필요'},...(plan?.checks||['원자료와 목표 대조']).map((text,i)=>({id:`criterion-${i}`,label:text,pass:null,manual:true,value:'실제 결과에서 직접 확인'}))];
 if(format==='pptx'&&session.exercise?.mode==='sample')checks.splice(1,0,{id:'slides',label:'슬라이드 5장',pass:artifact?.slideCount===5,value:`${artifact?.slideCount||0}장`});
 return {checks,passed:checks.filter(c=>c.pass===true).length,total:checks.length,allPassed:false,manual:true,scope:'자동으로 확인한 파일 정보와 직접 확인할 내용 기준을 구분합니다. 문장·이미지의 정확성을 자동 통과 처리하지 않습니다.',errors:[]};
}

export function cleanLearningContext(value){
 if(!value||typeof value.goal!=='string'||!Array.isArray(value.checks))return null;
 return {goal:value.goal.slice(0,300),checks:value.checks.filter(c=>typeof c==='string').slice(0,4).map(c=>c.slice(0,180)),inputHash:String(value.inputHash||'').slice(0,64)};
}
export function checkDialogueEvidence(session,evidence){
 const context=evidence.learningContext,plan=curriculumForSession(session,evidence.phase);
 const present=!!evidence.workbook||!!evidence.artifact||!!evidence.output?.trim();
 const checks=[{id:'result',label:'실제로 받은 답변 또는 파일',pass:present,value:evidence.file?.name||'대화 답변 보관'},...(context?.checks||plan?.checks||['요청과 결과를 대조했나요?']).map((label,i)=>({id:`criterion-${i}`,label,pass:null,manual:true,value:'원자료·요청과 직접 대조'}))];
 return {checks,passed:present?1:0,total:checks.length,allPassed:false,manual:true,scope:'대화에 맞춘 확인 기준입니다. AI 피드백은 자동 합격 판정이 아니에요.',errors:[]};
}
