import { schemaFor, systemInstruction, assertArtifact, MODEL_SETTINGS, sha256 } from './artifact-schema.mjs';
export class ServiceError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export async function generateArtifact({taskId,source,prompt,model,previous,bucket,key,fetchImpl=fetch}) {
  if(!key)throw new ServiceError('실시간 생성 연결이 아직 준비되지 않았습니다. 관리자에게 API 연결을 요청해 주세요.',503);
  const headers={Authorization:`Bearer ${key}`};
  let endpoint,body,requestSettings;
  const instruction=systemInstruction(taskId);
  if(taskId==='image') {
    requestSettings={model,size:MODEL_SETTINGS.imageSize,quality:MODEL_SETTINGS.imageQuality,n:1,output_format:'png'};
    const imagePrompt=`[참고 자료]\n${source.text}\n\n[사용자 요청]\n${prompt}`;
    if(previous){
      const object=await bucket.get(previous.artifact.objectKey);if(!object)throw new ServiceError('수정할 원본 이미지가 없습니다.',409);
      const form=new FormData();for(const [k,v]of Object.entries(requestSettings))form.append(k,String(v));
      form.append('prompt',imagePrompt);form.append('image',new Blob([await object.arrayBuffer()],{type:'image/png'}),'original.png');
      body=form;endpoint='https://api.openai.com/v1/images/edits';
    } else {headers['Content-Type']='application/json';body=JSON.stringify({...requestSettings,prompt:imagePrompt});endpoint='https://api.openai.com/v1/images/generations';}
  } else {
    requestSettings={model,max_output_tokens:MODEL_SETTINGS.maxOutput,store:false};
    const input=[{role:'system',content:instruction},{role:'user',content:`[참고 자료]\n${source.text}\n\n[사용자 요청]\n${prompt}`}];
    if(previous)input.push({role:'assistant',content:JSON.stringify(previous.artifact)},{role:'user',content:`위 결과를 참고하여 다음 요청에 맞는 완성본을 작성하세요.\n${prompt}`});
    body=JSON.stringify({...requestSettings,input,text:{format:{type:'json_schema',name:taskId+'_artifact',strict:true,schema:schemaFor(taskId)}}});
    headers['Content-Type']='application/json';endpoint='https://api.openai.com/v1/responses';
  }
  const start=Date.now();let response;
  try{response=await fetchImpl(endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(240000)});}catch{throw new ServiceError('AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요. 이전 결과는 보존됩니다.',502);}
  const requestId=response.headers.get('x-request-id')||null;
  if(!response.ok){
    let code='';try{code=(await response.json()).error?.code||'';}catch{}
    if(response.status===429)throw new ServiceError(code.includes('quota')||code.includes('balance')?'API 사용 가능 크레딧을 확인해 주세요.':'요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.',429);
    if(response.status===401||response.status===403)throw new ServiceError('AI 연결 권한을 확인해야 합니다. 관리자에게 문의해 주세요.',503);
    throw new ServiceError('AI가 요청을 처리하지 못했습니다. 요청 내용을 확인하고 다시 시도해 주세요.',502);
  }
  const data=await response.json();let artifact,imageBytes;
  if(taskId==='image'){
    const encoded=data.data?.[0]?.b64_json;if(!encoded)throw new ServiceError('생성된 이미지를 받지 못했습니다.',502);
    const binary=atob(encoded);imageBytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const png=[137,80,78,71,13,10,26,10];
    if(imageBytes.length<33||!png.every((b,i)=>imageBytes[i]===b)||String.fromCharCode(...imageBytes.slice(12,16))!=='IHDR')throw new ServiceError('올바른 PNG 이미지를 받지 못했습니다.',502);
    const dimensions=new DataView(imageBytes.buffer,imageBytes.byteOffset,imageBytes.byteLength),width=dimensions.getUint32(16),height=dimensions.getUint32(20);
    if(!width||!height||width>8192||height>8192)throw new ServiceError('생성 이미지의 크기를 확인할 수 없습니다.',502);
    artifact={kind:'image',title:source.title,size:`${width}x${height}`,width,height,mime:'image/png'};
  }else{
    if(data.status && data.status!=='completed')throw new ServiceError('결과 생성이 완료되지 않았습니다. 요청을 더 짧게 작성해 주세요.',502);
    const text=data.output?.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    try{artifact=assertArtifact(JSON.parse(text),taskId);}catch{throw new ServiceError('AI가 사용할 수 있는 파일 형식을 반환하지 않았습니다. 다시 시도해 주세요.',502);}
  }
  return {artifact,imageBytes,receipt:{provider:'OpenAI',requestId,responseId:data.id||null,model:data.model||model,settings:requestSettings,usage:data.usage||null,latencyMs:Date.now()-start,instructionHash:await sha256(taskId==='image'?'[참고 자료] + [사용자 요청]':instruction),endpoint:taskId==='image'?(previous?'images/edits':'images/generations'):'responses'}};
}
