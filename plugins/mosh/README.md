# Mosh

为 OxideTerm 提供 Mosh 远程连接，复用应用的原生终端、连接配置和本地输入预测。远端需要安装 `mosh-server` 并允许 UDP 通信。

插件只负责 UDP、加密、状态同步与网络恢复。SSH 认证、远端服务启动、录制和界面由主程序管理。插件没有额外标签页或侧边栏入口。

需要 OxideTerm 2.2.2 或更新版本。插件运行时为 `terminal-transport`，私有二进制管道版本为 1；密钥只通过管道传入，不进入命令行或环境变量。更新、禁用、卸载会停止当前 Mosh 会话。

在市场仓库根目录运行：

```sh
node scripts/build-remote-desktop.mjs mosh
node scripts/verify-mosh.mjs
```

构建使用固定提交的 Fernomade 引擎和 Cargo.lock。`src/wire.rs` 保存版本 1 的管道协议，与宿主 `oxideterm-mosh/src/wire.rs` 一致。修改协议时须同步两端并更新协议版本。

六平台构建由 `.github/workflows/remote-desktop.yml` 执行，每个平台验证归档内的可执行文件、二进制输入输出、预测确认、缩放和退出。真实 UDP 验证位于宿主的 `oxideterm-mosh/tests/plugin_process.rs`，通过本地 `mosh-server` 执行。

插件代码采用 GPL-3.0-only；Fernomade 依赖采用 Apache-2.0，依赖许可证随归档一并分发。
