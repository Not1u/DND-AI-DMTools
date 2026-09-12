# SoloTRPG

当前 Windows 测试版 **0.9.0**。双击根目录 `SoloTRPG.exe` 启动，无需安装；必须保留同级 `runtime/` 和 `library/`，不要只复制 EXE。

本版加入战斗专页、卡片详情页签、纸色墨线地图、本地攻击/施法执行器与可恢复投骰，HP 旁显示临时生命。已适配 DM 提示词和统一 ability 动作桥。

- `source/`：源码、开发文档、构建工具与测试版 ZIP（`source/dist/`）。
- `runtime/`：桌面运行库。
- `library/`：规则书、导入模组及 PDF 地图资源。
- `saves/`：战役对话、战斗回放、进度与奖励记录。
- `%APPDATA%/SoloTRPG/campaign/`：角色卡和本机设置。

开发者从 `source/` 运行测试和构建命令。更新程序会保留用户资料。完整说明见 [桌面说明](source/docs/DESKTOP.md) 、[战斗重构说明](source/docs/BATTLE_09.md) 与 [交互说明](source/docs/GAMEPLAY.md)。
