import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 43127;
let server;
const base = `http://127.0.0.1:${port}`;

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT:String(port), GEMINI_API_KEY:'test-key-not-real', GEMINI_MODEL:'gemini-3.8-flash' },
    stdio:'ignore'
  });
  let ready = false;
  for (let attempt=0; attempt<40; attempt++) {
    try { const response=await fetch(`${base}/api/health`); if(response.ok){ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true,'server did not start');
});

after(() => { server?.kill('SIGTERM'); });

test('health endpoint reports app and configured model', async () => {
  const response=await fetch(`${base}/api/health`);
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.ok,true);
  assert.equal(data.model,'gemini-3.8-flash');
  assert.equal(data.configured,true);
});

test('homepage is served with security headers', async () => {
  const response=await fetch(base);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(await response.text(),/NEXORA AI/);
});

test('malformed JSON receives a controlled 400 response', async () => {
  const response=await fetch(`${base}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:'{invalid'});
  const data=await response.json();
  assert.equal(response.status,400);
  assert.match(data.error,/Ungültige Anfrage/);
});

test('unknown API endpoints return JSON 404', async () => {
  const response=await fetch(`${base}/api/not-real`);
  assert.equal(response.status,404);
  assert.equal((await response.json()).error,'API-Endpunkt nicht gefunden.');
});
