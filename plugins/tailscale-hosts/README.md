# Tailscale 主机发现

从本机 Tailscale 客户端发现主机，在原生连接表单中检查地址、补充认证，再连接或保存。只注册标签页。

## 使用

需要 Node.js 22 或更新版本，以及已登录并运行的 Tailscale 客户端。提供 macOS、Linux 和 Windows 的 x64/ARM64 安装包。Windows 包使用独立启动入口；Node.js 需要位于 PATH 中，找不到 Tailscale 时可填写 `tailscale.exe` 的完整路径。

1. 安装并启用插件，打开其标签页。
2. 填写客户端命令或完整路径。
3. 点击“发现主机”，搜索后点击“配置连接”。
4. 在应用原生表单中检查信息，配置认证和跳板机后连接或保存。

读取调用 `tailscale status --json`，只列出当前客户端可见的对端设备，在线设备优先。优先使用 Tailscale IPv4 地址，没有时使用 IPv6；不包含子网路由后的所有主机。在线状态不保证 SSH 可达，本插件使用普通 SSH 连接表单，不实现 Tailscale SSH 的身份登录流程。

来源刷新不会自动修改已有连接。读取超时为 4 秒，输出上限为 8 MiB，最多 5000 台主机，每页显示 20 台。刷新失败清除旧结果。客户端退出信息和原始输出不写入日志、设置或宿主界面。关闭插件会终止读取任务；独立守护进程通过管道关闭检测宿主强制结束的情况。输入位置只保留在本次插件进程内。

## 构建与验证

在市场仓库根目录执行：

```sh
node scripts/build-host-source.mjs tailscale-hosts --package
node --test scripts/host-sources.test.mjs
```

公共界面和进程管理源码位于 `packages/host-sources/`，构建时复制到包内，运行不依赖源码仓库。业务解析器位于本插件的 `source.cjs`。包含 11 种界面语言。

正式兼容范围为 `>2.2.0`，需要新增的 `connections.openForm` 接口。若本地主程序仍标为 2.2.0，但已编译该接口，可给构建命令追加 `--local` 生成本地试用包；插件仍会检查接口是否存在。这些试用包不能上架。

许可证：MIT。
