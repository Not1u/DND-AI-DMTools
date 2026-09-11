import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export const MAX_MODULE_BYTES = 50 * 1024 * 1024;
const formats = new Set(['.pdf', '.txt', '.md', '.json']);
export async function extractModule(filename, data, options = {}) {
  const ext = path.extname(filename).toLowerCase();
  if (!formats.has(ext)) throw new Error('支持 PDF、TXT、Markdown 和 JSON 文件。');
  if (!data.length || data.length > MAX_MODULE_BYTES) throw new Error('文件不能为空，且不能超过 50 MB。');
  let sections, pageCount = 0;
  if (ext === '.pdf') {
    if (!data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('这不是有效的 PDF 文件。');
    const { PDFParse } = await import('pdf-parse');
    const pdfRoot = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
    const parser = new PDFParse({ data: new Uint8Array(data), isEvalSupported: false,
      cMapUrl: path.join(pdfRoot, 'cmaps').replaceAll('\\', '/') + '/', cMapPacked: true,
      standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/') + '/' });
    try {
      const result = await parser.getText();
      pageCount = result.total || result.pages.length;
      sections = result.pages.map(page => ({ title: '第 ' + page.num + ' 页', text: page.text }));
    } catch (error) {
      throw new Error('PDF 读取失败，请确认文件未加密且没有损坏。' + (error.name === 'PasswordException' ? '请先解除密码保护。' : ''));
    } finally { await parser.destroy(); }
  } else {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); }
    catch { throw new Error('文本文件请使用 UTF-8 编码。'); }
    if (ext === '.json') {
      let value;
      try { value = JSON.parse(text); } catch { throw new Error('JSON 格式不正确。'); }
      sections = Array.isArray(value) ? value : value && (value.entries || [value]);
      if (!Array.isArray(sections) || sections.some(e => !e || typeof e.text !== 'string')) throw new Error('JSON 应为 {title, text} 或包含这些条目的数组。');
    } else sections = [{ title: path.basename(filename, ext), text }];
  }
  const chunks = [];
  for (const [index, section] of sections.entries()) {
    const text = section.text.replace(/\u0000/g, '').trim();
    for (let offset = 0; offset < text.length; offset += 6000) {
      chunks.push({ title: String(section.title || ('条目 ' + (index + 1))).slice(0, 200) + (text.length > 6000 ? ' · ' + (Math.floor(offset / 6000) + 1) : ''), text: text.slice(offset, offset + 6000) });
    }
  }
  if ((!chunks.length || !chunks.some(c => /[\p{L}\p{N}]/u.test(c.text))) && !(options.allowImageOnly && ext === '.pdf')) throw new Error('没有提取到文字。扫描版 PDF 请先进行 OCR 文字识别，再上传。');
  if (chunks.reduce((n, c) => n + c.text.length, 0) > 5_000_000) throw new Error('文字内容过多，请拆分为较小的模组文件。');
  chunks.pageCount = pageCount;
  return chunks;
}

export function createModuleStore(root) {
  const dir = path.join(root, 'data', 'modules');
  let cache;
  let importing = false;
  async function records() {
    if (cache) return cache;
    let names;
    try { names = await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const items = [];
    for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      items.push(JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')));
    }
    cache = items;
    return items;
  }
  return {
    async pdf(id) {
      if(!/^[a-f0-9]{64}$/.test(String(id)))throw new Error('模组标识无效。');
      const record=(await records()).find(r=>r.id===id);if(!record)throw new Error('模组不存在。');
      try{return {record,data:await fs.readFile(path.join(dir,id+'.pdf'))}}catch(e){if(e.code==='ENOENT')throw new Error('旧模组没有保存 PDF 原件，请重新上传同一 PDF。');throw e}
    },
    async entries() { return (await records()).flatMap(r => r.entries); },
    async list() { return (await records()).map(({ entries, ...meta }) => ({ ...meta, count: entries.length })); },
    async import(filename, data) {
      if (importing) throw new Error('正在导入另一个模组，请稍后再试。');
      importing = true;
      try {
        filename = String(filename).split(/[\\/]/).pop().slice(0, 180);
        const id = createHash('sha256').update(data).digest('hex');
        const existing = (await records()).find(r => r.id === id);
        const isPdf=path.extname(filename).toLowerCase()==='.pdf';
        if (existing && (!isPdf || existing.hasPdf)) {
          if(isPdf)await fs.writeFile(path.join(dir,id+'.pdf'),data);
          return { ok: true, id, duplicate: true, name: existing.name, count: existing.entries.length, hasPdf:!!existing.hasPdf, pageCount:existing.pageCount||0 };
        }
        const chunks = await extractModule(filename, data, {allowImageOnly:true});
        const name = path.basename(filename, path.extname(filename)).replace(/[\\/]/g, '-') || '未命名模组';
        const record = { id, name, filename, hasPdf:isPdf, pageCount:chunks.pageCount||0, imageOnly:!chunks.length, bytes: data.length, importedAt: new Date().toISOString(), entries: chunks.map((chunk, i) => ({ ...chunk, id: 'upload:' + id + ':' + i, book: '模组', file: '模组/' + name + '/' + (i + 1), source: 'upload' })) };
        await fs.mkdir(dir, { recursive: true });
        const temp = path.join(dir, id + '.' + randomUUID() + '.tmp');
        try {
          if(isPdf)await fs.writeFile(path.join(dir,id+'.pdf'),data);
          await fs.writeFile(temp, JSON.stringify(record));
          await fs.rename(temp, path.join(dir, id + '.json'));
        } finally { await fs.unlink(temp).catch(() => {}); }
        cache = undefined;
        return { ok: true, id, name, hasPdf:isPdf, pageCount:record.pageCount, imageOnly:!chunks.length, restoredOriginal:!!existing, count: chunks.length, chars: chunks.reduce((n, c) => n + c.text.length, 0) };
      } finally { importing = false; }
    },
  };
}
