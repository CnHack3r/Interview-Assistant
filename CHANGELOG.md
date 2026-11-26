# 更新日志

## 许可变更 - 2026-11-27

- 许可证由 **MIT** 变更为 **[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)**：源码公开，仅限非商业用途；商业使用需获得作者书面授权
- `LICENSE` 中写入版权声明与项目地址：`Required Notice: Copyright (c) 2026 CnHack3r (https://github.com/CnHack3r/Interview-Assistant)`
- `package.json` / `src-tauri/Cargo.toml` 的 license 字段同步更新

## [1.1.0] - 2026-11-26

### Added

- 重命名为「面试官助手PRO」（productName / 窗口标题 / 顶栏标题 / 包标识 / CI 产物名）
- 新增 AI 出题请求回归测试：覆盖长简历在 UTF-8 字符边界处截断的场景

### Fixed

- 修复长简历导致出题永久卡死：简历超过 12000 字节且截断点落在多字节中文字符中间时，
  Rust 侧按字节切片会 panic，Tauri async command 不回包，前端 `invoke` 永不返回，
  UI 会一直显示「出题中」（实测可无限等待数十分钟）
- 修复出题请求超时设置不完整：此前 240 秒超时只覆盖「等到响应头」，非流式接口约 150ms
  即返回响应头，真正耗时的响应 body 读取没有超时；现在客户端总超时 300 秒，body 读取单独限时
- 新增前端 300 秒兜底超时：任何异常都不会再让候选人卡片永久停在「出题中」，
  超时后标记为失败并可一键重试

## [1.0.0] - 2026-09-10

- 首个 Rust (Tauri v2) 重写版本：简历解析、AI 出题、评分工作台、PDF 报告
