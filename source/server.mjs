#!/usr/bin/env node
/**
 * SoloTRPG — 单人跑团独立运行器
 *
 * 不依赖 DSH：自己起一个 HTTP 服务，把 engine/ 里的引擎（与 DSH 插件共用同一份源码）
 * 挂到同源接口上，再把 UI 直接渲染成整页应用。
 *
 *   node server.mjs                # 默认 http://127.0.0.1:4620
 *   PORT=5000 node server.mjs
 *
 * 接口：
 *   POST /api            {op, args} → {ok, value}     （核心能力 + plugins/*.mjs 扩展）
 *   POST /dnd5e/api      同上（别名，方便沿用 DSH 版 UI）
 *   GET  /               应用页面
 *   GET  /app/ui-client.js  UI 源码（直接读 engine/，改完刷新即生效）
 *   GET  /files/*         仓库文件（用来查看导出的地图 SVG 等）
 *   GET  /health          健康检查 + op 清单
 */
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { composeMap } from './src/cartography.mjs'
import { createModuleStore, MAX_MODULE_BYTES } from './src/modules.mjs'

export async function startServer(options = {}) {
const HERE = path.dirname(fileURLToPath(import.meta.url))
let CFG = {}
try { CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8')) } catch (e) { }
const ROOT = options.dataRoot || (CFG.dataRoot ? path.resolve(HERE, CFG.dataRoot) : HERE)
const libraryRoot = options.libraryRoot || HERE
const modules = createModuleStore(options.libraryRoot || ROOT)
const PORT = Number(options.port ?? process.env.PORT ?? CFG.port ?? 4620)
const BIND = options.bind || process.env.BIND || CFG.bind || '127.0.0.1'
const HOST_SRC = path.join(HERE, 'engine', 'ui-host.latest.txt')
const CLIENT_SRC = path.join(HERE, 'engine', 'ui-client.latest.txt')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon',
}
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'

// ---------- 引擎装载（按 mtime 热重载，和 DSH 插件同款机制）----------
const rec = {}
let loaded = false, loadedAt = 0, innerDispose = null

const writeText = async (abs, text) => {
  try { await fsp.mkdir(path.dirname(abs), { recursive: true }); await fsp.writeFile(abs, text, 'utf8'); return { ok: true } }
  catch (e) { return { ok: false, error: String((e && e.message) || e) } }
}
const fsSvc = {
  resolve: async (p) => (path.isAbsolute(String(p)) ? String(p) : path.join(ROOT, String(p))),
  readText: async (p) => { let s = await fsp.readFile(p, 'utf8'); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return s },
  writeText: async (p, t) => fsp.writeFile(p, t, 'utf8'),
  stat: async (p) => fsp.stat(p),
  // 引擎里两种目录列举都会用到（listDir 返回 dirent、readDir 返回文件名），两个都给
  listDir: async (p) => fsp.readdir(p, { withFileTypes: true }),
  readDir: async (p) => fsp.readdir(p),
  readdir: async (p) => fsp.readdir(p),
  exists: async (p) => fs.existsSync(p),
}
const miniCtx = {
  get(name) { return name === 'fs' ? fsSvc : undefined },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
  logger: { info: (...a) => console.log('[solo-trpg]', ...a), warn: (...a) => console.warn('[solo-trpg]', ...a), error: (...a) => console.error('[solo-trpg]', ...a) },
}

// 插件的 api（也给引擎用：让 AI 能调用 plugins/*.mjs 的能力）
const pluginApi = (overrides) => Object.assign({
  repoRoot: ROOT,
  call: async (op, args) => { ensureEngine(); const f = rec[op]; if (typeof f !== 'function') throw new Error('unknown op: ' + op); return f(args || {}) },
  readJson: async (rel) => { let s = await fsp.readFile(path.join(ROOT, rel), 'utf8'); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return JSON.parse(s) },
  writeJson: async (rel, obj) => writeText(path.join(ROOT, rel), JSON.stringify(obj, null, 2)),
  log: (m) => console.log('[plugin] ' + m),
}, overrides || {})

// 交给引擎的扩展访问器：AI 的工具列表里会带上插件能力
const extApi = {
  call: async (op, args) => {
    const ext = await loadPlugins()
    const fn = ext.ops[op]
    if (typeof fn !== 'function') throw new Error('unknown ext op: ' + op)
    return fn(args || {}, pluginApi())
  },
  list: () => {
    const out = []
    for (const c of pluginCache.values()) for (const n of Object.keys(c.ops || {})) out.push({ name: n, plugin: c.name, desc: '插件 ' + c.name })
    return out
  },
}

function ensureEngine() {
  if (!fs.existsSync(HOST_SRC)) throw new Error('引擎源码不存在：' + HOST_SRC + '（先跑 node tools/sync-from-repo.mjs）')
  const mt = fs.statSync(HOST_SRC).mtimeMs
  if (loaded && mt === loadedAt) return
  if (loaded && typeof innerDispose === 'function') { try { innerDispose() } catch (e) { } }
  innerDispose = null; loaded = false
  let src = fs.readFileSync(HOST_SRC, 'utf8')
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1)
  const harness = { handle: (n, f) => { rec[n] = f; return () => { delete rec[n] } } }
  const factory = new Function('harness', 'ctx', 'console', 'DND5E_ROOT', 'DND5E_WRITE', 'DND5E_EXT', 'DND5E_ASSETS', 'DND5E_MODULES', 'DND5E_LIBRARY', 'DND5E_COMPOSE', src)
  const plugin = factory(harness, miniCtx, console, ROOT, writeText, extApi, HERE, modules, libraryRoot, composeMap)
  if (!plugin || typeof plugin.apply !== 'function') throw new Error('引擎形状不对')
  const d = plugin.apply(miniCtx)
  if (typeof d === 'function') innerDispose = d
  loaded = true; loadedAt = mt
  console.log('[solo-trpg] 引擎已装载：' + Object.keys(rec).length + ' 个 op @ ' + new Date(mt).toLocaleTimeString())
}

// ---------- 插件装载（plugins/*.mjs，按 mtime 热重载）----------
const pluginCache = new Map()
async function loadPlugins() {
  const dir = path.join(HERE, 'plugins')
  const ops = {}, list = []
  let names = []
  try { names = fs.readdirSync(dir).filter((f) => /\.m?js$/.test(f) && !/^_/.test(f)) } catch (e) { return { ops, list } }
  for (const n of names) {
    try {
      const full = path.join(dir, n)
      const mt = fs.statSync(full).mtimeMs
      let c = pluginCache.get(n)
      if (!c || c.mtimeMs !== mt) {
        const mod = await import(pathToFileURL(full).href + '?m=' + mt)
        let mops = (mod && mod.ops) || {}
        if (mod && typeof mod.setup === 'function') mops = Object.assign({}, mops, (await mod.setup(pluginApi())) || {})
        c = { mtimeMs: mt, ops: mops, name: (mod && mod.name) || n.replace(/\.m?js$/, '') }
        pluginCache.set(n, c)
      }
      list.push({ file: n, name: c.name, ops: Object.keys(c.ops) })
      Object.assign(ops, c.ops)
    } catch (e) { list.push({ file: n, name: '(加载失败)', ops: [], error: String((e && e.message) || e) }) }
  }
  return { ops, list }
}

// ---------- HTTP ----------
const send = (res, status, body, type, extra) => {
  res.writeHead(status, Object.assign({ 'content-type': type || 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, extra || {}))
  res.end(body)
}
const sendJson = (res, status, payload) => send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8')

async function serveFile(res, abs, headers) {
  try {
    const st = await fsp.stat(abs)
    if (!st.isFile()) return send(res, 404, 'not found')
    const body = await fsp.readFile(abs)
    return send(res, 200, body, mimeOf(abs), Object.assign({ 'content-length': body.length, etag: 'W/"' + st.size + '-' + Math.round(st.mtimeMs) + '"' }, headers || {}))
  } catch (e) { return send(res, 404, 'not found: ' + path.basename(abs)) }
}
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, decodeURIComponent(rel).replace(/^[/\\]+/, '')))
  const relative = path.relative(base, p)
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? p : null
}

async function handleApi(req, res) {
  let body = '', tooLarge = false
  req.on('data', (c) => { body += c; if (body.length > 16 * 1024 * 1024) { tooLarge = true; req.destroy() } })
  req.on('end', async () => {
    if (tooLarge) return sendJson(res, 413, { ok: false, error: 'payload too large' })
    let op = '', args = null
    try { const p = JSON.parse(body || '{}'); op = String(p.op || ''); args = p.args === undefined ? null : p.args }
    catch (e) { return sendJson(res, 400, { ok: false, error: 'bad json: ' + (e && e.message || e) }) }
    if (!op) return sendJson(res, 400, { ok: false, error: 'op required' })
    try {
      ensureEngine()
      const ext = await loadPlugins()
      if (op === 'ext.list') return sendJson(res, 200, { ok: true, value: { core: Object.keys(rec), plugins: ext.list, pluginOps: Object.keys(ext.ops) } })
      const isCore = typeof rec[op] === 'function'
      const fn = isCore ? rec[op] : ext.ops[op]
      if (typeof fn !== 'function') return sendJson(res, 200, { ok: false, error: 'unknown op: ' + op })
      const value = isCore ? await fn(args || {}) : await fn(args || {}, {
        repoRoot: ROOT,
        call: async (n, a) => { ensureEngine(); const f = rec[n]; if (typeof f !== 'function') throw new Error('unknown op: ' + n); return f(a || {}) },
        readJson: async (rel) => { let s = await fsp.readFile(path.join(ROOT, rel), 'utf8'); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return JSON.parse(s) },
        writeJson: async (rel, obj) => writeText(path.join(ROOT, rel), JSON.stringify(obj, null, 2)),
        log: (m) => console.log('[plugin] ' + m),
      })
      return sendJson(res, 200, { ok: true, value: value === undefined ? null : value })
    } catch (e) { return sendJson(res, 200, { ok: false, error: String((e && e.message) || e) }) }
  })
}

const server = http.createServer(async (req, res) => {
  if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return send(res, 403, 'forbidden origin')
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'))
  const p = url.pathname
  try {
    if (p === '/api/modules') {
      if (req.method === 'GET') return sendJson(res, 200, { ok: true, items: await modules.list() })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET or POST only' })
      let size = 0
      const chunks = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_MODULE_BYTES) return sendJson(res, 413, { ok: false, error: '文件不能超过 50 MB。' })
        chunks.push(chunk)
      }
      try { return sendJson(res, 200, await modules.import(url.searchParams.get('filename') || '', Buffer.concat(chunks))) }
      catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    }
    if (p === '/api' || p === '/dnd5e/api') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
      return handleApi(req, res)
    }
    if (p === '/health') {
      try { ensureEngine() } catch (e) { return sendJson(res, 500, { ok: false, error: String(e && e.message || e) }) }
      const ext = await loadPlugins()
      return sendJson(res, 200, {
        ok: true, root: ROOT, port: PORT, engineLoadedAt: loadedAt,
        coreOps: Object.keys(rec).length, plugins: ext.list, pluginOps: Object.keys(ext.ops).length,
        has: { characters: fs.existsSync(path.join(ROOT, 'characters')), rulesIndex: fs.existsSync(path.join(libraryRoot, 'data', 'rules-index', 'manifest.json')), map: fs.existsSync(path.join(ROOT, 'data', 'map.json')) },
      })
    }
    if (p === '/app/ui-client.js' || p === '/ui-client.js') return serveFile(res, CLIENT_SRC, { 'cache-control': 'no-store', 'content-type': 'text/javascript; charset=utf-8' })
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(HERE, 'app', 'index.html'), { 'cache-control': 'no-store' })
    if (p.startsWith('/app/')) {
      const abs = safeJoin(path.join(HERE, 'app'), p.slice(5))
      if (!abs) return send(res, 403, 'forbidden')
      return serveFile(res, abs)
    }
    if (p.startsWith('/files/')) {
      if (!p.startsWith('/files/data/images/')) return send(res, 403, 'forbidden')
      const abs = safeJoin(path.join(ROOT, 'data', 'images'), p.slice('/files/data/images/'.length))
      if (!abs) return send(res, 403, 'forbidden')
      return serveFile(res, abs)
    }
    return send(res, 404, 'not found')
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
  }
})

// 预热插件：让 AI 的工具列表一开始就包含 plugins/*.mjs 的能力
async function warmPlugins() {
  try {
    const ext = await loadPlugins()
    console.log('[solo-trpg] 插件已预热：' + ext.list.length + ' 个（' + ext.list.map(p => p.name).join('、') + '）')
  } catch (e) { }
}
await warmPlugins()
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(PORT, BIND, resolve)
})
const address = server.address()
const url = 'http://' + BIND + ':' + address.port
console.log('[solo-trpg] ' + url)
return { server, url, close: () => new Promise(resolve => {
  if (typeof innerDispose === 'function') innerDispose()
  server.close(resolve)
  server.closeAllConnections()
}) }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer()
}
