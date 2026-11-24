// ExcelJS expects unprefixed spreadsheet/package elements. Some valid exporters
// use <x:workbook> etc. Adapt a parsing copy; keep the original bytes and hash.
const supported=new Set([
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://schemas.openxmlformats.org/package/2006/relationships',
  'http://schemas.openxmlformats.org/package/2006/content-types'
]);
export function normalizeOfficeXml(xml){
  const root=xml.match(/<([\w.-]+):[\w.-]+\b[^>]*>/)?.[0];
  if(!root)return xml;
  const namespaces=[...root.matchAll(/xmlns:([\w.-]+)\s*=\s*(["'])([^"']+)\2/g)].filter(m=>supported.has(m[3]));
  for(const [,prefix,,uri] of namespaces){
    const escaped=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const declarations=[...xml.matchAll(new RegExp(`xmlns:${escaped}\\s*=\\s*(["'])([^"']+)\\1`,'g'))];
    if(declarations.some(m=>m[2]!==uri))throw Error('네임스페이스가 재정의된 파일은 아직 검사할 수 없어요.');
    xml=xml.replace(new RegExp(`<(/?)${escaped}:`,'g'),'<$1');
  }
  return xml;
}
