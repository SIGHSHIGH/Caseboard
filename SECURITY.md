# 安全说明 / Security

## 数据模型 / Data model

- 所有案件数据只保存在本机的普通 SQLite 文件（默认 `%APPDATA%\app.caseboard.desktop\caseboard.db`）与同目录 `assets\`，应用**不上传、不联网同步、不含遥测**。
- 项目没有账号系统，也没有应用内解锁；访问控制交给操作系统账户权限与磁盘加密（如 BitLocker）。
- AI 通道默认只用内置规则/程序化实现，离线可跑；启用 Ollama 或 OpenAI 兼容端点需在设置里显式填写并经二次确认，届时提示词与片段会发往你配置的本机或远端服务。
- 内置 OCR（Tesseract WASM）与全部语言包随安装包分发，识别过程完全本机完成。

All case data stays in a plain local SQLite file plus an `assets` folder. The app has no accounts, no telemetry and no cloud sync; access control is delegated to OS account permissions and disk encryption. AI channels are offline by default — enabling Ollama or an OpenAI-compatible endpoint is an explicit, confirmed opt-in that sends prompt snippets to the endpoint you configure. The bundled OCR engine (Tesseract WASM) runs entirely on the machine.

## 报告问题 / Reporting a vulnerability

如果发现安全问题（例如路径穿越、越权读写、脱敏导出泄漏、AI 合规校验被绕过），请**不要**直接开公开 issue，改为私下联系维护者：

- 邮件：在仓库 Issues 里说明「需要私下渠道」，维护者会回复联系方式；
- 请附上复现步骤、影响范围与受影响版本（应用内「安全」面板或 `package.json` 可见版本号）。

For security issues (path traversal, unexpected reads/writes, redaction leaks, bypassed AI compliance checks), please do **not** open a public issue. Ask in the issue tracker for a private channel and the maintainer will follow up. Include reproduction steps, impact and the affected version.

## 已知边界 / Known limits

- 安装包当前**未做代码签名**，Windows 可能提示「未知发布者」；请只从可信渠道获取安装包并核对 `docs/RELEASES.md` 里记录的 SHA-256。
- 导出图片与打印件可能含案件敏感信息，脱敏导出只覆盖标注过的马赛克与常见证件/卡号掩码，分享前请人工复核。
