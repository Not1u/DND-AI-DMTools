# 项目协作约定

- 当前目录是 SoloTRPG 独立版的开发源。先阅读 `docs/PROJECT_REVIEW.md` 和 `docs/DEVELOPMENT.md`。
- 用户指定后续更新统一使用 `https://github.com/Not1u/DND-AI-DMTools.git`，远程 `origin`、默认分支 `main`。完成修改及验证后提交并推送，除非用户当次另有要求；不要强推覆盖已有历史。
- 不再默认从旧 `E:\HarnessTarvern\dnd5e` 覆盖本目录。`HANDOVER.md` 和 `README.md.repo` 是历史资料。
- 不提交密钥、AI 对话、日志和构建产物；不将无关运行时存档变化混入代码提交。
- 验证不得修改真实角色/战役存档。现有 `tools/health.mjs` 和部分旧预检会写数据，使用隔离数据。
- UI 改动运行 `node tools/smoke-ui.mjs`，涉及交互还要验证实际事件处理；不能只凭渲染通过判定功能正确。
