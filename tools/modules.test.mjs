import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createModuleStore, extractModule } from '../src/modules.mjs';
import { startServer } from '../server.mjs';

export function pdfFixture(text = 'Moonstone caverns secret passage', chinese = false) {
  const value = chinese ? '<' + Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>' : '(' + text + ')';
  const stream = 'BT /F1 18 Tf 40 120 Td ' + value + ' Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream'];
  if (chinese) {
    objects[3] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>';
    objects.push('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 7 0 R >>');
    objects.push('<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>');
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n'; });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf);
}

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
