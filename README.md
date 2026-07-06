# Maven 本地配置管理客户端

一个 Tauri + React 客户端，用于管理本机 Maven 环境和多个 `settings.xml` 配置文件。

完整使用说明见 [docs/使用说明.md](docs/使用说明.md)。

## 当前能力

- 自动识别本机 Maven 版本、Maven home、`mvn` 路径和 Java 版本
- 支持手动设置 Maven home 或 `bin/mvn` 路径
- 支持原生文件/目录选择器选择 Maven Home、`mvn` 文件和外部 `settings.xml`
- 读取默认 `~/.m2/settings.xml` 创建配置
- 导入任意外部 `settings.xml`
- 新建应用内 settings 配置
- 多配置管理、搜索筛选、打开、重命名、复制、删除、复制 `mvn -s` 命令
- 一键设为默认配置，覆盖前自动备份原 `~/.m2/settings.xml`
- 查看默认配置备份，并可恢复到 `~/.m2/settings.xml`
- 使用当前 Maven 和选中 settings 执行离线 `help:effective-settings` 试运行校验
- 编辑 `localRepository` 和 `offline`
- 编辑 `interactiveMode`
- 管理 `pluginGroups`
- 管理 `mirrors`
- 管理 `proxies`
- 管理 `servers`
- 管理 `profiles`、Profile 属性、Profile 仓库
- 维护 `activeProfiles`
- 支持 XML 源码编辑，源码可解析后同步回表单
- 表单编辑会保留未可视化的顶层 XML 和 Profile 内高级 XML 片段

## 使用方式

安装依赖：

```bash
npm install
```

开发运行：

```bash
npm run tauri:dev
```

构建客户端：

```bash
npm run tauri:build
```

macOS 打包：

```bash
npm run package:mac
```

Windows 打包：

```bash
npm run package:win
```

如果 Windows NSIS 阶段因为 GitHub 下载 `nsis_tauri_utils.dll` 超时失败，可以先生成 Windows exe，再使用本仓库内置的简化 NSIS 脚本生成安装包：

```bash
npm run package:win:exe
npm run package:win:manual
```

备用 NSIS 脚本位于 [packaging/windows/maven-settings-management.nsi](packaging/windows/maven-settings-management.nsi)，会安装到当前 Windows 用户目录并创建开始菜单、桌面快捷方式和卸载项。

## 环境要求

- Node.js 18+
- npm
- Rust/Cargo
- Tauri 依赖的系统 WebView 环境
- Windows 交叉打包需要 `cargo-xwin`、`x86_64-pc-windows-msvc` target、`llvm-rc` 和 `makensis`

当前机器已检测到 Node/npm，但如果未安装 Rust，需要先安装：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## 本地数据位置

- macOS: `~/Library/Application Support/Maven Settings Management`
- Windows: `%APPDATA%\Maven Settings Management`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/maven-settings-management`

默认 settings 覆盖路径：

- macOS/Linux: `~/.m2/settings.xml`
- Windows: `%USERPROFILE%\.m2\settings.xml`

## UI 设计标注

- 背景：低饱和冷色静态渐变，主色值 `#f7fbff`、`#eef5fb`、`#f8f9fc`
- 玻璃透明度：强层 `rgba(255,255,255,0.68)`，常规层 `0.48`，弱层 `0.34`，薄层 `0.26`
- 模糊半径：主容器 `22px`，控件材质使用透明高光模拟，避免滚动时大量实时模糊重绘
- 圆角：主面板 `30px`，分组面板 `24px`，输入/按钮 `18px`，小控件 `14px`
- 描边：主描边 `1px rgba(255,255,255,0.72)`，分割线 `1px rgba(255,255,255,0.58)`
- 阴影：仅保留浅色环境漫反射 `0 24px 60px rgba(92,121,148,0.14)`，不使用深色硬投影
