# 交接报告 —— dsh-5ednd / SoloTRPG

> **历史资料（2026-09-11 归档）**：以下描述旧工程，路径、提交号和同步流程不是当前操作依据。本目录现为独立 Git 仓库，后续统一使用 https://github.com/Not1u/DND-AI-DMTools.git 。以 [当前评估](docs/PROJECT_REVIEW.md) 和 [开发工作流](docs/DEVELOPMENT.md) 为准。

> 交接时间：本轮会话结束
> 代码仓库：`E:\HarnessTarvern\dnd5e`（GitHub `git@github.com:Not1u/dsh-5ednd.git`，分支 `main`，已同步到 `77b97eb`）
> 可运行产物：`E:\SoloTRPG`（**不是 git 仓库**，由仓库单向同步生成）

---

## 0. 30 秒上手

```powershell
# ① 跑起来（exe 已构建好，双击也行）
E:\SoloTRPG\SoloTRPG.exe          # 起服务 http://127.0.0.1:4620 并自动开浏览器

# ② 改引擎（宿主逻辑/界面）—— 改完刷新页面即生效，不用重启、不用重打包
notepad E:\SoloTRPG\engine\ui-host.latest.txt      # 宿主：所有 op 的实现
notepad E:\SoloTRPG\engine\ui-client.latest.txt    # 界面：所有 React 组件（无 JSX，用 h()）

# ③ 自检 + 提交
cd E:\HarnessTarvern\dnd5e
node tools/smoke-ui.mjs      # 界面冒烟（含 7 组断言）
git add -A ; git commit -m "..." ; git push      # push 走 SSH（HTTPS 在这台机器上被墙）
```

**最重要的三条铁律**（都是这轮踩出来的，务必照做）：

1. **不要用 PowerShell 内联 JS**（引号、`||`、中文都会被吃掉，且整段命令一块失败）。要改文件就**写一个 `.cjs` 补丁脚本再 `node` 它**，并在脚本里打印"替换了几处 + 校验结果"。
2. **改完一定跑 `node tools/smoke-ui.mjs`**，它会渲染全部面板并做断言，能抓到"点开才炸"的错误。
3. **改 `engine/` 不用重打包 exe；只有改 `standalone/app/`（mount.js / index.html / app.css）或图标才需要** `node tools/build-exe.mjs`。

---

## 1. 这是什么

一套面向 D&D 5e 的跑团工具，有两个形态、共用同一份业务逻辑：

| 形态 | 入口 | 说明 |
|---|---|---|
| **独立桌面程序** | `E:\SoloTRPG\SoloTRPG.exe` | Node SEA 单文件（88 MB，内含 Node 运行时 + 图标），双击起本地服务 + 开浏览器。IDE 式工作区界面 |
| **DSH 侧栏插件** | 仓库 `adapters/dsh-profile/` | 在 DSH Desktop 里注册两个页签（「跑团工作区」「角色速览」），走同源 HTTP 桥 `/dnd5e/api` |

两者都通过**同一座 HTTP 桥**调用**同一份引擎源码**（`engine/ui-host.latest.txt`）。AI（DeepSeek）也通过这座桥读写全部能力。

---

## 2. 目录地图

### 仓库 `E:\HarnessTarvern\dnd5e`（110 文件 / 30.4 MB，其中索引 28.9 MB）

```
engine/
  ui-host.latest.txt      183.7 KB  ★ 宿主逻辑：76 个 op 全部在这里（热重载）
  ui-client.latest.txt    192.9 KB  ★ 界面：所有 React 组件（热重载）
standalone/                         ★ 独立程序外壳（同步到 E:\SoloTRPG）
  server.mjs              11.7 KB   HTTP 服务 + 引擎装载 + 插件装载 + DND5E_EXT 注入
  app/{index.html,mount.js,app.css,icon.ico,vendor/react*}
  tools/{sync-from-repo,health,smoke-ui,build-exe,make-icon}.mjs
  README.md               20.3 KB   面向使用者的完整功能文档（含所有章节）
adapters/dsh-profile/
  lib/index.js             7.8 KB   DSH 常驻插件：桥 + 插件加载器（改这里要重启 DSH）
  lib/client.js           93.9 KB   界面壳（内联兜底快照，由 build:adapter 生成）
plugins/                            扩展插件（放进目录即挂到桥上）
  encounter-stats.mjs      ext.encounter.stats
  rule-lookup.mjs          ext.rule.lookup
  image-export.mjs         ext.image.map / list / provider / generate
rules/                    SRD 数据：dnd5e-srd.json / spells.json(361) / subclasses.json(12 职业) / feats.json / features.json / packs.json
characters/               4 张角色卡
data/rules-index/         37 本书 / 6803 条 / 28.9 MB（含模组图鉴与魔法物品）
tools/                    索引器、检索、预检、UI 冒烟、地图生成、dnd-api 探针
core/                     rules-finder / config / capabilities（兼容性策略）
```

### 运行目录 `E:\SoloTRPG`（271 文件 / 212 MB）

```
SoloTRPG.exe      88 MB   双击即玩（Node 内嵌）
server.mjs / config.json / start.bat
app/                      页面外壳（改这些要重打包 exe）
engine/                   引擎源码（从仓库同步；改这里刷新即生效）
rules/ characters/ plugins/ tools/
data/                     rules-index(29MB) + map.json + maps/ + combat-log.json
                          + workspace.json + theme.json + ai.json(密钥) + combat-state.json + dice.json
build/                    SEA blob 与 postject/resedit（重建 exe 用，可留可删）
```

---

## 3. 架构与数据流

```
        ┌─────────────── UI（engine/ui-client.latest.txt，一份代码三处跑）───────────────┐
        │ 独立程序页面(index.html+mount.js) │ DSH 侧栏页签 │ 动态插件壳（legacy，可无视） │
        └───────────────────────────────┬──────────────────────────────────────────────┘
                                        │  call(op, args) → POST /api 或 /dnd5e/api
                                        ▼
                     ┌──────────────  桥（{op,args} → {ok,value}）──────────────┐
                     │  核心 op：engine/ui-host.latest.txt（76 个）              │
                     │  扩展 op：plugins/*.mjs（6 个，可热重载）                 │
                     └───────────────┬──────────────────────────────────────────┘
                                     ▼
              JSON 数据落盘：characters/ · data/map.json + maps/ · data/combat-log.json
                            data/workspace.json · data/theme.json · data/ai.json · data/dice.json
```

**热重载机制**（关键）：
- 宿主：每次请求检查 `engine/ui-host.latest.txt` 的 mtime，变了就 `new Function(...)` 重载整个引擎 → **改完立即生效**。
- 界面：独立程序的 `mount.js` 每次刷新页面都从 `/app/ui-client.js`（= 磁盘上的 engine 源码）读取并 `new Function('React','host','styles','console', src)` → **F5 即生效**。
- 插件：按 mtime 重载 `plugins/*.mjs`。
- **只有 **`app/`（外壳）与图标**、以及 DSH 适配器 `adapters/dsh-profile/lib/*` 需要重启/重打包。

**AI 如何调用**：`ai.chat` 在宿主内运行工具调用循环（OpenAI 兼容 `/chat/completions` + `tools`），把模型返回的 `tool_calls` 派发到引擎自己的 op 注册表（`OPS`，`harness.handle` 打桩收集），结果回灌给模型；单轮最多 `maxSteps`（默认 6）步。**模型看到的函数名是净化过的**（`roll.dice` → `roll_dice`），派发前用 `opForName()` 映射回真实 op 名。

---

## 4. 能力清单

- **核心 op：76 个**（`GET /health` 看数量；`{op:"tools.list"}` 看分组，共 61 条带说明的条目）
  - 角色 17（`party.list/xp/sheet`、`pc.apply/awardXp/repair/forget`、`levelset.info/apply`、`multiclass.add`、`sheet.*`、`build.*`）
  - 地图 18（`map.get/set/terrain.set/token.*/clear/measure/tiles/list/use/create/save/rename/delete/batch/area/los`）
  - 战斗 7（`combat.get/start/next/economy/conditions/damage/end`）
  - 骰子 6（`roll.dice`、`dice.request/pending/answer/results/clear`）
  - 战斗记录 4（`log.list/append/set/clear`）
  - 规则书 3（`rules.stats/search/read`）、模组 4（`mod.list/search/read/statblock`）、元 2（`tools.list`、`ui.source`）
  - 其他：`settings.get/set`、`ai.chat/test/history/clear/tools`、`ws.get/set/reset`、`theme.get/set`
- **插件 op：6 个**（上表 plugins）
- **AI 工具集**：`toolset: 'core'`（默认）= **40 个**工具、清单约 15.5 KB（≈4.8k tokens）；`'all'` = 67 个。切换在设置面板。

---

## 5. 当前数据状态（交接时实测）

| 项 | 值 |
|---|---|
| 队伍 | 布洛林·铁砧 战士1 7/13｜格瑞姆贝尔·石心 牧师1 5/10｜**123 术士4/吟游诗人1 Lv5** 21/21｜图里尔·雾纱 **法师2** 8/12 |
| 经验 | 当前无人可升级（图里尔刚升到 Lv2） |
| 地图 | `main` 凡戴尔的失落矿坑·克拉格巢穴入口（24×14，7 单位）｜`demo-village` 示例：溪边营地（瓦片展示，18×12） |
| 战斗记录 | 82 条 |
| AI | DeepSeek `https://api.deepseek.com/v1` + `deepseek-chat`，toolset=core，密钥已保存（掩码 `sk-••••db2d`） |
| 主题 | azure / 深色 / #5aa0ff |
| 工作区布局 | 左[角色] 中[地图,角色卡] 右[先攻,AI,战斗记录] 底[骰子]（`data/workspace.json`） |

**敏感信息**：API Key 明文存在 `E:\SoloTRPG\data\ai.json`（已被 `.gitignore` 排除，**不要提交**）。也可用环境变量 `DND5E_AI_KEY` 覆盖（设置面板会显示"由环境变量提供"）。

---

## 6. 开发循环（照抄即可）

```powershell
# 改引擎 / 插件（最常用）
#   1) 编辑 E:\SoloTRPG\engine\ui-*.latest.txt  或  plugins\*.mjs
#   2) 浏览器 F5
#   3) 若还没同步到运行目录：node tools\sync-from-repo.mjs（在仓库里跑，仓库 → SoloTRPG）

# 改外壳页面（少）
node tools\build-exe.mjs          # 在 E:\SoloTRPG 跑，约 40 秒，产出 88 MB exe

# 加插件（零成本）
#   往 E:\SoloTRPG\plugins\ 丢一个 .mjs（导出 ops 或 setup(api)），下次调用即在桥上

# 加 AI 工具（不用改引擎）
#   在工具文件里加 register({name,description,...}) → 需要一次 DSH 重启才加载

# 同步方向只有一条：仓库 → SoloTRPG
node standalone\tools\sync-from-repo.mjs --from E:\HarnessTarvern\dnd5e
```

**双份表要对齐**（改一处记得改另一处）：
- 瓦片：宿主 `TILE_DEFS` ↔ 客户端 `TERRAIN`（21 种，字符/kind/属性必须一致）
- 职业主属性：宿主 `PRIMARY` ↔ 客户端 `MCLS_ABILITY`
- 状态目录：宿主 `CONDITIONS` ↔ 客户端 `CombatPanel` 的内置 `conditionCatalog`
- 工具清单：宿主 `toolCatalog()`（61 条）+ `TOOL_SCHEMA`（JSON Schema，AI 用）

---

## 7. 验证方式

```powershell
# ① 界面冒烟（最有用）：渲染全部面板 + 工作区两遍遍历 + 7 组断言
node tools\smoke-ui.mjs
#   ✔ 深度渲染（地图 40 格 / 2 单位 / 记录 3 行 / 面板 / 分隔条）
#   ✔ 主题断言  ✔ 瓦片 21 种  ✔ 瓦片规则  ✔ 骰池拼装  ✔ 兼职前置  ✔ 拖动落位
# ② 接口体检（连真实服务）：页面、核心 op、插件、读写落盘
node tools\health.mjs
# ③ 单点探针（在 SoloTRPG 目录，端口默认 4620）
node tools\dnd-api.mjs mod.statblock '{"title":"熊地精"}'
node tools\dnd-api.mjs log.list '@tools\_args.json'   # shell 吃引号时用 @文件
# ④ 健康检查
curl http://127.0.0.1:4620/health
```

冒烟测试的两个"特殊设计"（都是必要的，别拆）：
1. 桩 React **立即执行 effect**（比 React 更严格）→ 能抓到 effect 引用未初始化变量的 TDZ 问题；因此被 effect 引用的内部函数要用**函数声明**（`function openPanel(){}`）而不是 `const` 箭头。
2. 深度渲染要**两遍 walk**：嵌套面板（先攻/骰子/角色卡）是在 walk 时才被调用的，它们的 effect 也在那时才跑，所以 walk → 等 30ms → 再 walk 才能带上数据。

---

## 8. 已知问题与坑（按严重度）

1. **PowerShell 内联 JS 会静默搞坏文件 / 整段命令不执行**。表现：`Unexpected token`、`args 不是合法 JSON`、或者命令"看起来输出了但文件没改"。**一律写补丁脚本**（`_*.cjs` 已加 `.gitignore`，用完删掉；曾经有一个 `_h21.cjs` 漏进了提交）。
2. **写入缓存遮蔽外部改档**：引擎写角色时会留内存副本，外部（AI/脚本）直接改文件后读到的还是旧值。已修：`readPc()` 会比较 mtime，磁盘更新则自动失效；另有 `pc.forget {id}` 强制丢弃。
3. **Tavern 工具 `dnd_build` 写入的角色 `classes` 缺 `class` 键**（疑似本轮 NaN 的根因）。引擎侧已能自愈（`normClasses/inferClassKey` + `pc.repair`），但**建议把 `dnd_build` 改成写引擎 schema，或让 AI 统一用 `build.create`**。改工具文件需 DSH 重启。
4. **角色 `123` 的等级有争议**：文件里是 4 级术士 + 1 级吟游诗人（合计 Lv5），修复时把 `level` 对齐成了 5。若用户本意是"总共 4 级"，删掉吟游诗人那一级即可。
5. **`僵尸` 的 statblock 会命中 CR9 的"僵尸(jiangshi)"**（怪物图鉴里没有精确标题为"僵尸"的条目）。需要时给 `mod.statblock` 加一个"官方图鉴优先 + 别名表"。
6. **一次经验跨多级只升一级**：`pc.awardXp` 会返回 `levelUps[].targetLevel`（可能 > level+1），但 UI 的升级向导一次只处理 `level+1`。想做"连续升级"的话改 `levelset.info/apply` 的 target 计算即可。
7. **浅色主题下地图靠 CSS 反色滤镜**（`.dndp-light .dndp-cell{filter:invert(...)}`）——能用但不够精致，正经做法是给 21 种瓦片写浅色配色。
8. **`tools.list` 条数（61）≠ 已注册 op（76）**：前者是手工维护的"带说明清单"，新增 op 时**记得两处都加**（`toolCatalog()` + `TOOL_SCHEMA`），否则 AI 看不到。
9. **DSH 侧栏与独立程序共用一个 UI 源码**：侧栏很窄，部分面板（地图/骰子）在侧栏里体验一般；独立程序是主战场。
10. **动态插件壳（`dui-1`）是早期开发用的垫片**，现在正式形态是 profile 插件 + 独立程序，可以忽略或 `cordis_undefine` 掉。

---

## 9. 下一步建议（按性价比排序）

1. **一条龙实战验收**：用《凡戴尔的失落矿坑》第二章跑完整链路（读模组 → 摆地图 → 掷先攻 → 放范围法术 → `dice.request` 让玩家掷豁免 → 结算 → `pc.awardXp` → 触发升级/兼职），把不顺手的地方修掉。零件已齐，缺的是端到端打磨。
2. **`mod.encounter { module, chapter }` 一键布景**：从模组语料里抽出遭遇（地形 ASCII + 怪物 statblock + 战利品 + XP），直接 `map.set`/`map.batch` 落图。**注意**：当前索引里**没有模组正文**（只有图鉴/魔法物品/NPC 附录），要做这个得先补语料或让 AI 依据图鉴自行拼场地。
3. **连续升级**（第 8.6 条）。
4. **AI 面板体验**：流式输出、多会话/分支、上下文裁剪策略、费用累计显示。
5. **打包收尾**：用 `resedit` 写 exe 版本信息；写一份《快速上手.md》（从零到开始跑团 5 步）；可选代码签名（消 SmartScreen）。
6. **法术位消耗**：现在界面只展示 Pips（菱形），点一下扣/回法术位会更顺手（可做成新的 `pc.slot` op）。

---

## 10. 快速排错表

| 症状 | 处理 |
|---|---|
| 界面报 `X is not defined` / 白屏 | 跑 `node tools/smoke-ui.mjs` 看哪个组件/常量没定义；注意 client 与 host 双份表是否对齐 |
| 改了 client 但页面没变 | 确认改的是 `E:\SoloTRPG\engine\ui-client.latest.txt`（或仓库后 `sync`）；F5；看页签上的 `UI xxKB · 磁盘` 标记 |
| `unknown op: xxx` | op 名拼错，或没同步；`{op:"tools.list"}` 查清单；插件 op 需 `ext.list` |
| 服务起不来 / 端口占用 | 先杀掉旧进程：`Get-Process SoloTRPG,node | Stop-Process -Force`；再启动；首次冷启动约 5~8 秒 |
| `git push` 失败 | 必须 SSH（remote 已是 `git@github.com:...`）；22 端口被墙时用 `ssh.github.com:443`（见 `~/.ssh/config`） |
| 角色数据诡异（NaN/等级不符） | `pc.repair {id}`；或 `pc.forget {id}` 后重读 |
| AI 连不上 | 设置面板「保存并测试连接」；DeepSeek 用 `https://api.deepseek.com/v1` + `deepseek-chat`；OpenAI 在这台机器上**不可达** |
| 地图图例/瓦片显示怪 | 检查 `TILE_DEFS` 与 `TERRAIN` 是否一致（21 种） |

---

## 11. 一句话状态

**功能上已经能完整跑一场单人团**（规则书 6803 条检索、模组 624 条、角色卡、战术地图 21 种瓦片/多图、施法范围与掩体、先攻与行动经济、物理骰子盘 + DM 发起的判定骰、经验与升级/兼职、AI 通过同一座桥读写全部状态）；
**工程上**热重载开发循环顺畅、冒烟测试能兜住大部分回归；
**主要缺口**是端到端打磨（第 9 节 1~3 项）与打包收尾。
