#!/usr/bin/env node
/**
 * 常驻插件 HTTP 桥的通用探针 / DM 工具。
 *
 * 用法：
 *   node tools/dnd-api.mjs <op> '<json args>'
 *   node tools/dnd-api.mjs log.list '{"limit":10}'
 *   node tools/dnd-api.mjs roll.dice '{"expr":"1d20+5","actor":"图里尔·雾纱","label":"法术攻击"}'
 *   node tools/dnd-api.mjs log.append '{"entries":[{"kind":"narrate","actor":"DM","text":"..."}]}'
 *
 * Windows 上如果 shell 把引号吃掉（报 “args 不是合法 JSON”），把参数写进文件再传 @路径：
 *   node tools/dnd-api.mjs log.append '@tools/_args.json'
 *
 * 说明：不要用 PowerShell 的 Invoke-RestMethod 传中文——它会把中文和 `+` 弄坏；
 *       这个脚本用 fetch + JSON.stringify，编码是干净的。
 * 端口：环境变量 DND5E_API 可覆盖，默认 http://127.0.0.1:43120/dnd5e/api
 */
const URL_BASE = process.env.DND5E_API || 'http://127.0.0.1:43120/dnd5e/api'

async function api(op, args) {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, args: args === undefined ? null : args }),
  })
  const data = await res.json().catch(() => null)
  if (!data) throw new Error('bad response from ' + URL_BASE)
  return data
}

const [op, rawArgs] = process.argv.slice(2)
if (!op) {
  console.error('usage: node tools/dnd-api.mjs <op> [json-args]')
  process.exit(2)
}

let args = null
if (rawArgs) {
  try {
    if (rawArgs.startsWith('@')) {
      const { readFileSync } = await import('node:fs')
      let txt = readFileSync(rawArgs.slice(1), 'utf8')
      if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1)
      args = JSON.parse(txt)
    } else {
      args = JSON.parse(rawArgs)
    }
  } catch (e) { console.error('args 不是合法 JSON: ' + e.message); process.exit(2) }
}

const data = await api(op, args)
console.log(JSON.stringify(data, null, 2))
if (data && data.ok === true && data.value && data.value.ok === false) process.exit(1)
if (data && data.ok !== true) process.exit(1)
