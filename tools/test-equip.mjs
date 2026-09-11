// tools/test-equip.mjs — offline test: exercise sheet.equip / condition.set / item.add through the real host code
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST_SRC = path.join(ROOT, 'engine', 'ui-host.latest.txt')
const CHARS_DIR = path.join(ROOT, 'characters')

const body = fs.readFileSync(HOST_SRC, 'utf8')
const handlers = {}
const harness = { handle: (n, f) => { handlers[n] = f; return () => { } } }
let savedPayload = null
const ctx = {
  get(name) {
    if (name === 'fs') return {
      resolve: async (p) => p,
      readText: async (p) => fs.readFileSync(p, 'utf8'),
      listDir: async (d) => fs.readdirSync(d).map(n => ({ name: n })),
      readDir: async (d) => fs.readdirSync(d),
    }
    if (name === 'tools') return { execute: async ({ arguments: a }) => { savedPayload = a; return { isError: false, value: { ok: true, summary: 'stub-saved' } } } }
    return undefined
  },
}

const plugin = new Function('harness', 'ctx', 'console', body)(harness, ctx, console)
plugin.apply(ctx)

const ID = process.argv[2] || fs.readdirSync(CHARS_DIR).filter(n => n.endsWith('.json'))[0].replace(/\.json$/, '')
const before = (await handlers['party.sheet']({ id: ID })).sheet
console.log('BEFORE  AC=' + before.ac + ' | 护甲=' + (before.equipment.armor || {}).name + ' | 盾=' + (before.equipment.shield || {}).name + ' | 主手=' + (before.equipment.mainHand || {}).name)
console.log('  背包: ' + before.inventory.map(i => i.key + '(' + (i.kind || '') + ')').join(', '))

const pick = (kind, fallback) => { const it = before.inventory.find(i => i.kind === kind); return it ? it.key : fallback }
const r1 = await handlers['sheet.equip']({ json: JSON.stringify({ id: ID, slot: 'armor', key: pick('armor', 'leather') }) })
console.log('equip armor -> ' + JSON.stringify({ ok: r1.ok, error: r1.error, summary: r1.summary }))
const r3 = await handlers['sheet.equip']({ json: JSON.stringify({ id: ID, slot: 'shield', clear: true }) })
console.log('clear shield -> ' + JSON.stringify({ ok: r3.ok, error: r3.error, summary: r3.summary }))

const after = (await handlers['party.sheet']({ id: ID })).sheet
console.log('AFTER   AC=' + after.ac + ' | 护甲=' + (after.equipment.armor || {}).name + ' | 盾=' + (after.equipment.shield ? after.equipment.shield.name : '(空)') + ' | 主手=' + (after.equipment.mainHand || {}).name)
console.log('AC明细: ' + after.acBreakdown)

const rc = await handlers['sheet.condition.set']({ json: JSON.stringify({ id: ID, key: 'restrained', note: '被藤蔓缠住' }) })
console.log('condition add -> ' + JSON.stringify({ ok: rc.ok, error: rc.error, summary: rc.summary }))
const ra = await handlers['sheet.item.add']({ json: JSON.stringify({ id: ID, item: { name: '精金胸甲', kind: 'armor', base: 16, desc: '测试自定护甲' } }) })
console.log('item add -> ' + JSON.stringify({ ok: ra.ok, error: ra.error, summary: ra.summary, itemKey: ra.itemKey }))
console.log('stub save received: ' + (savedPayload ? 'yes' : 'no'))
