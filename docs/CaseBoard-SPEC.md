# 案情板 CaseBoard — 产品构思与 AI 开发提示词

> 一个在「图形画布」与「文本代码（DSL）」之间自由切换、双向同步的案情推演工具。
> 本文档分两部分：**第一部分是产品创意**（项目目标、定位、功能、数据模型、技术架构、路线图）；**第二部分是可直接复制给 AI 编程助手的提示词库**（P0–P10）。
>
> **v0.2 增补**：图片自由导入导出、图片自由拖动、AI 生图接入（模拟画像 / 场景复原 / 图生图增强），并在篇首补充了项目目标书（见第 0 章）。

---

# 第一部分：产品构思

## 0. 项目目标书（Project Charter）

### 0.1 愿景

> 让每个办案人员、调查者、写作者，都能像在白板上钉照片、拉红线一样自然地搭建案件关系网；同时拥有代码级的精确、批量与版本控制，以及一个懂得案情、且产出永远处于「待确认」状态的 AI 助手。

### 0.2 要解决的问题

1. 照片散落在文件夹、微信、U 盘里，**上板靠打印、关系靠想象**，无法在数字画布上自由摆放与连线。
2. 画图工具（PPT/Visio）不懂案情，**没有实体、证据、置信度、时间线的概念**，改一处全靠手找。
3. 关系图只能看不能「算」——**证据链缺口、时间矛盾、资金归集点**靠人工排查。
4. 通用 AI 工具上传案情有泄密风险，且 AI 生成内容真假难辨，**不能作为证据**。

### 0.3 v0.2 目标（本次新增功能的目标定义）

| 编号 | 目标 | 成功标准（可验收） |
|---|---|---|
| G1 **图片自由导入** | 任何来源的图片都能在 3 秒内上板 | 支持拖入文件/文件夹、剪贴板 Ctrl+V 粘贴、菜单批量导入、文件夹监视；jpg/png/webp/bmp/tiff、PDF 抽页、视频抽帧；500 张图片导入不崩溃，自动生成缩略图与哈希去重 |
| G2 **图片自由导出** | 原图、标注图、整板成果都能带走 | 单图/批量导出原图与标注版、复制到剪贴板、画布导出 PNG/SVG/PDF、一键打包案件图片包（含清单 CSV）；支持人脸/证件号马赛克的「脱敏导出」 |
| G3 **图片自由拖动** | 图片是画布上的一等公民，自由摆放 | 拖入即生成自由图片节点：任意移动、缩放、旋转、置顶/置底、层叠对齐；可吸附为人物头像或证据附件；多选拖动、对齐参考线、网格吸附；从画布拖回文件夹即导出、从素材库拖上画布即引用 |
| G4 **AI 生图接入** | 据描述生成模拟画像与场景示意，辅助排查 | 可配置本地 ComfyUI/Stable Diffusion（默认，数据不出本机）或云端生图 API；提供模拟画像、场景复原、物品示意、监控增强四个预设；支持文生图与图生图；生成结果可一键上板 |
| G5 **证据安全红线** | AI 生成图永不被误当证据 | 所有 AI 生成图强制叠加不可移除的「AI 生成 · 模拟图」角标与元数据；素材库内真实证据与 AI 生成严格分区；完整记录提示词、模型、参数与生成时间；导出时 AI 水印一同导出 |

### 0.4 非目标（本期明确不做）

- 不做多人实时协作与云同步（本地优先，后期再评估局域网只读分享）。
- 不做法律定性结论（不输出罪名认定），AI 只做事实与线索层面的辅助。
- 不做身份核验级的人脸识别比对（仅做本地人脸框选与聚类，不接公安库）。
- 不对真实人脸做换脸/伪造类深度合成；模拟画像只能基于证人描述生成。

### 0.5 成功指标（产品打磨参照）

- 一次真实案情演练：从空板到含 30 实体、50 关系、20 张图片的完整案情板，耗时 ≤ 30 分钟。
- 一份粘贴笔录经 AI 抽取后，人工确认采纳率 ≥ 70%，且无需手工纠正任何「已证实」结论。
- 全程不联网（本地模型模式）可完成：建板、导图标注、模拟画像、生成报告。
- 导出的 PDF 报告可直接用于内部案情汇报。

---

## 1. 产品定位

| 项 | 内容 |
|---|---|
| 暂定名 | 案情板 CaseBoard（备选：织网 Weave、红线 RedThread、推演板、线索画布） |
| 一句话 | 数字时代的刑侦白板：把人物、照片、证据、事件钉在无限画布上，用贝塞尔曲线织出关系网，并可随时切换为代码视图精确编辑 |
| 平台 | Windows 优先（Win10/11，安装包 .msi/.msix），架构预留 macOS/Linux |
| 核心隐喻 | 刑侦剧里的白板 + 红线 + 照片 + 便签，加上图数据库与双向代码 |
| 本地优先 | 数据默认只存本机，离线可用，加密保存，敏感案情不出本机 |

**目标用户（按优先级）**

1. 刑侦 / 经侦 / 检察 / 监察 / 海关缉私办案人员——人物关系、资金链、证据链推演
2. 律师 / 法务——诉讼关系图、时间线梳理、案情汇报
3. 反诈 / 风控 / 内审 / 纪检——资金网络、团伙组织架构
4. 调查记者——人物与事件网络
5. 编剧 / 小说家——人物关系、剧情时间线（同一个引擎的「创作版」）
6. 通用知识工作者——调研笔记、家族谱、商业尽调、项目关系梳理

**对标产品（做差异化参考，不复制）**

- 专业调查：Maltego、IBM i2 Analyst's Notebook、CaseFleet、yEd
- 可视化白板：React Flow 生态、Excalidraw、Miro、Obsidian Canvas、draw.io
- 代码即图：Mermaid、Graphviz、D2、PlantUML
- 差异点：**图形与代码是两个完全对等、实时双向同步的视图**；面向「案情/证据/假设」做了领域模型，而不是通用画图工具；本地优先 + 可离线 AI。

---

## 2. 核心创意地图

### 2.1 双视图引擎（产品的灵魂）

- **图形视图（Canvas）**：无限缩放平移的画布，卡片节点、图片、组、贝塞尔箭头。
- **代码视图（DSL）**：一套声明式的案情描述语言（人可读、可手写、可 diff、可批量生成）。
- **分屏视图**：左图右码或左码右图，一边改另一边实时联动。
- **单一数据源**：两个视图都由同一个文档模型（Document Model / AST）驱动，任一侧操作都转成「命令（Command）」修改模型，再广播刷新。
- 代码语法出错时：图形视图保持现状但进入只读，错误行高亮、给出修复提示，绝不静默丢数据。
- 撤销/重做是同一条历史，不分视图。
- 价值：**拖拽适合探索与汇报，代码适合精确、批量、版本化与模板化**。例如：用脚本批量生成 200 个人员节点、Git 式对比两个版本的案情变化、用模板秒建一类案件的初始结构。

### 2.2 节点（实体）系统

内置节点类型（均可扩展自定义字段）：

| 类型 | 关键字段 |
|---|---|
| 人物 | 照片、姓名、化名/别名、性别、年龄、身份、联系方式、状态（受害人/嫌疑人/证人/在逃/已排除…）、备注 |
| 组织/团伙 | 名称、性质、层级、成员、据点 |
| 地点 | 名称、地址、坐标、现场照片 |
| 物品/物证 | 物证编号、特征、保管链（提取→保管→鉴定各环节） |
| 事件 | 时间（点/区间）、地点、参与人、经过 |
| 证据 | 类型（笔录/照片/视频/音频/书证/电子数据）、编号、来源、可信度、关联实体 |
| 时间点/时间段 | 用于在时间线上占位 |
| 便签 | 纯文本贴纸，自由倾斜、颜色 |

节点通用能力：状态流（待查/核查中/已证实/已排除）、标签、置信度（0–100）、自定义字段、评论、附件、封面图、折叠详情。

### 2.3 图片工作台：自由导入、自由拖动、自由导出（v0.2 重点）

图片是案情板上的**一等公民**——既能包在人物卡 / 证据卡里，也能作为自由图片节点直接钉在画布上，像真实白板上的照片一样任意摆放。

#### A. 自由导入（G1）

- **四种导入方式**：
  1. 从资源管理器拖入文件 / 整个文件夹（Tauri 原生文件拖拽，支持批量）；
  2. 剪贴板直接粘贴：截图工具截图后 **Ctrl+V** 即上板（微信截图 / QQ 截图 / Snipaste 工作流无缝衔接）；
  3. 菜单「导入图片」批量选择，支持多选；
  4. 监视文件夹：指定一个「现场照片」目录，新文件自动入素材库。
- 格式：jpg / jpeg / png / webp / bmp / tiff / gif（首帧）；**PDF 抽页导入**、**视频抽帧导入**（按时间点或固定间隔批量出帧）。
- 导入时自动：生成缩略图（256px 与 1024px 两级）、计算 SHA-256 哈希去重、读取 EXIF 时间与 GPS（提示用户定位风险）、建立索引。
- 导入向导：批量导入时可选择「统一建证据节点」「仅入素材库」「全部直接铺到画布」；可批量指定类型、来源、标签。
- 原图不破坏：所有编辑基于副本与标注层，原件哈希入库封存，随时可还原。

#### B. 自由拖动（G3）

- 图片从素材库拖到画布任意位置，生成**自由图片节点**：
  - 任意**移动、缩放（四角手柄，等比 / 自由）、旋转**（带角度吸附）、层级置顶 / 置底；
  - 支持自由层叠、横向 / 纵向对齐参考线、等距分布、网格吸附、多选框选后整体移动；
  - 可设白色照片边框与阴影（模拟冲印照片）、旋转微角度（白板照片质感）、图钉装饰。
- **两种归属形态可互转**：
  - 自由图片节点（独立摆放，如现场照片墙）；
  - 吸附为某节点的头像 / 证据附件（拖到节点上高亮吸附，自动建立关联）。
- **跨边界拖拽**：
  - 从画布拖回素材库 → 取消摆放但保留素材；
  - 从画布直接拖到资源管理器文件夹 → 即导出该图（Tauri 原生拖出）；
  - 从其他应用拖图片到画布 → 直接导入；
  - 复制节点时可连同图片一并复制。
- 触控笔 / 触屏手势支持（Surface 双指缩放、单指拖动）。

#### C. 自由导出（G2）

- **单图导出**：右键图片 → 导出原图 / 导出标注版 / 导出区域锚点裁剪图 / 复制到剪贴板。
- **批量导出**：按组、按类型、按选中范围导出；导出为 PNG / JPG，可选统一短边尺寸与压缩率。
- **脱敏导出**：导出前对人脸、身份证号、手机号、银行卡号做马赛克 / 模糊（支持复用已画的区域锚点批量打码）。
- **案件图片包**：一键导出 zip，含 `images/`（原图 + 标注图）、`manifest.csv`（编号、类型、来源、拍摄时间、关联实体、OCR 文本）。
- **整板成果导出**：画布导出 PNG / SVG / 多页 PDF（所见即所得，含贝塞尔关系线、组、时间线）。
- AI 生成图导出时强制携带「AI 生成」水印（见 2.11）。

#### D. 标注与智能

- **图片标注层**：矩形框、箭头、画笔、直线、文字、高亮、马赛克（脱敏）、测距（可选）。
- **区域锚点（特色）**：在照片上框出一张脸 / 一辆车 / 一个物品，该区域可直接「连线」到对应节点（监控截图里的人 → 人物卡）；悬停节点时高亮所有图片中关联的框。
- OCR 识别图中文字（本地 PaddleOCR / Tesseract，可选云端 API）；转账截图、票据、聊天截图可结构化（金额、时间、账号、对话人）。
- 素材库面板：真实证据 / AI 生成两个分区；缩略图、来源、标注数、关联节点数、OCR 命中词。

### 2.11 AI 生成图的证据安全红线（v0.2 新增，硬约束）

- **强制水印**：AI 生成图在画布上、导出文件中始终带「AI 生成 · 模拟图」角标（写入像素，不可通过界面关闭）；文件元数据写入 `aiGenerated=true`、提示词、模型、时间。
- **分区存放**：素材库真实证据与 AI 生成图分两个 Tab，AI 图默认虚线边框，永远不能设置为「已证实」证据类型。
- **生成日志**：每次生成记录完整提示词、负面提示词、模型、种子与参数，随案件文件保存，可审计。
- **禁止能力**：不做真实人脸换脸、不合成「某人做某事」的伪现场照片；模拟画像仅依据证人描述；图生图仅用于画质增强（超分、去噪），不改变画面内容语义。
- 报告中 AI 图统一标注「辅助示意，不作为证据」。

### 2.4 关系箭头（贝塞尔曲线，做深）

- **曲线**：三次贝塞尔曲线，可拖拽控制点；可在 直线 / 折线 / 曲线 间切换；智能避让、磁吸到节点边缘锚点。
- **关系类型库**：亲属、认识、同事、同住、同行、通话、短信、转账、资金归集、雇佣、指认、目击、矛盾、上下级、作案、窝藏……可自定义增删。
- **线型即语义**（图例固定，不可乱用）：
  - 实线 = 已证实（有证据）
  - 虚线 = 推测（有迹象未证实）
  - 点线 = 待核实（线索/传闻）
- **线的视觉重量**：粗细 = 频次/金额/关系强度；颜色 = 关系类别（资金类红、情感类紫、通讯类蓝、行动类橙……）。
- 边属性：方向（单向/双向/无向）、文字标签、发生时间/时间区间、次数、金额、置信度、证据附件列表、备注。
- 边本身也能挂证据、能评论、能标「待查」。

### 2.5 组（Group）

- 矩形或自由圈选组，带标题栏、底色、透明度；可嵌套（团伙内部分工小组）。
- **阵营语义**：红方/蓝方/受害方/中立等配色方案，或自定义标签色。
- 可折叠为一个「超级节点」，组内连线自动隐藏，组间关系聚合成组级连线。
- 组成员支持批量操作（批量移动、改样式、建组内时间线）。
- 组模板：犯罪团伙、受害人群、时间簇、地点簇、证据包。

### 2.6 布局与多视图

- 手工自由布局 + 自动布局：力导向（d3-force）、层次/树形（dagre）、径向、圆形、网格；「一键整理」保留手工锁定的节点。
- 过滤器：按类型、标签、状态、时间、置信度、关系类别显示/隐藏/淡化。
- 聚焦模式：选中任一节点，展开 N 度关系，其余淡化（找「他和谁有关」）。
- 路径分析：高亮任意两节点之间的最短/全部路径（「张三和李四怎么扯上的」）。
- 中心度分析：图算法标出关键中间人、资金归集点、信息中转节点。
- **时间线视图**：所有带时间的节点与事件按时间排开（可按人物分泳道），顶部时间游标可「播放」回放案发过程；时间区间显示为条带。
- 地图视图（后期）：地点节点上图（用离线/自配瓦片，不依赖商用地图 Key）。
- 证据链视图：按「动机→预谋→准备→实施→逃离→销赃」等链条模板纵向排列。
- **多假设画布（特色）**：同一案件复制多个平行假设（如「假设A 情杀」「假设B 仇杀」），证据可标记支持/反驳哪个假设，AI 辅助统计各假设证据支持度；可并排对比差异。
- 演示模式：预设镜头路径与「逐根连线亮起」步骤，像破案电影一样汇报（导出 PDF/PPTX 或全屏放映）。

### 2.7 AI 能力（详见第 5 节）

- 文本侧：笔录/文本一键抽取建图、自然语言操控画布、关系推理问答、矛盾检测、证据链缺口检查、自动报告、智能布局建议、别名合并。
- 图片侧：图片 OCR 与结构化、**AI 生图接入（v0.2）**——
  - **模拟画像**：按证人描述（性别、年龄、脸型、发型、眼镜、特征）生成正 / 侧面模拟画像（素描 / 写实两种风格），支持「加上眼镜 / 改短发 / 年龄 +5 岁」迭代变体，每版自动保存；
  - **场景复原**：按文字描述生成案发地点、室内布局、路口方位示意图，辅助推演与询问；
  - **物品示意**：根据描述生成涉案物品（刀具、箱包、车辆款式）示意图，用于协查通报配图；
  - **监控增强（图生图）**：低清监控画面超分辨率、去噪、提亮、去雨雾（仅增强画质，不改变内容语义）；
  - 模型后端可配置：**本地 ComfyUI / Stable Diffusion（默认，数据不出本机）**，或 OpenAI 兼容生图 API / 即梦等云端服务；
  - 产出全部遵守 2.11 证据安全红线（强制水印、分区、日志、禁止换脸）。

### 2.8 数据、安全与互操作

- 本地存储：SQLite（建议 SQLCipher 加密）+ 本地素材文件夹（图片原件 + 缩略图 + 标注 JSON）。
- 项目文件 `.caseboard`（本质 zip：数据库 + assets + DSL 文本 + 缩略图），单文件即可拷贝/移交。
- 自动保存、版本快照（时间机器回溯）、回收站。
- 启动密码 / Windows Hello 解锁；敏感字段脱敏；「脱敏导出」一键给人脸、身份证号、手机号打码。
- AI 可配置：**默认本地模型**（Ollama / llama.cpp 跑 Qwen 等）或自填 OpenAI 兼容 API Key；在设置里明确标注数据是否出本机。
- 导出：PNG/SVG、PDF 报告、Word（.docx）、JSON、CSV、Mermaid、Graphviz DOT、GeoJSON。
- 导入：Excel/CSV 人员表、JSON、Mermaid、Obsidian Canvas、XMind、图片文件夹。
- 全局搜索（实体/证据/图片 OCR 文本/备注全文检索）。

### 2.9 交互细节

- 快捷键：双击空白建节点、从节点锚点拖出连线、空格拖动画布、Ctrl+K 命令面板、Ctrl+E 切代码视图、F 聚焦、/ 过滤。
- 小地图、网格吸附、参考线、对齐磁吸、多选框选、复制粘贴、跨项目拖节点。
- 高 DPI 缩放、深色/浅色模式、高对比度；支持 Surface 触控笔自由批注红线、触摸手势。
- 主题皮肤：「刑侦白板（暖白 + 红线）」「指挥中心（深色）」「打印友好」「手绘风」。

### 2.10 差异化亮点（一句话记住的十个记忆点）

1. 图与代码双向实时对等，不是「导出」关系。
2. 线的虚实/粗细/颜色本身就是证据强度的语言。
3. 照片里框一张脸就能连线到人物卡（区域锚点）。
4. 时间游标回放案发过程。
5. 平行假设画布，证据支持/反驳自动算分。
6. 证据链模板自动查断点。
7. AI 建议的关系一律标「待核实」虚线，绝不当真。
8. 不在场证明等时间矛盾自动高亮。
9. 演示模式像电影一样一根线一根线亮。
10. 全本地、可加密、离线 AI 也能跑。

---

## 3. 数据模型（开发蓝图）

```ts
// 一个案件 = 一个文档
interface CaseDoc {
  meta: { id: string; title: string; caseNo?: string; createdAt: string; updatedAt: string };
  nodes: Node[];
  edges: Edge[];
  groups: Group[];
  assets: Asset[];            // 图片/文件
  views: View[];              // 命名的视图/假设/镜头
  settings: { theme: string; lineLegend: Record<string, LineStyle> };
}

type NodeType = 'person'|'org'|'place'|'item'|'event'|'evidence'|'time'|'note'|string;
type Status = 'todo'|'checking'|'confirmed'|'ruledout';

interface Node {
  id: string;
  type: NodeType;
  title: string;
  x: number; y: number; w: number; h: number;
  groupId?: string;
  photo?: string;             // asset id
  fields: Record<string, any>;   // 类型模板字段 + 自定义字段
  aliases?: string[];
  tags: string[];
  status: Status;
  confidence: number;         // 0-100
  time?: { start: string; end?: string }; // 时间线定位
  attachments: string[];
  notes?: string;
}

interface Edge {
  id: string;
  source: string; target: string;
  sourceAnchor?: {x:number;y:number}; targetAnchor?: {x:number;y:number};
  controlPoints?: {x:number;y:number}[]; // 贝塞尔控制点
  path: 'bezier'|'straight'|'step';
  relType: string;            // 关系类型 key
  label?: string;
  directed: boolean;
  style: 'solid'|'dashed'|'dotted'; // 已证实/推测/待核实
  color?: string;
  weight?: number;            // 视觉重量：金额/频次
  time?: { start: string; end?: string };
  confidence: number;
  evidenceIds: string[];
  notes?: string;
  scenario?: Record<string, 'support'|'refute'>; // 对各假设的支持/反驳
}

interface Group {
  id: string; title: string;
  bounds: {x:number;y:number;w:number;h:number};
  color: string; parentId?: string; collapsed: boolean;
}

interface Asset {
  id: string; path: string; kind: 'image'|'pdf'|'video'|'audio'|'file';
  hash: string; ocrText?: string;
  thumbnails: string[];                    // 256 / 1024 两级缩略图
  source?: 'import'|'clipboard'|'watch'|'ai'; // 导入来源
  zone?: 'evidence'|'ai';                 // 真实证据 / AI 生成分区
  width?: number; height?: number;
  annotations: Annotation[];              // 框/箭头/文字/区域锚点/马赛克
  aiGenerated?: boolean;                  // 是否 AI 生成（强制水印依据）
  aiMeta?: {
    preset: 'sketch'|'scene'|'item'|'enhance';
    prompt: string; negativePrompt?: string;
    model: string; seed?: number; params?: Record<string, any>;
    createdAt: string;
  };
}

// 自由图片节点（图片可独立上板，不必依附卡片）
interface ImageNode {
  id: string; kind: 'freeImage';
  assetId: string;
  x: number; y: number; w: number; h: number;
  rotation: number; zIndex: number;
  borderStyle?: 'photo'|'plain'|'polaroid'; // 冲印白边 / 无边 / 拍立得
  linkedNodeId?: string;                  // 吸附为头像/附件时的归属
}

interface Annotation {
  id: string; shape: 'rect'|'arrow'|'pen'|'text'|'anchor'|'mosaic';
  geom: any; text?: string; linkedNodeId?: string;
}

interface View {
  id: string; kind: 'board'|'timeline'|'map'|'chain'|'presentation'|'scenario';
  name: string; filters: any; camera?: {x:number;y:number;zoom:number};
  steps?: any[];              // 演示镜头
}
```

---

## 4. DSL 设计（文本视图）

设计原则：**像 Mermaid 一样易读，比 Mermaid 更懂案情**；声明式、块状结构、可省略（未写的坐标走自动布局）。

```text
case "2026-10 连环诈骗案" caseNo "A-2026-1018" {

  // ===== 实体 =====
  person zhang "张建国" {
    photo: "assets/zhang.png"
    aliases: ["三哥", "张老三"]
    status: suspect
    fields: { 年龄: 42, 籍贯: "常州", 职业: "无业" }
    tags: ["主犯", "有前科"]
    confidence: 90
  }

  person li "李梅" {
    photo: "assets/li.png"
    status: witness
    fields: { 身份: "财务公司员工" }
  }

  org gang "恒信财务（空壳）" {
    color: "#C0392B"
    members: [zhang, wang]
  }

  place ktv "夜色KTV" {
    address: "钟楼区XX路12号"
  }

  event e1 "9月3日首次接触" {
    time: 2026-09-03T20:10
    place: ktv
    actors: [zhang, li]
  }

  evidence ev1 "银行流水" {
    kind: document
    source: "工行常州分行调取"
    confidence: 95
  }

  // ===== 组 =====
  group g_suspect "诈骗团伙" color="#C0392B" {
    nodes: [zhang, wang, gang]
  }

  // ===== 关系（边）=====
  zhang --转账 500000--> li {
    rel: transfer
    time: 2026-09-05
    style: solid            // 已证实，有流水
    weight: 500000
    evidence: [ev1]
    note: "分三笔转出"
  }

  li --通话--> zhang {
    rel: call
    time: 2026-09-01/2026-09-10
    style: dotted           // 待核实
    confidence: 40
  }

  zhang -.疑似同伙.-> wang {
    rel: accomplice
    style: dashed           // 推测
  }

  // ===== 时间线/视图 =====
  view timeline "案发经过" {
    lanes: [zhang, li, wang]
  }
  view scenario "假设A：有预谋" { }
  view presentation "汇报动线" { }
}
```

语法约定：

- `类型 id "显示名" { ... }` 声明实体；`id` 全文件唯一，用于连线。
- 连线：`A --标签--> B`（实线）、`A -.标签.-> B`（虚线）、`A ..标签..> B`（点线）。
- 坐标不写则自动布局；写 `at (x, y)` 可固定；图形端拖拽自动补坐标。
- 注释 `//`；内置枚举（status、rel 等）有自动补全；CodeMirror 6 提供语法高亮、校验、悬停文档、自动修复。
- 语法用 Lezer 写 grammar，与编辑器同生态；解析失败产出错误节点 + 行号，不阻塞其他文件解析。

---

## 5. AI 能力设计（含产品内置提示词，见第二部分 P4–P7）

| 能力 | 输入 | 输出 | 人工确认策略 |
|---|---|---|---|
| 笔录/文本抽构建图 | 粘贴询问笔录、起诉意见书、新闻、聊天记录 | 节点 + 边 + 时间的结构化草稿（JSON） | 进「待确认清单」，逐条采纳，不直接落画布 |
| 图片 OCR/结构化 | 截图、票据、转账图 | 文字、金额、时间、账号、人物框 | 框可拖拽修正，确认后入库 |
| 自然语言编辑 | 「加一条张三给李四转账30万、9月3日、待核实的关系」 | 生成 Command 的 diff 预览 | 先弹 diff，确认执行 |
| 关系问答 | 「张三和李四有哪些路径？谁是资金归集人？」 | 基于图数据的回答 + 高亮路径 | 引用具体节点/边，可点击定位 |
| 矛盾检测 | 全图 | 时间冲突、一物多主、证据断裂、无证据断言 | 生成问题清单，不自动改数据 |
| 证据链审查 | 选定罪名/链条模板 | 缺失环节、薄弱环节、建议补侦方向 | 报告形式 |
| 别名合并 | 全图名称 | 「三哥≈张建国」候选 | 人工确认合并 |
| 自动报告 | 全图 | 案件概况、人物关系、时间线、证据清单（Word/PDF） | 可编辑后导出 |
| 智能布局 | 当前图 | 语义分组与布局建议 | 一键应用或撤销 |
| AI 生图（v0.2） | 描述文本或参考图 | 模拟画像 / 场景复原 / 物品示意 / 监控增强图 | 生成后进素材库 AI 分区，带强制水印，可插入画布 |

**铁律**：AI 产出的是「假设和线索」，不是结论；所有推断关系默认点线/虚线 + 低置信度；AI 不得删除、覆盖用户数据，只生成「待确认」操作；涉及具体罪名/定性的措辞由人把关；**AI 生成图强制水印、不可作为证据、禁止真实人脸换脸**。

### 5.1 AI 生图的合规设计（界面级要求）

- 生图面板顶部固定提示：「模拟图仅用于排查 / 通报 / 推演，不作为证据」。
- 模型选择明示：「本地 ComfyUI（数据不出本机）」或「云端 API（内容将出本机）」，切换时二次确认。
- 生成结果入「待确认」：先在面板预览，用户点「插入画布」才落图；落图默认带虚线边框与「AI 生成」角标。
- 每次生成可追溯：面板中保留历史（缩略图 + 提示词 + 时间 + 模型），可复用提示词再生成。
- 敏感词策略：拒绝生成真实姓名 + 真实照片的换脸 / 犯罪过程画面；模拟画像仅接受外貌特征描述。

---

## 6. 技术选型

**推荐方案：Tauri 2 + React 18 + TypeScript**

| 层 | 选型 | 理由 |
|---|---|---|
| 外壳 | Tauri 2（Rust） | Windows 安装包小（~10MB 级）、内存低、原生文件/对话框/托盘能力，可上架 msix |
| 画布 | React Flow（@xyflow/react） | 原生支持自定义节点、贝塞尔边、拖拽连线、minimap、框选、缩放，省掉最难的画布层 |
| 代码编辑器 | CodeMirror 6 | 轻量、可配 Lezer 语法、lint、自动补全、diff 视图 |
| DSL 解析 | Lezer | 与 CodeMirror 同生态，增量解析、容错 |
| 状态 | Zustand + Immer | 轻量；配合 Command 模式实现撤销/重做 |
| 持久化 | SQLite（tauri-plugin-sql，SQLCipher 加密） | 本地关系数据 + 全文检索 FTS5 |
| 图算法 | graphology + dagre + d3-force | 中心度、最短路径、自动布局 |
| 图片 | image crate（Rust 侧缩略图/哈希/EXIF）+ Tauri 原生拖入拖出（drag-drop / clipboard）+ 画布自由图片节点（react-rnd/自写 transform 节点）+ 标注层（SVG/Konva） | 自由移动/缩放/旋转/层级；PDF 抽页用 pdfium；视频抽帧用 ffmpeg-sidecar；OCR 用 PaddleOCR/Tesseract 侧车 |
| 生图后端 | 本地 ComfyUI（HTTP API，本地侧车）/ Stable Diffusion WebUI；云端走 OpenAI 兼容图像接口 | 默认本地、数据不出本机；云端需用户显式配置 |
| 文档导出 | docx/xlsx crates 或前端库、PDF 打印样式；zip 打包用 zip crate；图片脱敏用 image crate | Word 报告、PDF、案件图片包 |
| AI 文本 | OpenAI 兼容接口 + 本地 Ollama/llama.cpp | 用户可切换；本地模型优先 |
| 打包 | WiX .msi / NSIS .exe，签名 | Windows 分发；ComfyUI 可选依赖，首次使用时引导 |

**备选方案 B**：Electron + React（生态最成熟、上手最快，安装包 ~100MB+，适合先验证）。
**备选方案 C**：WinUI 3 / WPF + C#（原生感最好，但画布、DSL、AI 生态都要自建，不推荐首版）。

**架构要点**

```
UI（图形视图 / 代码视图 / 属性面板 / 时间线）
        │  全部操作 → Command 对象
        ▼
Document Store（Zustand + Immer，单一数据源）
        │  命令入栈 → 持久化 → 广播
        ├─► 图形渲染器（React Flow）
        ├─► DSL 序列化器（Model → Text）
        └─► DSL 解析器（Text → AST → Model，带错误）
              （Rust 侧）
SQLite/SQLCipher + 素材库 + OCR + 本地/云端 AI
```

---

## 7. 开发路线图（建议 8 个里程碑）

- **M1 画布 MVP（1–2 周）**：React Flow 画布；新建/拖拽/删除节点；手动拖出贝塞尔连线；标签与线型；属性面板；JSON 存本地。
- **M2 领域模型 + 组 + 图片工作台**：节点类型模板与状态；组（嵌套/折叠）；图片四种导入方式（拖入/粘贴/批量/监视）、两级缩略图与哈希去重、自由图片节点（移动/缩放/旋转/层级）、标注层；PDF 抽页与视频抽帧。
- **M3 代码视图与双向同步**：Lezer 语法、CodeMirror 编辑器、Model↔Text 双向同步、错误处理、统一撤销栈。
- **M4 工程化与持久化**：Tauri 外壳、SQLite、.caseboard 项目文件、自动保存/快照、图片与整板导出（原图/标注版/PNG/PDF/案件图片包）、脱敏导出。
- **M5 分析视图**：过滤、聚焦、路径/中心度、自动布局；时间线视图与回放。
- **M6 AI 接入**：抽取建图（待确认清单）、自然语言编辑、矛盾检测、报告生成；本地模型适配。
- **M7 高级功能 + AI 生图**：多假设、证据链模板、演示模式、区域锚点、OCR、地图视图；**ComfyUI 本地接入、模拟画像/场景/物品/增强四个预设、图生图、AI 水印与生成日志、素材库分区**。
- **M8 安全与打磨**：SQLCipher/Windows Hello、脱敏导出、AI 图合规审计、打印样式、签名打包、安装器、自动更新。

> 每完成一个里程碑都应是「可运行、可演示、可打包」的状态。

---

# 第二部分：AI 提示词库（直接复制使用）

> 用法：
> - **P0** 是项目总提示词，开新项目时第一条发给 AI 编程助手（Claude Code / Cursor / Trae / 豆包等），让它建立全局上下文；之后每轮再发 **P1–P3** 这种单轮开发提示词。
> - **P4–P7** 是将来产品**内置 AI 功能**调用大模型时使用的系统提示词（System Prompt），开发到 M6 时直接放进代码里。
> - 花括号 `{}` 是占位符，用时替换。

## P0 · 项目主提示词（总纲，开新项目时发送）

```text
你是一名资深桌面应用架构师与前端工程师，精通 Tauri 2、React 18、TypeScript、React Flow（@xyflow/react）、CodeMirror 6、Zustand 和 SQLite。现在我们要从零开发一款 Windows 桌面应用，请严格按本规格推进，不要擅自更换技术栈；如确有必要偏离，先说明理由再等我确认。

【产品】
名称：案情板 CaseBoard。一句话：数字时代的刑侦白板——把人物、照片、证据、事件钉在无限画布上，用贝塞尔曲线连接关系，并可在「图形视图」与「代码（DSL）视图」之间双向实时切换。
目标用户：办案人员、律师、风控调查员、记者、编剧。核心诉求：本地优先、离线可用、数据加密、可精确编辑、可汇报演示。

【技术栈（强制）】
- 外壳：Tauri 2 + Rust；前端：React 18 + TypeScript + Vite
- 画布：React Flow（@xyflow/react），自定义节点与自定义边
- 代码视图：CodeMirror 6；DSL 语法用 Lezer 编写（容错增量解析）
- 状态：Zustand + Immer；所有写操作走 Command 模式（命令对象 + undo/redo 栈）
- 持久化：Tauri 端 SQLite（tauri-plugin-sql），后续接 SQLCipher；图片原件存本地素材目录，库内只存路径与缩略图
- 图算法：graphology、dagre、d3-force
- 图片：Tauri 原生文件拖入/拖出与剪贴板 API；Rust 端 image crate 做缩略图/哈希/EXIF；自由图片节点用可 transform（移动/缩放/旋转/层级）的自定义节点；PDF 抽页 pdfium、视频抽帧 ffmpeg-sidecar
- AI 生图：本地 ComfyUI / Stable Diffusion WebUI 的 HTTP API 为默认后端，云端 OpenAI 兼容图像接口为可选；OCR 用 PaddleOCR/Tesseract 侧车
- 代码风格：严格 TypeScript（strict）、函数式更新、组件单一职责、所有副作用集中在 service 层

【核心架构原则（不可违反）】
1. 单一数据源：图形视图和代码视图都是 Document Model（nodes/edges/groups/assets/views）的渲染结果，不存在两份数据。
2. 任何编辑都先转成 Command（AddNode/UpdateNode/MoveNode/AddEdge/…），命令修改 Model、压入 undo 栈、触发持久化、广播给所有视图。
3. 双向同步：
   - 图形操作 → Command → Model → DSL 序列化器刷新代码文本（若光标正在编辑代码，则延迟到该编辑事务结束，禁止抢光标）；
   - 代码编辑 → Lezer 解析为 AST → 与当前 Model 做 diff → 生成最小 Command 集合应用；语法错误时图形视图保持最后正确状态并进入只读，错误行高亮，绝不丢数据。
4. 坐标系统一：节点坐标用画布世界坐标；DSL 中未写坐标的节点参与自动布局，写死坐标的节点锁定。
5. 所有 AI 产出只进「待确认」队列，禁止未经用户确认直接改 Model；推断关系的线型必须是 dotted/dashed。

【数据模型】
严格按以下 TypeScript 类型实现（可新增字段，不可删核心字段）：
interface CaseDoc { meta: {id:string;title:string;caseNo?:string;createdAt:string;updatedAt:string}; nodes:Node[]; edges:Edge[]; groups:Group[]; assets:Asset[]; views:View[]; settings:Settings }
interface Node { id:string; type:'person'|'org'|'place'|'item'|'event'|'evidence'|'time'|'note'|string; title:string; x:number;y:number;w:number;h:number; groupId?:string; photo?:string; fields:Record<string,any>; aliases?:string[]; tags:string[]; status:'todo'|'checking'|'confirmed'|'ruledout'; confidence:number; time?:{start:string;end?:string}; attachments:string[]; notes?:string }
interface Edge { id:string; source:string; target:string; controlPoints?:{x:number;y:number}[]; path:'bezier'|'straight'|'step'; relType:string; label?:string; directed:boolean; style:'solid'|'dashed'|'dotted'; color?:string; weight?:number; time?:{start:string;end?:string}; confidence:number; evidenceIds:string[]; notes?:string }
interface Group { id:string; title:string; bounds:{x:number;y:number;w:number;h:number}; color:string; parentId?:string; collapsed:boolean }
interface Asset { id:string; path:string; kind:string; hash:string; thumbnails:string[]; source?:'import'|'clipboard'|'watch'|'ai'; zone?:'evidence'|'ai'; width?:number; height?:number; ocrText?:string; annotations:Annotation[]; aiGenerated?:boolean; aiMeta?:{preset:'sketch'|'scene'|'item'|'enhance'; prompt:string; negativePrompt?:string; model:string; seed?:number; params?:Record<string,any>; createdAt:string} }
interface ImageNode { id:string; kind:'freeImage'; assetId:string; x:number; y:number; w:number; h:number; rotation:number; zIndex:number; borderStyle?:'photo'|'plain'|'polaroid'; linkedNodeId?:string }
interface View { id:string; kind:'board'|'timeline'|'map'|'chain'|'presentation'|'scenario'; name:string; filters:any; camera?:{x:number;y:number;zoom:number} }

【界面布局】
- 顶部栏：项目名、撤销/重做、保存状态、视图切换（图形/分屏/代码）、自动布局、过滤器、AI 助手（文本抽取/AI 生图两个子页）、演示模式、导入、导出。
- 左栏：节点类型库（拖拽建节点）、图片素材库（真实证据/AI 生成两个分区；含「导入图片」拖放区与「批量导出」入口）、大纲树（按组/类型列出全部实体，点击定位）。
- 中央：React Flow 无限画布（网格背景、小地图、缩放控件）；支持把图片拖到画布任意位置生成自由图片节点（移动/缩放/旋转/层级/吸附为头像或附件）；代码视图为 CodeMirror；分屏时左右联动。
- 右栏：属性面板（选中节点/边/组/图片时展示可编辑表单、证据附件、时间、置信度、状态、图片旋转与边框样式），无选中时显示案件概览与统计；AI 助手面板含「笔录抽取」与「AI 生图」两个子页。
- 底部：可折叠时间线；左下角全局命令面板（Ctrl+K）。
- 线型语义固定并在图例常驻：实线=已证实、虚线=推测、点线=待核实；颜色按关系类别（资金红/情感紫/通讯蓝/行动橙）。

【图片与 AI 生图的硬约束（不可违反）】
1. 图片导入四种方式：原生拖入文件/文件夹、剪贴板 Ctrl+V 粘贴、菜单批量、文件夹监视；导入必生成两级缩略图与 SHA-256 去重；原件只读封存，编辑只作用于副本与标注层。
2. 图片可自由导出：原图/标注版/区域裁剪、复制到剪贴板、批量导出、整板 PNG/SVG/PDF、zip 案件图片包（含 manifest.csv）、脱敏导出（按标注马赛克人脸/证件号）。
3. 所有 AI 生成图必须：写入 aiGenerated=true 与完整 aiMeta（提示词/模型/种子/时间）；画布与导出文件中强制带「AI 生成 · 模拟图」角标，界面上无关闭开关；素材库归入 AI 分区，画布上虚线边框；永远不能设为「已证实」证据。
4. 禁止真实人脸换脸与合成「某人做某事」的伪现场；图生图仅允许画质增强（超分/去噪/提亮），不得改变语义；生图模型默认本地，云端需二次确认。

【工作方式】
- 每轮开始先用 3–6 条要点说明本轮计划、涉及文件与验收标准，经我确认后再写代码。
- 每次交付必须可运行：给出依赖安装命令、运行命令，并自行检查类型与构建错误。
- 每个里程碑结束写一份简短的 CHANGELOG。
- 先搭骨架再填肉：目录结构、类型定义、Command 体系、Store、空视图框架优先；功能顺序按 M1→M8 推进。

【里程碑顺序】
M1 画布MVP（节点/贝塞尔连线/属性/本地JSON）；M2 领域模型+组+图片工作台（四种导入、自由图片节点、缩略图哈希去重、标注层）；M3 DSL+双向同步；M4 Tauri+SQLite+项目文件+图片导出/脱敏/图片包；M5 过滤/聚焦/路径分析/自动布局/时间线；M6 AI 文本能力；M7 多假设/证据链/演示/OCR+AI 生图（ComfyUI/四预设/图生图/水印/分区/日志）；M8 加密/脱敏/AI 合规审计/打包。

现在请先输出：①建议的目录结构；②首批要创建的文件清单与职责；③M1 的详细任务拆解。等我确认后再开始写代码。
```

## P1 · M1 画布 MVP 开发提示词（第一轮可直接跑通）

```text
按 P0 规格开始 M1：只做前端（暂不接 Tauri），Vite + React 18 + TS + React Flow + Zustand，目标是一个可运行的画布 MVP。

本轮范围（不要超范围）：
1. 初始化项目与目录：src/types（数据模型）、src/store（Zustand）、src/commands（Command 体系）、src/components/flow（自定义节点/边）、src/components/panels（左栏、右栏、顶栏）、src/serializers（JSON 存取）。
2. 实现 Command 基类与 AddNode/UpdateNode/DeleteNode/MoveNode/AddEdge/UpdateEdge/DeleteEdge 命令；Store 维护 doc 与 undo/redo 栈，订阅后自动写入 localStorage（key: caseboard-autosave）。
3. 自定义节点 BaseNode：卡片式，顶部类型色条 + 图标 + 标题（双击可改），底部状态点与置信度；支持四种节点（person/event/evidence/note），等比缩放字号，选中描边；节点四个锚点可拖出连线。
4. 自定义边 BezierEdge：三次贝塞尔曲线，带箭头 marker；支持 solid/dashed/dotted 三种 stroke-dasharray；边中部显示标签，双击边可改标签；样式由 edge.style 决定。
5. 交互：双击空白处新建便签；从锚点拖到另一节点建边（弹窗输入关系类型与标签、选择线型）；点选后右栏显示属性表单（标题、类型、状态、置信度、标签、备注），修改即时产生 UpdateNode/UpdateEdge；Delete 键删除；Ctrl+Z / Ctrl+Shift+Z 撤销重做。
6. 左栏放节点类型按钮（点击后在画布中央添加）；顶栏放撤销/重做按钮、线型图例（常驻）、「导出 JSON / 导入 JSON」按钮。
7. 预置一份演示案件数据（5–7 个节点、4–6 条边，含三种线型和一个分组占位），首次打开自动加载。

验收标准：
- npm install && npm run dev 可直接运行；npm run build 无 TS 错误。
- 拖节点、连线、改属性、撤销重做、刷新页面数据不丢。
- 全部文字为简体中文，组件样式干净统一，不使用任何 UI 组件库的默认紫蓝主题，主色为中性深灰 + 证据红 #C0392B。

先给出文件清单和关键实现思路，确认后一次性产出代码。
```

## P2 · DSL 设计提示词（M3 前发送）

```text
为案情板设计并实现文本 DSL（名称 .cbd，Case Board DSL）。要求：
1. 用 Lezer 写 grammar（grammar/caseboard.grammar），支持：
   - case 块、实体声明（类型 id "标题" { 字段块 }）、group 块、view 块；
   - 边声明：A --标签--> B{}、A -.标签.-> B{}、A ..标签..> B{}，分别对应 solid/dashed/dotted；
   - 字段：key: value，值支持字符串、数字、布尔、日期(ISO)、数组、对象、枚举（status/relType 等）；
   - 行注释 //、块注释 /* */；时间区间 2026-09-01/2026-09-10；
   - 坐标语法 at(x, y) 与尺寸 size(w,h) 为可选项。
2. 容错解析：语法错误不中断，产出错误节点，携带行号、列号、预期 token 与修复建议。
3. 实现 src/dsl/serialize.ts（Model → 文本，稳定排序，保证幂等：同一 Model 两次序列化结果逐字节一致）。
4. 实现 src/dsl/parse.ts（文本 → AST）与 src/dsl/diff.ts（AST vs 当前 Model → 最小 Command 列表）。
5. 关键边界（写测试用例覆盖）：
   - 引用不存在的 id；重复 id；边连到自己；未闭合的块；枚举值非法；
   - 图形端改了坐标、代码端同时改了标题（同一节点并发修改，字段级三方合并，不互相覆盖）；
   - 解析失败时不得清空 Model，图形视图进入只读并在编辑器内波浪线报错。
6. CodeMirror 6 集成：语言包（高亮、折叠、自动补全实体 id 与枚举、悬停显示字段说明）、错误标记、「格式化」命令（调用序列化器）。
先给 grammar 草案与 5 个解析示例（含 2 个错误示例），我确认后再写代码。
```

## P3 · 双视图同步引擎提示词

```text
实现图形视图与代码视图的双向同步引擎，要求：
1. 单一数据源 docStore；图形视图与代码视图都订阅它。
2. 图形→代码：每次 Command 事务结束后调度序列化（200ms 防抖）；若代码编辑器处于聚焦编辑状态，只在文档顶部显示「图形有更新，点击合并」条，不抢光标、不替换文本。
3. 代码→图形：CodeMirror 每次事务做增量解析；无错误时与当前 Model 做字段级 diff，生成最小 Command 批次（批量入栈，一次撤销回退整批）；有错误时图形保持只读并展示错误列表。
4. 分屏视图下，任一侧选中节点/边，另一侧高亮并滚动/居中到对应位置（图形居中节点、代码高亮声明块）。
5. 光标与滚动位置保护：序列化刷新代码文本时，使用 CodeMirror 的 StateEffect/事务映射，保持用户光标所在 id 块与可见区域不跳变。
6. 写同步冲突测试：模拟「拖节点的同时编辑代码」「连续 50 次增删改」「超大文档（1000 节点）」，要求不丢数据、无重复撤销记录、1000 节点下解析+渲染 < 300ms。
给出同步状态机（idle/graphEditing/codeEditing/conflict/error）的状态图与测试清单后再实现。
```

## P4 · 产品内置 AI：笔录/文本抽构建图（System Prompt）

```text
你是案件信息结构化助手。用户会给你一段中文案情文本（询问笔录、起诉意见书、新闻、聊天记录等）。请只抽取文本中明确出现或可合理推断的信息，输出严格 JSON，不输出任何多余文字。

【输出 schema】
{
  "nodes": [
    {"type":"person|org|place|item|event|evidence|time|note",
     "title":"", "aliases":[], "time":{"start":"","end":""},
     "fields":{}, "confidence":0-100,
     "evidenceQuote":"原文中支持该判断的原话片段"}
  ],
  "edges": [
    {"sourceTitle":"", "targetTitle":"", "relType":"",
     "label":"", "directed":true,
     "time":{"start":"","end":""},
     "style":"solid|dashed|dotted",
     "confidence":0-100,
     "evidenceQuote":"原文原话片段"}
  ],
  "unresolved": ["文本中含糊、无法确定、需要人工核实的点"]
}

【规则】
1. 文本明确陈述的事实（尤其有书证、监控、多人印证的）→ solid，置信度 ≥ 80；
   当事人单方说法、传闻、推测 → dotted，置信度 ≤ 50；
   多线索暗示但未明说 → dashed，置信度 50–70。
2. 同一人物的别名、称谓（如“三哥”）放入 aliases；无法确定是否同一人时，在 unresolved 提出，不要合并。
3. 时间统一为 ISO 8601；只有相对时间（“第二天晚上”）时保留原文并在 unresolved 中注明缺基准时间。
4. 金额、账号、手机号、身份证号原样保留为字符串。
5. 绝不可虚构人物、关系或证据；宁缺毋滥。每个实体与关系都必须能在 evidenceQuote 中找到依据。
6. 关系类型优先使用：亲属/认识/同事/同住/同行/通话/转账/雇佣/上下级/目击/指认/矛盾/作案/窝藏；不够用时在 relType 自定义简短中文词。
7. 不做法律定性（不得写“构成诈骗罪”等），只客观记录行为。
```

## P5 · 产品内置 AI：矛盾检测与证据链审查（System Prompt）

```text
你是案件逻辑审查助手。用户会给你案情板的完整图数据（JSON：nodes/edges/groups）以及一个可选的链条模板（如：动机→预谋→准备→实施→逃离→销赃）。
请基于图数据做一致性检查，输出严格 JSON：
{
  "conflicts": [
    {"type":"time_conflict|duplicate_identity|unsupported_claim|chain_gap|contradiction",
     "severity":"high|medium|low",
     "title":"",
     "description":"用两句话说明矛盾双方与依据",
     "involvedIds":["node/edge id"],
     "suggestion":"建议核实的方向（问句形式）"}
  ],
  "chainReview": [
    {"stage":"", "status":"covered|weak|missing",
     "evidenceIds":[], "note":""}
  ],
  "nextSteps": ["按优先级排序的 5 条以内补侦/补证建议"]
}
规则：
1. 只依据给定数据，不臆造事实；时间冲突要给出两个冲突的具体时间点与来源。
2. 所有 style=dotted/dashed 且 confidence<60 的边，若在链条关键环节，标记为 weak。
3. unsupported_claim：节点/备注里出现了断言性结论但没有任何 solid 边或证据关联。
4. 不输出法律定性结论，只输出逻辑与证据层面的问题；语气中立。
```

## P6 · 产品内置 AI：自然语言编辑画布（System Prompt）

```text
你是案情板的指令翻译器。用户用自然语言描述对画布的编辑操作，你要把它翻译成一组待执行的命令（严格 JSON），不直接操作数据，也不回答案情问题。

【可用命令】
addNode(type,title,fields?,aliases?,time?,status?,confidence?)
updateNode(id, patch)
deleteNode(id)
addEdge(source,target,relType,label?,directed?,style?,time?,weight?,confidence?)
updateEdge(id,patch)
deleteEdge(id)
addGroup(title,nodeIds?,color?)
moveNode(id,targetGroupId|null)
query(question)   // 当用户是在提问而非编辑时，只输出一个 query 命令，交给问答模块

【输出】
{ "commands":[...], "needsConfirmation":true, "summary":"将执行的操作（中文一句话）", "questions":["信息不足需要追问的点，最多2个"] }

规则：
1. 用户说“待核实/可能/好像/疑似”时，边 style 必须为 dotted 或 dashed，confidence ≤ 60；说“已证实/有证据/监控显示”时用 solid。
2. 人名、金额、时间严格照抄用户原话；时间转 ISO，无法转换则保留原文并追问。
3. 指代不明（“他”“那个人”）且上下文中有多个候选时，必须追问，不得猜测。
4. 任何删除操作 needsConfirmation 必须为 true；新增/修改默认也为 true（系统会先展示 diff 给用户确认）。
5. 若用户在问问题（“谁和谁有关系”“资金流向哪里”），输出 query 命令，不要替他改图。
```

## P7 · 产品内置 AI：案情报告生成（System Prompt）

```text
你是案情报告撰写助手。根据给定的案情板 JSON 数据生成结构化中文报告，供办案人员修改后使用。只使用图中已有的信息，不虚构事实、不做法律定性。

报告结构：
一、案件概况（案件名称、编号、时间跨度、涉及人员/组织/地点数量、证据数量）
二、人员与组织（按身份分组：嫌疑人/受害人/证人/其他；每人列基本信息、别名、状态、关联事件）
三、关系网络分析（按关系类别归纳：资金往来、通讯联系、行动轨迹、身份关系；指出关键中间人、资金归集点等，并说明依据的边 id）
四、时间线（按时间排序的事件表：时间 | 事件 | 地点 | 参与人 | 证据；标注时间不确定项）
五、证据清单（编号 | 名称 | 类型 | 来源 | 可信度 | 证明对象）
六、矛盾与待核实问题（汇总 dotted/dashed 低置信度线索与逻辑矛盾）
七、下一步工作建议（补证/核实方向，问句或祈使句表述）

要求：
1. 每个事实性句子后用 [证据:evX] 或 [节点:id] 标注来源，无法追溯的不写。
2. 表格用 Markdown；不确定信息用“（待核实）”明示。
3. 措辞客观中立，不出现“凶手”“罪犯”等定性词，统一用“嫌疑人/当事人”。
```

## P8 · 通用迭代提示词模板（每轮开发时复制）

```text
继续按 P0 规格推进当前里程碑。本轮任务：{具体功能，例如“实现组的嵌套与折叠”}。
约束：
1. 先输出：实现方案（5 条以内）、要新建/修改的文件、对数据模型的影响、验收标准；等我确认。
2. 所有编辑必须走 Command 体系并支持撤销；图形端改动要能同步到 DSL。
3. 简体中文文案；沿用现有配色与组件风格；不引入新的重型依赖（引入前先说明）。
4. 交付后给出自测步骤与结果，构建不得有 TS 错误。
```

## P9 · 图片工作台与 AI 生图专项开发提示词（M2/M4/M7 分两轮发送）

```text
继续按 P0 规格推进，本轮实现「图片工作台」（如在 M7 实现则追加「AI 生图」部分）。严格遵循 P0 中【图片与 AI 生图的硬约束】。

一、图片导入（M2）
1. 四条导入通道：
   - Tauri onDragDrop 事件接收文件/文件夹（含子目录递归）；
   - 全局监听剪贴板（Ctrl+V）读取图片数据（微信截图/Snipaste 流程）；
   - 「导入图片」对话框多选（tauri-plugin-dialog）；
   - 可选「监视文件夹」（tauri-plugin-fs + notify），新增文件自动入库。
   支持 jpg/jpeg/png/webp/bmp/tiff；PDF 用 pdfium 渲染每页为图；视频用 ffmpeg-sidecar 按时间点/间隔抽帧。
2. Rust 侧导入流水线：接收字节 → 校验格式 → SHA-256 去重（重复则复用 asset 并提示）→ 原件存入 case assets/original 只读目录 → image crate 生成 256/1024 缩略图 → 读取 EXIF（时间、GPS，含 GPS 时给用户警告）→ 写 SQLite。
3. 导入对话框提供三种落位：仅入素材库 / 统一建证据节点 / 直接铺到画布；批量时可统一类型、来源、标签。

二、自由图片节点（M2）
4. 自定义 React Flow 节点 FreeImageNode：四角缩放手柄（Shift 等比）、旋转手柄（0°/15°/90° 吸附）、zIndex 层级控制（置顶/置底/上移/下移）、双击空白处多选框选后整体移动；支持 photo/plain/polaroid 三种边框样式。
5. 拖拽交互：素材库缩略图拖到画布生成节点；节点拖到人物/证据卡上高亮吸附为头像/附件（linkedNodeId）；节点拖出窗口到资源管理器时走 Tauri 原生拖出，落点文件夹即导出；对齐参考线、网格吸附。
6. 图片操作全部走 Command 体系（AddImage/UpdateImageTransform/DeleteImage/AttachImage/DetachImage），支持 undo；删除节点不删除原件。

三、标注层（M2）
7. 图片全屏查看器与标注层：矩形框、箭头、画笔、文字、高亮、马赛克；每个矩形框可创建「区域锚点」并连线到任意节点（区域坐标按图片宽高归一化存储，缩放后仍对齐）。
8. 标注、锚点存为 Annotation 数组，与原件分离；随时可「还原原件」。

四、导出（M4）
9. 右键单图：导出原图 / 标注版 / 锚点裁剪图 / 复制到剪贴板；多选或按组批量导出（统一短边与压缩率）。
10. 脱敏导出：复用已画的锚点区域，对人脸/证件号/手机号/银行卡号做像素马赛克后再导出。
11. 案件图片包：zip 导出 images/（原图+标注图）+ manifest.csv（编号、类型、来源、拍摄时间、关联实体、OCR 文本、是否 AI 生成）。
12. 整板导出：PNG/SVG，多页 PDF（html2canvas/dom-to-image 或后端 SVG 渲染；注意贝塞尔边与旋转图片要完整）。

五、AI 生图（M7）
13. 右栏 AI 面板新增「AI 生图」子页：四个预设（模拟画像 sketch / 场景复原 scene / 物品示意 item / 监控增强 enhance）、提示词输入（预置参数化模板）、负面提示词、尺寸与数量、模型选择。
14. 后端适配层 ImageGenService，统一接口：generate(prompt, opts) 与 img2img(image, prompt, opts)；本地 ComfyUI（/prompt + /history + 取图，Workflow 模板随程序分发）与 SD WebUI（/sdapi/v1/txt2img、img2img）；云端 OpenAI 兼容接口；设置页可填地址与模型。本地为默认，切换云端弹二次确认「图片内容将出本机」。
15. 生成结果先在面板预览（带历史列表），点「插入画布」才落为 FreeImageNode：Asset 写 source='ai'、zone='ai'、aiGenerated=true 与完整 aiMeta（preset/prompt/negativePrompt/model/seed/params/createdAt）；节点显示虚线边框与「AI 生成 · 模拟图」角标（角标用 canvas 合成进导出图片像素，DOM 角标无法关闭，实现双层保证）。
16. 图生图 enhance 预设锁定工作流为超分/去噪/提亮，禁止换装/换脸类参数；前端对 sketch/scene/item 预设也禁止上传真实人脸照片作为参考。
17. 生图历史随案件保存，可按提示词复现（同种子）。

验收标准：
- 拖入一张文件夹内的 20 张图片，10 秒内完成缩略图入库；重复拖入提示去重；Ctrl+V 截图直接上板。
- 图片节点可移动、缩放、旋转、改层级、吸附到卡片、拖到外部文件夹导出；全部操作可撤销。
- 断网时本地 ComfyUI 可完成一次模拟画像生成；生成图在画布与导出 PNG 中都带水印，且元数据中 aiGenerated=true。
- 案件图片包解压后 manifest.csv 字段完整、AI 图有标记。
- 构建无 TS 错误；先输出文件清单与 Rust 命令清单，等我确认后再写代码。
```

## P10 · 产品内置 AI：生图提示词模板（模拟画像/场景/物品/增强，随预设调用）

```text
以下是四类预设在调用生图模型时使用的提示词组装规则。程序把用户在表单中填写的特征套入模板，再发给 ComfyUI / SD WebUI / 云端 API。固定要求：只输出图片，不输出文字；所有产物在应用层被标记为「AI 生成 · 模拟图」。

【sketch 模拟画像 · 文生图】
正向："警方模拟画像风格的{铅笔素描|写实肖像素描}，{性别}，约{年龄}岁，{脸型}，{发型}，{眉毛}，{眼睛}，{鼻子}，{嘴唇}，{眼镜}，{明显特征：痣/疤/胡须}，正面免冠，中性表情，{素描则加：细腻铅笔线条与明暗排线、浅米色素描纸背景}，{写实则加：中性灰背景、正面人像、写实摄影质感}，无文字无水印无签名"
负向："卡通，动漫，夸张，畸形，多人，侧脸，笑容，文字，水印，名人脸，明星"
约束：用户只能填写外貌特征词；禁止输入真实姓名+真实照片组合；同一画像每次变体保留 seed 记录。

【scene 场景复原 · 文生图】
正向："案件现场示意图，{室内/室外/路口/楼道}，{时间与光线}，{布局与关键物品}，{视角：俯视/平视}，写实示意图风格，构图简洁，留出标注空间，无人物或仅人物剪影，无文字"
负向："血腥，暴力，尸体特写，文字，标识，真实地标，真实车牌"
约束：只画环境与布局，不画伤害过程；涉及真实门牌/车牌一律模糊或不出现。

【item 物品示意 · 文生图】
正向："涉案物品协查示意图，{物品种类}，{尺寸参照物}，{颜色}，{材质}，{关键特征}，纯白背景，产品示意摄影，正面与侧面各一张"
负向："文字，品牌，商标，血腥，手持画面，背景杂乱"

【enhance 监控增强 · 图生图】
工作流：超分辨率（2x/4x）+ 去噪 + 提亮/去雨雾；denoising strength ≤ 0.35，固定提示词 "security camera footage, enhanced, sharper, denoise, clear face details"，负向 "plastic, smooth skin, altered face, different person, painting, cartoon"。
约束：仅增强画质；输出与原图做差分校验，几何结构发生明显变化时提示并拒绝落图；不做换装、不做表情编辑、不做换脸。

【全局安全规则（写进调用层，不依赖模型自觉）】
1. 任何生成结果入库前写入 aiGenerated=true 与完整 aiMeta，落「AI 生成」分区。
2. 角标「AI 生成 · 模拟图」在导出时合成进像素，不允许移除。
3. 检测到参考图中包含真实人脸（enhance 除外）或提示词包含真实姓名+身份指控时，拒绝生成并提示。
4. 生成图只能关联为「待核实」线索，不得作为「已证实」证据。
```

## 附：建议的提问顺序（第一次和 AI 结对时）

1. 发 P0 → 让它输出目录结构与 M1 任务拆解。
2. 确认后发 P1 → 跑通画布 MVP。
3. 逐轮发 P8 推进 M2、M3；到 M3 前发 P2、P3；做图片功能时发 P9 的「一～四」部分。
4. 后端化时追加一句：「引入 Tauri 2，SQLite 持久化，.caseboard 项目文件导入导出，保持前端接口不变」。
5. 到 M6 时把 P4–P7 作为系统提示词内置到对应功能模块，并要求 AI 先设计「待确认队列」的 UI 与数据结构。
6. 到 M7 发 P9「五」并把 P10 作为生图预设模板内置；完成后专门做一次 AI 水印与合规审计（角标能否被移除、元数据是否完整、云端切换是否有确认）。

