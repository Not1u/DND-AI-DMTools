// tools/check-ui.mjs — UI 源码静态自检：找出「引用但未定义」的组件/常量，防 RulesPanel/KINDN 类事故
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'engine', 'ui-client.latest.txt')
const src = fs.readFileSync(SRC, 'utf8')

const defined = new Set()
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1])
for (const m of src.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1])
for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
for (const m of src.matchAll(/let\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
for (const m of src.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
// 宿主/浏览器内置
for (const b of ['React', 'h', 'host', 'styles', 'console', 'document', 'window', 'localStorage', 'fetch', 'navigator', 'setTimeout', 'clearTimeout', 'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Error', 'RegExp', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'Function', 'Map', 'Set', 'Infinity', 'NaN']) defined.add(b)

const used = new Set()
for (const m of src.matchAll(/\bh\(\s*([A-Za-z_$][\w$]*)/g)) used.add(m[1])
for (const m of src.matchAll(/React\.createElement\(\s*([A-Za-z_$][\w$]*)/g)) used.add(m[1])
// 仅检查首字母大写（组件）与全大写（常量）标识符
const suspicious = [...used].filter(n => /^[A-Z]/.test(n) && !defined.has(n))

// 额外的常量引用检查（全大写）
const constRefs = new Set()
for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) constRefs.add(m[1])
const undefConsts = [...constRefs].filter(n => !defined.has(n) && !['JSON', 'URL', 'CSS', 'HTML', 'DOM', 'UUID', 'API'].includes(n))

console.log('组件引用 ' + used.size + ' 个；定义 ' + defined.size + ' 个')
if (suspicious.length) {
  console.log('!! 未定义的组件引用: ' + suspicious.join(', '))
} else {
  console.log('ok: 所有组件引用都有定义')
}
if (undefConsts.length) console.log('?? 可能未定义的常量: ' + undefConsts.join(', '))
const missing = suspicious.length
const packCount = (src.match(/sheet\.pack\.take/g) || []).length
const panelCount = (src.match(/h\(RulesPanel/g) || []).length
console.log('checks: RulesPanel 引用=' + panelCount + '，pack.take 调用=' + packCount)
process.exit(missing ? 1 : 0)
