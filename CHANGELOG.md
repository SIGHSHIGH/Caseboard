# CHANGELOG

本项目的变更记录。每个里程碑收尾追加一条，并打 git tag `ms/M<n>`。

## [未发布] v0.2.0 · M2 领域模型 + 组 + 图片工作台

### M2-1 领域模型与节点模板（2026-10-18）

- **8 类节点模板**（`src/lib/nodeTemplates.ts`）：人物/组织/地点/物品/事件/证据/时间/便签共 40 个字段定义，含下拉（性别、性质、证据种类、保管状态…）、日期、数字与长文本；左栏开放全部 8 类并显示字段数，右栏按类型渲染专属字段，模板外自定义字段照样展示（D11）。
- **卡片摘要**：节点卡片显示前 2 条关键字段值与评论数，折叠详情（`collapsed`）时只留标题与状态。
- **别名 / 标签 / 折叠 / 评论**：右栏可编辑别名与标签；新增 `addComment` / `deleteComment` 命令（进撤销栈），评论带时间戳。
- **旧文档迁移兜底**：新增 `src/serializers/migrate.ts` 的 `normalizeDoc`——缺 tags/attachments/status/confidence/w/h 自动补默认值，未知节点类型落 `note`，重复 id 与端点缺失的悬空边丢弃，缺 meta 抛 `DocMigrateError`；自动存档与 JSON 导入统一走这里。
- **编辑器修复**：`RightPanel` 的字段提交在数字字段上优先存 number，空值视为删除字段，保持导出 JSON 干净。
- **验收**：`pnpm smoke` 44 条（新增 17 条）、`pnpm ui-smoke` 13 条全绿；演示案件字段已对齐模板。

### M2-2 组系统（2026-10-19）

- **矩形组与圈选成组**：左栏「新建矩形组」在可视中心落 360×260 组；「圈选成组」拖框按节点中心命中（`nodeIdsInRect`），轨迹小于 24×24 视为误触，Esc 取消。
- **组进节点层**（D12）：展开态是自定义节点 `groupRect`（`zIndex:-1`，虚线框 + 同色标题栏，右下角把手可缩放），折叠态是自定义节点 `group` 超级节点；不用覆盖层，避免 React Flow 吞点击与重复实现视口换算。
- **嵌套与整组移动**：`Group.parentId` 支持嵌套，`canParentGroup` 防成环；拖标题栏走一条 `moveGroup` 命令同步位移组矩形 + 全部子孙组 + 组内节点，撤销一次全还原；删除组时子组与成员提升一级、不删节点。
- **折叠与连线聚合**：折叠后组内节点与子组隐藏，只留显示对象数/子组数的超级节点；跨组边聚合成 `__agg:` 合成边（多条显示「N 条关系」，线型取最弱、置信度取最小），聚合边不可选、不可删，避免误改真实数据。
- **属性面板**：分组名称、6 色标识色、底色不透明度（0.02–0.6）、上级分组、折叠开关、组内对象列表（可移出）、删除分组；节点属性新增「所属分组」选择。
- **验收**：`pnpm smoke` 70 条（新增 26 条组系统断言）、`pnpm ui-smoke` 18 条全绿；演示案件「诈骗团伙」分组已绑定张建国与恒信财务。

### M2-3 图片导入流水线（2026-10-19）

- **四路导入**：拖入（`.cb-main` onDrop）、Ctrl+V 粘贴截图、批选文件（`fileService.pickFiles`）、目录监视（File System Access 轮询，D14；不支持时按钮禁用并写明原因）。
- **Worker 预处理**（D13）：`src/workers/imageWorker.ts` 在 Worker 内算 SHA-256（`crypto.subtle.digest`）、解码尺寸、出 256/1024 双级缩略图（`OffscreenCanvas` + 白底 JPEG 0.85）、解析 EXIF；`ImageWorkerPool` 固定 3 个 worker 并按传入顺序重排结果。
- **存储分层**：原件与缩略图落 IndexedDB（`caseboard-assets`，库 `originals`/`thumbs`），`CaseDoc` 只存素材元数据（编号 `IMG-0001`、大小、MIME、拍摄时间、相机、GPS、来源说明、导入渠道），组件层不碰 IndexedDB。
- **去重**：`dedupeCandidates` 先查库内哈希、再查批内重复；向导里单列「已跳过的重复文件」并标注原因，全重复时给中文提示。
- **EXIF 解析器**：自研 DataView 实现（JPEG APP1 → TIFF IFD0/ExifIFD/GPSIFD，Make/Model/DateTimeOriginal/GPS 度分秒）；修掉「LONG 型 IFD 指针被当作内联值」导致的越界崩溃，并加损坏 IFD 的长度兜底。
- **导入向导**：预览瓷砖（尺寸/体积/哈希/拍摄时间/相机/GPS）、按张移除、两种导入方式（仅入素材库 / 建证据节点并自动铺排）、证据来源、拍摄时间、关联实体；确认后落一条 `importAssets` 命令（素材入库 + 建节点 + 挂附件，一次撤销回退）。
- **素材库与详情**：左栏改三标签（对象 / 素材 / 分组），素材库分「证据素材 · N」「AI 生成 · N」并在 AI 分区空态里写明 M7 强制角标规则；右栏 `AssetForm` 可改编号与来源说明、只读展示哈希/EXIF/关联对象，删除素材同时摘掉节点引用。
- **验收**：`pnpm smoke` 93 条（新增 22 条）、`pnpm ui-smoke` 31 条全绿。

### M2-5 标注层 + PDF 抽页 / 视频抽帧（2026-10-19，tag `ms/M2`）

- **标注模型**：`Annotation` 改为类型化 —— `shape` 六选一（矩形框/箭头/手绘/文字/区域锚点/马赛克）+ `geom` 归一化几何 + 可选 `color`/`text`/`linkedNodeId`；坐标统一为 **0–1 相对素材宽高**（D17），迁移时越界自动夹紧、空几何与非法图形丢弃。
- **纯函数层**（`src/lib/annotation.ts`）：`normalizeGeom / rectFromPoints / createAnnotation / annotationBBox / hitAnnotation / mosaicCells / arrowHeadPoints / toPixelRect / toPixelPoints / describeAnnotation`，全部无 DOM、smoke 直接测。
- **命令层**：`addAnnotation / updateAnnotation / deleteAnnotation / linkAnnotation / clearAnnotations`，标注挂在 `Asset.annotations` 上，一次操作一条命令一次撤销。
- **绘制唯一入口**（`src/services/annotate.ts`）：编辑画布、缩略图与导出全部走 `drawAnnotations`；马赛克按区域分列抽样后 `imageSmoothingEnabled=false` 放大，箭头两翼在像素空间算，文字带深底块避免压不住亮背景。
- **标注编辑器**（`AnnotationEditor`）：选择 + 六种图形 + 6 色；矩形/箭头/马赛克拖拽成型，手绘按点累积，文字就地输入；侧栏可改区域锚点关联实体、改文字、删除；「导出标注图」以长边 2048 重绘原图并叠标注出 PNG。
- **PDF 抽页**：pdf.js v6（`pdfjs-dist ^6.4.299`）**动态 import 懒加载**（D19），页码范围支持 `1-3,5`（含全角分隔符、倒序纠正、越界裁剪），逐页渲染 PNG 后交给既有导入流水线（来源默认「书证翻拍」）。
- **视频抽帧**：`<video> + <canvas>` 原生解码（D18），`planFrameTimes` 取每段中点（数量 1–24），产物同走导入流水线（来源默认「监控截图」）；编码不受支持时给中文原因。
- **入口与样式**：素材库新增「PDF / 视频抽图」按钮与 `ExtractDialog`（双模式标签）；素材属性新增「标注（N）」按钮与标注说明；新增 `.cb-annot*` / `.cb-extract*` / `.cb-color-dot` 约 190 行样式。
- **验收**：`pnpm smoke` 173 条（新增 42 条：标注几何 16、标注命令 11、抽页/抽帧规划 15）、`pnpm ui-smoke` 51 条（新增 12 条）全绿；构建 243 modules，主包 464.72 kB（gzip 150.81），pdf 解析器拆成独立懒加载块。
- **工具链结论**：esbuild 处理大输出时会在系统临时目录留不下文件（`remove ...: Access is denied`），构建前把 `TMP/TEMP` 指到工作区 `.tmp-esbuild` 即可（MILESTONES §5）。

### M2-4 自由图片节点（2026-10-19）

- **自由图片节点**：`CaseDoc` 新增 `imageNodes`（`ImageNode`：`assetId/x/y/w/h/rotation/zIndex/borderStyle/linkedNodeId/pinned`），画布自定义节点 `freeImage` 与卡片共用 zIndex 空间；迁移层丢弃素材不存在的图片节点、旧文档自动补空数组。
- **移动与缩放**：8 个方位手柄（四角 + 四边），Shift 等比、Alt 从中心对称、最小 40px；屏幕位移先除 `zoom` 再按 `-rotation` 旋到图片本地轴，缩放手感与旋转后的方向一致。
- **旋转吸附**：旋转手柄按相对中心的角度累加，距 15° 整步 ≤4° 吸附（0°/90°/180°/270° 自动命中），否则保留 0.1° 微角度。
- **层级与边框**：`reorderLayers` 支持置顶/置底/上移/下移（悬浮条 + 右栏按钮）；边框样式 `photo` 白边 / `plain` 无边框 / `polaroid` 拍立得，另可开图钉装饰。
- **对齐参考线与网格**：拖动中与其它图片/卡片求左中右、上中下的三线吸附（阈值 6px），命中画证据红虚线（`.cb-guides`），未命中按 8px 网格；画布另加 80px 大网格底纹。
- **多选与吸附**：Shift 点击多选，拖动一张带动其余，松手一条 `moveImageNodes`；图片中心落到卡片上时卡片高亮，松手 `attachImageNode` 吸附为人物头像或其它节点的证据附件（D16）。
- **交互不污染撤销栈**（D15）：拖动/缩放/旋转过程只改组件本地预览与 `uiStore` 的 guides/attachTarget，松手才派发一条命令。
- **素材库拖入**：缩略图可拖拽（`ASSET_DND_TYPE` 载荷），画布 onDrop 按落点居中生成并选中；右栏新增 `ImageForm`（位置/宽高、旋转滑杆、边框、层级、图钉、吸附对象与取消吸附、删除）。
- **验收**：`pnpm smoke` 131 条（新增 38 条）、`pnpm ui-smoke` 39 条全绿；构建 232 modules。

## v0.1.0 · M1 画布 MVP（2026-10-18，tag `ms/M1`）

### 2026-10-18

- **画布骨架**：Vite 6 + React 18 + TS(strict) + React Flow 12 + Zustand + Immer，纯 Web 交付（D2）。
- **Command 体系**：`AddNode / UpdateNode / MoveNode / DeleteNode / AddEdge / UpdateEdge / DeleteEdge / ReplaceDocument` 为唯一写入口；unified undo/redo 栈（immer patches，上限 200 步），store 不暴露裸 set。
- **自定义节点 `BaseNode`**：类型色条 + 图标 + 标题（双击就地改名）+ 状态点 + 置信度；四边锚点（target 几何锚点 + source 拖拽锚点，见 D8）。
- **自定义边 `BezierEdge`**：三次贝塞尔 + 箭头 marker，线型即语义（实线已证实 / 虚线推测 / 点线待核实，`strokeDasharray` 由 `LINE_STYLE_META` 统一），权重影响线宽，双击标签改名。
- **交互闭环**：双击空白建便签、拖锚点连线并弹窗选关系类型/线型、右栏属性表单、Delete 删除节点（联动清边）、Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y、左栏类型库在画布中心新增、顶栏常驻线型图例。
- **持久化**：localStorage 自动保存（`caseboard-autosave`），刷新不丢；导出/导入 JSON（`src/serializers/json.ts`，含中文错误提示），导入可撤销。
- **既有缺陷修复**：`enablePatches()` 未启用导致首条命令崩溃（撤销栈不可用）；仅 source 锚点导致连线可能不渲染。
- **验收工具**：`pnpm smoke`（27 条逻辑断言）、`pnpm ui-smoke`（12 条打包产物 DOM 断言，jsdom 伪布局）、`scripts/preview-check.cjs`（HTTP 可服务性）。
- **工具链结论**：安装走 `pnpm install --ignore-scripts`；`.npmrc` 固定 `node-linker=hoisted`；vite CLI 在沙箱内需提权（见 MILESTONES §5）。

## v0.0.0 · 立项

### 2026-10-18

- 归档产品规格至 `docs/CaseBoard-SPEC.md`（《案情板CaseBoard-产品构思与AI提示词》v0.2）。
- 建立里程碑契约 `docs/MILESTONES.md`：M1–M8 范围、交付物、可执行验收标准、推进规则。
- 完成工具链实测：Node v24.17.0 可用；**无 npm**；pnpm 10.34.5 需经 node 直连（`scripts/pnpm.cmd` 已封装并通过 `add esbuild` 实测）；npm registry 可达；**无 Rust 工具链（M4 前置阻塞）**；pnpm 10 需白名单放行构建脚本（D7）。
- 记录首批决策 D1–D6：pnpm 替代 npm、M1–M3 纯 Web、图片能力 service 双实现、`.cbd`/`.caseboard` 命名、持久化路线、坐标换算单点化。
