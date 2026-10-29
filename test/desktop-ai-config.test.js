import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { configureLocalAI, loadLocalAI } from '../desktop/ai-config.mjs';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aibridge-ai-config-'));
  const workspace = path.join(base, 'project'), userData = path.join(base, 'app-data');
  fs.mkdirSync(workspace); fs.mkdirSync(userData);
  t.after(() => {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.match(path.basename(base), /^aibridge-ai-config-/);
    fs.rmSync(base, { recursive: true });
  });
  return { base, workspace, userData, envFile: path.join(workspace, '.dev.vars') };
}

test('desktop reconnects from an approved file without copying credentials into its configuration', t => {
  const f = fixture(t), key = 'sk-test-fictional-configuration-only';
  fs.writeFileSync(f.envFile, `OPENAI_API_KEY=${key}\nOPENAI_TEXT_MODEL=gpt-test\nNODE_OPTIONS=unexpected\n`);
  const result = configureLocalAI(f);
  assert.equal(result.status, 'configured');
  assert.equal(fs.readFileSync(result.target, 'utf8').includes(key), false);
  const environment = {};
  assert.deepEqual(loadLocalAI({ ...f, environment }), { status: 'ready', source: 'local-file' });
  assert.deepEqual(environment, { OPENAI_API_KEY: key, OPENAI_TEXT_MODEL: 'gpt-test' });
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('desktop respects the launch environment and handles a missing or invalid saved file', t => {
  const f = fixture(t);
  assert.equal(loadLocalAI({ ...f, environment: {} }).status, 'missing');
  const environment = { OPENAI_API_KEY: 'sk-explicit-test-environment' };
  assert.deepEqual(loadLocalAI({ ...f, environment }), { status: 'ready', source: 'environment' });
  fs.writeFileSync(path.join(f.userData, 'operator-ai.json'), JSON.stringify({ version: 1, workspace: f.workspace, envFile: f.envFile }));
  assert.equal(loadLocalAI({ ...f, environment: {} }).status, 'unavailable');
  fs.writeFileSync(f.envFile, 'OPENAI_API_KEY=invalid');
  assert.equal(loadLocalAI({ ...f, environment: {} }).status, 'unavailable');
});

test('desktop rejects paths outside the registered workspace and non-environment files', t => {
  const f = fixture(t), outside = path.join(f.base, '.env');
  fs.writeFileSync(outside, 'OPENAI_API_KEY=sk-outside-test');
  assert.throws(() => configureLocalAI({ ...f, envFile: outside }));
  const document = path.join(f.workspace, 'document.txt');
  fs.writeFileSync(document, 'OPENAI_API_KEY=sk-document-test');
  assert.throws(() => configureLocalAI({ ...f, envFile: document }));
  fs.writeFileSync(path.join(f.userData, 'operator-ai.json'), JSON.stringify({ version: 1, workspace: f.workspace, envFile: outside }));
  const environment = {};
  assert.equal(loadLocalAI({ ...f, environment }).status, 'unavailable');
  assert.deepEqual(environment, {});
});
