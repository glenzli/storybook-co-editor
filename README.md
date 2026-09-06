# Storybook Co-Editor

<p align="center">
  <strong>简体中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="docs/images/banner.png" alt="Storybook Co-Editor" width="100%" />
</p>

Storybook Co-Editor 是一款本地绘本排版工具。Chrome 扩展从网页收集图片；macOS 桌面端用于管理页序和脚本文字、调整图片、保存项目，以及导出电子 PDF 和印刷 PDF。

当前版本为 `1.4.0`，项目文件使用 `.scproj` 格式，界面支持简体中文和 English。

- [下载发布版](https://github.com/glenzli/storybook-co-editor/releases)
- 本地服务：`http://127.0.0.1:14320`

![Chrome 扩展图片发送界面](docs/images/extension-overlay.png)

*Chrome 扩展可将网页图片发送到本地项目，也可标记参考图。*

![绘本编辑界面](docs/images/app-editor.png)

*桌面端用于管理页面、脚本、文字样式和图片参数。*

![印前拼版界面](docs/images/app-prepress.png)

*印前界面提供纸张、装订、边距、裁切线和双面打印预览。*

## 当前能力

- **网页采集**：从网页图片、懒加载元素和常见图片链接读取内容，通过悬浮按钮发送图片或参考图，并按内容哈希去重。
- **绘本编辑**：拖拽调整页序，管理封面、扉页、正文、空白页和回收站；分别设置文字样式、页面底色、图片缩放与位置。正文支持描边、柔光、绘画底纹和清晰面板等复杂背景可读性模式，并可按页控制文本宽度。
- **脚本排版**：使用 `[Cover]`、`[Author]`、`[Title]` 和数字标签将脚本文字映射到页面，同时支持对应的中文标签。
- **图片调整**：按页调整亮度、曝光、对比度、高光、阴影、饱和度、色温、色调和局部 HSL，并可按指定底色处理图片背景。
- **项目保存**：`.scproj` 项目包保存项目数据、图片资源和回收站，支持最近项目、自动保存、另存为、撤销和重做；多语言版本可共享画面并分别维护脚本和文字样式。
- **PDF 导出**：导出按页排列的电子 PDF，或按纸张、装订方式和打印边距生成印刷 PDF；可写入出版信息、生成版权页并设置电子 PDF 权限。
- **Codex（可选）**：通过本机 Codex App Server 提供剧本润色、绘制新页面和重绘图片。修改与候选图先供用户检查，确认后写入项目。
- **MCP（可选）**：本地 MCP 服务可读取当前项目和剧本、替换剧本、读取页面布局并调整文字位置。写入操作使用项目修改时间检查并发更新。

## 当前边界

- 当前发布包面向 Apple Silicon macOS，尚未经过 Apple notarization。
- Chrome 扩展通过压缩包发布，需要在 `chrome://extensions` 中以开发者模式加载。
- 编辑、保存、图片处理和 PDF 导出在本机完成。使用 Codex 润色、绘制或重绘时，相关文字、要求和所选参考图片会发送给当前选择的模型服务。
- MCP 只监听 `127.0.0.1:14320`，使用本机随机令牌。令牌可读写当前打开的项目，应只交给受信任的本机客户端。
- MCP 资源不提供图片像素。绘制和重绘由桌面端单独发起，候选图在确认前不会写入 `.scproj`。
- PDF 权限用于记录发布者的使用限制，截图和专用工具仍可能绕过这些限制。打开密码只用于当次导出，不保存在项目中。

## 安装

从 [GitHub Releases](https://github.com/glenzli/storybook-co-editor/releases) 下载当前版本：

```text
storybook-co-editor_1.4.0_aarch64.dmg
storybook-co-editor-extension-v1.4.0.zip
```

1. 安装并打开 macOS 桌面端。
2. 解压 Chrome 扩展包。
3. 打开 `chrome://extensions`，启用开发者模式并加载解压后的目录。
4. 保持桌面端运行，在网页图片上使用扩展浮层的“发送”按钮。

首次启动遇到 macOS 安全提示时，可在 Finder 中右键打开应用，或在系统设置中允许打开。

## 脚本格式

脚本面板按标签拆分文字并映射到页面：

```text
[Cover]
大闹天宫

[Author]
匿名

[Title]

[1]
云端之上，金箍棒搅动天宫。

[2]
猴王立在云海边，看见远处宫阙连绵。
```

- `[Cover]` 或 `[封面]` 对应第 0 页。
- `[Author]` 或 `[作者]` 对应封面作者署名。
- `[Title]` 或 `[扉页]` 对应扉页；存在扉页时，正文数字页自动后移。
- `[1]`、`[2]` 等数字标签对应正文页。

## 连接 Codex

1. 打开项目，点击工具栏中的机器人图标。
2. 点击“安装到 Codex”并确认。应用只更新 Codex 用户配置中的 `storybook` 条目。
3. 重启 Codex 或新建任务，在使用 `storybook` MCP 服务时保持 Storybook Co-Editor 运行。

可以在同一界面复制 MCP 配置供其他本机客户端使用，也可以轮换访问令牌。轮换后，已有客户端需要使用新配置重新连接。

## 本地开发

桌面端：

```sh
cd app
pnpm install
pnpm tauri dev
```

Chrome 扩展：

```sh
cd extension
pnpm install
pnpm dev
```

然后在 `chrome://extensions` 中加载 `extension/dist`。

运行项目维护的检查：

```sh
./scripts/check.sh
```

## 项目导航

- [架构与模块职责](ARCHITECTURE.md)
- [发布流程](RELEASE.md)
- [第三方资源与许可](THIRD_PARTY_NOTICES.md)
- [桌面端说明](app/README.md)

## 许可证

Storybook Co-Editor 应用代码使用 MIT License。内置字体使用各自的 SIL Open Font License 1.1，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
