#!/usr/bin/env node
/**
 * 生成一张示范战术地图（凡戴尔的失落矿坑 · 克拉格巢穴入口）并推送到插件桥。
 *
 * 用法： node tools/seed-demo-map.mjs
 *
 * 地图 JSON 结构（data/map.json）：
 *   w, h      格数（每格 5 尺）
 *   terrain   h 个长度 w 的字符串，每字符 1 格：
 *             . 地面  # 岩壁  ~ 溪水(困难)  , 荆棘(困难+半掩体)  ^ 高地/崖顶
 *             o 洞口/黑暗  + 门  = 木板  T 树(半掩体)  ! 火堆  x 碎石  ' ' 虚空
 *   tokens    [{ id, name, kind: pc|enemy|ally|object, x, y, hp, max, speed, color, note, size }]
 */
const URL_BASE = process.env.DND5E_API || 'http://127.0.0.1:43120/dnd5e/api'

const W = 24, H = 14
const grid = []
for (let y = 0; y < H; y++) grid.push(new Array(W).fill('.'))

const put = (x, y, ch) => { if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = ch }
const rect = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch) }
const line = (pts, ch) => pts.forEach(([x, y]) => put(x, y, ch))

// 北侧岩壁 + 洞口（溪水从洞里流出）
rect(0, 0, W - 1, 0, '#')
rect(0, 1, 16, 1, '#')
rect(0, 2, 9, 2, '#')
put(10, 0, 'o'); put(10, 1, 'o'); rect(11, 1, 15, 1, 'o')   // 洞口与洞内黑暗
rect(11, 2, 15, 2, 'o')

// 溪水：从洞口往西南流
line([[9, 1], [9, 2], [8, 2], [8, 3], [9, 3], [8, 4], [7, 4], [7, 5], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [5, 9], [5, 10], [5, 11], [6, 11], [6, 12], [6, 13], [4, 10], [4, 11], [5, 12], [4, 12], [4, 13], [5, 13]], '~')

// 洞口前的木板桥 + 崖顶高台（哨台）
put(14, 3, '='); put(15, 3, '='); put(16, 3, '=')
rect(17, 1, 23, 5, '^')
put(19, 3, '!')                       // 哨台上的火堆
rect(17, 6, 23, 8, ',')               // 崖下荆棘
rect(16, 6, 16, 8, '^')               // 上台的斜坡
rect(17, 9, 23, 13, ',')              // 南侧密林

// 队伍潜行用的西侧荆棘带 + 几棵树与碎石
rect(0, 3, 3, 13, ',')
rect(0, 1, 8, 2, ',')
line([[13, 6], [12, 6], [13, 7]], 'x')
line([[13, 8], [14, 10], [2, 11], [21, 10]], 'T')

const tokens = [
  { id: 'pc-turiel', name: '图里尔', kind: 'pc', x: 5, y: 12, hp: 3, max: 7, speed: 30, note: '法师 1｜AC12｜1环位 0/2｜奥术复原未用', color: null },
  { id: 'pc-brolin', name: '布洛林', kind: 'pc', x: 4, y: 12, hp: 7, max: 13, speed: 25, note: '战士 1｜AC18｜链甲' },
  { id: 'pc-grimbeard', name: '格瑞姆贝尔', kind: 'pc', x: 3, y: 13, hp: 5, max: 10, speed: 25, note: '牧师 1｜AC15｜1环位 0/2' },
  { id: 'gb-sentryA', name: '地精哨兵A', kind: 'enemy', x: 11, y: 1, hp: 6, max: 7, speed: 30, note: '已示警｜短弓+4 1d6+2｜AC15' },
  { id: 'gb-guard', name: '地精守卫', kind: 'enemy', x: 13, y: 2, hp: 7, max: 7, speed: 30, note: '洞内｜弯刀+4 1d6+2｜AC15' },
  { id: 'wolf-1', name: '狼', kind: 'enemy', x: 15, y: 2, hp: 11, max: 11, speed: 40, note: 'AC13｜啃咬+4 1d6+2，命中需 DC11 力量豁免否则倒地' },
  { id: 'gob-B', name: '地精B（阵亡）', kind: 'object', x: 18, y: 4, hp: 0, max: 7, speed: 0, note: '被弩箭重击钉在枯树上' },
]

const map = {
  name: '凡戴尔的失落矿坑 · 克拉格巢穴入口',
  campaign: '凡戴尔的失落矿坑',
  w: W, h: H, cell: 5,
  terrain: grid.map(r => r.join('')),
  tokens,
}

async function api(op, args) {
  const res = await fetch(URL_BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, args: args === undefined ? null : args }) })
  const data = await res.json().catch(() => null)
  if (!data) throw new Error('bad response')
  return data
}

const r = await api('map.set', map)
console.log(JSON.stringify(r, null, 2).slice(0, 900))
if (r && r.ok) {
  console.log('\n--- 地图预览 ---')
  r.value.terrain.forEach((row, y) => console.log(String(y).padStart(2, ' ') + ' ' + row))
  r.value.tokens.forEach(t => console.log('  ' + t.name + ' @ (' + t.x + ',' + t.y + ') ' + t.kind + ' HP ' + t.hp + '/' + t.max))
}
