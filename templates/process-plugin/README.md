# OxideTerm 进程插件起步模板

**简体中文** | [English](README.en.md)

这是一个可以直接运行、打包和发布的 OxideTerm 原生进程插件。它注册一个由 OxideTerm 宿主渲染的标签页，并处理按钮事件，不需要编写 GPUI、HTML 或 CSS。

模板需要 Node.js 18 或更新版本。生成的插件源码使用 MIT 许可证，你可以在自己的仓库中继续使用和修改。

## 立即运行

从插件目录仓库根目录运行：

```bash
node scripts/create-plugin.mjs ../my-process-plugin \
  --type process \
  --id com.example.my-process-plugin \
  --name "My Process Plugin" \
  --author "Your Name"
```

生成后进入插件目录并运行：

```bash
npm run check
```

如果手工复制这个模板，先修改：

- `plugin.json` 中的 `id`、名称、版本、描述和作者；
- `permissions.capabilities` 中的能力；
- `contributes` 中希望显示的标签页、设置或其他贡献。

运行时会从 `plugin.json` 读取插件 ID，无需在 JavaScript 中维护第二份身份。

## 开发插件

主要文件：

```text
plugin.json                 插件身份、权限和声明式贡献
bin/plugin.js               进程协议与插件行为
bin/plugin                  macOS 和 Linux 启动入口
bin/plugin.cmd              Windows 启动入口
scripts/check.mjs           清单、入口和 JavaScript 校验
scripts/package.sh          Unix 安装包
scripts/package.ps1         Windows 安装包
.github/workflows/release.yml  标签发布工作流
```

修改 [`starterTabSchema()`](bin/plugin.js) 定义宿主渲染的界面，修改 [`handleUiEvent()`](bin/plugin.js) 处理交互。标准输出只能写入协议帧；诊断信息写入标准错误，并且不得包含凭据、请求正文或远端数据。

完整的清单、协议、界面组件、权限与 Host API 见 [OxideTerm 插件开发文档](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/zh-Hans/plugin-development.md)。

## 在 OxideTerm 中调试

1. 运行 `oxideterm paths --json` 找到当前配置目录；
2. 将插件目录复制到 `<config-dir>/plugins/<plugin-id>`；
3. macOS 或 Linux 上确认 `bin/plugin` 可执行；
4. 重启 OxideTerm；
5. 在插件管理器中启用插件并批准权限；
6. 修改代码后重新复制目录并重新加载插件。

进程插件会隐式申请 `runtime.process.trusted`，因为进程以当前操作系统用户身份运行。该权限由 OxideTerm 根据运行时自动添加，不要手工写入 `permissions.capabilities`。

## 打包

macOS 或 Linux：

```bash
npm run check
npm run package:unix
```

Windows：

```powershell
npm run check
npm run package:windows
```

安装包写入 `dist/`。脚本会打印市场收录需要的 SHA-256 和准确字节数。Unix 包使用 `bin/plugin`，Windows 包会在临时目录中把清单入口改为 `bin/plugin.cmd`，不会修改源码。

不要把 Unix 包标记为 Windows，也不要把进程插件包标记为 `any`。只提交已经实际安装验证过的 target。

## 发布

1. 修改 `plugin.json` 中的版本；
2. 提交并推送代码；
3. 创建与清单版本一致的标签，例如 `v0.1.0`；
4. 推送标签；
5. 等待 **Release plugin** 工作流完成。

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会校验标签与清单版本，分别构建 Unix 和 Windows ZIP，然后创建 GitHub Release。下载 Release 中的最终资产并实际安装后，再按照 [插件发布与更新指南](https://github.com/AnalyseDeCircuit/oxideterm-plugins/blob/main/docs/PUBLISHING.md) 申请市场收录。

已经发布的 Release 资产不得覆盖。下一次更新应提升版本并创建新标签。
