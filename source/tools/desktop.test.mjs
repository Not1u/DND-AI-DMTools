import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeData } from '../desktop/storage.mjs';
import { startServer } from '../server.mjs';
test('desktop fresh start, upgrade preservation and packaged-resource separation', async () => {
 const home = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-desktop-'));
 let runtime;
 try {
  const root = await initializeData(home, '0.2.0');
  await assert.rejects(fs.access(path.join(root, 'data', 'ai.json')));
  const save = path.join(root, 'data', 'ai.json');
  const original = '{"config":{"apiKey":"test-only-placeholder"},"messages":[]}';
  await fs.writeFile(save, original);
  await initializeData(home, '0.3.0');
  assert.equal(await fs.readFile(save,'utf8'),original);
  runtime = await startServer({dataRoot:root,port:0,bind:'127.0.0.1'});
  const health = await (await fetch(runtime.url+'/health')).json();
  assert.equal(health.ok,true); assert.ok(health.coreOps>70);
  assert.equal(health.plugins.length,3);
  assert.ok(health.plugins.every(p=>!p.error));
  const api=async op=>(await (await fetch(runtime.url+'/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,args:{}})})).json());
  assert.equal((await api('party.list')).ok,true);
  assert.equal((await api('rules.stats')).ok,true);
  assert.equal((await fetch(runtime.url+'/app/ui-client.js')).status,200);
  assert.equal((await fetch(runtime.url+'/files/data/ai.json')).status,403);
  assert.equal((await fetch(runtime.url+'/api',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'})).status,403);
 } finally { await runtime?.close(); await fs.rm(home,{recursive:true,force:true}); }
});
