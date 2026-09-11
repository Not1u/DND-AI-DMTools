#!/usr/bin/env node
/**
 * 从开发仓库同步运行所需文件到本目录（单向：仓库 → SoloTRPG）。
 *
 *   node tools/sync-from-repo.mjs                       # 默认源 E:\HarnessTarvern\dnd5e
 *   node tools/sync-from-repo.mjs --from D:\repo\dnd5e
 *   node tools/sync-from-repo.mjs --no-index            # 跳过 29MB 规则索引
 *   node tools/sync-from-repo.mjs --force               # 覆盖角色/地图/战斗记录（默认不覆盖玩家数据）
 *
 * 同步内容：engine/（引擎源码）、rules/、plugins/、characters/、data/rules-index/、
 *           tools/（探针与地图生成器）、NOTICE/LICENSE、以及首次运行时补齐 React 运行库。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const has = (k) => argv.includes(k)

const FROM = path.resolve(arg('--from', process.env.DND5E_REPO || 'E:\\HarnessTarvern\\dnd5e'))
const NO_INDEX = has('--no-index')
const FORCE = has('--force')

let copied = 0, skipped = 0, bytes = 0
const log = (s) => console.log(s)

async function copyFile(src, dest, opts = {}) {
  try {
    const st = await fsp.stat(src)
    if (!st.isFile()) return
    if (!opts.overwrite && fs.existsSync(dest)) {
      const cur = await fsp.stat(dest)
      if (cur.mtimeMs >= st.mtimeMs && cur.size === st.size) { skipped++; return }
      if (!opts.overwrite) { skipped++; return }
    }
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await fsp.copyFile(src, dest)
    copied++; bytes += st.size
  } catch (e) { log('  ! 跳过 ' + src + ' (' + e.message + ')') }
}

async function copyDir(rel, opts = {}) {
  const src = path.join(FROM, rel)
  if (!fs.existsSync(src)) { log('  - 源不存在，跳过：' + rel); return }
  const destRoot = opts.dest || rel
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const from = path.join(src, e.name)
    const to = path.join(HERE, destRoot, e.name)
    if (e.isDirectory()) await copyDir(path.join(rel, e.name), Object.assign({}, opts, { dest: path.join(destRoot, e.name) }))
    else if (e.isFile() && /\.(json|jsonl|txt|mjs|js|md|yml|html|bat|ico)$/i.test(e.name)) await copyFile(from, to, opts)
  }
}

async function main() {
  if (!fs.existsSync(FROM)) {
    log('源仓库不存在：' + FROM + '\n用 --from 指定开发仓库路径。')
    process.exit(2)
  }
  log('源仓库：' + FROM)
  log('目标  ：' + HERE)
  log('')

  log('· engine/（引擎源码）')
  await copyDir('engine', { overwrite: true })
  log('· rules/（SRD 数据）')
  await copyDir('rules', { overwrite: true })
  log('· plugins/（扩展插件）')
  await copyDir('plugins', { overwrite: true })
  log('· tools/（探针与工具）')
  await copyDir('tools', { overwrite: true })
  // 外壳本体（独立运行器、页面、构建脚本）也来自仓库：standalone/ → 根目录
  log('· standalone/（外壳本体：server / 页面 / 打包脚本）')
  for (const f of ['server.mjs', 'package.json', 'start.bat']) {
    await copyFile(path.join(FROM, 'standalone', f), path.join(HERE, f), { overwrite: true })
  }
  await copyDir('standalone/app', { overwrite: true, dest: 'app' })
  await copyDir('standalone/tools', { overwrite: true, dest: 'tools' })
  if (!fs.existsSync(path.join(HERE, 'config.json'))) {
    const cfg = { port: 4620, bind: '127.0.0.1', dataRoot: '.' }
    fs.writeFileSync(path.join(HERE, 'config.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf8')
    log('  已生成默认 config.json（端口 4620）')
  }
  log('· characters/（角色卡）')
  await copyDir('characters', { overwrite: FORCE })
  log('· 文档')
  for (const f of ['NOTICE.md', 'LICENSE', 'README.md']) await copyFile(path.join(FROM, f), path.join(HERE, f + (f === 'README.md' ? '.repo' : '')), { overwrite: true })

  log('· data/（地图、战斗记录）')
  for (const f of ['map.json', 'combat-log.json']) await copyFile(path.join(FROM, 'data', f), path.join(HERE, 'data', f), { overwrite: FORCE })

  if (!NO_INDEX) {
    log('· data/rules-index/（规则书索引，约 29MB）')
    await copyDir('data/rules-index', { overwrite: true })
  } else {
    log('· 跳过 data/rules-index/（--no-index）')
  }

  // React 运行库：优先本机已有的 UMD 构建
  const reactCandidates = [
    'C:\\Users\\DELL\\.dsh\\profiles\\node_modules\\dsh-plugin-desktop\\node_modules',
    path.join(FROM, 'node_modules'),
  ]
  const need = ['app/vendor/react.js', 'app/vendor/react-dom.js'].filter((f) => !fs.existsSync(path.join(HERE, f)))
  if (need.length) {
    log('· app/vendor/（React 运行库）')
    for (const base of reactCandidates) {
      const r1 = path.join(base, 'react', 'umd', 'react.production.min.js')
      const r2 = path.join(base, 'react-dom', 'umd', 'react-dom.production.min.js')
      if (fs.existsSync(r1) && fs.existsSync(r2)) {
        await copyFile(r1, path.join(HERE, 'app', 'vendor', 'react.js'), { overwrite: true })
        await copyFile(r2, path.join(HERE, 'app', 'vendor', 'react-dom.js'), { overwrite: true })
        log('   来自 ' + base)
        break
      }
    }
    if (need.some((f) => !fs.existsSync(path.join(HERE, f)))) log('   ! 没找到 React UMD，请手动放到 app/vendor/react.js 与 react-dom.js')
  }

  log('')
  log('完成：复制 ' + copied + ' 个文件（' + (bytes / 1048576).toFixed(1) + ' MB），跳过 ' + skipped + ' 个（已存在；--force 可覆盖玩家数据）')
  log('启动： node server.mjs')
}

main()
