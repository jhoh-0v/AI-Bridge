import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const dir=path.dirname(fileURLToPath(import.meta.url));
const expected=JSON.parse(fs.readFileSync(path.join(dir,'../expected-values.json'),'utf8'));
const book=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,'../after.xlsx')));
const front=book.worksheets.getItem('연도선택 대시보드');
const data=book.worksheets.getItem('연도선택 데이터');
const checks=[];
for(const item of expected){
  front.getRange('D5').values=[[item.year]];
  book.recalculate();
  const kpi=['A12','E12','I12','M12'].map(address=>front.getRange(address).values[0][0]);
  const target=Object.values(item.metrics).map(m=>m.value);
  const yoy=data.getRange('B21:E21').values[0];
  const targetYoy=Object.values(item.metrics).map(m=>m.percent);
  const kpiMatches=kpi.every((v,i)=>typeof v==='number'&&Math.abs(v-target[i])<1e-7);
  const yoyMatches=yoy.every((v,i)=>item.year===2021?v===''||v==null:typeof v==='number'&&Math.abs(v-targetYoy[i])<1e-7);
  const chartCategories=data.getRange('I26:I29').values.map(r=>r[0]);
  const chartYoy=data.getRange('J26:J29').values.map(r=>r[0]);
  const chartMatches=chartCategories.join('|')==='매출액|영업이익|당기순이익|기말현금'&&chartYoy.every((v,i)=>item.year===2021?(v===''||v==null):typeof v==='number'&&Math.abs(v-targetYoy[i])<1e-7);
  const row={year:item.year,kpi,target,kpiMatches,yoy,targetYoy,yoyMatches,chartCategories,chartYoy,chartMatches,
    title:front.getRange('F5').values[0][0],conclusion:front.getRange('A7').values[0][0],
    kpiComparison:['A16','E16','I16','M16'].map(address=>front.getRange(address).values[0][0])};
  checks.push(row); console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(dir,'../recalculation-evidence.json'),JSON.stringify({engine:'@oai/artifact-tool; in-memory validation only; downloaded XLSX not rewritten',checks},null,2));
if(checks.some(r=>!r.kpiMatches||!r.yoyMatches||!r.chartMatches))process.exitCode=1;
