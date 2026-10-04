# PDF 预览

在 OxideTerm 的本地文件管理器和 SFTP 预览窗口中查看 PDF。
插件只提供文件预览，不注册标签页、侧边栏或主机工具。

支持翻页、点击页码进度条跳转、缩放及适应宽度。每次只渲染当前页。
第一版沿用主程序 10 MiB 的文档预览限制，不支持输入 PDF 密码、文字选择、搜索或编辑。

插件使用 Rust 和随包附带的 PDFium，运行时不需要 Node.js、Python 或系统 PDF 库。
主程序读取所选文件并管理远程临时副本；插件不会建立 SSH 连接。
关闭预览会终止渲染任务。原生进程插件需要在插件管理器中确认信任后启用。

## 开发和打包

开发环境需要 Rust、Node.js 22 和 tar；在市场仓库根目录运行 `npm ci --ignore-scripts`。
在本目录运行：

```sh
npm run build
npm test
npm run package
npm run test:package
```

构建脚本按当前平台下载 `pdfium.json` 锁定的引擎并验证 SHA-256。
打包保留 PDFium 及第三方许可证，包内包含原生可执行文件和动态库。
只有经过实际验证的平台包才能上架。发布记录使用市场仓库的 `scripts/release-plugin.mjs` 生成。

当前主程序需要新增的 `filePreviews` 能力，正式包要求 OxideTerm `>2.2.0`。
源码版本仍为 2.2.0 时，本地试用副本需单独放宽范围，不能修改正式包的限制。

## 六平台自动构建

市场仓库的 `Build PDF preview plugin` 工作流覆盖 macOS、Linux、Windows 的 ARM64
和 x86_64，每个平台使用原生运行器。Rust 工具链固定为 1.94.1；PDFium 的版本与校验值
由 `pdfium.json` 固定，构建和打包时检查运行器、工具链和目标架构是否一致。

相关修改推送到 main 后自动构建，也可手动运行。每个平台会解压最终安装包，启动包内
程序和 PDFium，验证两页文档的页数、像素颜色、缩放尺寸以及错误处理。
六个平台全部通过后，工作流用市场发布脚本生成一份包含六个平台下载地址、校验值和
大小的 `catalog-entry.json`，保留已有版本历史。已发布版本不能被覆盖，更新前应递增版本号。

默认仅上传 CI 产物。在 main 上手动运行并勾选 `publish`，才会创建
`pdf-preview-v<版本>`，将六份 ZIP 和市场记录附加到同一个 Release。
资产上传完成前保持草稿状态。市场索引仍需按仓库发布流程审核更新，工作流不会自动提交索引。
