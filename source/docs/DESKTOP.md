# Windows 桌面版 0.5.0

## 启动和分发

日常双击仓库外层 `SoloTRPG.exe`。0.5.0 改用免解压启动结构，避免旧便携单文件每次启动提取 Electron 与 PDF 依赖。

发送 `source/dist/SoloTRPG-0.5.0-Windows-x64.zip` 给测试者。完整解压后双击 EXE，不需要安装 Node.js。**不能只发一个 EXE**，必须保留旁边的 `runtime/` 和 `library/`。Windows 10/11 x64；程序尚未签名。

```text
SoloTRPG.exe                  很小的固定启动入口
runtime/                      Electron 和应用代码
library/
  rules/                      结构化规则 JSON
  data/rules-index/           内置规则书和模组文字索引
  data/modules/               用户导入模组的提取文本
source/                       仅开发机器需要，不发给测试者
```

角色、AI 配置、聊天、战斗状态、地图 JSON 和外观设置在 `%APPDATA%/SoloTRPG/campaign/`。菜单“文件”可分别打开存档目录和资源库目录。旧 AppData 下的上传模组首次启动时迁移到同级 library；逐个比较文件内容相同后才删除旧副本，冲突会保留原件并提示。

内置资源只含本项目现有的文字条目，不代表每个模组都含完整原书。导入 PDF 提取文字和页码，不提取原 PDF 地图插图；扫描件需要先做 OCR。模组文件上限 50 MB。

## 更新与备份

退出软件后，用新版包覆盖 `SoloTRPG.exe`、`runtime/` 和内置规则目录，保留自己的 `library/data/modules/`。AppData 存档不会被程序包覆盖。备份时同时备份 AppData 战役目录和 library 用户模组目录。软件仍会使用少量 AppData 缓存；该版不承诺 C 盘完全零占用。

## 模组与 AI

设置 AI 地址、模型和密钥后，“保存并测试”会发送一条最小对话，而非仅查询模型列表。错误显示在界面；请求有超时。DeepSeek 中旧的 `deepseek` 模型名兼容修正为已验证的 `deepseek-chat`。

在 AI 旁选择已上传模组，点击“确认并筹备首场景”。AI 会研究开场、检索资料，并用连通房间/通道生成第一张战术地图；筹备期间只有资料读取和地图生成工具可用，不会放玩家或开始战斗。AI 依据文字生成的地图需要 DM 核对，不是原书地图图片复刻。

推进到战斗时，AI 查询敌人规则条目并放置敌人，开始战斗再放已有角色卡的玩家单位。不会凭空创建玩家角色。敌人浮层显示 AC、HP、先攻修正、豁免和来源；找不到的数据标为待核对。地图工具栏支持按名称检索并将条目应用到选中敌人。

战斗记录上方显示先攻顺序；悬浮先攻数值可看投骰与修正。投骰操作集中在独立骰子面板。

## 构建和测试

在 `source/` 执行：

```powershell
npm ci
npm run test:desktop
npm run smoke
npm run build:release  # 生成暂存包并更新本机外层入口，需先关闭旧版
npm run build:zip      # 生成供测试者完整解压的 ZIP
```

本地发布会保留 library 中用户导入模组；ZIP 只从干净暂存目录打包，拒绝包含上传模组目录。EXE、ZIP、依赖、缓存、密钥和用户模组均不提交 Git。
