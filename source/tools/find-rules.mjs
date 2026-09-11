// tools/find-rules.mjs — 规则检索 CLI（薄适配器，核心逻辑在 core/rules-finder.mjs）
// 用法: node tools/find-rules.mjs "擒抱" [--limit 8] [--book 玩家手册] [--read <id>] [--stats]
import { search, read, stats } from '../core/rules-finder.mjs'

const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const has = (n) => args.includes('--' + n)
const INDEX = getArg('index', 'E:/HarnessTarvern/dnd5e/data/rules-index')

if (has('stats')) {
  const s = stats(INDEX)
  if (s.missing) { console.log('索引不存在，请先运行: node tools/index-rules.mjs --source <规则书目录>'); process.exit(0) }
  console.log('索引生成时间: ' + s.generatedAt + '，共 ' + s.total + ' 条目')
  s.books.forEach(b => console.log('  ' + b.book + '  ' + b.entries + ' 条  ' + (b.bytes / 1048576).toFixed(2) + ' MB'))
  process.exit(0)
}

if (getArg('read', '')) {
  const e = read(INDEX, getArg('read', ''))
  if (!e) { console.log('未找到条目'); process.exit(0) }
  console.log('【' + e.book + '】' + e.title + '\n' + e.file + '\n' + '-'.repeat(60) + '\n' + e.text)
  process.exit(0)
}

const q = args.filter(a => !a.startsWith('--') && a !== getArg('limit', '') && a !== getArg('book', '') && a !== INDEX).join(' ')
if (!q) { console.log('用法: node tools/find-rules.mjs "关键词" [--limit 8] [--book 玩家手册] [--read <id>] [--stats]'); process.exit(0) }

const hits = search(INDEX, q, { limit: Number(getArg('limit', '8')), book: getArg('book', '') || undefined })
console.log('查询「' + q + '」命中 ' + hits.length + ' 条：\n')
hits.forEach((h, i) => {
  console.log((i + 1) + '. [' + h.book + '] ' + h.title + '   (score ' + h.score + ', id ' + h.id + ')')
  console.log('   ' + h.snippet.replace(/\s+/g, ' ').slice(0, 180))
})
