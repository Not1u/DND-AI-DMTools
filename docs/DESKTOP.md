# Windows 桌面测试版

当前版本：0.3.0。桌面版使用 Electron 独立窗口，已内置运行环境、界面、规则资料和 PDF 文字提取组件，无需安装 Node.js，也无需打开浏览器。

## 给测试者

发送 `dist/SoloTRPG-0.3.0-Windows-x64.exe` 即可。支持 Windows 10/11 x64；双击启动。首次解压运行可能需要稍等。当前测试包未做代码签名。

首次启动为空白战役，请创建角色并在设置面板填写自己的 AI 接口与密钥。规则与离线功能可直接使用；AI 请求需要联网及有效的服务配置。测试包不包含开发者的密钥、聊天记录或私人战役存档。

## 更新和存档

### 上传模组

点击顶部“模组库 / 上传”，选择本机 PDF、TXT、MD 或 JSON 文件（每个文件最多 50 MB）。PDF 按页提取文字，再切分为可检索片段；中文字符映射组件已打包。上传完成后可在同页搜索、点结果读正文，也可以让 AI 使用现有 `mod.search` / `mod.read` 工具查阅。重复的同内容文件不会重复导入。

扫描图片 PDF 需先 OCR，受密码保护的 PDF 需先解除保护。本版导入文字，不导入插图、战术地图或 PDF 排版；多栏、表格等复杂排版可能需要人工核对。文件在本机提取，不上传到文件托管服务；使用 AI 时，被工具检索的文字片段会随对话发给用户配置的 AI 服务。

导入保存的是提取后的文字索引及文件名，不额外备份原 PDF，请自行保留原文件。JSON 格式为 `{ "title": "章节名", "text": "正文" }`，也支持这类条目的数组或 `{ "entries": [...] }`。文本文件须为 UTF-8。

### 内置内容与目录

EXE 包含 `rules/*.json` 和 `data/rules-index/`：6,803 条文字索引，其中模组分组有 624 条记录、37 个名称分组。内含玩家手册、城主指南、怪物图鉴等资料；这些是已有可检索文字内容，不等于每本原书的完整 PDF，也不保证每个模组含完整冒险正文。

| 位置 | 内容 |
| --- | --- |
| `%APPDATA%/SoloTRPG/campaign/characters/` | 角色卡 JSON |
| `%APPDATA%/SoloTRPG/campaign/data/maps/`、`maps.json`、`map.json` | 地图与地图目录；后两项位于 `data/` 下 |
| `%APPDATA%/SoloTRPG/campaign/data/ai.json` | AI 配置、密钥和对话 |
| `%APPDATA%/SoloTRPG/campaign/data/modules/` | 上传模组的文字索引，每个文件对应独立 JSON |
| `%APPDATA%/SoloTRPG/campaign/data/` | 另含战斗、骰子、布局与主题 JSON，使用后按需生成 |
| `%APPDATA%/SoloTRPG/` 下其他目录 | Electron 缓存和浏览器本地存储等 |
| `%TEMP%/随机目录/` | 便携 EXE 自动解压的程序、规则和依赖，退出时由启动器清理；不要把它当存档备份 |

在当前电脑，永久目录通常是 `C:/Users/DELL/AppData/Roaming/SoloTRPG/campaign`；其他电脑用自己的 Windows 用户名。应用菜单“文件 → 打开存档文件夹”可直接定位。备份整个 `campaign` 即可保留角色、地图、AI 对话和已上传模组。

### 替换新版

1. 关闭所有 SoloTRPG 窗口。
2. 用菜单“文件 → 打开存档文件夹”定位存档，更新前建议复制备份。
3. 将新版 EXE 放到任意目录并运行，旧 EXE 可删除。

存档固定保存在 `%APPDATA%/SoloTRPG/campaign`，不会随程序路径、文件名或版本变化。便携指程序免安装；数据保存在当前 Windows 用户目录，不在 EXE 旁。同一用户下所有版本共用该存档。菜单“帮助”可查看版本和打开 GitHub Releases 下载页；本版采用手动替换更新，不会自动下载或安装。

旧浏览器版存档不会自动迁入。需要沿用时，先退出新旧程序，备份目标目录，再将旧项目的 `characters` 和 `data` 复制到 `campaign` 下（无需复制 `data/rules-index`）；其中 `data/ai.json` 含密钥和聊天，仅在自己的电脑迁移，不要发给测试者。

## 开发者重新封装

```powershell
npm ci
npm run test:desktop
npm run smoke
npm run build:exe
```

输出为 `dist/SoloTRPG-<version>-Windows-x64.exe`。每次发布先提高 `package.json` 版本（例如 `npm version patch --no-git-tag-version`），验证后重新构建。`npm run build:installer` 可另外生成安装器；默认分发免安装版。桌面开发用 `npm run desktop`，浏览器开发仍可用 `npm start`。

代码与锁文件提交到当前 GitHub 仓库。二进制通过 GitHub Releases 分发，不提交进源码历史。构建命令默认不自动发布；发布时将构建产物和校验值上传至对应版本的 Release。

旧 `tools/build-exe.mjs` 是历史 Node SEA 浏览器启动器，只通过 `npm run build:sea` 显式调用；根目录旧 `SoloTRPG.exe` 不是新桌面测试包。

## 实现与后续版本

- `desktop/main.cjs`：窗口、单实例、菜单、本地服务生命周期；渲染进程启用 sandbox/contextIsolation，关闭 Node 集成。
- `desktop/storage.mjs`：创建用户存档目录，记录数据格式版本，不覆盖已有存档。
- `server.mjs`：可独立启动或由桌面入口调用；桌面使用回环随机端口，规则/引擎从只读程序资源加载，状态写入用户存档。
- `package.json` 的打包白名单只包含程序和规则，不包含开发目录中的角色、密钥和日志。
- 后续修改存档结构时，需要增加带备份的明确迁移步骤。现阶段更新仅替换程序，不能假定任意未来数据结构都兼容旧版本。

GitHub 仓库的 Actions → Windows desktop test build 支持手动构建，推送 `v*` 标签也会触发；完成后可下载 `SoloTRPG-Windows-x64` 构建附件。该流程不自动创建 Release。
