# plugins/ — 桥上的扩展插件目录

这里是「所有接口都留着」的落点：任何放在本目录、以 `.mjs` 结尾的模块都会被 `/dnd5e/api` 自动挂载，
**不需要改核心代码**，也不需要重新打包。侧栏 UI、AI（DM）、你自己的脚本，走的是同一座桥。

## 最小插件

```js
export const name = 'my-plugin'

export const ops = {
  'ext.my.hello': async (args, api) => {
    return { ok: true, echo: args && args.who, repo: api.repoRoot }
  },
}
```

调用：

```bash
node tools/dnd-api.mjs ext.my.hello '{"who":"图里尔"}'
```

## setup 形态（可做初始化 / 返回额外 op）

```js
export const name = 'my-plugin'
export const setup = (api) => ({
  'ext.my.op': async (args) => ({ ok: true, rows: await api.readJson('data/combat-log.json').then(j => j.entries.length) }),
})
```

## api 能拿到什么

| 成员 | 说明 |
|---|---|
| `api.repoRoot` | 仓库根目录绝对路径（跨机器可移植） |
| `api.call(op, args)` | 调用**任意**已注册 op：核心 op（`party.list`、`map.get`、`roll.dice`…）或别的插件 op |
| `api.readJson(rel)` / `api.writeJson(rel, obj)` | 相对仓库根的 JSON 读写（自带 BOM 处理） |
| `api.log(msg)` | 写日志到宿主控制台 |

## 现成示例

| 文件 | op | 作用 |
|---|---|---|
| `encounter-stats.mjs` | `ext.encounter.stats` | 读战斗记录，统计每人攻击次数/命中率/伤害/治疗/移动距离 |
| `rule-lookup.mjs` | `ext.rule.lookup` | 关键词 → 直接返回规则书正文（内部编排 `rules.search` + `rules.read`） |
| `image-export.mjs` | `ext.image.map` / `ext.image.list` / `ext.image.provider` / `ext.image.generate` | 地图 → SVG 落盘（本地，零依赖）；外置图像模型（OpenAI 兼容 / webhook）生成场景图与立绘 |

## 图像外挂怎么配

本地导出（地图转 SVG）开箱可用：侧栏地图面板的「⬇ 导出图片」，或

```bash
node tools/dnd-api.mjs ext.image.map '{"tile":40}'
```

要生成真正的插画/立绘，配好环境变量即可，插件会在调用时读取：

```
DND5E_IMAGE_URL=https://api.openai.com/v1/images/generations
DND5E_IMAGE_KEY=sk-...
DND5E_IMAGE_MODEL=gpt-image-1
DND5E_IMAGE_STYLE=TRPG 战术地图风格，俯视视角，清晰网格
```

```bash
node tools/dnd-api.mjs ext.image.provider '{}'                 # 看配置状态
node tools/dnd-api.mjs ext.image.generate '{"prompt":"地精巢穴入口，溪流从洞口涌出","kind":"scene"}'
```

生成的图片落在 `data/images/`，`ext.image.list` 可枚举。

## 发现已加载的插件

```bash
node tools/dnd-api.mjs ext.list
```

返回核心 op 清单、已加载插件及其 op 名。加载失败（语法错误等）不会拖垮核心，只在 `ext.list` 里显示 `(加载失败)`。

## 约定

- 文件名不要以 `_` 开头（会被跳过，用于草稿）。
- op 名用 `ext.` 前缀，避免与核心 op 冲突。
- 返回 `{ ok: false, error: '...' }` 表示业务失败；抛异常会被桥接成 `{ ok: false, error }`。
- 插件按 mtime 热重载：改完文件下次调用即生效，**不用重启**。
