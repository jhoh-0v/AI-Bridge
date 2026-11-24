import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readSpreadsheetArtifactFile} from '../../../AI bridge/lib/coach/read-xlsx.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const sid='fef5612d-5a0c-46d8-8458-ec58e4affa24';
const appDir=path.join(process.env.APPDATA,'AI Bridge');
const flow=JSON.parse(fs.readFileSync(path.join(appDir,'practice-flows.json'),'utf8')).flows[sid];
const sourceBytes=fs.readFileSync(path.join(dir,'source.xlsx'));
const source=(await readSpreadsheetArtifactFile(new File([sourceBytes],'source.xlsx'))).artifact;
const evidence={at:new Date().toISOString(),sessionId:sid,conversation:flow.conversation,
  sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),
  beforeSha256:createHash('sha256').update(fs.readFileSync(path.join(dir,'before.xlsx'))).digest('hex'),
  turns:flow.turns,responses:flow.responses,coach:flow.liveCoach,linked:flow.linked,
  artifacts:flow.artifacts,source};
fs.writeFileSync(path.join(dir,'session-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({turns:evidence.turns.map(t=>({id:t.id,phase:t.phase,text:t.text})),coach:{status:flow.liveCoach?.status,title:flow.liveCoach?.title,action:flow.liveCoach?.action}},null,2));
if(process.argv.includes('--source')) console.log(JSON.stringify(source.sheets.map(s=>({name:s.name,cells:s.cells.map(c=>[c.address,c.value])})),null,2));
