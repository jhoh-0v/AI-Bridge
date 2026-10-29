import { showHighlight } from './content-preview.js';
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.source!=='ai-bridge-preview')return;showHighlight(e.data.target);});
document.getElementById('composer-plus-btn').addEventListener('click',()=>{document.getElementById('feedback').textContent='실제 ChatGPT에서는 이 위치의 버튼을 눌러 파일을 선택합니다.';});
