# RDP

为 OxideTerm 提供独立更新的远程桌面协议引擎。安装并启用后，从现有连接页面使用；画面、输入、凭据与 SSH 网关仍由应用管理。

要求 OxideTerm >2.2.1。每个版本提供 macOS、Linux、Windows 的 x64 和 ARM64 独立包。

从仓库根目录使用 Rust 1.97.0 运行 node scripts/build-remote-desktop.mjs rdp，然后运行 node scripts/verify-remote-desktop.mjs rdp。

共享通信模型固定到主仓库提交 570c541393ad7c7f01e85ba3441c9dab29ac3556。现有通信格式不变，清单声明协议版本 1；修改共享模型时需重新验证宿主兼容范围。

许可证：GPL-3.0-only。
