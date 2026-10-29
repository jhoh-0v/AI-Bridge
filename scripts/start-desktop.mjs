import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Operator-only local launch. Secrets remain outside the packaged application.
const root=fileURLToPath(new URL('../',import.meta.url));
const envFile=path.join(root,'.dev.vars');
if(fs.existsSync(envFile))process.loadEnvFile(envFile);
const child=spawn(path.join(root,'desktop','node_modules','electron','dist','electron.exe'),['.',...process.argv.slice(2)],{cwd:path.join(root,'desktop'),env:process.env,stdio:'inherit'});
child.on('error',()=>{console.error('앱 실행 파일을 찾지 못했어요.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
