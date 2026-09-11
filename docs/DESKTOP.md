# Windows 桌面测试版

当前版本：0.2.0。桌面版使用 Electron 独立窗口，已内置运行环境、界面和规则资料，无需安装 Node.js，也无需打开浏览器。

## 给测试者

发送 `dist/SoloTRPG-0.2.0-Windows-x64.exe` 即可。支持 Windows 10/11 x64；双击启动。首次解压运行可能需要稍等。当前测试包未做代码签名。

首次启动为空白战役，请创建角色并在设置面板填写自己的 AI 接口与密钥。规则与离线功能可直接使用；AI 请求需要联网及有效的服务配置。测试包不包含开发者的密钥、聊天记录或私人战役存档。

## 更新和存档

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
