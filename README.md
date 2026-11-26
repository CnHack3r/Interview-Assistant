# 面试官助手PRO（Interview Assistant PRO）

基于 **Rust + Tauri v2** 的面试官桌面工具：批量导入候选人简历，AI 结合目标岗位自动生成针对性面试题，在评分工作台逐题打分，最后导出带毛笔字水印的 PDF 面试评估报告。

项目由原 Electron + React 版本重写而来：前端复用原版界面，后端（简历解析、AI 代理、配置与会话持久化、PDF 报告、文件对话框）全部改为 Rust 实现。

> 版本：**1.1.0** ｜ 协议：**MIT** ｜ 平台：**macOS (Apple Silicon) / Windows 10+ x64**

## 功能特性

- **多候选人工作台（面试日模式）**：批量上传（多选/拖拽）、统一确认姓名与岗位、AI 串行排队出题、卡片状态与评分进度、失败重试、重启恢复队列
- **简历解析与预览**：PDF 分页预览（react-pdf）、DOCX 转 HTML 滚动预览；文本提取在 Rust 后端完成（`pdf-extract` + DOCX XML 解析）
- **AI 智能出题**：OpenAI 兼容接口（DeepSeek / 豆包 / OpenAI / Kimi），系统提示词 + 容错 JSON 解析，出题心跳日志
- **面试评分工作台**：基础题按要点勾选自动折算、综合题按档位评分、逐题删除/恢复、自动重算总分
- **PDF 面试评估报告**：居中封面 + Ma Shan Zheng 毛笔字体总分印章水印、评分汇总表、能力评估、未掌握要点、逐题详情（优先 headless Chrome 渲染 HTML → PDF，无浏览器时回退 `printpdf`）
- **本地隐私**：简历解析、评分与会话数据全部保存在本机；仅「AI 出题」时把简历文本发送给你所配置的 AI 服务商

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 应用框架 | **Tauri v2**（Rust + 系统 WebView） |
| 后端 | **Rust**（`reqwest` / `pdf-extract` / `quick-xml` / `headless_chrome` / `printpdf`） |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 简历文本提取 | `pdf-extract`（PDF）+ `quick-xml`（DOCX） |
| AI 代理 | `reqwest`，OpenAI 兼容 `/chat/completions` |
| API Key 存储 | 本地配置文件（XOR + base64 混淆，不依赖系统钥匙串） |
| PDF 报告 | headless Chrome 渲染 HTML → PDF（`printpdf` 兜底） |
| 状态管理 | Zustand |
| 文件对话框 | `rfd` |

## 目录结构

```
.
├── src/                        # React 前端（通过 Tauri invoke 调用 Rust 命令）
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── lib.rs              # 入口：注册所有 Tauri command
│   │   ├── resume.rs           # 简历文件对话框 + PDF/DOCX 文本提取 + 读文件
│   │   ├── ai.rs               # AI 出题 / 连通性探测 / 模型列表 / 连接测试
│   │   ├── settings.rs         # 配置与会话持久化 + API Key 混淆存储
│   │   ├── report.rs           # 报告 HTML 预览 + headless Chrome 渲染 PDF（printpdf 兜底）
│   │   └── types.rs            # 共享数据结构（camelCase，与前端一致）
│   ├── capabilities/           # Tauri 权限配置
│   ├── icons/                  # 应用图标
│   ├── resources/fonts/        # MaShanZheng（毛笔水印）+ NotoSansSC（正文）
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/workflows/build.yml # macOS arm64 + Windows x64 安装包 CI
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.cjs
├── postcss.config.cjs
├── LICENSE
└── README.md
```

> `dist/`、`src-tauri/gen/`、`src-tauri/target/`、`node_modules/` 均为构建产物，已加入 `.gitignore`，不入库。

## 环境要求

- **Rust** stable ≥ 1.75（通过 [rustup](https://rustup.rs/) 安装）
- **Node.js** ≥ 18 + npm
- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Windows**：Visual Studio 2022 Build Tools（勾选「使用 C++ 的桌面开发」）+ WebView2 Runtime（Windows 11 自带）

## 本地开发

```bash
npm install

# 前端浏览器预览（内置 mock 数据，无需桌面运行时）
npm run dev

# 桌面应用（前端热更新 + Rust 后端）
npm run tauri dev

# TypeScript 类型检查
npm run typecheck
```

> Tauri 编译时会把前端构建产物嵌入应用，因此直接执行 `cargo` 编译前请先 `npm run build` 生成 `dist/`；使用 `npm run tauri dev` / `tauri build` 时会自动构建前端，无需手动执行。
>
> 可选：若在仓库内放置了本地 Rust 工具链（`.cargo` / `.rustup`），可以先 `source ./env.sh` 使用它；普通开发无需此步骤。

## 打包

### macOS（Apple Silicon / arm64）

```bash
npm run build:mac
# 等价于：npx tauri build --target aarch64-apple-darwin --bundles dmg,app
# 产物：src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
#       src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app
```

### Windows x64

前置条件：

1. Windows 10/11 x64
2. Node.js ≥ 18
3. Rust stable，host toolchain 为 `x86_64-pc-windows-msvc`（`rustup default stable-msvc`）
4. Visual Studio 2022 Build Tools，安装「使用 C++ 的桌面开发」工作负载（提供 MSVC 链接器）
5. WebView2 Runtime（Windows 11 自带，Windows 10 一般随 Edge 安装）

```powershell
npm install
npm run build:win
# 等价于：npx tauri build --target x86_64-pc-windows-msvc --bundles nsis
# 产物：src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\*.exe
```

说明：

- Tauri 的 Windows 构建依赖 MSVC 工具链与 WebView2，**无法在 macOS 上交叉编译出可安装的 Windows 包**；请使用 Windows 机器，或仓库自带的 GitHub Actions（`windows-latest`）。
- Windows 下 PDF 报告会优先调用本机 Chrome / Edge 的 headless 模式；找不到浏览器时自动回退 `printpdf`，功能不受影响。

### GitHub Actions（一键双平台安装包）

`.github/workflows/build.yml` 已配置：

- macOS arm64：`npx tauri build --target aarch64-apple-darwin --bundles dmg,app`
- Windows x64：`npx tauri build --target x86_64-pc-windows-msvc --bundles nsis`
- 触发方式：push `v*` 标签、push `main` 分支或手动 `workflow_dispatch`
- 产物：`interview-assistant-pro-macos-arm64`（dmg/app）、`interview-assistant-pro-windows-x64`（NSIS exe）

> 两个平台的安装包均未做代码签名：macOS 首次打开请在「应用程序」中右键 →「打开」；Windows 若遇 SmartScreen 提示，点击「仍要运行」。

## 数据与隐私

- API Key、AI 配置、候选人会话与评分的本地存储位置：
  - macOS：`~/Library/Application Support/com.interview.assistant/config.json`、`session.json`
  - Windows：`%APPDATA%\com.interview.assistant\config.json`、`session.json`
- API Key 使用 **XOR + base64 混淆**后落盘（非强加密，仅避免明文存放在磁盘上；本地工具场景使用）。仓库中不包含任何 API Key 或个人数据。
- 简历文本在本地完成解析；只有当你在界面点击「AI 生成面试题 / 测试连接」时，简历文本才会发送给你所配置的 AI 服务商。

## 使用流程

1. 打开「设置」（左下角齿轮），选择 AI 服务商、填写 API Key →「获取模型列表」→ 选择模型 →「测试连接」→ 保存
2. 「简历」页上传候选人简历（PDF / DOCX），填写姓名与面试岗位
3. 「AI 生成面试题」→ 题目页逐题评分（基础题勾选要点自动折算、综合题按档位评分）
4. 可在「题目」页删除/恢复题目，总分自动重算
5. 「汇总」页确认得分 →「结束面试，生成报告」导出 PDF

## 与原始 Electron 版的差异

- 运行体积更小、启动更快（Tauri 使用系统 WebView）
- 后端用 Rust 重写：`pdf-extract` 替代 `pdf-parse`；DOCX 用 `quick-xml` 解析；PDF 报告优先用 headless Chrome 渲染同一份 HTML（与预览版式一致），无浏览器时回退 `printpdf`
- API Key 改用本地配置文件（XOR + base64 混淆）存储，不依赖系统 Keychain / Credential Manager，避免未签名应用反复弹出钥匙串授权
- 文件对话框用 `rfd` 实现，全部逻辑保留在 Rust 命令中

## 已知限制

- AI 出题为**串行队列**（逐位候选人处理，避免并发触发服务商限流）；多人批量上传时总耗时为队列累加
- 单次出题 8–15 道（含参考答案与评分要点），正常网络下约 30–90 秒/人；请求总超时 300 秒，超时后界面会标记失败并支持重试
- 安装包未做 Apple / Microsoft 代码签名，首次打开需要绕过系统安全提示

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 开源协议

[MIT](LICENSE)
