# SoloTRPG

当前 Windows 测试版 **0.10.0**。双击根目录 `SoloTRPG.exe` 启动，无需安装；必须保留同级 `runtime/` 和 `library/`，不要只复制 EXE。

本版修复剧情装备与角色卡/地图 AC 同步，生命增益整合进 HP 框；地图下方新增游戏式技能与资源栏，可拖动调整布局、缩放、选择法术范围，并在结束回合时同步给 DM。旧奖励可用「核对剧情装备」补查。

- `source/`：源码、开发文档、构建工具与测试版 ZIP（`source/dist/`）。
- `runtime/`：桌面运行库。
- `library/`：规则书、导入模组及 PDF 地图资源。
- `saves/`：战役对话、战斗回放、进度与奖励记录。
- `%APPDATA%/SoloTRPG/campaign/`：角色卡和本机设置。

开发者从 `source/` 运行测试和构建命令。更新程序会保留用户资料。完整说明见 [桌面说明](source/docs/DESKTOP.md) 、[战斗重构说明](source/docs/BATTLE_010.md) 与 [交互说明](source/docs/GAMEPLAY.md)。
