export const colName = i => String.fromCharCode(65+i);
const address = str => { const m=/^\$?([A-Z]{1,2})\$?(\d+)$/.exec(str); if(!m) throw Error('셀 주소 오류'); return [Number(m[2])-1,[...m[1]].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1]; };
export function calculator(book) {
  const cache = new Map(), active = new Set();
  function cell(sheet,r,c) {
    const key=`${sheet}!${r}:${c}`;
    if(cache.has(key)) return cache.get(key);
    if(active.has(key)) throw Error('순환 참조');
    const s=book.sheets.find(s=>s.name===sheet); if(!s) throw Error('시트 참조 오류');
    const raw=s.rows[r]?.[c]??0;
    if(typeof raw!=='string'||!raw.startsWith('=')) return raw;
    active.add(key);
    try {const result=evaluate(raw.slice(1),sheet); if(typeof result==='number'&&!Number.isFinite(result)) throw Error('0 나눗셈 또는 범위 오류'); cache.set(key,result);return result;}
    finally{active.delete(key);}
  }
  function evaluate(expr,sheet) {
    if(expr.length>1200) throw Error('수식이 너무 깁니다');
    const pattern=/\s*(?:('(?:[^']|'')+'|"(?:[^"]|"")*"|\$?[A-Z]{1,2}\$?\d+|[\p{L}_][\p{L}\p{N}_ ]*|\d+(?:\.\d+)?|[!,:()+\-*/%^]))/uy;
    const tokens=[];let position=0,m;
    while(position<expr.length){pattern.lastIndex=position;m=pattern.exec(expr);if(!m) {if(!expr.slice(position).trim())break;throw Error('지원하지 않는 수식');} tokens.push(m[1].trim());position=pattern.lastIndex;}
    let i=0;
    const peek=()=>tokens[i], take=()=>tokens[i++], expect=t=>{if(take()!==t)throw Error('수식 구문 오류');};
    const number=v=>{if(Array.isArray(v))throw Error('단일 셀 필요'); if(v===''||v==null)return 0;if(typeof v==='number')return v;const n=Number(v);if(!Number.isFinite(n))throw Error('숫자가 아닌 셀');return n;};
    const flat=values=>values.flat(Infinity).filter(v=>typeof v==='number');
    function range(ref,refSheet){
      const [r,c]=address(ref);
      if(peek()!==':')return cell(refSheet,r,c);
      take();const [er,ec]=address(take());if(r>er||c>ec||er>1000||ec>30)throw Error('범위 오류');
      const values=[];for(let rr=r;rr<=er;rr++)for(let cc=c;cc<=ec;cc++)values.push(cell(refSheet,rr,cc));return values;
    }
    function atom(){
      let token=take();if(token==null)throw Error('수식이 비어 있어요');
      if(token==='-')return -number(atom());if(token==='+')return number(atom());
      if(token==='('){const v=sum();expect(')');return v;}
      if(token.startsWith('"'))return token.slice(1,-1).replaceAll('""','"');
      if(/^\d/.test(token))return Number(token);
      if(peek()==='!'){take();const ref=take();return range(ref,token.startsWith("'")?token.slice(1,-1).replaceAll("''","'"):token);}
      if(/^\$?[A-Z]{1,2}\$?\d+$/.test(token))return range(token,sheet);
      expect('(');const args=[];if(peek()!==')'){do{args.push(sum());if(peek()!==',')break;take();}while(true);}expect(')');
      const nums=flat(args), fn=token.toUpperCase();
      if(fn==='SUM')return nums.reduce((a,b)=>a+b,0);
      if(fn==='COUNT')return nums.length;
      if(fn==='AVERAGE'){if(!nums.length)throw Error('빈 평균');return nums.reduce((a,b)=>a+b,0)/nums.length;}
      if(fn==='MIN')return nums.length?Math.min(...nums):0;
      if(fn==='MAX')return nums.length?Math.max(...nums):0;
      if(fn==='ROUND')return Math.round(number(args[0])*10**number(args[1]))/10**number(args[1]);
      if(fn==='SUMIF'){
        const values=Array.isArray(args[0])?args[0]:[args[0]], sums=args[2]===undefined?values:Array.isArray(args[2])?args[2]:[args[2]];
        if(values.length!==sums.length)throw Error('SUMIF 범위 크기 불일치');
        return values.reduce((total,v,k)=>total+(String(v)===String(args[1])?number(sums[k]):0),0);
      }
      throw Error('지원하지 않는 함수: '+token);
    }
    function power(){let v=atom();if(peek()==='%'){take();v=number(v)/100;}if(peek()==='^'){take();v=number(v)**number(power());}return v;}
    function product(){let v=power();while(['*','/'].includes(peek())){const op=take(),b=number(power());v=op==='*'?number(v)*b:number(v)/b;}return v;}
    function sum(){let v=product();while(['+','-'].includes(peek())){const op=take(),b=number(product());v=op==='+'?number(v)+b:number(v)-b;}return v;}
    const result=sum();if(i!==tokens.length)throw Error('수식 끝을 확인해 주세요');return result;
  }
  return { cell, evaluate, safe:(sheet,r,c)=>{try{return {value:cell(sheet,r,c),error:null};}catch(e){return {value:'#ERROR!',error:e.message};}} };
}
export function inspectWorkbook(book, material) {
  const calc=calculator(book), values=[], errors=[];let formulas=0;
  for(const s of book.sheets) s.rows.forEach((row,r)=>row.forEach((raw,c)=>{const v=calc.safe(s.name,r,c);values.push(v.value);if(v.error)errors.push({sheet:s.name,cell:colName(c)+(r+1),error:v.error});if(typeof raw==='string'&&raw.startsWith('='))formulas++;}));
  const sourceRows=material.csv.split('\n').slice(1).map(line=>line.split(','));
  const allRows=book.sheets.flatMap(s=>s.rows);
  const preserved=sourceRows.filter(row=>allRows.some(other=>row.every((c,i)=>String(other[i])===String(c)))).length;
  return { formulas, errors, preserved, totalRows:sourceRows.length, totalFound:values.some(v=>typeof v==='number'&&Math.abs(v-material.total)<0.001), monthlyFound:material.monthly.filter(n=>values.some(v=>typeof v==='number'&&Math.abs(v-n)<0.001)).length };
}
export function automaticChecks(task, artifact, independent=false) {
  const material=independent?task.challenge:task.material;
  if(artifact?.kind==='workbook'){
    const report=inspectWorkbook(artifact,material);
    return [
      {label:'원자료 행 보존',value:`${report.preserved}/${report.totalRows}행`,pass:report.preserved===report.totalRows},
      {label:'계산 가능한 수식',value:`${report.formulas}개 · 오류 ${report.errors.length}개`,pass:report.formulas>=6&&report.errors.length===0},
      {label:'전체 합계 대조',value:report.totalFound?`${material.total.toLocaleString('ko-KR')}원 확인`:'정확한 합계를 찾지 못했어요',pass:report.totalFound},
      {label:'월별 합계 대조',value:`${report.monthlyFound}/3개`,pass:report.monthlyFound===3}
    ];
  }
  if(artifact?.kind==='presentation') return [
    {label:'슬라이드 수',value:`${artifact.slides.length}장 / 목표 ${material.slideCount}장`,pass:artifact.slides.length===material.slideCount},
    {label:'발표 대본 포함',value:`${artifact.slides.filter(s=>s.notes?.trim()).length}/${artifact.slides.length}장`,pass:artifact.slides.every(s=>s.notes?.trim())},
    {label:'장별 핵심 문장',value:'각 장 4개 이하',pass:artifact.slides.every(s=>s.bullets.length<=4)},
    {label:'수치·내용의 정확성',value:'원자료와 직접 대조 필요',pass:null}
  ];
  if(artifact?.kind==='image') return [
    {label:'생성 크기',value:artifact.size,pass:artifact.size===material.size},
    {label:'문구·장면의 정확성',value:'확대해서 직접 확인 필요',pass:null}
  ];
  return [{label:'사실·요청 조건',value:'아래 기준과 원자료로 직접 확인해요',pass:null}];
}
