#!/usr/bin/env node
/**
 * 生成应用图标（.ico，内嵌多尺寸 PNG）。纯 Node 实现，不依赖任何图像库。
 *   node tools/make-icon.mjs [输出路径]
 * 设计：深色圆角方底 + 二十面体（d20）线框。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'app', 'icon.ico')

// ---------- PNG ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c }
  return t
})()
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0)
  return Buffer.concat([len, td, crc])
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 几何辅助 ----------
const distSeg = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay
  const L = vx * vx + vy * vy
  let t = L > 0 ? (wx * vx + wy * vy) / L : 0
  t = Math.max(0, Math.min(1, t))
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy)
  return Math.sqrt(dx * dx + dy * dy)
}
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r
}

function drawIcon(size) {
  const SS = 3
  const bg = [26, 30, 36], bg2 = [43, 79, 124]
  const line = [231, 238, 246], accent = [214, 158, 66]
  const pad = size * 0.055, radius = size * 0.22
  const cx = size / 2, cy = size / 2
  const R = size * 0.375
  const hex = []
  for (let i = 0; i < 6; i++) { const a = (-90 + i * 60) * Math.PI / 180; hex.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]) }
  const tri = []
  for (let i = 0; i < 3; i++) { const a = (-90 + i * 120) * Math.PI / 180; tri.push([cx + R * 0.56 * Math.cos(a), cy + R * 0.56 * Math.sin(a)]) }
  const segs = []
  for (let i = 0; i < 6; i++) segs.push([hex[i][0], hex[i][1], hex[(i + 1) % 6][0], hex[(i + 1) % 6][1], line])
  for (let i = 0; i < 3; i++) segs.push([tri[i][0], tri[i][1], tri[(i + 1) % 3][0], tri[(i + 1) % 3][1], line])
  for (let i = 0; i < 3; i++) segs.push([tri[i][0], tri[i][1], hex[[0, 2, 4][i]][0], hex[[0, 2, 4][i]][1], accent])
  const w = Math.max(1.15, size * 0.052)

  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS
          let cr = 0, cg = 0, cb = 0, ca = 0
          if (inRoundRect(px, py, pad, pad, size - pad, size - pad, radius)) {
            const t = Math.min(1, Math.max(0, (px / size) * 0.35 + (py / size) * 0.65))
            cr = bg[0] * (1 - t) + bg2[0] * t; cg = bg[1] * (1 - t) + bg2[1] * t; cb = bg[2] * (1 - t) + bg2[2] * t; ca = 255
            let best = 1e9, bestCol = null
            for (const s of segs) { const d = distSeg(px, py, s[0], s[1], s[2], s[3]); if (d < best) { best = d; bestCol = s[4] } }
            if (best <= w / 2) { cr = bestCol[0]; cg = bestCol[1]; cb = bestCol[2]; ca = 255 }
            else if (best <= w / 2 + 1) { const k = 1 - (best - w / 2); cr = cr * (1 - k) + bestCol[0] * k; cg = cg * (1 - k) + bestCol[1] * k; cb = cb * (1 - k) + bestCol[2] * k }
          }
          r += cr; g += cg; b += cb; a += ca
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n)
    }
  }
  return encodePng(size, size, out)
}

// ---------- ICO ----------
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map((s) => ({ size: s, png: drawIcon(s) }))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4)
let offset = 6 + images.length * 16
const dir = []
for (const im of images) {
  const e = Buffer.alloc(16)
  e[0] = im.size >= 256 ? 0 : im.size
  e[1] = im.size >= 256 ? 0 : im.size
  e[2] = 0; e[3] = 0
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
  e.writeUInt32LE(im.png.length, 8)
  e.writeUInt32LE(offset, 12)
  dir.push(e)
  offset += im.png.length
}
const ico = Buffer.concat([header, ...dir, ...images.map((i) => i.png)])
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, ico)
console.log('图标已生成：' + OUT + '  ' + ico.length + ' B  尺寸 ' + sizes.join('/'))
