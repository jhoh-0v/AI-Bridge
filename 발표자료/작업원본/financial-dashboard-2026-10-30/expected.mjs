import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const evidence=JSON.parse(fs.readFileSync(path.join(dir,'session-evidence.json'),'utf8'));
const cells=new Map(evidence.source.sheets[0].cells.map(c=>[c.address,c.value]));
const fields={revenue:19,operatingIncome:22,netIncome:24,cash:37};
const years=[2021,2022,2023,2024,2025].map((year,i)=>{
  const col=String.fromCharCode(68+i),previous=String.fromCharCode(67+i);
  const metrics=Object.fromEntries(Object.entries(fields).map(([name,row])=>{
    const current=cells.get(col+row),prior=i?cells.get(previous+row):null;
    return [name,{value:current,source:col+row,prior,delta:i?current-prior:null,percent:i?(current/prior-1)*100:null}];
  }));
  return {year,metrics,netMarginCalculated:metrics.netIncome.value/metrics.revenue.value*100,
    incomeStatementMargin:cells.get(col+'30'),separateMargin:cells.get(col+'47'),
    balanceDifference:cells.get(col+'8')-cells.get(col+'12')-cells.get(col+'16')};
});
fs.writeFileSync(path.join(dir,'expected-values.json'),JSON.stringify(years,null,2));
console.log(JSON.stringify(years.filter(r=>[2021,2023,2025].includes(r.year)),null,2));
