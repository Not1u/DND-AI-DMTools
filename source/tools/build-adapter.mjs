// tools/build-adapter.mjs — 生成 profile 插件的 lib/client.js
// 采用「壳」方案：bundle 只含传输层与加载器，UI 源码在运行时通过 /dnd5e/api 的 ui.source 读取；
// 桥不可用时回退到构建时内联快照。好处：改 UI 只需改 engine/ui-client.latest.txt 并刷新页面。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_ID = 'dsh-5ednd'
const API_PATH = '/dnd5e/api'
const UI_SRC = path.join(ROOT, 'engine', 'ui-client.latest.txt')
const OUT = path.join(ROOT, 'adapters', 'dsh-profile', 'lib', 'client.js')

const uiBody = fs.readFileSync(UI_SRC, 'utf8')

const banner = 'window.__ModuleLoader__.load({ id: "' + PLUGIN_ID + '", factory: (require) => {'
const intro = 'var module = { exports: {} }; var exports = module.exports;'
const footer = 'return module.exports; } });'

const code = `
const React = require('react')
const __apiPath = '${API_PATH}'
const __console = (typeof window !== 'undefined' && window.console) ? window.console : console

async function __api(op, args) {
  const body = JSON.stringify({ op: op, args: args === undefined ? null : args })
  const res = await fetch(__apiPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body })
  if (!res.ok) throw new Error('[dsh-5ednd] http ' + res.status)
  const data = await res.json()
  if (!data || data.ok !== true) throw new Error((data && data.error) || ('rpc failed: ' + op))
  return data.value
}

const host = { call: function (name, args) { return __api(name, args) } }

const styles = {
  insert: function (css) {
    const el = document.createElement('style')
    el.setAttribute('data-dsh-5ednd', '1')
    el.textContent = css
    document.head.appendChild(el)
    return function () { if (el.parentNode) el.parentNode.removeChild(el) }
  },
}

const __INLINE_UI = ${JSON.stringify(uiBody)}

async function __loadUISource() {
  try {
    const r = await __api('ui.source', { file: 'ui-client.latest.txt' })
    const src = r && typeof r.source === 'string' ? r.source : ''
    if (src.length > 1000) { window.__DND5E_UI = { bytes: src.length, mtimeMs: r.mtimeMs || 0, from: 'disk' }; __console.log('[dsh-5ednd] ui loaded from disk: ' + src.length + ' bytes @ ' + (r.mtimeMs || 0)); return src }
  } catch (e) { __console.warn('[dsh-5ednd] ui.source unavailable, using inline snapshot:', e && e.message) }
  window.__DND5E_UI = { bytes: __INLINE_UI.length, mtimeMs: 0, from: 'inline' }
  __console.warn('[dsh-5ednd] using INLINE snapshot (' + __INLINE_UI.length + ' bytes) — bundle may be stale')
  return __INLINE_UI
}

async function __makeUI() {
  const src = await __loadUISource()
  const factory = new Function('React', 'host', 'styles', 'console', src)
  const plugin = factory(React, host, styles, __console)
  if (!plugin || typeof plugin.apply !== 'function') throw new Error('[dsh-5ednd] ui plugin shape invalid')
  return plugin
}

module.exports = {
  name: '${PLUGIN_ID}-client',
  inject: ['betterSidebar'],
  apply: function (ctx) {
    let dispose = null
    let cancelled = false
    __makeUI().then(function (plugin) {
      if (cancelled) return
      const d = plugin.apply(ctx)
      if (typeof d === 'function') dispose = d
    }).catch(function (e) { __console.error('[dsh-5ednd] ui load failed:', e && e.message) })
    return function () { cancelled = true; if (typeof dispose === 'function') { try { dispose() } catch (e) { } } }
  },
}
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, [banner, intro, code, footer].join('\n'), 'utf8')
const size = fs.statSync(OUT).size
console.log('built ' + path.relative(ROOT, OUT) + '  ' + (size / 1024).toFixed(1) + ' KB (loader + ' + (uiBody.length / 1024).toFixed(1) + ' KB inline fallback)')
