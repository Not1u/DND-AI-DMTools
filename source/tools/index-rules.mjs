// index-rules.mjs — 把本地规则书 HTML 语料（GBK）转成可检索的 JSONL 索引
// 用法: node tools/index-rules.mjs --source <规则书根目录> [--out data/rules-index] [--books 玩家手册,城主指南] [--all]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const getArg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def }
const hasFlag = (name) => args.includes('--' + name)

const SOURCE = getArg('source', 'E:/HarnessWorkspace/跑团/rules-src/dnd5e-chm')
const OUT = getArg('out', 'E:/HarnessTarvern/dnd5e/data/rules-index')
const DEFAULT_BOOKS = ['玩家手册', '城主指南', '玩家手册2024', '城主指南2024', '速查', '塔莎的万事坩埚', '珊娜萨的万事指南']
const books = hasFlag('all')
  ? fs.readdirSync(SOURCE, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  : (getArg('books', '') ? getArg('books', '').split(',') : DEFAULT_BOOKS)

const decoder = new TextDecoder('gb18030')
const readHtml = (p) => decoder.decode(fs.readFileSync(p))

const decodeEntities = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—').replace(/&hellip;/g, '…')

const htmlToText = (html) => {
  let s = html.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|table)>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  s = s.replace(/[ \t\u00a0]+/g, ' ').replace(/\n{2,}/g, '\n').replace(/^\s+|\s+$/g, '')
  return s
}

const titleOf = (html, fallback) => {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)
  const raw = (t && t[1]) || (h && h[1]) || fallback
  return htmlToText(raw).slice(0, 120) || fallback
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(html?|htm)$/i.test(e.name)) out.push(p)
  }
  return out
}

fs.mkdirSync(OUT, { recursive: true })
const manifest = { generatedAt: new Date().toISOString(), source: SOURCE, books: [] }
let total = 0

for (const book of books) {
  const bookDir = path.join(SOURCE, book)
  if (!fs.existsSync(bookDir)) { console.log('skip (missing): ' + book); continue }
  const files = walk(bookDir)
  const chapters = []
  const lines = []
  let idx = 0
  for (const f of files) {
    let raw = ''
    try { raw = readHtml(f) } catch (e) { continue }
    const text = htmlToText(raw)
    if (text.length < 40) continue
    const rel = path.relative(SOURCE, f).replace(/\\/g, '/')
    const title = titleOf(raw, path.basename(f, path.extname(f)))
    const rec = { id: book + ':' + (++idx), book, title, file: rel, text }
    lines.push(JSON.stringify(rec))
    chapters.push({ id: rec.id, title, file: rel, chars: text.length })
    total++
  }
  const outFile = path.join(OUT, book.replace(/[\\/:*?"<>|]/g, '_') + '.jsonl')
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8')
  const bytes = fs.statSync(outFile).size
  manifest.books.push({ book, entries: chapters.length, jsonl: path.basename(outFile), bytes })
  console.log(book + ' → ' + chapters.length + ' 条目, ' + (bytes / 1024 / 1024).toFixed(2) + ' MB')
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log('总计 ' + total + ' 条目 → ' + OUT)
