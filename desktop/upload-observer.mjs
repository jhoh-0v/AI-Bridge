import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const FILE_LIMIT=3*1024*1024,BODY_LIMIT=FILE_LIMIT+128*1024;
const header=(headers,name)=>String(Object.entries(headers||{}).find(([key])=>key.toLowerCase()===name)?.[1]||'');
export function isFileUpload(details,scope){
  if(!scope||details.webContentsId!==scope.webContentsId||!['POST','PUT'].includes(details.method)||!details.uploadData?.length)return false;
  let url;try{url=new URL(details.url);}catch{return false;}
  if(url.protocol!=='https:'||!(url.hostname==='chatgpt.com'||url.hostname.endsWith('.oaiusercontent.com')||url.hostname.endsWith('.blob.core.windows.net')))return false;
  const type=header(details.requestHeaders,'content-type').toLowerCase(),size=Number(header(details.requestHeaders,'content-length'));
  const fileRoute=details.method==='PUT'||/multipart\/form-data/.test(type)||details.uploadData.some(part=>part.file)||/\/(?:files|uploads?)(?:\/|$)/i.test(url.pathname);
  return fileRoute&&size<=BODY_LIMIT&&(/multipart\/form-data|application\/(?:octet-stream|vnd\.|msword)|text\/(?:csv|plain|markdown)/.test(type));
}

// Read only the body of a file upload in the active lesson. No headers, URL,
// credentials or file contents are retained in the learning record.
export async function uploadedFile(details,getBlobData){
  const chunks=[];let size=0,name='';
  for(const part of details.uploadData||[]){
    let bytes;
    if(part.bytes)bytes=Buffer.from(part.bytes);
    else if(part.file){
      const stat=await fs.lstat(part.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>FILE_LIMIT)return null;
      bytes=await fs.readFile(part.file);name=path.basename(part.file);
    }else if(part.blobUUID){
      const declared=Number(header(details.requestHeaders,'content-length'));
      if(!(declared>0&&declared<=BODY_LIMIT))return null;
      bytes=await getBlobData(part.blobUUID);
    }else return null;
    size+=bytes.length;if(size>BODY_LIMIT)return null;chunks.push(bytes);
  }
  let bytes=Buffer.concat(chunks),type=header(details.requestHeaders,'content-type');
  if(/multipart\/form-data/i.test(type)){
    const boundary=type.match(/boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i),marker=boundary&&Buffer.from('--'+(boundary[1]||boundary[2]));
    if(!marker||marker.length>202)return null;
    const files=[];let offset=bytes.indexOf(marker);
    while(offset>=0){
      const next=bytes.indexOf(marker,offset+marker.length);if(next<0)break;
      const start=bytes.indexOf('\r\n\r\n',offset+marker.length);
      if(start>0&&start<next&&start-offset<8192){
        const disposition=bytes.subarray(offset+marker.length,start).toString('utf8');
        const match=disposition.match(/content-disposition:[^\r\n]*filename="([^"\r\n]*)"/i);
        if(match)files.push({name:match[1].split(/[\\/]/).at(-1),bytes:bytes.subarray(start+4,next-2)});
      }
      offset=next;
    }
    if(files.length!==1)return null;
    ({name,bytes}=files[0]);
  }
  if(!bytes.length||bytes.length>FILE_LIMIT)return null;
  return {name:name.slice(0,180),sha256:createHash('sha256').update(bytes).digest('hex')};
}

export function createUploadObserver({getScope,onChange,readUpload=uploadedFile,getBlobData,now=Date.now}){
  const requests=new Map();let latest=null,proof=null;
  const current=entry=>{const scope=getScope();return scope&&entry.token===scope.token&&entry.sessionId===scope.sessionId&&entry.phase===scope.phase&&latest===entry;};
  function publish(entry){
    if(!entry.result||!entry.completed||!current(entry))return;
    proof={...entry.result,id:randomUUID(),token:entry.token,sessionId:entry.sessionId,phase:entry.phase,at:now()};onChange();
  }
  return {
    begin(details){
      const scope=getScope();if(!isFileUpload(details,scope))return;
      const entry={...scope,id:details.id,at:now(),result:null,completed:false};latest=entry;proof=null;
      for(const [id,old] of requests)if(now()-old.at>120000)requests.delete(id);
      requests.set(details.id,entry);onChange();
      Promise.resolve().then(()=>readUpload(details,getBlobData)).then(result=>{entry.result=result;publish(entry);}).catch(()=>{});
    },
    complete(details){
      const entry=requests.get(details.id);if(!entry)return;
      requests.delete(details.id);entry.completed=details.statusCode>=200&&details.statusCode<300;if(entry.completed)publish(entry);
    },
    fail(details){const entry=requests.get(details.id);requests.delete(details.id);if(entry===latest){latest=null;proof=null;onChange();}},
    get(){return proof&&current(latest)&&now()-proof.at<120000?proof:null;},
    clear(){latest=null;proof=null;requests.clear();}
  };
}
