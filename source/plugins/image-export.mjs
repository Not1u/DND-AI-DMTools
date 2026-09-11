/**
 * 图像外挂插件：把"画图"变成可调用工具。
 *
 * 两条路：
 *   1) 本地生成（永远可用）：ext.image.map —— 直接把 data/map.json 渲染成 SVG 落盘，
 *      跑团时可以把地图当图片分享/存档，不需要任何外部服务、不消耗 token。
 *   2) 外置服务（配置即用）：ext.image.generate —— 调用外部图像模型（OpenAI 兼容 / 自定义 webhook），
 *      用于生成场景概念图、人物立绘、token 图标等。
 *
 * 配置（环境变量，写在 profile 启动环境或 .env 里）：
 *   DND5E_IMAGE_URL   例如 https://api.openai.com/v1/images/generations
 *   DND5E_IMAGE_KEY   密钥
 *   DND5E_IMAGE_MODEL 例如 gpt-image-1 / dall-e-3 / sd 模型名
 *   DND5E_IMAGE_STYLE 可选，附加到 prompt 后面的风格串
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export const name = 'image-export'

const COLORS = {
  ground: '#3a3d42', wall: '#1b1e22', water: '#2a4a6b', brush: '#2d4a30', high: '#5a4a32',
  cave: '#0e0f13', door: '#6b5330', plank: '#4a3a22', tree: '#204021', fire: '#6b4a20',
  rubble: '#403b34', void: '#07080a',
}
const TERRAIN = { '.': 'ground', '#': 'wall', '~': 'water', ',': 'brush', '^': 'high', 'o': 'cave', '+': 'door', '=': 'plank', 'T': 'tree', '!': 'fire', 'x': 'rubble', ' ': 'void' }
const TOKEN = { pc: '#2b6cb0', enemy: '#b03030', ally: '#2f7d4f', object: '#5b5b66' }

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function buildSvg(map, opts) {
  const tile = Math.max(12, Math.min(80, Number(opts.tile) || 40))
  const w = map.w, h = map.h
  const pad = 14, head = 30, legendH = 26
  const width = w * tile + pad * 2
  const height = h * tile + pad * 2 + head + legendH
  const parts = []
  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">')
  parts.push('<rect width="100%" height="100%" fill="#15171a"/>')
  parts.push('<text x="' + pad + '" y="' + (pad + 14) + '" fill="#e8e8ec" font-family="sans-serif" font-size="15" font-weight="700">' + esc(map.name || '战术地图') + '</text>')
  parts.push('<text x="' + (width - pad) + '" y="' + (pad + 14) + '" fill="#9aa0a6" font-family="sans-serif" font-size="11" text-anchor="end">每格 5 尺 · ' + w + '×' + h + ' 格</text>')
  const ox = pad, oy = pad + head
  for (let y = 0; y < h; y++) {
    const row = String((map.terrain || [])[y] || '.').padEnd(w, '.')
    for (let x = 0; x < w; x++) {
      const k = TERRAIN[row[x]] || 'ground'
      parts.push('<rect x="' + (ox + x * tile) + '" y="' + (oy + y * tile) + '" width="' + tile + '" height="' + tile + '" fill="' + COLORS[k] + '"/>')
    }
  }
  if (opts.grid !== false) {
    for (let x = 0; x <= w; x++) parts.push('<line x1="' + (ox + x * tile) + '" y1="' + oy + '" x2="' + (ox + x * tile) + '" y2="' + (oy + h * tile) + '" stroke="rgba(255,255,255,.10)" stroke-width="1"/>')
    for (let y = 0; y <= h; y++) parts.push('<line x1="' + ox + '" y1="' + (oy + y * tile) + '" x2="' + (ox + w * tile) + '" y2="' + (oy + y * tile) + '" stroke="rgba(255,255,255,.10)" stroke-width="1"/>')
  }
  for (const t of (map.tokens || [])) {
    if (t.hidden) continue
    const size = Math.max(1, Number(t.size) || 1)
    const cx = ox + (t.x + size / 2) * tile, cy = oy + (t.y + size / 2) * tile
    const r = (size * tile) / 2 - 3
    const fill = t.color || TOKEN[t.kind] || TOKEN.enemy
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" stroke="#ffffff" stroke-width="2"/>')
    parts.push('<text x="' + cx + '" y="' + (cy + 4) + '" fill="#fff" font-family="sans-serif" font-size="' + Math.max(9, tile * 0.3) + '" font-weight="700" text-anchor="middle">' + esc(String(t.name || '?').slice(0, 3)) + '</text>')
    if (t.hp != null && t.max) {
      const pct = Math.max(0, Math.min(1, t.hp / t.max))
      const bw = (size * tile) * 0.76, bx = cx - bw / 2, by = cy + r + 2
      parts.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="4" rx="2" fill="rgba(0,0,0,.6)"/>')
      parts.push('<rect x="' + bx + '" y="' + by + '" width="' + (bw * pct) + '" height="4" rx="2" fill="' + (pct <= 0.25 ? '#d3564b' : (pct <= 0.5 ? '#e0a03a' : '#5ec27a')) + '"/>')
    }
  }
  const ly = oy + h * tile + 16
  const legend = [['ground', '地面'], ['wall', '岩壁'], ['water', '溪水'], ['brush', '荆棘'], ['high', '高地'], ['cave', '洞口'], ['tree', '树'], ['rubble', '碎石']]
  let lx = pad
  legend.forEach(([k, n]) => {
    parts.push('<rect x="' + lx + '" y="' + (ly - 8) + '" width="10" height="10" rx="2" fill="' + COLORS[k] + '" stroke="rgba(255,255,255,.25)"/>')
    parts.push('<text x="' + (lx + 14) + '" y="' + ly + '" fill="#9aa0a6" font-family="sans-serif" font-size="10">' + n + '</text>')
    lx += 14 + String(n).length * 12 + 10
  })
  parts.push('</svg>')
  return { svg: parts.join('\n'), width, height }
}

export const ops = {
  // data/map.json → SVG 文件，返回路径与内容
  'ext.image.map': async (args, api) => {
    const a = args || {}
    let map = null
    try { map = await api.readJson(a.file || 'data/map.json') } catch (e) { return { ok: false, error: '读不到地图：' + (e && e.message) } }
    if (a.fromCallMap !== false) {
      try { const live = await api.call('map.get', {}); if (live && live.ok) map = live } catch (e) { }
    }
    if (!map || !map.terrain) return { ok: false, error: '地图数据为空，先 map.set 建一张图' }
    const built = buildSvg(map, a)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const rel = 'data/images/map-' + stamp + '.svg'
    const abs = path.join(api.repoRoot, rel)
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, built.svg, 'utf8')
    } catch (e) { return { ok: false, error: '写图片失败：' + (e && e.message) } }
    return { ok: true, format: 'svg', relPath: rel, absPath: abs, bytes: Buffer.byteLength(built.svg), width: built.width, height: built.height, tokens: (map.tokens || []).length, svg: a.inline === false ? undefined : built.svg, summary: '已导出 ' + rel + '（' + built.width + '×' + built.height + '，' + (map.tokens || []).length + ' 个单位）' }
  },

  // 已生成的图片清单
  'ext.image.list': async (args, api) => {
    const dir = path.join(api.repoRoot, 'data', 'images')
    try {
      const names = await fs.readdir(dir)
      const rows = []
      for (const n of names.filter(n => /\.(svg|png|jpg|jpeg|webp)$/i.test(n))) {
        const st = await fs.stat(path.join(dir, n))
        rows.push({ file: 'data/images/' + n, bytes: st.size, mtimeMs: st.mtimeMs })
      }
      rows.sort((a, b) => b.mtimeMs - a.mtimeMs)
      return { ok: true, count: rows.length, items: rows }
    } catch (e) { return { ok: true, count: 0, items: [], note: '还没有图片，先用 ext.image.map 导一张' } }
  },

  // 外置图像服务状态
  'ext.image.provider': async () => {
    const url = process.env.DND5E_IMAGE_URL || ''
    const hasKey = !!process.env.DND5E_IMAGE_KEY
    return {
      ok: true,
      configured: !!url,
      url: url || null,
      model: process.env.DND5E_IMAGE_MODEL || null,
      hasKey: hasKey,
      style: process.env.DND5E_IMAGE_STYLE || null,
      hint: url ? '可直接调用 ext.image.generate' : '未配置外置图像服务；本地 ext.image.map 仍可用。配置 DND5E_IMAGE_URL / DND5E_IMAGE_KEY / DND5E_IMAGE_MODEL 后即可生成场景图与立绘。',
    }
  },

  // 调用外置图像模型（OpenAI images 兼容；也支持自定义 webhook 返回 {b64_json|url|data[0].b64_json}）
  'ext.image.generate': async (args, api) => {
    const a = args || {}
    const url = a.url || process.env.DND5E_IMAGE_URL || ''
    if (!url) return { ok: false, error: '未配置图像服务', hint: (await ops['ext.image.provider']({}, api)).hint }
    const prompt = [String(a.prompt || '').trim(), process.env.DND5E_IMAGE_STYLE || a.style || 'TRPG 战术地图风格，俯视视角，清晰网格'].filter(Boolean).join('，')
    if (!prompt) return { ok: false, error: '需要 prompt' }
    const body = { prompt: prompt, n: 1, size: a.size || '1024x1024', model: a.model || process.env.DND5E_IMAGE_MODEL || undefined, response_format: 'b64_json' }
    let res, data
    try {
      res = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, process.env.DND5E_IMAGE_KEY ? { authorization: 'Bearer ' + process.env.DND5E_IMAGE_KEY } : {}), body: JSON.stringify(body) })
      data = await res.json()
    } catch (e) { return { ok: false, error: '调用失败：' + (e && e.message), url: url } }
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status, detail: JSON.stringify(data).slice(0, 400) }
    const b64 = (data && data.data && data.data[0] && (data.data[0].b64_json || data.b64_json)) || (data && data.b64_json) || null
    const remote = (data && data.data && data.data[0] && data.data[0].url) || (data && data.url) || null
    if (!b64 && !remote) return { ok: false, error: '响应里没有图片', detail: JSON.stringify(data).slice(0, 300) }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const kind = String(a.kind || 'scene').replace(/[^a-z0-9_-]/gi, '')
    const rel = 'data/images/' + kind + '-' + stamp + (b64 ? '.png' : '.url.txt')
    const abs = path.join(api.repoRoot, rel)
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, b64 ? Buffer.from(b64, 'base64') : remote, b64 ? undefined : 'utf8')
    } catch (e) { return { ok: false, error: '写文件失败：' + (e && e.message) } }
    return { ok: true, relPath: rel, absPath: abs, remoteUrl: remote, bytes: b64 ? Buffer.from(b64, 'base64').length : 0, prompt: prompt, summary: '已生成 ' + rel }
  },
}
