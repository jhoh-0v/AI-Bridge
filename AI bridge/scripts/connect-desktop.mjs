import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureLocalAI } from '../desktop/ai-config.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'win32' || !process.env.APPDATA) {
  console.error('이 연결 명령은 Windows 앱에서 사용해 주세요.');
  process.exitCode = 1;
} else {
  try {
    const result = configureLocalAI({ workspace, envFile: path.join(workspace, '.dev.vars'), userData: path.join(process.env.APPDATA, 'AI Bridge') });
    console.log(JSON.stringify(result));
  } catch {
    console.error('승인된 .dev.vars의 연결 설정을 확인해 주세요. 키 값은 표시하지 않았어요.');
    process.exitCode = 1;
  }
}
