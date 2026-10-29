import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

const CONFIG_NAME = 'operator-ai.json';
const validKey = value => typeof value === 'string' && /^sk-[A-Za-z0-9_-]+$/.test(value);

function readEnvironment(config) {
  if (config?.version !== 1 || !path.isAbsolute(config.workspace || '') || !path.isAbsolute(config.envFile || '')) throw Error('Invalid AI configuration');
  const workspace = path.resolve(config.workspace), envFile = path.resolve(config.envFile);
  const relative = path.relative(workspace, envFile);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw Error('Invalid AI configuration');
  if (!/^\.(?:dev\.vars|env(?:\.[\w-]+)?)$/.test(path.basename(envFile))) throw Error('Invalid environment file');
  let current = envFile;
  for (;;) {
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('Linked environment files are not supported');
    if (!path.relative(workspace, current)) break;
    current = path.dirname(current);
  }
  const stat = fs.statSync(envFile);
  if (!stat.isFile() || stat.size > 65536) throw Error('Invalid environment file');
  const values = parseEnv(fs.readFileSync(envFile, 'utf8'));
  if (!validKey(values.OPENAI_API_KEY)) throw Error('Missing API key');
  return values;
}

// Store only the approved file's location. The key remains in that file and the
// main process; it is never copied into app data, renderer state, or the EXE.
export function configureLocalAI({ workspace, envFile, userData }) {
  const config = { version: 1, workspace: path.resolve(workspace), envFile: path.resolve(envFile) };
  readEnvironment(config);
  fs.mkdirSync(userData, { recursive: true });
  const target = path.join(userData, CONFIG_NAME);
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw Error('Invalid configuration destination');
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return { status: 'configured', target, envFile: config.envFile };
}

export function loadLocalAI({ userData, environment = process.env }) {
  if (validKey(environment.OPENAI_API_KEY)) return { status: 'ready', source: 'environment' };
  const target = path.join(userData, CONFIG_NAME);
  if (!fs.existsSync(target)) return { status: 'missing' };
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw Error('Invalid AI configuration');
    const values = readEnvironment(JSON.parse(fs.readFileSync(target, 'utf8')));
    environment.OPENAI_API_KEY = values.OPENAI_API_KEY;
    if (!environment.OPENAI_TEXT_MODEL && /^[A-Za-z0-9._-]+$/.test(values.OPENAI_TEXT_MODEL || '')) environment.OPENAI_TEXT_MODEL = values.OPENAI_TEXT_MODEL;
    return { status: 'ready', source: 'local-file' };
  } catch {
    return { status: 'unavailable' };
  }
}
