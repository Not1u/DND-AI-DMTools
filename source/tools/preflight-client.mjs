// tools/preflight-client.mjs — 预检 profile 插件 client 壳（假 __ModuleLoader__ / require / fetch）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = fs.readFileSync(path.join(ROOT, 'adapters', 'dsh-profile', 'lib', 'client.js'), 'utf8')
const uiSource = fs.readFileSync(path.join(ROOT, 'engine', 'ui-client.latest.txt'), 'utf8')

let captured = null
const fakeReact = {
  createElement: (t, p, ...c) => ({ t, p, c }),
  useState: (v) => [v, () => { }],
  useEffect: () => { },
  useRef: () => ({ current: null }),
  Component: class { constructor(p) { this.props = p || {}; this.state = {} } setState(s) { this.state = Object.assign({}, this.state, s) } },
}
const fakeRequire = (id) => { if (id === 'react' || id === 'react/jsx-runtime') return fakeReact; throw new Error('unexpected require: ' + id) }

const styleEls = []
const fakeDocument = {
  createElement: () => ({ setAttribute() { }, removeChild() { }, style: {}, textContent: '', appendChild() { } }),
  head: { appendChild: (el) => styleEls.push(el) },
  documentElement: {},
}

let servesUi = true
const calls = []
const fakeFetch = async (url, opts) => {
  const body = JSON.parse((opts && opts.body) || '{}')
  calls.push(body.op)
  if (body.op === 'ui.source') {
    if (!servesUi) return { ok: false, status: 500, json: async () => ({ ok: false, error: 'down' }) }
    return { ok: true, json: async () => ({ ok: true, value: { ok: true, source: uiSource, bytes: uiSource.length } }) }
  }
  return { ok: true, json: async () => ({ ok: true, value: { ok: true, items: [], total: 6803, books: [] } }) }
}

const win = {
  __ModuleLoader__: { load: (def) => { captured = def } },
  console: { log: (...a) => console.log('   [shell.log]', ...a), warn: (...a) => console.log('   [shell.warn]', ...a), error: (...a) => console.log('   [shell.err]', ...a) },
  localStorage: { getItem: () => null, setItem: () => { } },
  innerWidth: 1200, innerHeight: 900,
}

const run = new Function('window', 'document', 'fetch', 'localStorage', 'console', bundle)
run(win, fakeDocument, fakeFetch, win.localStorage, win.console)

if (!captured || typeof captured.factory !== 'function') { console.log('FAIL: bundle did not call __ModuleLoader__.load'); process.exit(1) }
console.log('ok: __ModuleLoader__.load id=' + captured.id)

const mod = captured.factory(fakeRequire)
const plugin = mod && mod.default && !mod.apply ? mod.default : mod
if (!plugin || typeof plugin.apply !== 'function') { console.log('FAIL: no apply()'); process.exit(1) }
console.log('ok: plugin name=' + plugin.name + ' inject=' + JSON.stringify(plugin.inject))

let tab = null
const fakeCtx = {
  get: (n) => (n === 'betterSidebar' ? { registerTab: (d) => { tab = d; return () => { } } } : undefined),
  effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d() } },
  on: () => () => { }, logger: { info() { }, warn() { }, error() { } },
}

const dispose = plugin.apply(fakeCtx)
console.log('ok: apply() returned ' + (typeof dispose === 'function' ? 'disposer (async load in flight)' : String(dispose)))

await new Promise((r) => setTimeout(r, 60))
if (!tab) { console.log('FAIL: tab not registered after async load; calls=' + JSON.stringify(calls)); process.exit(1) }
console.log('ok: fetched ui.source=' + calls.includes('ui.source') + ' | registerTab id=' + tab.id + ' title=' + tab.title)
if (typeof tab.component !== 'function') { console.log('FAIL: component missing'); process.exit(1) }
const el = tab.component({ scope: {} })
console.log('ok: component() -> ' + (el === null ? 'null' : typeof el))
if (typeof dispose === 'function') { dispose(); console.log('ok: disposer callable') }

// 回退路径：桥不可用时应使用内联快照
tab = null; calls.length = 0; servesUi = false
const p2 = captured.factory(fakeRequire)
p2.apply(fakeCtx)
await new Promise((r) => setTimeout(r, 60))
console.log('fallback: tab=' + (tab ? tab.id : 'MISSING') + ' calls=' + JSON.stringify(calls))
if (!tab) { console.log('FAIL: inline fallback path broken'); process.exit(1) }

console.log('PREFLIGHT PASSED')

// SWEEP: 清掉任何预检遗留的测试卡（名字以「预检」开头）
try {
  const dir = path.join(ROOT, 'characters')
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    try { const pc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (pc && typeof pc.name === 'string' && pc.name.startsWith('预检')) { fs.unlinkSync(path.join(dir, f)); console.log('sweep: removed ' + f) } } catch (e) { }
  }
} catch (e) { }