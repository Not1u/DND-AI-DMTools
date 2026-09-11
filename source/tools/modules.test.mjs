import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createModuleStore, extractModule } from '../src/modules.mjs';
import { startServer } from '../server.mjs';

import {pdfFixture} from './pdf-fixture.mjs';
export {pdfFixture} from './pdf-fixture.mjs';

test('PDF import is searchable immediately, survives restart, and deduplicates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-modules-'));
  let server;
  try {
    server = await startServer({ dataRoot: root, port: 0, bind: '127.0.0.1' });
    const api = async (op, args = {}) => (await (await fetch(server.url + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }) })).json()).value;
    const before = await api('mod.list'); assert.equal(before.total, 624);
    const upload = async bytes => (await fetch(server.url + '/api/modules?filename=Moonstone.pdf', { method: 'POST', body: bytes })).json();
    const bytes = pdfFixture();
    const result = await upload(bytes); assert.equal(result.ok, true, result.error); assert.ok(result.count > 0);
    const search = await api('mod.search', { query: 'Moonstone' });
    const hit = search.items.find(e => e.id.startsWith('upload:')); assert.ok(hit);
    assert.match((await api('mod.read', { id: hit.id })).text, /secret passage/);
    assert.ok((await api('rules.search', { query: 'Moonstone' })).items.some(e => e.id === hit.id));
    assert.equal((await upload(bytes)).duplicate, true);
    const restored = createModuleStore(root); assert.equal((await restored.list()).length, 1);
    assert.match((await restored.entries())[0].text, /Moonstone/);
    const invalid = await upload(Buffer.from('broken')); assert.equal(invalid.ok, false);
    assert.equal((await restored.list()).length, 1);
    await fs.mkdir(path.resolve('build'), { recursive: true });
    await fs.writeFile(path.resolve('build/module-smoke.pdf'), pdfFixture('Moonstone secret passage 月石洞穴', true));
  } finally { await server?.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('text/JSON imports validate content and preserve UTF-8', async () => {
  assert.match((await extractModule('中文.pdf', pdfFixture('月石洞穴秘密通道', true)))[0].text, /月石洞穴秘密通道/);
  assert.equal((await extractModule('冒险.md', Buffer.from('月石洞穴：秘门。')))[0].text, '月石洞穴：秘门。');
  assert.equal((await extractModule('冒险.json', Buffer.from(JSON.stringify([{ title: '入口', text: '密道' }]))))[0].title, '入口');
  await assert.rejects(extractModule('empty.txt', Buffer.from('  ')), /没有提取到文字/);
  await assert.rejects(extractModule('bad.json', Buffer.from('null')), /JSON/);
  await assert.rejects(extractModule('run.exe', Buffer.from('anything')), /支持/);
  await assert.rejects(extractModule('empty.pdf', pdfFixture('')), /OCR/);
});
