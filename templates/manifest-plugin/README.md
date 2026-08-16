# OxideTerm Manifest-only 插件模板

**简体中文** | [English](README.en.md)

这个模板展示不运行任何代码的 OxideTerm 插件。它通过 `plugin.json` 声明由宿主管理的设置，适合配置包、静态元数据以及不需要运行时的产品贡献。

## 开始开发

如果使用仓库根目录的脚手架：

```bash
node scripts/create-plugin.mjs ../my-manifest-plugin \
  --type manifest \
  --id com.example.my-manifest-plugin \
  --name "My Manifest Plugin" \
  --author "Your Name"
```

进入生成目录后运行：

```bash
npm run check
```

手工复制模板时，修改 `plugin.json` 中的身份、版本、作者和 `contributes`。Manifest-only 插件必须省略 `runtime` 和旧版 `main` 字段。

## 可以声明的内容

这个模板使用 `contributes.settings` 展示字符串和布尔设置。还可以声明宿主支持的静态工具元数据，但不要声明依赖运行时代码的命令、事件处理器或动态界面。

设置由 OxideTerm 渲染和持久化。秘密值不应放在设置默认值、名称、描述或插件包中。

完整清单字段见 [OxideTerm 插件开发文档](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/zh-Hans/plugin-development.md#最小清单插件)。

## 本地验证

1. 运行 `oxideterm paths --json` 找到配置目录；
2. 将整个目录复制到 `<config-dir>/plugins/<plugin-id>`；
3. 重启 OxideTerm；
4. 在插件管理器中查看插件状态和设置项。

Manifest-only 插件不启动进程，也不需要 `runtime.process.trusted` 权限。

## 打包与发布

macOS 或 Linux：

```bash
npm run package:unix
```

Windows：

```powershell
npm run package:windows
```

两个脚本生成相同结构的可移植 ZIP，并输出 SHA-256 和字节数。由于包内没有平台相关运行时，可以在实际验证后将它作为 `any` target 提交。

提升 `plugin.json` 版本并推送匹配的 `v<version>` 标签后，模板工作流会创建 GitHub Release。市场收录步骤见 [插件发布与更新指南](https://github.com/AnalyseDeCircuit/oxideterm-plugins/blob/main/docs/PUBLISHING.md)。
