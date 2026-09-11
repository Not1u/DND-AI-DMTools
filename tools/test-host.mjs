// tools/test-host.mjs — offline host harness: runs engine/ui-host.latest.txt handlers against real character files
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST_SRC = path.join(ROOT, 'engine', 'ui-host.latest.txt')
const CHARS_DIR = path.join(ROOT, 'characters')

const body = fs.readFileSync(HOST_SRC, 'utf8')
const handlers = {}
const harness = { handle: (name, fn) => { handlers[name] = fn; return () => { delete handlers[name] } } }
const ctx = {
  get(name) {
    if (name === 'fs') {
      return {
        resolve: async (p) => p,
        readText: async (p) => fs.readFileSync(p, 'utf8'),
        listDir: async (dir) => fs.readdirSync(dir).map(n => ({ name: n })),
        readDir: async (dir) => fs.readdirSync(dir),
      }
    }
    if (name === 'tools') return { execute: async () => ({ isError: false, value: { ok: true, summary: 'stub-save' } }) }
    return undefined
  },
}

const plugin = new Function('harness', 'ctx', 'console', body)(harness, ctx, console)
plugin.apply(ctx)

const assertLossless = (label, value) => {
  const bad = []
  const walk = (v, p) => {
    if (v === undefined) { bad.push(p); return }
    if (v === null) return
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, p + '[' + i + ']')); return }
    if (typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], p + '.' + k); return }
    if (typeof v === 'function') bad.push(p + ' (function)')
  }
  walk(value, label)
  return bad
}

const files = fs.readdirSync(CHARS_DIR).filter(n => n.endsWith('.json'))
let failures = 0

const list = await handlers['party.list']({})
const badList = assertLossless('party.list', list)
console.log('party.list ok=' + list.ok + ' items=' + (list.items || []).length + ' problems=' + (badList.join(',') || 'none'))
if (badList.length) failures++

for (const f of files) {
  const id = f.replace(/\.json$/, '')
  const res = await handlers['party.sheet']({ id })
  if (!res.ok) { console.log('party.sheet ' + id + ' FAILED: ' + res.error); failures++; continue }
  const bad = assertLossless('party.sheet(' + id + ')', res.sheet)
  const s = res.sheet
  console.log('sheet ' + id + ' | Lv' + s.level + ' AC' + s.ac + ' | ' + s.acBreakdown)
  console.log('   装备: 护甲=' + (s.equipment.armor ? s.equipment.armor.name : '无') + ' 盾=' + (s.equipment.shield ? s.equipment.shield.name : '无') + ' 主手=' + (s.equipment.mainHand ? s.equipment.mainHand.name : '无') + ' | 背包=' + s.inventory.length + ' 状态=' + s.conditions.length + ' 法术=' + s.spells.length)
  if (s.weaponStats.main) console.log('   主手: 攻击+' + s.weaponStats.main.attack + ' 伤害 ' + s.weaponStats.main.damage + (s.weaponStats.main.dmgBonus >= 0 ? '+' : '') + s.weaponStats.main.dmgBonus)
  if (bad.length) { console.log('   !! undefined fields: ' + bad.slice(0, 8).join(', ')); failures++ }
}

const opts = await handlers['build.options']({})
console.log('build.options ok=' + opts.ok + ' classes=' + (opts.classes || []).length + ' undefined=' + (assertLossless('build.options', opts).length ? 'YES' : 'no'))

const ls = await handlers['levelset.info']({ id: files[0].replace(/\.json$/, ''), target: 7 })
console.log('levelset.info ok=' + ls.ok + ' target=' + ls.target + ' pending=' + ((ls.pending || []).length) + ' undefined=' + (assertLossless('levelset.info', ls).length ? 'YES' : 'no'))

const rs = await handlers['rules.stats']({})
console.log('rules.stats ok=' + rs.ok + ' total=' + rs.total + ' books=' + ((rs.books || []).length))
if (!rs.ok || !rs.total) failures++
const rr = await handlers['rules.search']({ query: '擒抱', limit: 3 })
console.log('rules.search ok=' + rr.ok + ' hits=' + ((rr.items || []).length) + ' first=' + (((rr.items || [])[0] || {}).title || '-'))
if (!rr.ok || !(rr.items || []).length) failures++
const rd = await handlers['rules.read']({ id: ((rr.items || [])[0] || {}).id })
console.log('rules.read ok=' + rd.ok + ' chars=' + (((rd.entry || {}).text) || '').length)
if (!rd.ok) failures++
console.log(failures ? ('FAILURES: ' + failures) : 'ALL CHECKS PASSED')
