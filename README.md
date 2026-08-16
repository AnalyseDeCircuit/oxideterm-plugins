# OxideTerm Plugins

OxideTerm 官方插件目录与一方插件发布仓库。

本仓库不作为应用内网页使用。OxideTerm 会读取版本化的机器目录，并从不可变的 GitHub Release 下载插件包：

- 市场目录：[`registry/v1/index.json`](registry/v1/index.json)
- 目录格式：[`schema/registry-v1.schema.json`](schema/registry-v1.schema.json)
- 条目示例：[`examples/plugin-entry.json`](examples/plugin-entry.json)

## 一方示例插件

- [`Host Tools Dashboard`](plugins/host-tools-dashboard)：展示标签页、活动栏、设置和受控 Host Tools 监控。

## 发布约定

1. 插件包必须是包含 `plugin.json` 的 ZIP 文件。
2. Release 标签和安装包 URL 必须固定到明确版本，禁止使用分支源码压缩包。
3. 每个平台包都必须提供 SHA-256 和字节数。
4. `id` 必须与安装包内 `plugin.json` 的 `id` 完全一致。
5. `minOxideTermVersion` 使用语义化版本号。
6. 市场收录表示该条目由维护者发布或确认，不代表完成了全面安全审计。

原生进程插件应分别发布平台包。WASM 和纯声明插件可以使用 `any` 目标。

## 收录方式

本项目不接受 Pull Request。插件作者可以通过 Issue 提交候选插件信息；目录修改、校验和发布由仓库维护者完成。

本仓库中的一方插件源码使用 [GNU GPL v3](LICENSE) 许可。

## 本地校验

```bash
node scripts/validate-registry.mjs
node scripts/validate-plugins.mjs
```
