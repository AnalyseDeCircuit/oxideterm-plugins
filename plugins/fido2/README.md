# FIDO 安全密钥

使用现有 `ed25519-sk` 或 `ecdsa-sk` 私钥文件进行 SSH 认证。插件包含独立的 libfido2 签名程序；SSH 连接、PIN 输入、触摸提示和取消操作由 OxideTerm 原生界面负责。没有额外标签页或侧边栏入口。

需要支持 `helper` 运行时的 OxideTerm 2.2.2 或更新版本。安装并批准进程权限后启用插件，在 SSH 连接中选择安全密钥的私钥文件。首次使用需要主程序具备新的认证入口，后续插件可以独立更新。

本插件不生成安全密钥、不导出设备私钥、不缓存 PIN。设备不存在、凭据不匹配或 PIN 被锁定时会明确报错。硬件密钥可通过支持 FIDO 的 OpenSSH `ssh-keygen` 生成，再将公钥安装到服务器。

## 构建与验证

运行 `node scripts/build.mjs`，然后运行 `node scripts/verify-package.mjs`。原生构建依赖 libfido2、libcbor、OpenSSL、C 编译器和 pkg-config；Windows 使用静态 vcpkg 依赖。安装包包含必要的非系统动态库，不要求最终用户安装 Homebrew 或 vcpkg。

六个平台由 `.github/workflows/fido2.yml` 的原生任务分别打包。验证涵盖协议启动、错误响应和安装包依赖；真实安全密钥的触摸、PIN、实际 SSH 登录需要硬件实测。软件签名测试不代表硬件已验证。

插件使用私有、长度前缀的标准输入输出协议。宿主先验证版本，再发送单次认证请求；句柄与 PIN 的缓冲区在使用后清理，不写入设置或日志。取消、超时和插件停用后，宿主停止并回收进程。

清单使用通用 `helper` 运行时，并在 `contributes.helper` 中声明所属功能 `ssh-authentication`、协议 `oxideterm-security-key` 和 `protocolVersion: 1`。普通插件管理器只负责安装、权限和启用状态；SSH 认证任务负责启动与回收签名进程。

目录 v1 已冻结，新发布仅进入 v2；旧客户端需升级主程序后获取新插件和更新。发布后的版本及资产不可覆盖。
