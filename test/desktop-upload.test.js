import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { uploadedFile, isFileUpload, createUploadObserver } from '../desktop/upload-observer.mjs';
import { attachmentState, attachmentNameFromLabel, sameAttachmentName } from '../desktop/guide-model.mjs';

const content=Buffer.from('항목,건수\n문의,20\n해결,15\n');
const sha256=createHash('sha256').update(content).digest('hex');
const scope={token:'lesson-a',sessionId:'session-a',phase:0,webContentsId:5};
const request=(id=1)=>({id,webContentsId:5,url:'https://files.oaiusercontent.com/upload',method:'PUT',requestHeaders:{'Content-Type':'text/csv','Content-Length':String(content.length)},uploadData:[{bytes:content}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('raw and multipart uploads verify original bytes, including Korean renamed copies',async()=>{
  assert.deepEqual(await uploadedFile(request()),{name:'',sha256});
  const bytes=Buffer.concat([Buffer.from('--boundary\r\nContent-Disposition: form-data; name="file"; filename="운영현황(4).csv"\r\nContent-Type: text/csv\r\n\r\n'),content,Buffer.from('\r\n--boundary--\r\n')]);
  const data=await uploadedFile({...request(),requestHeaders:{'Content-Type':'multipart/form-data; boundary=boundary'},uploadData:[{bytes}]});
  assert.deepEqual(data,{name:'운영현황(4).csv',sha256});
  assert.equal(sameAttachmentName(data.name,'운영현황.csv'),true);
  assert.equal(attachmentNameFromLabel('운영현황(4).csv 제거'),data.name);
  assert.equal(attachmentNameFromLabel('Remove 운영현황(4).csv'),data.name);
  assert.equal(attachmentState({material:{file:{sha256}}},data,true).state,'ready');
  assert.equal(attachmentState({material:{file:{sha256:'0'.repeat(64)}}},data,true).state,'wrong');
  assert.equal(attachmentState({material:{file:{sha256}}},data,false).state,'uploading');
  assert.equal(attachmentState({},null,true).state,'missing');
  assert.equal(attachmentState({}, {reading:true},true).state,'uploading');
});

test('only bounded file uploads from the lesson web contents are observed',async()=>{
  assert.equal(isFileUpload(request(),scope),true);
  for(const patch of [{webContentsId:8},{url:'https://evil.example/upload'},{url:'https://chatgpt.com.evil.example/upload'},{method:'GET'},{requestHeaders:{'Content-Type':'application/json'}},{requestHeaders:{'Content-Type':'text/csv','Content-Length':9999999}}])assert.equal(isFileUpload({...request(),...patch},scope),false);
  assert.equal(isFileUpload(request(),null),false);
  assert.equal(isFileUpload({...request(),url:'https://chatgpt.com/events',method:'POST',requestHeaders:{'Content-Type':'text/plain'}},scope),false);
  let calls=0;
  assert.equal(await uploadedFile({...request(),requestHeaders:{},uploadData:[{blobUUID:'blob'}]},async()=>{calls++;return content;}),null);
  assert.equal(calls,0);
  assert.deepEqual(await uploadedFile({...request(),uploadData:[{blobUUID:'blob'}]},async()=>content),{name:'',sha256});
  assert.equal(await uploadedFile({...request(),uploadData:[{bytes:Buffer.alloc(4*1024*1024)}]}),null);
});

test('proof waits for successful upload and cannot cross lessons, removals, errors or expiry',async()=>{
  let current=scope,clock=1000;
  const observer=createUploadObserver({getScope:()=>current,onChange:()=>{},now:()=>clock});
  observer.begin(request());await tick();assert.equal(observer.get(),null);
  observer.complete({id:1,statusCode:201});assert.equal(observer.get().sha256,sha256);
  current={...scope,token:'lesson-b'};assert.equal(observer.get(),null);
  current=scope;observer.clear();assert.equal(observer.get(),null);
  observer.begin(request(2));observer.complete({id:2,statusCode:403});await tick();assert.equal(observer.get(),null);
  observer.begin(request(3));observer.fail({id:3});await tick();assert.equal(observer.get(),null);
  observer.begin(request(4));observer.complete({id:4,statusCode:200});await tick();assert.equal(observer.get().sha256,sha256);
  clock+=120001;assert.equal(observer.get(),null);
});

test('a delayed older file digest never replaces a newer upload',async()=>{
  const resolvers=new Map();
  const observer=createUploadObserver({getScope:()=>scope,onChange:()=>{},readUpload:details=>new Promise(resolve=>resolvers.set(details.id,resolve))});
  observer.begin(request(1));observer.begin(request(2));await tick();
  observer.complete({id:1,statusCode:200});observer.complete({id:2,statusCode:200});
  resolvers.get(2)({name:'new.csv',sha256});await tick();
  resolvers.get(1)({name:'old.csv',sha256:'0'.repeat(64)});await tick();
  assert.equal(observer.get().name,'new.csv');
});
