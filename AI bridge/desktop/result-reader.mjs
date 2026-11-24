export const RESULT_READER_VERSION=2;
export function needsResultRead(download,flow,{adaptive,expected,turnId}){
  if(download.status!=='completed'||!flow.turns.some(t=>t.id===download.scope?.turnId))return false;
  if(!adaptive&&(!expected.test(download.name)||download.scope.turnId!==turnId||flow.linked.some(l=>l.downloadId===download.id)))return false;
  const artifact=flow.artifacts?.[download.id];
  return !artifact||artifact.status==='reading'||artifact.readerVersion!==RESULT_READER_VERSION;
}
