export const normalizeText = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();

export function matchesUserRequest(attempt, rendered) {
  const expected=normalizeText(attempt.text);
  let actual=normalizeText(rendered);
  // Collapsed long messages append a standalone visual ellipsis after the full
  // text. It is not another request, and shortened excerpts still cannot match.
  if(expected.length>100&&actual===expected+' …')actual=expected;
  if(actual===expected)return true;
  if(!expected||!actual.endsWith(expected))return false;
  let prefix=actual.slice(0,-expected.length).trim();
  // ChatGPT adds a selected spreadsheet range chip before the actual message.
  // Accept only the exact count label; arbitrary added text is still rejected.
  prefix=prefix.replace(/^(?:셀\s*[\d,]+\s*개|[\d,]+\s+cells?)\s*/i,'');
  if(!prefix)return true;
  if(!attempt.attachmentName)return false;
  const compact=v=>String(v).normalize('NFC').toLowerCase().replace(/[\s_.\-]/g,'');
  const name=compact(attempt.attachmentName),stem=compact(attempt.attachmentName.replace(/\.(csv|xlsx|txt|md|docx|pptx)$/i,''));
  if(!stem||!compact(prefix).includes(stem))return false;
  return compact(prefix).split(name).join('').split(stem).join('').replace(/스프레드시트|spreadsheet|프레젠테이션|presentation|텍스트|text|문서|document|다운로드|download|열기|open|csv|xlsx|docx|pptx|txt|md/g,'')==='';
}
