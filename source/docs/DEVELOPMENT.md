# 开发与 GitHub 工作流

> **桌面封装已更新**：`npm run desktop` 启动独立窗口；`npm run build:exe` 生成包含全部应用资源的便携 EXE。存档放在 `%APPDATA%/SoloTRPG/campaign`，每次修改后重新封装并替换 EXE。详见 [DESKTOP.md](DESKTOP.md)。

仓库的 `source/` 目录是 SoloTRPG 独立版的开发源。先进入该目录再运行本文命令。仓库最外层的 `SoloTRPG.exe` 是本地测试启动入口。唯一默认远程是 `origin`：

https://github.com/Not1u/DND-AI-DMTools.git

默认分支为 `main`。旧的 `Not1u/dsh-5ednd` 工程仅是历史来源；不要再运行默认的 `npm run sync` / `sync:force` 来覆盖本项目。相关脚本暂留供手工迁移参考。

## 本地启动

```powershell
node server.mjs
```

默认访问 http://127.0.0.1:4620 。开发启动不需要安装 npm 运行依赖。首次使用在设置面板配置 AI；本地 `data/ai.json` 不入库。也可通过 `DND5E_AI_KEY` 提供密钥。源码 clone 不包含 exe，运行 `npm ci` 后可用 `npm run build:exe` 生成独立桌面版。

接口探针需显式指定独立服务地址，因为现有脚本的默认端口仍沿用旧宿主：

```powershell
$env:DND5E_API = 'http://127.0.0.1:4620/api'
node tools/dnd-api.mjs tools.list
```

## 修改、验证与提交

```powershell
git status --short --branch
git pull --ff-only
# 修改代码；工作区已有未提交修改时先整理，避免直接拉取造成冲突。
node tools/smoke-ui.mjs
node tools/check-ui.mjs
node --check server.mjs
git diff --check
git diff
git add <本次修改的具体路径>
git diff --cached --stat
git commit -m "说明本次变更"
git push origin main
```

用户已指定后续项目更新统一放到该仓库：每次完成修改和适当验证后提交并推送，除非用户当次明确要求暂不推送。存在冲突时先保留本地与远程工作，不使用强制推送覆盖历史。涉及功能的改动还需要相应行为测试，渲染冒烟不代表流程正确。

## 文件管理

- 提交源码、文档、规则数据及明确需要版本化的角色/地图快照。本次首次导入保留现有存档快照；今后不把运行时自动改变的存档混进无关代码提交。
- 不提交 `data/ai.json`、AI 备份、`.env`、凭据文件、日志、`node_modules`、`build`、`dist`、exe。`.gitignore` 已设置相应规则。
- 规则索引按现有项目约定保留，来源说明见 `NOTICE.md`。本地 `engine/_src-phb/` 参考 HTML 不入库。
- 不运行会修改真实存档的健康检查/迁移脚本作为普通测试。应复制测试数据，或注入隔离的文件存储。
- 修改 host 文件后下次请求热加载；修改 client 和 `app/` 文件后刷新页面。`server.mjs` 或监听配置变更后需重启服务。桌面 EXE 包含全部程序与规则；修改后重新打包，用户存档不随程序更新覆盖。

当前缺陷、遗留工具限制与重构建议见 `PROJECT_REVIEW.md`。
