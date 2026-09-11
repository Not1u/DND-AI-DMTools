#!/usr/bin/env node
/**
 * 打包成单个 SoloTRPG.exe（Node SEA：把 Node 运行时 + 启动器打进一个可执行文件）。
 *
 *   node tools/build-exe.mjs                 # 输出到本目录 SoloTRPG.exe
 *   node tools/build-exe.mjs --out dist\SoloTRPG.exe
 *   node tools/build-exe.mjs --no-icon       # 不注入图标（排错用）
 *
 * 产物：单文件 exe（内含 Node v24），双击即启动本地服务并打开浏览器。
 * exe 需要和 engine/ rules/ data/ characters/ plugins/ 放在同一层目录（就是本目录）。
 *
 * 依赖：postject（注入 SEA blob）、resedit（纯 JS 改 PE 资源里的图标）——
 * 首次运行会自动 npm install 到 build/ 下。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const has = (k) => argv.includes(k)

const OUT = path.resolve(ROOT, arg('--out', 'SoloTRPG.exe'))
const BUILD = path.join(ROOT, 'build')
const LAUNCHER = path.join(BUILD, 'sea-launcher.cjs')
const SEA_CFG = path.join(BUILD, 'sea-config.json')
const BLOB = path.join(BUILD, 'sea-prep.blob')
const ICON = path.join(ROOT, 'app', 'icon.ico')
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const step = (s) => console.log('\n▸ ' + s)
const mb = (n) => (n / 1048576).toFixed(1) + ' MB'

// ---------- 1) 启动器（被内联进 exe 的 CJS 入口）----------
step('生成启动器 build/sea-launcher.cjs')
const LAUNCHER_SRC = `// SoloTRPG 单文件启动器（Node SEA 内联入口）
// 职责：定位数据根目录 → 起 server.mjs → 等端口就绪 → 打开浏览器
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const exeDir = path.dirname(process.execPath);

function findRoot() {
  const cands = [];
  if (process.env.SOLOTRPG_ROOT) cands.push(process.env.SOLOTRPG_ROOT);
  cands.push(exeDir);
  cands.push(path.join(exeDir, '..'));
  cands.push(process.cwd());
  cands.push(path.join(exeDir, 'SoloTRPG'));
  for (const c of cands) {
    try {
      if (fs.existsSync(path.join(c, 'engine', 'ui-host.latest.txt')) && fs.existsSync(path.join(c, 'server.mjs'))) return path.resolve(c);
    } catch (e) { }
  }
  return null;
}

function diagnose() {
  const lines = ['    每个候选目录需要同时具备 server.mjs 与 engine/ui-host.latest.txt：'];
  const cands = [exeDir, path.join(exeDir, '..'), process.cwd()];
  for (const c of cands) {
    const miss = [];
    if (!fs.existsSync(path.join(c, 'server.mjs'))) miss.push('server.mjs');
    if (!fs.existsSync(path.join(c, 'engine', 'ui-host.latest.txt'))) miss.push('engine/');
    if (!fs.existsSync(path.join(c, 'data', 'rules-index', 'manifest.json'))) miss.push('data/rules-index/（规则书检索用，可后补）');
    lines.push('    - ' + c + '：' + (miss.length ? ('缺 ' + miss.join('、')) : '齐全'));
  }
  return lines;
}

function readPort(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
    return Number(process.env.PORT || cfg.port || 4620);
  } catch (e) { return Number(process.env.PORT || 4620); }
}

function probing(port, host) {
  return new Promise(function (resolve) {
    const s = net.connect({ port: port, host: host });
    s.setTimeout(400);
    s.on('connect', function () { s.destroy(); resolve(true); });
    s.on('timeout', function () { s.destroy(); resolve(false); });
    s.on('error', function () { resolve(false); });
  });
}

function openBrowser(url) {
  if (process.env.SOLOTRPG_NO_BROWSER) return;
  try {
    if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { }
}

(async function main() {
  const root = findRoot();
  if (!root) {
    console.error('');
    console.error('  ✘ 没找到数据目录 —— SoloTRPG.exe 要和服务文件、数据目录放在同一层。');
    diagnose().forEach(function (l) { console.error(l); });
    console.error('    当前 exe：' + process.execPath);
    console.error('');
    process.stdin.resume();
    return;
  }
  process.chdir(root);
  const port = readPort(root);
  const host = '127.0.0.1';
  const url = 'http://' + host + ':' + port;

  if (await probing(port, host)) {
    console.log('  SoloTRPG 已经在运行，直接打开 ' + url);
    openBrowser(url);
    return;
  }

  console.log('');
  console.log('  ⚔  SoloTRPG');
  console.log('     数据目录  ' + root);
  console.log('     服务地址  ' + url);
  console.log('     关闭本窗口即停止服务');
  console.log('');
  try {
    await import(pathToFileURL(path.join(root, 'server.mjs')).href);
  } catch (e) {
    console.error('  ✘ 启动失败：' + (e && e.message || e));
    process.stdin.resume();
    return;
  }
  for (let i = 0; i < 60; i++) {
    await new Promise(function (r) { setTimeout(r, 250); });
    if (await probing(port, host)) { openBrowser(url); break; }
  }
})();
`
fs.mkdirSync(BUILD, { recursive: true })
fs.writeFileSync(LAUNCHER, LAUNCHER_SRC, 'utf8')

// ---------- 2) 依赖 ----------
step('准备构建依赖（postject / resedit）')
const need = ['postject', 'resedit'].filter((m) => !fs.existsSync(path.join(BUILD, 'node_modules', m)))
if (need.length) {
  if (!fs.existsSync(path.join(BUILD, 'package.json'))) fs.writeFileSync(path.join(BUILD, 'package.json'), '{"name":"solotrpg-build","private":true}', 'utf8')
  console.log('  安装 ' + need.join('、') + ' …')
  execFileSync('npm', ['install', ...need, '--silent', '--no-audit', '--no-fund'], { cwd: BUILD, stdio: 'inherit', shell: true })
}
const POSTJECT = path.join(BUILD, 'node_modules', 'postject', 'dist', 'cli.js')
if (!fs.existsSync(POSTJECT)) { console.error('✘ 找不到 postject，无法注入 SEA blob'); process.exit(1) }

// ---------- 3) SEA blob ----------
step('打包 SEA blob')
fs.writeFileSync(SEA_CFG, JSON.stringify({
  main: path.relative(BUILD, LAUNCHER).replace(/\\/g, '/'),
  output: path.relative(BUILD, BLOB).replace(/\\/g, '/'),
  disableExperimentalSEAWarning: true,
}, null, 2), 'utf8')
execFileSync(process.execPath, ['--experimental-sea-config', path.basename(SEA_CFG)], { cwd: BUILD, stdio: 'inherit' })
const blobSize = fs.statSync(BLOB).size
console.log('  blob ' + blobSize + ' B')

// ---------- 4) 复制 node.exe ----------
step('复制 Node 运行时 → ' + path.relative(ROOT, OUT))
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.copyFileSync(process.execPath, OUT)

// ---------- 5) 注入 ----------
step('注入 blob（postject）')
execFileSync(process.execPath, [POSTJECT, OUT, 'NODE_SEA_BLOB', BLOB, '--sentinel-fuse', FUSE], { stdio: 'inherit' })

// ---------- 6) 图标 ----------
if (!has('--no-icon') && fs.existsSync(ICON)) {
  step('注入图标（resedit）')
  try {
    const ResEdit = await import(pathToFileURL(path.join(BUILD, 'node_modules', 'resedit', 'dist', 'index.js')).href)
    const mod = ResEdit.default || ResEdit
    const data = fs.readFileSync(OUT)
    const exe = mod.NtExecutable.from(data, { ignoreCert: true })
    const res = mod.NtExecutableResource.from(exe)
    const iconFile = mod.Data.IconFile.from(fs.readFileSync(ICON))
    mod.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconFile.icons.map((i) => i.data))
    res.outputResource(exe)
    fs.writeFileSync(OUT, Buffer.from(exe.generate()))
    console.log('  图标已写入（' + iconFile.icons.length + ' 个尺寸）')
  } catch (e) {
    console.log('  ! 图标注入失败（exe 仍可用）：' + (e && e.message || e))
  }
}

// ---------- 7) 收尾 ----------
const size = fs.statSync(OUT).size
step('完成')
console.log('  ' + OUT)
console.log('  ' + mb(size) + '（其中 Node 运行时 ' + mb(fs.statSync(process.execPath).size) + '）')
console.log('')
console.log('  用法：把 SoloTRPG.exe 放在本目录（与 engine/ rules/ data/ characters/ plugins/ 同级），双击运行。')
console.log('  首次运行 Windows 可能提示"未知发布者"（exe 未签名），点"仍要运行"即可。')
