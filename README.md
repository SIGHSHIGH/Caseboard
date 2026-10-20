# 案情板 CaseBoard

> 数字时代的刑侦白板：把人物、照片、证据、事件钉在无限画布上，用贝塞尔曲线织出关系网，并可随时切到代码视图精确编辑。

Windows 优先、本地优先、离线可用。图形视图与代码视图是**同一份数据的两个对等视图**；AI 只产出「待确认」的线索，永不落定结论。

**An investigation whiteboard for the digital age.** Pin people, photos, evidence and events to an infinite canvas, connect them with Bezier edges, and switch to a code view to edit the very same document precisely. Windows-first, local-first, offline-capable.

当前版本 **v0.15.0**：画布、代码视图双向同步、桌面外壳、分析视图、AI 辅助与内置离线 OCR 已全部落地，并通过机器验收与桌面自检。

## 能做什么 / What it does

| 能力 | 说明 |
|---|---|
| **画布与数据模型** | 8 类实体节点；贝塞尔关系（实线=已证实 / 虚线=推测 / 点线=待核实，图例常驻）；分组嵌套与折叠；无限画布与框选多选；八方向连线与布局后自动换锚点 |
| **图片工作台** | 选择 / 拖入 / 粘贴 / 文件夹监视四路导入；SHA-256 去重；EXIF；双级缩略图；自由图片节点（移动 / 缩放 / 旋转 / 层级 / 吸附跟随 / 圆点收纳）；标注层（矩形 / 椭圆 / 箭头 / 文字 / 马赛克 / 区域锚点）；PDF 抽页与视频抽帧 |
| **代码视图（DSL）** | 图形与 CodeMirror 6 双向同步；序列化幂等；容错解析；字段级三方合并；整批一次撤销 |
| **桌面与文件** | Tauri 2 外壳；SQLite + FTS5；单文件 `.caseboard`（zip 内含库 / 素材 / DSL / 缩略图）；自动保存；版本快照；回收站 |
| **导出** | 整板 PNG / SVG / 多页 PDF；案件图片包（`images/` + `manifest.csv`）；脱敏导出（像素马赛克 + 证件 / 手机 / 银行卡掩码）；打印样式与 A4 页眉页脚 |
| **分析视图** | 过滤与聚焦；最短路径与全部路径；度 / 中介中心度；五种自动布局；时间线回放（多轨并行、公用指针、比例调节）；演示模式；离线示意地图（可导入底图、拖动图钉改坐标） |
| **AI 文本能力** | 抽取建图进「待确认」队列逐条采纳；矛盾与证据链审查；自然语言编辑 diff 预览；七节报告（事实句带 `[证据:id]` / `[节点:id]`）可导出 Word / PDF。内置规则通道离线可跑，Ollama / OpenAI 兼容通道需显式授权 |
| **AI 生图与合规** | 四预设（模拟画像 / 场景复原 / 物品示意 / 图像增强）；内置程序化绘制默认通道，ComfyUI 与 OpenAI 兼容图像接口可选；换脸类提示词拦截；「AI 生成 · 模拟图」角标写入像素且界面无移除开关；素材库 AI 分区 |
| **内置离线 OCR** | Tesseract WASM 中英文内核与语言包随安装包分发，不联网、无需另装；导入图片即可识别并把文字写回素材，识别结果可人工修正 |
| **本地优先** | 数据只存本机的普通 SQLite 文件；无账号、无遥测、无云依赖；需要限制访问时交给操作系统账户权限与磁盘加密 |

## 技术栈 / Tech stack

Tauri 2 + Rust · React 18 + TypeScript + Vite · React Flow (`@xyflow/react`) · CodeMirror 6 + Lezer · Zustand + Immer · SQLite · graphology / dagre / d3-force · tesseract.js (WASM)

## 构建 / Build

```bash
pnpm install
pnpm dev      # 浏览器预览
pnpm build    # 类型检查 + 前端产物
```

桌面端打包需要 Rust 工具链与 Tauri CLI（`@tauri-apps/cli`）。

---

## English

CaseBoard is a Windows-first, offline investigation whiteboard. Nodes, edges, photos, annotations and analysis all live in **one document**, exposed through two equal views: the canvas and a DSL code editor.

**v0.15.0** — canvas, two-way DSL sync, desktop shell, analysis views, AI assistance and bundled offline OCR are all in place, with machine-verified acceptance and desktop self-checks.

| Capability | What it does |
|---|---|
| **Canvas & model** | 8 node types; Bezier edges with line style as semantics (solid = confirmed, dashed = inferred, dotted = to be verified, legend always on); nested collapsible groups; infinite canvas with box selection; eight-direction linking with automatic re-anchoring after layout |
| **Photo workbench** | Import via picker, drag & drop, paste or watched folder; SHA-256 dedupe; EXIF; two-level thumbnails; free image nodes (move, resize, rotate, layering, docking that follows the card, collapse to a dot); annotation layer (rect, ellipse, arrow, text, mosaic, region anchor); PDF page and video frame extraction |
| **DSL code view** | Two-way sync between canvas and CodeMirror 6; idempotent serialization; fault-tolerant parsing; field-level three-way merge; one undo for a whole batch |
| **Desktop & files** | Tauri 2 shell; SQLite + FTS5; single-file `.caseboard` (zip with database, assets, DSL, thumbnails); autosave; version snapshots; trash |
| **Export** | Board as PNG / SVG / multi-page PDF; evidence image pack (`images/` + `manifest.csv`); redacted export (pixel mosaics plus ID / phone / bank card masking); print stylesheet with A4 header and footer |
| **Analysis** | Filter and focus; shortest and all paths; degree and betweenness centrality; five automatic layouts; timeline playback (parallel tracks, shared cursor, zoom ratio); presentation mode; offline schematic map with image backdrop and draggable pins |
| **AI text** | Extraction into a pending-confirmation queue, contradiction and evidence-chain review, natural-language editing with diff preview, seven-section report (facts cite `[evidence:id]`) exportable to Word / PDF. Built-in rule channel runs offline; Ollama / OpenAI-compatible channels require explicit opt-in |
| **AI imaging & compliance** | Four presets (sketch, scene, item, enhance); built-in procedural renderer by default, optional ComfyUI and OpenAI-compatible endpoints; face-swap prompts blocked; "AI generated · simulated" watermark burned into pixels with no toggle; dedicated AI zone in the asset library |
| **Bundled OCR** | Tesseract WASM (Chinese + English) ships inside the installer — no network, no extra install. Importing a photo extracts text straight into the asset, and results stay editable |
| **Local-first** | Data lives in a plain local SQLite file; no account, no telemetry, no cloud dependency. Restrict access with OS account permissions and disk encryption |
