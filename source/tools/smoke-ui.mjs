#!/usr/bin/env node
/**
 * UI 冒烟测试（两段式，不开浏览器）：
 *   1) 基础：用桩 React 装载 UI 源码，逐个渲染全部面板，抓 "X is not defined / 组件未定义 / 渲染异常"。
 *   2) 深度：给核心 op 灌入假数据，**两遍渲染** Workspace（先跑 effect，等异步回来，再渲染一次），
 *      然后对真实工作区结构做断言：地图格子数、单位数、战斗记录条数、面板槽位等。
 *
 *   node tools/smoke-ui.mjs                        # 测 engine/ui-client.latest.txt
 *   node tools/smoke-ui.mjs <path-to-ui-source>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'engine', 'ui-client.latest.txt')

let src = fs.readFileSync(SRC_PATH, 'utf8')
if (src.charCodeAt(0) === 0xfeff) src = src.slice(1)

const problems = []
const notes = []
let nodes = 0
const seen = new Set()

// ---------- 假数据 ----------
const SHEET = {
  id: 'pc-test', name: '测试角色', level: 3, xp: 900, xpNext: 2700, xpPrev: 900, race: '矮人·山丘',
  classes: ['战士 Lv3'], clsKeys: ['fighter'], hp: { cur: 24, max: 31, temp: 0 }, ac: 18, acOverride: null,
  acBreakdown: '链甲 16 ｜ 盾牌 +2', pb: 2, dc: null, attack: null, hitDice: '3d10',
  mods: { str: 3, dex: 1, con: 3, int: 0, wis: 1, cha: -1 }, saves: { str: 5, dex: 1, con: 5, int: 0, wis: 1, cha: -1 },
  saveProfs: ['str', 'con'],
  weaponStats: { main: { key: 'longsword', name: '长剑', damage: '1d8', dmgType: 'slashing', ability: 'str', attack: 5, dmgBonus: 3 }, off: null },
  equipment: { armor: { key: 'chainMail', name: '链甲', base: 16, dexCap: 0 }, shield: { key: 'shield', name: '盾牌', acBonus: 2 }, mainHand: { key: 'longsword', name: '长剑', damage: '1d8', dmgType: 'slashing' }, offHand: null, worn: [] },
  conditions: [{ key: 'prone', name: '倒地', desc: '' }], conditionCatalog: [{ key: 'prone', name: '倒地', desc: '只能爬行' }, { key: 'exhaustion', name: '力竭', level: 1, desc: '等级' }],
  resources: [{ name: '回气', max: 1, note: '短休恢复' }],
  subclass: { name: '勇士', picks: {}, features: [{ name: '强化重击', desc: '19-20 重击' }] },
  choices: { pactBoon: null, invocations: [], feats: ['巨武斗士'] },
  choicesDetail: [{ kind: '魔契', name: '链之契', desc: '获得可变化形态的魔宠' }, { kind: '祈愿', name: '痛苦魔爆', desc: '魔能爆每束加魅力修正' }, { kind: '自定义', name: '苦痛魔爆', desc: '测试用' }],
  classFix: [],
  features: { race: [{ name: '黑暗视觉', desc: '60 尺' }], class: [{ name: '回气', desc: '' }], background: [{ name: '军人', desc: '' }] },
  spells: [{ key: 'magicMissile', name: '魔法飞弹', level: 1, school: '塑能', time: '1 动作', range: '120 尺', duration: '立即', fx: '3d4+3 力场' }],
  slots: [{ lv: 1, max: 2 }],
  legend: null,
  inventory: [{ key: 'torch', name: '火把', qty: 3, kind: 'gear' }, { key: 'explorersPack', name: '探险家套装', kind: 'pack', container: true, contents: [{ key: 'ration', name: '干粮', qty: 10 }] }],
}
const W = 8, H = 5
const MAP = {
  ok: true, name: '测试地图', campaign: 'x', w: W, h: H, cell: 5,
  terrain: Array.from({ length: H }, (_, y) => (y === 0 ? '#'.repeat(W) : ('.'.repeat(W - 2) + '~~'))),
  tokens: [
    { id: 'pc-turiel', name: '图里尔', kind: 'pc', x: 1, y: 1, hp: 3, max: 7, speed: 30, size: 1, note: '' },
    { id: 'gb-a', name: '地精A', kind: 'enemy', x: 4, y: 2, hp: 6, max: 7, speed: 30, size: 1, note: '' },
  ],
  legend: [['.', '地面'], ['#', '岩壁'], ['~', '溪水·困难']],
}
const LOG = {
  ok: true, campaign: '测试战役', round: 2, total: 3,
  entries: [
    { id: 'e1', round: 1, kind: 'turn', actor: 'DM', text: 'R1', detail: '' },
    { id: 'e2', round: 1, kind: 'attack', actor: '图里尔', text: '火焰箭 → 地精A', detail: '1d20+5 → [10] +5 = 15 命中' },
    { id: 'e3', round: 2, kind: 'move', actor: '布洛林', text: 'B2 → C3', detail: '移动 5 尺（1 格）' },
  ],
}
const PARTY = { ok: true, items: [{ id: 'pc-test', name: '测试角色', race: '矮人', cls: '战士3', level: 3, hp: 24, max: 31 }] }
const WS = {
  ok: true,
  // 给一份带 activeSheet 的布局：这样深度渲染会真的走到「角色卡」面板（含特性/祈愿栏位）
  layout: {
    version: 1,
    slots: {
      left: { size: 230, panels: ['roster'] },
      center: { size: 0, panels: ['map', 'sheet'] },
      right: { size: 430, panels: ['combat', 'ai', 'log'] },
      bottom: { size: 210, panels: ['dice'] },
    },
    weights: { left: [1], center: [3, 2], right: [2, 3, 3], bottom: [1] },
    collapsed: [], maximized: null, activeSheet: 'pc-test',
  },
}

const CANNED = {
  'dice.results': { ok: true, count: 2, pending: 1, items: [
    { id: 'r3', t: '2026-09-11T11:00:00.000Z', expr: '1d20+2', label: '敏捷豁免（火球术）', actor: '图里尔', total: 15, dc: 13, success: true, detail: '1d20+2 → [13] +2 = 15' },
    { id: 'r2', t: '2026-09-11T10:59:00.000Z', expr: '1d20+5', label: '火焰箭命中', actor: '图里尔', total: 9, dc: 15, success: false, detail: '1d20+5 → [4] +5 = 9' },
  ] },
  'ws.get': WS, 'party.list': PARTY, 'party.sheet': { ok: true, sheet: SHEET }, 'map.get': MAP, 'log.list': LOG,
  'rules.stats': { ok: true, total: 6803, books: [{ book: '玩家手册', entries: 166 }] },
  'rules.search': { ok: true, items: [{ id: 'r1', title: '战斗', book: '玩家手册', snippet: '…' }] },
  'ext.encounter.stats': { ok: true, rows: [{ actor: '图里尔', attacks: 3, hits: 1, hitRate: '33%', crits: 0, damage: 9, healed: 0, feet: 15 }] },
  'ext.image.map': { ok: true, summary: '已导出 data/images/map-test.svg' },
  'ai.history': { ok: true, messages: [{ role: 'user', content: '我推门进去' }, { role: 'assistant', content: '门后是一间库房。', steps: '· log.append ✔' }], model: 'gpt-4o-mini' },
  'ai.tools': { ok: true, count: 42 },
  'party.xp': { ok: true, items: [
    { id: 'pc-test', name: '测试角色', level: 3, xp: 900, next: 2700, prev: 900, pct: 0, canLevel: false, targetLevel: 3 },
    { id: 'pc-test2', name: '升级中的人', level: 1, xp: 400, next: 300, prev: 0, pct: 100, canLevel: true, targetLevel: 2 },
  ], ready: [{ id: 'pc-test2', name: '升级中的人', level: 1, xp: 400, targetLevel: 2 }], summary: '可升级：升级中的人 → Lv2' },
  'pc.awardXp': { ok: true, each: 200, per: 'each', awards: [], levelUps: [], summary: '经验 +200（每人）：测试角色 1100 XP' },
  'combat.get': { ok: true, active: true, round: 2, turnIndex: 0, current: '图里尔',
    order: [
      { i: 0, id: 'pc-turiel', name: '图里尔', kind: 'pc', init: 18, hp: 3, max: 7, active: true, conditions: [{ key: 'poisoned', name: '中毒', rounds: 2 }], econ: { action: true, move: 15 }, pcId: 'pc-turiel-mistveil' },
      { i: 1, id: 't-地精A', name: '地精A', kind: 'enemy', init: 15, hp: 4, max: 7, conditions: [], econ: {}, tokenId: 'gb-sentryA' },
      { i: 2, id: 'pc-brolin', name: '布洛林', kind: 'pc', init: 9, hp: 7, max: 13, conditions: [], econ: {} },
    ], summary: 'R2 · 当前 图里尔（先攻 18）' },
  'dice.pending': { ok: true, count: 1, pending: [{ id: 'r3', expr: '1d20+2', advantage: 'normal', label: '敏捷豁免（火球术）', dc: 13, kind: 'roll' }], done: [] },
  'roll.dice': { ok: true, total: 15, detail: '1d20+2 → [13] +2 = 15', dice: [13], dropped: [] },
  'dice.answer': { ok: true, id: 'r3', total: 15, success: true, detail: '1d20+2 → [13] +2 = 15', summary: '已记录' },

  'theme.get': { ok: true, theme: { name: 'emerald', mode: 'light', accent: '#4fbf8b' }, presets: { emerald: { name: 'emerald', label: '翡翠', accent: '#4fbf8b' } } },
  'settings.get': { ok: true, path: 'data/ai.json', config: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', temperature: 0.7, maxSteps: 6, extraPrompt: '' }, hasKey: true, keyMask: 'sk-••••abcd', presets: { openai: 'https://api.openai.com/v1', ollama: 'http://127.0.0.1:11434/v1' } },
  'build.options': { ok: true, races: [], classes: [], backgrounds: [], weapons: [], armor: [], packs: [] },
}

// ---------- 桩 React（带每组件状态格 + effect 立即执行）----------
const stateStore = new Map()
let hookIdx = 0
let curComp = ''
const cleanups = []
const ReactStub = {
  createElement(type, props) {
    if (type === undefined) throw new Error('createElement 收到 undefined —— 多半是某个组件/常量没定义')
    if (type === null) throw new Error('createElement 收到 null')
    if (typeof type !== 'function' && typeof type !== 'string') throw new Error('非法组件类型: ' + String(type))
    const children = Array.prototype.slice.call(arguments, 2)
    const p = Object.assign({}, props || {})
    if (children.length) p.children = children.length === 1 ? children[0] : children
    return { type: type, props: p, children: children, key: (props && props.key !== undefined) ? props.key : null }
  },
  Component: class Component {
    constructor(props) { this.props = props || {}; this.state = {}; this.context = null }
    setState(s) { this.state = Object.assign({}, this.state, typeof s === 'function' ? s(this.state, this.props) : s) }
    componentDidCatch() { }
    render() { return null }
  },
  PureComponent: class PureComponent {
    constructor(props) { this.props = props || {}; this.state = {} }
    setState(s) { this.state = Object.assign({}, this.state, typeof s === 'function' ? s(this.state, this.props) : s) }
    render() { return null }
  },
  useState(init) {
    const key = curComp + '#' + (hookIdx++)
    if (!stateStore.has(key)) stateStore.set(key, typeof init === 'function' ? init() : init)
    const set = (v) => { stateStore.set(key, typeof v === 'function' ? v(stateStore.get(key)) : v) }
    return [stateStore.get(key), set]
  },
  useEffect(fn) { try { const d = fn(); if (typeof d === 'function') cleanups.push(d) } catch (e) { problems.push('useEffect 异常：' + (e && e.message || e)) } },
  useLayoutEffect() { },
  useRef(v) { const key = curComp + '@ref#' + (hookIdx++); if (!stateStore.has(key)) stateStore.set(key, { current: v === undefined ? null : v }); return stateStore.get(key) },
  useMemo(fn) { try { return fn() } catch (e) { return undefined } },
  useCallback(fn) { return fn },
  useReducer(_r, init) { return [init, () => { }] },
  createContext(def) { return { Provider: 'ctx', Consumer: 'ctx', _currentValue: def } },
  Fragment: 'Fragment',
  StrictMode: 'StrictMode',
}
const RENDERED = []
const consoleStub = { log() { }, warn() { }, error() { }, info() { } }
const hostStub = {
  call: async (op) => {
    RENDERED.push(op)
    if (Object.prototype.hasOwnProperty.call(CANNED, op)) return CANNED[op]
    return { ok: false, error: 'no canned data for ' + op }
  },
}
const stylesStub = { insert: () => () => { } }

function captureScope(code) {
  const marker = 'return {\n  apply(ctx) {'
  if (!code.includes(marker)) return code
  const names = ['Card', 'Pips', 'XpWidget', 'Sect', 'ChoiceBox', 'LevelSet', 'ManualEdit', 'StatusPanel', 'EquipPanel',
    'Bag', 'RulesPanel', 'Wizard', 'Detail', 'MapPanel', 'LogView', 'LogRow', 'DiceBar', 'PartyView',
    'Workspace', 'Roster', 'SheetHost', 'StatsPanel', 'PanelFrame', 'AIPanel', 'SettingsPanel', 'CombatPanel', 'DicePanel', 'LevelUpBox', 'MulticlassBox', 'ManualLevelBox', 'mcPrereqInfo', 'MCLS_ABILITY', 'FeatureBox', 'XpMini', 'buildExpr', 'onAccentOf', 'normThemeLocal', 'themeClassOf', 'themeStyleOf', 'THEME_LIST', 'cellVariation', 'PANEL_DEFS', 'DEFAULT_LAYOUT', 'normLayout',
    'slotOf', 'inLayout', 'cellDist', 'cloneLayout', 'reorderPanels', 'TERRAIN', 'WS_SLOTS']
  return code.replace(marker, 'globalThis.__UI_SCOPE__ = { ' + names.join(', ') + ' }\n' + marker)
}

function invoke(fn, props) {
  const isClass = !!(fn.prototype && typeof fn.prototype.render === 'function')
  curComp = fn.name || 'anonymous'
  hookIdx = 0
  if (isClass) { const inst = new fn(props || {}); return inst.render() }
  return fn(props || {})
}

let collector = null
function walk(node, depth) {
  if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return
  nodes++
  if (Array.isArray(node)) { node.forEach((n) => walk(n, depth)); return }
  if (typeof node === 'object' && node.type) {
    const label = typeof node.type === 'function' ? (node.type.name || 'anonymous') : String(node.type)
    if (typeof node.type === 'function') {
      if (depth > 18) return
      const p = node.props || {}
      const key = label + ':' + depth + ':' + String(p.id || p.title || p.name || (node.key !== null && node.key !== undefined ? node.key : ''))
      if (seen.has(key)) return
      seen.add(key)
      let out
      try { out = invoke(node.type, node.props) } catch (e) { problems.push('组件 ' + label + '() 渲染异常：' + (e && e.message || e)); return }
      walk(out, depth + 1)
      return
    }
    if (collector && typeof node.props.className === 'string') collector.push(node.props.className)
    // 只走 children：桩 createElement 里 props.children 与 children 指向同一批对象，两个都走会指数膨胀
    const kids = (node.children && node.children.length) ? node.children : (node.props.children ? [].concat(node.props.children) : [])
    kids.forEach((k) => walk(k, depth))
    return
  }
  if (typeof node === 'object' && node.props) walk(node.props.children, depth)
}

function countByType(node, matches, acc) {
  if (node === null || node === undefined) return acc
  if (Array.isArray(node)) { node.forEach((n) => countByType(n, matches, acc)); return acc }
  if (typeof node !== 'object') return acc
  const cls = node.props && node.props.className
  if (typeof cls === 'string' && matches(cls)) acc.push(node)
  // 只走 children（桩 createElement 里 props.children 与 children 是同一批引用，重复走会指数膨胀）
  ;[].concat(node.children || []).forEach((k) => countByType(k, matches, acc))
  return acc
}
function histogram(node, hist) {
  if (!node) return hist
  if (Array.isArray(node)) { node.forEach((n) => histogram(n, hist)); return hist }
  if (typeof node !== 'object') return hist
  const cls = node.props && node.props.className
  if (typeof cls === 'string') { const k = cls.split(' ')[0]; hist[k] = (hist[k] || 0) + 1 }
  ;[].concat(node.children || []).forEach((k) => histogram(k, hist))
  return hist
}

// ---------- 1) 装载 ----------
let factory
try { factory = new Function('React', 'host', 'styles', 'console', captureScope(src)) }
catch (e) { console.log('✘ UI 源码语法错误：' + e.message); process.exit(1) }
let plugin
try { plugin = factory(ReactStub, hostStub, stylesStub, consoleStub) }
catch (e) { console.log('✘ UI 源码执行失败：' + e.message); process.exit(1) }
if (!plugin || typeof plugin.apply !== 'function') { console.log('✘ UI 插件形状不对（缺 apply）'); process.exit(1) }

// ---------- 2) 挂载 ----------
const tabs = []
const ctxStub = {
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
  get(name) { return name === 'betterSidebar' ? { registerTab(spec) { tabs.push(spec); return () => { } } } : undefined },
  timer: { interval: () => () => { } },
  logger: consoleStub,
}
try { plugin.apply(ctxStub) } catch (e) { problems.push('apply() 抛异常：' + (e && e.message || e)) }
if (!tabs.length) problems.push('没有注册页签（betterSidebar.registerTab 未被调用）')

// ---------- 3) 基础：逐个面板 ----------
const scope = globalThis.__UI_SCOPE__ || {}
const rendered = []
const tryRender = (name, props) => {
  const fn = scope[name]
  if (typeof fn !== 'function') { problems.push('面板 ' + name + ' 不存在（作用域里找不到）'); return }
  let out
  try { out = invoke(fn, props || {}) } catch (e) { problems.push(name + '() 渲染异常：' + (e && e.message || e)); return }
  const before = problems.length
  walk(out, 0)
  rendered.push(name + (problems.length > before ? ' ✘' : ' ✔'))
}
stateStore.clear()
tryRender('Card', { title: 'x', items: [] })
tryRender('XpWidget', { s: SHEET })
tryRender('LevelSet', { s: SHEET })
tryRender('ManualEdit', { s: SHEET })
tryRender('StatusPanel', { s: SHEET })
tryRender('EquipPanel', { s: SHEET })
tryRender('Bag', { s: SHEET })
tryRender('FeatureBox', { s: SHEET })
tryRender('LevelUpBox', { s: SHEET })
tryRender('ManualLevelBox', { s: SHEET })
tryRender('LevelSet', { s: SHEET, manual: true })
tryRender('MulticlassBox', { s: SHEET })
tryRender('RulesPanel', {})
tryRender('Detail', { s: SHEET })
tryRender('MapPanel', { bare: true })
tryRender('LogView', { party: [], bare: true })
tryRender('Roster', { activeId: 'pc-test', onPick() { }, onOpen() { }, rev: 0 })
tryRender('SheetHost', { activeId: 'pc-test', rev: 0 })
tryRender('StatsPanel', {})
tryRender('PanelFrame', { id: 'map', layout: scope.DEFAULT_LAYOUT, collapsed: false, isMax: false, onCollapse() { }, onMax() { }, onClose() { }, onMove() { }, onAddTo() { } })
tryRender('Wizard', {})
tryRender('PartyView', {})
tryRender('Workspace', {})
tryRender('CombatPanel', { conditionCatalog: [{ key: 'prone', name: '倒地' }] })
tryRender('XpMini', { item: { xp: 900, next: 2700, pct: 33, canLevel: false } })
tryRender('XpMini', { item: { xp: 400, next: 300, pct: 100, canLevel: true, targetLevel: 2 } })
tryRender('DicePanel', { theme: { name: 'azure', mode: 'dark', accent: '#5aa0ff' } })
tryRender('AIPanel', { onOpen() { } })
tryRender('SettingsPanel', { toolCount: 42, theme: { name: 'amber', mode: 'dark', accent: '#e0a64a' }, onTheme: async () => ({ ok: true }) })
for (const t of tabs) { try { walk(t.component(), 0); rendered.push('页签 ' + t.title + ' ✔') } catch (e) { problems.push('页签 ' + t.title + ' 渲染异常：' + (e && e.message || e)) } }

// ---------- 4) 深度：两遍渲染真工作区 ----------
const deep = { ok: true, detail: [] }
async function deepWorkspace() {
  stateStore.clear()
  const Workspace = scope.Workspace
  if (typeof Workspace !== 'function') { deep.ok = false; deep.detail.push('找不到 Workspace'); return }
  let out
  try { out = invoke(Workspace, {}) } catch (e) { deep.ok = false; deep.detail.push('第一遍渲染异常：' + (e && e.message || e)); return }
  await new Promise((r) => setTimeout(r, 30))          // 等 call() 的 promise 落地
  try { out = invoke(Workspace, {}) } catch (e) { deep.ok = false; deep.detail.push('第二遍渲染异常：' + (e && e.message || e)); return }
  const before = problems.length
  // 嵌套面板（先攻/骰子/角色卡等）是在 walk 时才真正被调用的，它们的 effect 也在那时才跑，
  // 所以要走两遍：第一遍触发加载 → 等异步落地 → 第二遍才带上数据。
  seen.clear()
  collector = []
  try { walk(out, 0) } catch (e) { deep.ok = false; deep.detail.push('遍历异常：' + (e && e.message || e)); return }
  collector = null
  await new Promise((r) => setTimeout(r, 30))
  seen.clear()
  collector = []
  try { walk(out, 0) } catch (e) { deep.ok = false; deep.detail.push('第二遍遍历异常：' + (e && e.message || e)); return }
  const seenCls = collector
  collector = null
  if (problems.length > before) { deep.ok = false; deep.detail.push('渲染期报错 ' + (problems.length - before) + ' 条'); return }

  const has = (p) => seenCls.filter((c) => c === p).length
  const starts = (p) => seenCls.filter((c) => c.indexOf(p) === 0).length
  const cells = starts('dndp-cell')
  const toks = has('dndp-tok') + starts('dndp-tok ')
  const rows = starts('dndp-logrow')
  const panels = seenCls.filter((c) => c.indexOf('dndp-panel') === 0 && c.indexOf('dndp-panelslot') !== 0).length
  const titles = has('dndp-ptitle')
  const splitters = starts('dndp-ws-split')
  const roster = seenCls.filter((c) => c.indexOf('dndp-ritem') === 0).length
  const aiMsgs = has('dndp-bubble')
  const xpBars = starts('dndp-xpmini')
  const featCards = has('dndp-cardwrap')
  const warnBoxes = has('dndp-warn')
  const recRows = has('dndp-rec')
  const liveBtns = has('dndp-dicego') + starts('dndp-dicego ')
  const upMarks = has('dndp-xpup')

  deep.detail.push('地图格 ' + cells + '（期望 ' + (W * H) + '）')
  deep.detail.push('地图单位 ' + toks + '（期望 2）')
  deep.detail.push('战斗记录行 ' + rows + '（期望 3）')
  deep.detail.push('面板 ' + panels + ' 个，标题栏 ' + titles + ' 个，分隔条 ' + splitters + ' 条')
  deep.detail.push('角色列表项 ' + roster + '（期望 1）')
  deep.detail.push('AI 对话气泡 ' + aiMsgs + '（期望 2）')
  deep.detail.push('经验条 ' + xpBars + ' 条；特性卡片 ' + featCards + ' 张；判定记录 ' + recRows + ' 行；骰子按钮 ' + liveBtns + ' 个')

  const bad = []
  if (cells !== W * H) bad.push('地图格子数不符')
  if (toks !== 2) bad.push('地图单位数不符')
  if (rows !== 3) bad.push('战斗记录行数不符')
  if (titles < 5) bad.push('默认布局应至少 5 个面板标题栏（含 AI 对话）')
  if (aiMsgs !== 2) bad.push('AI 面板历史消息未渲染')
  if (xpBars < 1) bad.push('经验条未渲染（角色行或升级面板）')
  if (featCards < 3) bad.push('特性/祈愿卡片未渲染（期望 >= 3）')
  if (recRows !== 2) bad.push('战斗判定记录应为 2 行（最新在上），实际 ' + recRows)
  if (liveBtns < 1) bad.push('骰子投掷按钮未渲染')
  if (splitters < 3) bad.push('分隔条数量不足')
  if (!bad.length) notes.push('深度渲染：地图 ' + cells + ' 格 / ' + toks + ' 单位，记录 ' + rows + ' 行，AI 气泡 ' + aiMsgs + ' 个，面板 ' + panels + ' 个，分隔条 ' + splitters + ' 条')
  else { deep.ok = false; bad.forEach((b) => deep.detail.push('✘ ' + b)) }

  const calls = {}
  RENDERED.forEach((c) => { calls[c] = (calls[c] || 0) + 1 })
  deep.detail.push('渲染期调用：' + Object.keys(calls).map((k) => k + '×' + calls[k]).join('、'))
  const hist = {}
  seenCls.forEach((c) => { const k = c.split(' ')[0]; hist[k] = (hist[k] || 0) + 1 })
  deep.detail.push('类名直方图：' + Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + '×' + v).join('、'))
}

// ---------- 5) 纯函数 ----------
function pureChecks() {
  const cd = scope.cellDist
  if (typeof cd !== 'function') { problems.push('cellDist 不存在'); return }
  const d1 = cd({ x: 0, y: 0 }, { x: 3, y: 4 })
  const d2 = cd({ x: 0, y: 0 }, { x: 2, y: 2 })
  if (d1.cells !== 4 || d1.feetSimple !== 20 || d1.feetStandard !== 25) problems.push('cellDist(3,4) 结果不对：' + JSON.stringify(d1))
  if (d2.feetStandard !== 15) problems.push('cellDist(2,2) 应为 15 尺（5-10-5）：' + JSON.stringify(d2))
  const nl = scope.normLayout
  if (typeof nl === 'function') {
    const l = nl({ slots: { left: { panels: ['roster', 'bogus'] } } })
    if (l.slots.left.panels.join(',') !== 'roster') problems.push('normLayout 未剔除非法面板 id')
    if (!l.slots.center || !Array.isArray(l.weights.center)) problems.push('normLayout 未补全缺失槽位')
  }
  const slotOf = scope.slotOf
  if (typeof slotOf === 'function' && slotOf(nl(scope.DEFAULT_LAYOUT), 'map') !== 'center') problems.push('默认布局里 map 应该在 center')
  // 主题：亮度判定 + 规范化
  const oa = scope.onAccentOf, nt = scope.normThemeLocal, tcl = scope.themeClassOf
  let themeOk = true
  if (typeof oa === 'function') {
    if (oa('#ffffff') !== '#0d1015') problems.push('白色强调色上应该用深色文字：' + oa('#ffffff'))
    if (oa('#101820') !== '#ffffff') problems.push('深色强调色上应该用白色文字：' + oa('#101820'))
  }
  if (typeof nt === 'function') {
    const bad = nt({ name: 'nope', mode: 'weird', accent: 'red' })
    if (bad.name !== 'azure' || bad.mode !== 'dark' || bad.accent !== '#5aa0ff') problems.push('非法主题没有回退到默认：' + JSON.stringify(bad))
  }
  if (typeof tcl === 'function') {
    if (tcl({ name: 'rose', mode: 'light', accent: '#e07a98' }) !== 'dndp-theme-rose dndp-light') problems.push('主题 class 组合不对：' + tcl({ name: 'rose', mode: 'light', accent: '#e07a98' }))
  }
  if (themeOk && typeof oa === 'function' && typeof tcl === 'function') notes.push('主题断言：明暗文字自动切换 / 非法值回退默认 / class 组合正确')
  // 拖动落位：跨槽位 / 同槽位重排 / 权重与面板数一致
  // 瓦片：21 种都有 kind，且图例色块用同一套 kind
  const TM = scope.TERRAIN
  if (TM && typeof TM === 'object') {
    const kinds = Object.keys(TM).map(k => TM[k].k)
    const uniq = new Set(kinds)
    if (kinds.length !== 21) problems.push('瓦片种类应为 21，实际 ' + kinds.length)
    if (uniq.size !== kinds.length) problems.push('瓦片 kind 有重复：' + kinds.join(','))
    for (const need of ['floor', 'grass', 'wall', 'brick', 'water', 'deep', 'tree', 'fire', 'stair', 'pillar', 'furn']) {
      if (!uniq.has(need)) problems.push('缺少瓦片 kind: ' + need)
    }
    notes.push('瓦片：' + kinds.length + ' 种（kind 唯一），含草地/砖墙/深水/楼梯/岩柱/家具等')
  } else problems.push('TERRAIN 表不存在')
  const cv = scope.cellVariation
  if (typeof cv === 'function') {
    const a1 = cv(3, 5), b1 = cv(3, 5), c1 = cv(4, 5)
    if (JSON.stringify(a1) !== JSON.stringify(b1)) problems.push('同格微差应当稳定（可复现）')
    if (JSON.stringify(a1) === JSON.stringify(c1)) problems.push('相邻格微差应当不同')
  }
  // 范围模板：覆盖格渲染 + 图例
  const TM2 = scope.TERRAIN
  if (TM2) {
    const cover2 = Object.keys(TM2).filter(k => TM2[k].cover)
    if (cover2.length < 3) problems.push('带掩体属性的瓦片应至少 3 种（灌木/树/家具），实际 ' + cover2.length)
    const solid2 = Object.keys(TM2).filter(k => TM2[k].solid)
    if (!solid2.includes('#') || !solid2.includes('b') || !solid2.includes('c')) problems.push('墙体类瓦片应标记 solid：#/b/c')
    const diff2 = Object.keys(TM2).filter(k => TM2[k].difficult)
    if (diff2.length < 4) problems.push('困难地形瓦片偏少：' + diff2.length)
    notes.push('瓦片规则：阻挡 ' + solid2.length + ' 种 / 困难 ' + diff2.length + ' 种 / 掩体 ' + cover2.length + ' 种（可支撑视线与掩体判定）')
  }
  // 骰池 → 骰式
  const be = scope.buildExpr
  if (typeof be === 'function') {
    const t1 = be({ d20: 2, d6: 1 }, 3)
    if (t1 !== '1d6+2d20+3') problems.push('骰式拼装不对：' + t1)
    if (be({}, 0) !== '1d20') problems.push('空骰池应回退 d20：' + be({}, 0))
    if (be({ d20: 1 }, -2) !== '1d20-2') problems.push('负调整值拼装不对：' + be({ d20: 1 }, -2))
    notes.push('骰池拼装：' + t1 + ' / ' + be({}, 0) + ' / ' + be({ d20: 1 }, -2))
  }
  // 兼职前置判定（纯函数）
  const mc = scope.mcPrereqInfo
  if (typeof mc === 'function') {
    const mods = { str: 3, dex: 1, con: 3, int: 0, wis: 1, cha: -1 }
    const base = { clsKeys: ['fighter'], mods: mods }
    const a1 = mc(base, 'rogue', ['fighter'])   // 敏捷 +1 → 满足
    if (!a1.ok) problems.push('敏捷13（+1）兼职游荡者应该允许：' + JSON.stringify(a1.bad))
    const a2 = mc(base, 'wizard', ['fighter'])  // 智力 +0 → 不满足
    if (a2.ok) problems.push('智力10 兼职法师应该被拒')
    const a3 = mc({ clsKeys: ['fighter'], mods: { str: 0, dex: 2, con: 2, int: 2, wis: 0, cha: 0 } }, 'rogue', ['fighter'])
    if (a3.ok) problems.push('已有职业主属性不足（力量+0）时应被拒')
    if (a2.text.indexOf('智力') < 0) problems.push('前置说明缺少属性名：' + a2.text)
    notes.push('兼职前置：敏捷+1 可兼游荡者 / 智力+0 拒绝 / 已有本职不达标也拒绝')
  }
  const rp = scope.reorderPanels
  if (typeof rp === 'function') {
    const base = nl(scope.DEFAULT_LAYOUT)
    const a = rp(base, 'map', 'left', 1)
    if (a.slots.left.panels.join(',') !== 'roster,map') problems.push('跨槽位移动结果不对：left=' + a.slots.left.panels.join(','))
    if (a.slots.center.panels.join(',') !== 'sheet') problems.push('移出后面板残留：center=' + a.slots.center.panels.join(','))
    const b = rp(base, 'ai', 'center', 0)
    if (b.slots.center.panels[0] !== 'ai') problems.push('插到首位结果不对：' + b.slots.center.panels.join(','))
    const three = nl({ slots: { center: { panels: ['map', 'sheet', 'log'] } } })
    const c = rp(three, 'map', 'center', 2)
    if (c.slots.center.panels.join(',') !== 'sheet,map,log') problems.push('同槽位重排结果不对：' + c.slots.center.panels.join(','))
    const d = rp(three, 'log', 'center', 0)
    if (d.slots.center.panels.join(',') !== 'log,map,sheet') problems.push('同槽位前插结果不对：' + d.slots.center.panels.join(','))
    for (const k of ['left', 'center', 'right', 'bottom']) {
      if (c.slots[k].panels.length !== (c.weights[k] || []).length) problems.push('权重长度与面板数不一致：' + k)
    }
    if (!problems.length) notes.push('拖动落位：跨槽位/同槽位重排/权重 4 个断言通过')
  }
}

await deepWorkspace()
pureChecks()

// ---------- 结果 ----------
console.log('UI 源码：' + SRC_PATH)
console.log('源码 ' + Buffer.byteLength(src) + ' B ｜ 基础遍历节点 ' + nodes + ' 个 ｜ 渲染面板 ' + rendered.length + ' 个')
console.log('面板：' + rendered.join('，'))
console.log('')
console.log((deep.ok ? '✔' : '✘') + ' 深度渲染（工作区两遍渲染 + 断言）')
deep.detail.forEach((d) => console.log('   · ' + d))
if (notes.length) notes.forEach((n) => console.log('   ★ ' + n))
if (problems.length) {
  console.log('\n✘ 发现 ' + problems.length + ' 个问题：')
  problems.slice(0, 25).forEach((p) => console.log('  · ' + p))
  process.exit(1)
}
if (!deep.ok) process.exit(1)
console.log('\n✔ 冒烟全部通过')
// 面板里有 setInterval 轮询，桩环境里不会自己退出，显式结束
process.exit(0)
