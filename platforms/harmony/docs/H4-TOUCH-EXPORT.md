# H4 · 手指命中与导出能力（2026-10-21）

一条命令验收：`powershell -ExecutionPolicy Bypass -File scripts/accept-h4.ps1`
（`-SkipBuild` 复用现有 HAP，`-SkipWeb` 跳过前端产物）。

## 一、结论表

| 项 | 改之前 | 改之后 | 要不要写码 |
|---|---|---|---|
| 连线命中 | 线宽 1.6~4.5px，透明带 18px | **34px 命中带**（触屏） | 要 |
| 分组折叠 / 节点数 | 26px 高 | **32px 高**（随画布缩放） | 要 |
| 图例按钮 | 36px 高 | **40px 高** | 要 |
| 连接点（112 个） | 7×7 | 不动 | **不要**：`BaseNode.tsx:86/96` 是 `isConnectable={false}` 的装饰点，`pointer-events: none`，本来就不该点 |
| 缩放按钮 | 40×40 | 不变 | 已是手指尺寸 |
| 长按菜单 / 双指 / 单指平移 | 本就能用 | 不变 | 不要（见 docs/H3-GESTURES.md） |
| 导出 PNG | 能导出，但 mime = `application/octet-stream` | **`image/png`**，系统面板显示「PNG 图片」 | 要 |

## 二、改了什么

- `web/src/components/flow/BezierEdge.tsx`：透明命中路径 `strokeWidth={hitWidth}`，`hitWidth = touch ? 34 : 18`；顺带补 `pointerEvents: 'stroke'`（此前靠 `visiblePainted` 兜着，不明确）。
- `web/src/styles/responsive.css`：`.cb-group__fold` / `.cb-group__count` 抬到 `min-height: 32px`；`.cb-legend-fab` 抬到 40px；并写了一整段注释解释**为什么连接点不放大**。
- `web/src/services/file.ts`：新增 `mimeOfName(fileName)`（png/jpg/webp/svg/pdf/json/csv/md/txt/caseboard/zip → 对应 MIME），`saveBytes` 不再硬编码 `application/octet-stream`。

## 三、导出实测（真机对话式验证）

`导出…` → `导出 PNG` → 系统保存对话框（文件名 `2026-10连环诈骗案（演示）-A-2026-1018-20261021.png`，格式「PNG 图片」）→ `保存` →

```
[file] save 2026-10连环诈骗案（演示）-A-2026-1018-20261021.png -> file://docs/storage/Users/currentUser/…png (305370B, image/png)
```

第一次导出落在 `我的平板 > 个人`（306 KB，文件管理器里显示为「图片」）——**导出的不是空文件，是真的 PNG 字节**。

> 坑：同名文件已存在时系统会弹「…文件已存在，要替换它？」。脚本里必须再点一次「替换」，否则等待超时、日志里没有 `[file] save`，看起来像导出失败。

## 四、OCR 实测结论（样图 `test-fixtures/ocr-id-sample.jpg`）

链路全通但**模拟器跑不起来**：

- `readRawfileBase64('test-fixtures/ocr-id-sample.jpg')` → `b64.length=847740`（原图 635,804B）；PixelMap 解码成功。
- `canIUse('SystemCapability.AI.OCR.TextRecognition')` → **false**。
- 绕过闸门直调 `recognizeText` → `{"code":1001400001}`；先 `await textRecognition.init()` → 5s 超时 `{"code":200}`。

→ **HMS AI 引擎不在 x86 模拟器上工作，OCR 只能真机验收**。代码侧已加 `ensureInit()` 单次初始化与 `OCR_MAX_EDGE = 1600` 预缩放（大图更容易撞 `1001400001`）。

## 五、验收项（7 条，全 PASS）

H4-1 触控形态生效 / H4-2 连线命中带 ≥30px / H4-3 图例 ≥40px / H4-4 折叠计数已放大 / H4-5 产物 CSS 含放大规则 / H4-6 导出面板 7 项 / H4-7 导出 PNG 落盘且 mime=image/png。

## 六、未做

- SVG / PDF / 图片包 / 项目文件四条导出通道还没逐条上机（PDF 依赖 `@kit.PDFKit`，模拟器上同样可能因 HMS 不可用而失败）。
- 时间线条目、颜色块在当前示例案子里没有渲染，命中体检里是 0，未验证。
- 画布内元素随缩放变化，`32px` 在 0.5 倍缩放下只有 16px 物理高度——极端缩小时仍会偏小，未做下限保护。