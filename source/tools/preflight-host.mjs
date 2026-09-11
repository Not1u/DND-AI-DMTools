// tools/preflight-host.mjs — 预检 profile 插件 host 半：注册路由并用假 req/res 走通一次真实 op
import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mod = await import(new URL('../adapters/dsh-profile/lib/index.js', import.meta.url).href)

let route = null
const ctx = {
  get: (name) => (name === 'fs' ? {
    resolve: async (p) => p,
    readText: async (p) => fs.readFileSync(p, 'utf8'),
    listDir: async (d) => fs.readdirSync(d).map((n) => ({ name: n })),
    readDir: async (d) => fs.readdirSync(d),
  } : undefined),
  effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d() } },
  logger: { info: (m) => console.log('   [log] ' + m), warn: (m) => console.log('   [warn] ' + m), error: (m) => console.log('   [err] ' + m) },
  webServer: { register: (def) => { route = def; return () => { } } },
}

const plugin = mod.default || mod
console.log('plugin name=' + plugin.name + ' inject=' + JSON.stringify(plugin.inject))
const dispose = plugin.apply(ctx, { dataRoot: ROOT })

if (!route) { console.log('FAIL: no route registered'); process.exit(1) }
console.log('ok: route ' + route.kind + ' ' + route.path)

const callApi = (op, args) => new Promise((resolve) => {
  const req = new EventEmitter()
  req.method = 'POST'
  const res = {
    statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k] = v },
    end(t) { this.body = t; resolve({ status: this.statusCode, body: this.body }) },
  }
  route.handler(req, res)
  const payload = JSON.stringify({ op: op, args: args === undefined ? null : args })
  req.emit('data', payload)
  req.emit('end')
})

const stats = await callApi('rules.stats', {})
const sj = JSON.parse(stats.body)
console.log('rules.stats -> status ' + stats.status + ' ok=' + sj.ok + ' total=' + (sj.value && sj.value.total) + ' books=' + (sj.value && (sj.value.books || []).length))
if (!sj.ok || !sj.value || !sj.value.total) { console.log('FAIL: rules.stats'); process.exit(1) }

const search = await callApi('rules.search', { query: '擒抱', limit: 3 })
const ss = JSON.parse(search.body)
console.log('rules.search -> ok=' + ss.ok + ' hits=' + ((ss.value && ss.value.items) || []).length + ' first=' + ((((ss.value || {}).items || [])[0] || {}).title || '-'))
if (!ss.ok || !((ss.value || {}).items || []).length) { console.log('FAIL: rules.search'); process.exit(1) }

const sheet = await callApi('party.sheet', { id: 'pc-turiel-mistveil' })
const sh = JSON.parse(sheet.body)
console.log('party.sheet -> ok=' + sh.ok + ' sheetOk=' + (sh.value && sh.value.ok) + ' AC=' + (((sh.value || {}).sheet) || {}).ac + ' Lv=' + (((sh.value || {}).sheet) || {}).level)
if (!sh.ok) { console.log('FAIL: party.sheet'); process.exit(1) }

const bad = await callApi('nope', {})
console.log('unknown op -> ' + bad.body)

// WRITE TEST: 走一次真实落盘（改 hpTemp 再改回），验证 adapter 注入的 DND5E_WRITE
const t1 = await callApi('sheet.patch', { json: JSON.stringify({ id: 'pc-turiel-mistveil', patch: { hpTemp: 3 } }) })
const v1 = JSON.parse(t1.body).value
const onDisk1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', 'pc-turiel-mistveil.json'), 'utf8')).hp.temp
console.log('write -> saved=' + v1.saved + ' err=' + (v1.saveError || '-') + ' diskTemp=' + onDisk1)
const t2 = await callApi('sheet.patch', { json: JSON.stringify({ id: 'pc-turiel-mistveil', patch: { hpTemp: 0 } }) })
const onDisk2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', 'pc-turiel-mistveil.json'), 'utf8')).hp.temp
console.log('restore -> diskTemp=' + onDisk2)
if (onDisk1 !== 3 || onDisk2 !== 0) { console.log('FAIL: direct write not effective'); process.exit(1) }

// CREATE TEST: 完整走一遍建卡落盘（用后即删）
const spec = { name: '预检角色', player: 'preflight', race: 'dwarf/hill', cls: 'fighter', bg: 'acolyte', scores: { str: 15, dex: 12, con: 14, int: 8, wis: 13, cha: 10 }, skills: ['athletics', 'perception'], cantrips: [], spells: [], pack: 'dungeoneersPack', armor: 'chainMail', weapons: ['longsword'] }
const t3 = await callApi('build.create', { json: JSON.stringify(spec) })
const v3 = JSON.parse(t3.body).value
console.log('create -> ok=' + v3.ok + ' saved=' + v3.saved + ' err=' + (v3.saveError || '-') + ' id=' + v3.id)
const createdPath = path.join(ROOT, 'characters', v3.id + '.json')
const exists = fs.existsSync(createdPath)
console.log('create -> file on disk=' + exists + (v3.problems && v3.problems.length ? (' problems=' + v3.problems.join(';')) : ''))
if (exists) { fs.unlinkSync(createdPath); console.log('create -> cleaned up') }
if (!v3.ok || !exists) { console.log('FAIL: create'); process.exit(1) }

// PACK TEST: 套装作为容器 + 取出成为独立物品
const spec2 = { name: '预检套装', player: 'preflight', race: 'dwarf/hill', cls: 'fighter', bg: 'acolyte', scores: { str: 15, dex: 12, con: 14, int: 8, wis: 13, cha: 10 }, skills: ['athletics', 'perception'], pack: 'dungeoneersPack', armor: 'chainMail', weapons: ['longsword'] }
const c2 = JSON.parse((await callApi('build.create', { json: JSON.stringify(spec2) })).body).value
const id2 = c2.id
let sh2 = JSON.parse((await callApi('party.sheet', { id: id2 })).body).value.sheet
const packEntry = (sh2.inventory || []).find(x => x.container)
console.log('pack -> container=' + !!packEntry + ' name=' + (packEntry && packEntry.name) + ' 内含=' + ((packEntry && packEntry.contents || []).length) + ' 件')
if (!packEntry) { console.log('FAIL: pack not container'); process.exit(1) }
const firstItem = packEntry.contents[0]
const tk = JSON.parse((await callApi('sheet.pack.take', { json: JSON.stringify({ id: id2, packKey: packEntry.key, itemKey: firstItem.key }) })).body).value
sh2 = JSON.parse((await callApi('party.sheet', { id: id2 })).body).value.sheet
const packAfter = (sh2.inventory || []).find(x => x.container)
const takenItem = (sh2.inventory || []).find(x => x.key === firstItem.key && !x.container)
console.log('take -> ' + tk.summary + ' | 剩余=' + ((packAfter && packAfter.contents || []).length) + ' 件 | 背包出现独立物品=' + !!takenItem)
if (!takenItem) { console.log('FAIL: taken item not in inventory'); process.exit(1) }
fs.unlinkSync(path.join(ROOT, 'characters', id2 + '.json'))
console.log('pack -> cleaned up')
if (typeof dispose === 'function') dispose()
console.log('PREFLIGHT PASSED (host bridge)')

// SWEEP: 清掉任何预检遗留的测试卡（名字以「预检」开头）
try {
  const dir = path.join(ROOT, 'characters')
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    try { const pc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (pc && typeof pc.name === 'string' && pc.name.startsWith('预检')) { fs.unlinkSync(path.join(dir, f)); console.log('sweep: removed ' + f) } } catch (e) { }
  }
} catch (e) { }