/* M1 UI 冒烟：用 jsdom 挂载打包产物，确认画布真的渲染出节点与连线。 */
const { createHarness, loadAppBundle } = require('./jsdom-harness.cjs');

const { window } = createHarness();

process.on('uncaughtException', (error) => {
  console.log('UNCAUGHT ' + (error && error.message));
  process.exit(3);
});
process.on('unhandledRejection', (error) => {
  console.log('UNHANDLED ' + (error && error.message));
  process.exit(4);
});

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log('  PASS ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
  }
}

(async () => {
  try {
    await loadAppBundle();
  } catch (error) {
    console.error('挂载失败：', error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n') : error);
    process.exit(2);
  }
  await new Promise((resolve) => setTimeout(resolve, 600));

  const doc = window.document;
  const text = doc.body.textContent || '';

  if (process.env.CB_DEBUG === '1') {
    const edgesLayer = doc.querySelector('.react-flow__edges');
    console.log('DEBUG edgesLayer', edgesLayer ? edgesLayer.outerHTML.slice(0, 700) : 'null');
    console.log('DEBUG svg 数量', doc.querySelectorAll('svg').length);
    const firstNode = doc.querySelector('.cb-node');
    console.log('DEBUG 首个节点', firstNode ? firstNode.outerHTML.slice(0, 400) : 'null');
    console.log('DEBUG 画布容器', doc.querySelector('.react-flow') ? 'ok' : 'missing');
    console.log('DEBUG edges 层 HTML 长度', edgesLayer ? edgesLayer.outerHTML.length : 0);
    if (edgesLayer) {
      console.log('DEBUG edges 层 g 数量', edgesLayer.querySelectorAll('g').length, 'path 数量', edgesLayer.querySelectorAll('path').length);
      console.log('DEBUG edges 层尾部', edgesLayer.outerHTML.slice(-600));
    }
    const edgeish = [...doc.querySelectorAll('[class*="react-flow__edge"]')].slice(0, 8).map((el) => el.tagName + '.' + [...el.classList].join('.'));
    console.log('DEBUG 含 edge 类的元素', JSON.stringify(edgeish));
    const handles = doc.querySelectorAll('.react-flow__handle').length;
    console.log('DEBUG handle 数量', handles);
    console.log('DEBUG source handle', doc.querySelectorAll('.react-flow__handle.source').length, 'target handle', doc.querySelectorAll('.react-flow__handle.target').length);
    const labelLayer = doc.querySelector('.react-flow__edgelabel-renderer');
    console.log('DEBUG 标签层子元素', labelLayer ? labelLayer.children.length : 'missing');
    const nodeEls = [...doc.querySelectorAll('.react-flow__node')].slice(0, 2);
    console.log('DEBUG 节点样式', nodeEls.map((el) => (el.style.transform || '') + '|' + (el.style.width || '')).join(' ; '));
    console.log('DEBUG 节点尺寸', nodeEls.map((el) => { const r = el.getBoundingClientRect(); return r.width + 'x' + r.height; }).join(' ; '));
  }

  console.log('[UI] 打包产物挂载结果');
  check('根容器已渲染', doc.querySelector('#root') !== null && doc.querySelector('#root').children.length > 0);
  check('顶栏存在', doc.querySelector('.cb-topbar') !== null);
  check('顶栏显示案件标题与编号', text.includes('连环诈骗案') && text.includes('A-2026-1018'));
  check('顶栏不再有「案情板」logo 块（M10）', (() => {
    const brand = doc.querySelector('.cb-topbar__brand');
    return brand !== null && brand.querySelector('.cb-topbar__logo') === null;
  })());
  check('左栏 8 个节点类型按钮', doc.querySelectorAll('.cb-type-btn').length === 8, doc.querySelectorAll('.cb-type-btn').length);
  check('每个类型按钮带字段数提示', doc.querySelectorAll('.cb-type-btn__hint').length === 8, doc.querySelectorAll('.cb-type-btn__hint').length);
  check('节点卡片展示模板字段摘要', doc.querySelectorAll('.cb-node__field').length >= 2, doc.querySelectorAll('.cb-node__field').length);
  check('画布渲染 6 个节点', doc.querySelectorAll('.cb-node').length === 6, doc.querySelectorAll('.cb-node').length);
  check('关系线已渲染', doc.querySelectorAll('.react-flow__edge').length === 6, doc.querySelectorAll('.react-flow__edge').length);
  check('线型图例收进右下角「图示」（M10）', (() => {
    // 顶栏不再常驻图例，改由 CanvasLegend 折叠；展开后仍是 3 条线型
    if (doc.querySelector('.cb-topbar__legend') !== null) return false;
    const fab = doc.querySelector('.cb-legend-fab');
    return fab !== null && fab.getAttribute('aria-expanded') === 'false';
  })());
  check('右栏显示案件概览', text.includes('案件概览'));
  check('节点标题可见', text.includes('张建国') && text.includes('恒信财务'));
  check('撤销按钮初始禁用', (() => {
    const buttons = [...doc.querySelectorAll('.cb-topbar__tools button')];
    return buttons.length === 2 && buttons.every((b) => b.disabled);
  })());
  check('关系标签渲染', text.includes('转账 50 万'), null);
  check('分组框已渲染', doc.querySelectorAll('.cb-group').length === 1, doc.querySelectorAll('.cb-group').length);
  check('分组标题可见', text.includes('诈骗团伙'));
  check('分组显示成员数', (() => {
    const count = doc.querySelector('.cb-group__count');
    return count !== null && /2/.test(count.textContent || '');
  })(), doc.querySelector('.cb-group__count')?.textContent);
  check('分组底色使用标识色', (() => {
    const group = doc.querySelector('.cb-group');
    const bg = group ? group.style.background || group.style.backgroundColor : '';
    return /192, *57, *43/.test(bg);
  })(), doc.querySelector('.cb-group')?.getAttribute('style'));
  const clickByText = async (selector, needle) => {
    const target = [...doc.querySelectorAll(selector)].find((el) => (el.textContent || '').includes(needle));
    if (!target) return false;
    target.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    return true;
  };

  console.log('[UI] M2-3 左栏标签与素材库');
  check('左栏四个标签', doc.querySelectorAll('.cb-tabs .cb-tab').length === 4, doc.querySelectorAll('.cb-tabs .cb-tab').length);

  check('可切到素材标签', await clickByText('.cb-tabs .cb-tab', '素材'));
  check('素材库区块已渲染', doc.querySelector('.cb-assets') !== null);
  check('证据素材 / AI 生成 两分区', doc.querySelectorAll('.cb-assets__zones .cb-tab').length === 2, doc.querySelectorAll('.cb-assets__zones .cb-tab').length);
  check('证据分区显示 1 张素材', doc.querySelectorAll('.cb-asset').length === 1, doc.querySelectorAll('.cb-asset').length);
  check('无 IndexedDB 时缩略图降级为占位', doc.querySelectorAll('.cb-asset__ph').length === 1, doc.querySelectorAll('.cb-asset__ph').length);
  check('导入图片按钮存在', [...doc.querySelectorAll('.cb-assets__actions .cb-btn')].some((b) => (b.textContent || '').includes('导入图片')));
  check('无 File System Access 时监视按钮禁用', (() => {
    const watch = [...doc.querySelectorAll('.cb-assets__actions .cb-btn')].find((b) => (b.textContent || '').includes('监视文件夹'));
    return !!watch && watch.disabled === true;
  })());

  check('可切到 AI 生成分区', await clickByText('.cb-assets__zones .cb-tab', 'AI 生成'));
  check('AI 分区空态提示', (doc.querySelector('.cb-assets__empty')?.textContent || '').includes('AI 生成图'), doc.querySelector('.cb-assets__empty')?.textContent);

  check('可切到分组标签', await clickByText('.cb-tabs .cb-tab', '分组'));
  check('分组标签含 2 个入口', doc.querySelectorAll('.cb-group-actions .cb-btn').length === 2, doc.querySelectorAll('.cb-group-actions .cb-btn').length);

  check('可切回对象标签', await clickByText('.cb-tabs .cb-tab', '对象'));
  check('切回后类型按钮恢复 8 个', doc.querySelectorAll('.cb-type-btn').length === 8, doc.querySelectorAll('.cb-type-btn').length);
  check('粘贴导入不会破坏初始渲染', doc.querySelectorAll('.cb-node').length === 6, doc.querySelectorAll('.cb-node').length);

  console.log('[UI] M2-4 自由图片节点');
  check('画布渲染自由图片节点', doc.querySelectorAll('.cb-free-image').length === 1, doc.querySelectorAll('.cb-free-image').length);
  check('默认照片白边样式', doc.querySelectorAll('.cb-free-image__frame--photo').length === 1);
  check('无原件时显示占位说明', doc.querySelectorAll('.cb-free-image__ph').length === 1);
  check('图钉装饰已渲染', doc.querySelectorAll('.cb-free-image__pin').length === 1);
  check('旋转角度写进 transform', (() => {
    const frame = doc.querySelector('.cb-free-image__frame');
    return !!frame && /rotate\(\s*352/.test(frame.style.transform || '');
  })(), doc.querySelector('.cb-free-image__frame')?.getAttribute('style'));

  const imageEl = doc.querySelector('.cb-free-image');
  if (imageEl) imageEl.click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  check('点击图片后右栏切换为图片属性', (doc.querySelector('.cb-panel--right')?.textContent || '').includes('图片属性'));
  check('图片属性含层级与边框设置', (doc.querySelector('.cb-panel--right')?.textContent || '').includes('层级') && doc.querySelectorAll('.cb-panel--right .cb-btn').length >= 5);
  check('图片选中后出现八向缩放手柄', doc.querySelectorAll('.cb-img-handle').length === 8, doc.querySelectorAll('.cb-img-handle').length);
  check('图片选中后出现旋转手柄', doc.querySelector('.cb-img-rotate') !== null);

  console.log('[UI] M2-5 标注层与 PDF/视频抽图');
  check('可回到素材标签', await clickByText('.cb-tabs .cb-tab', '素材'));
  check('PDF / 视频抽图按钮存在', [...doc.querySelectorAll('.cb-assets__actions .cb-btn')].some((b) => (b.textContent || '').includes('PDF / 视频抽图')));
  const tile = doc.querySelector('.cb-asset');
  if (tile) tile.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const rightText = () => doc.querySelector('.cb-panel--right')?.textContent || '';
  check('点击素材后右栏切换为素材属性', rightText().includes('素材编号') && rightText().includes('SHA-256'));
  check('素材属性显示标注入口与数量', rightText().includes('标注（2）'), rightText().slice(0, 60));
  check('可打开标注编辑器', await clickByText('.cb-panel--right .cb-btn', '标注（'));
  check('标注编辑器已渲染', doc.querySelector('.cb-annot') !== null);
  check('六种图形 + 选择工具共 7 个按钮', doc.querySelectorAll('.cb-annot__toolbar .cb-btn').length === 7, doc.querySelectorAll('.cb-annot__toolbar .cb-btn').length);
  check('标注色板 6 色', doc.querySelectorAll('.cb-annot__colors .cb-color-dot').length === 6, doc.querySelectorAll('.cb-annot__colors .cb-color-dot').length);
  check('已存标注列表显示 2 条', doc.querySelectorAll('.cb-annot__item').length === 2, doc.querySelectorAll('.cb-annot__item').length);
  check('标注列表显示图形名与关联', (doc.querySelector('.cb-annot__list')?.textContent || '').includes('矩形框') && (doc.querySelector('.cb-annot__list')?.textContent || '').includes('区域锚点'));
  check('原件缺失时标注画布给出说明', (doc.querySelector('.cb-annot__missing')?.textContent || '').includes('原件不在本机'), doc.querySelector('.cb-annot__missing')?.textContent);
  check('导出标注图按钮存在', [...doc.querySelectorAll('.cb-annot .cb-btn')].some((b) => (b.textContent || '').includes('导出标注图')));

  console.log('[UI] M3-4 分屏代码视图');
  const codeBtn = [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].find((b) => (b.textContent || '').includes('代码视图'));
  check('顶栏有代码视图按钮', !!codeBtn);
  if (codeBtn) codeBtn.click();
  // 代码视图是按需 chunk，等它加载并挂载 CodeMirror
  await new Promise((resolve) => setTimeout(resolve, 1500));
  check('分屏出现代码面板', doc.querySelector('.cb-code') !== null);
  check('同步徽标显示已同步', (doc.querySelector('.cb-code__badge')?.textContent || '').includes('已同步'), doc.querySelector('.cb-code__badge')?.textContent);
  check('分栏把手存在', doc.querySelector('.cb-splitter') !== null);
  check('CodeMirror 编辑器已挂载', doc.querySelector('.cm-editor') !== null);
  check('代码文本含实体声明', (doc.querySelector('.cm-content')?.textContent || '').includes('张建国'), (doc.querySelector('.cm-content')?.textContent || '').slice(0, 40));
  check('代码视图渲染多行声明', doc.querySelectorAll('.cm-line').length >= 3, doc.querySelectorAll('.cm-line').length);
  check('代码首行是文本视图说明', (doc.querySelector('.cm-line')?.textContent || '').includes('案情板'), doc.querySelector('.cm-line')?.textContent);
  const closeCode = [...doc.querySelectorAll('.cb-code__head .cb-btn')].find((b) => (b.textContent || '').includes('关闭'));
  if (closeCode) closeCode.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('关闭后代码面板移除', doc.querySelector('.cb-code') === null);
  // 验收 6：画布选中 → 代码侧定位并高亮
  const reopen = [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].find((b) => (b.textContent || '').includes('代码视图'));
  if (reopen) reopen.click();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  check('可以再次打开代码视图', doc.querySelector('.cb-code') !== null);
  const firstNode = doc.querySelector('.cb-node');
  if (firstNode) firstNode.click();
  await new Promise((resolve) => setTimeout(resolve, 400));
  check('画布选中后代码侧高亮对应声明', doc.querySelectorAll('.cb-code-target').length >= 1, doc.querySelectorAll('.cb-code-target').length);

  console.log('[UI] M4 导出面板与保存状态');
  check('顶栏有保存项目按钮', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').includes('保存项目')));
  check('顶栏有导出按钮', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').includes('导出')));
  const saveBar = doc.querySelector('.cb-topbar__save');
  check('顶栏显示保存后端与时间', !!saveBar && (saveBar.textContent || '').includes('本机存储'), saveBar?.textContent);
  check('可打开导出面板', await clickByText('.cb-topbar__io .cb-btn', '导出'));
  check('导出面板渲染 7 个导出项', doc.querySelectorAll('.cb-export__item').length === 7, doc.querySelectorAll('.cb-export__item').length);
  check('导出项含整板 PNG 与 SVG', (doc.querySelector('.cb-export__list')?.textContent || '').includes('整板 PNG') && (doc.querySelector('.cb-export__list')?.textContent || '').includes('整板 SVG'));
  check('导出项含多页 PDF', (doc.querySelector('.cb-export__list')?.textContent || '').includes('多页 PDF'));
  check('导出项含案件图片包', (doc.querySelector('.cb-export__list')?.textContent || '').includes('案件图片包'));
  check('导出面板含脱敏分区', (doc.querySelector('.cb-export__redact')?.textContent || '').includes('脱敏'));
  const redactText = (doc.querySelector('.cb-export__redact')?.textContent || '');
  check('脱敏区说明来自标注开关', redactText.includes('导出时打码') || doc.querySelectorAll('.cb-export__redactlist li').length >= 1, redactText.slice(0, 60));
  check('导出面板声明不联网', (doc.querySelector('.cb-export')?.textContent || '').includes('不联网'));
  const closeExport = doc.querySelector('.cb-export .cb-modal__icon');
  if (closeExport) closeExport.click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  check('关闭后导出面板移除', doc.querySelector('.cb-export') === null);

  console.log('[UI] M4 历史与回收站面板');
  check('顶栏有历史按钮', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').includes('历史')));
  check('可打开历史面板', await clickByText('.cb-topbar__io .cb-btn', '历史'));
  check('历史面板已渲染', doc.querySelector('.cb-history') !== null);
  const historyTabs = doc.querySelector('.cb-history__tabs');
  check('两个标签页文案', (historyTabs?.textContent || '').includes('版本快照') && (historyTabs?.textContent || '').includes('回收站'));
  check('立即快照按钮存在', [...doc.querySelectorAll('.cb-history__tabs .cb-btn')].some((b) => (b.textContent || '').includes('立即快照')));
  check('浏览器环境提示只在桌面端可用', (doc.querySelector('.cb-history .cb-panel__note')?.textContent || '').includes('只在桌面端 SQLite 可用'), doc.querySelector('.cb-history .cb-panel__note')?.textContent);
  check('快照空态文案', (doc.querySelector('.cb-history__empty')?.textContent || '').includes('还没有快照'), doc.querySelector('.cb-history__empty')?.textContent);
  const trashTab = [...doc.querySelectorAll('.cb-history__tabs .cb-btn')].find((b) => (b.textContent || '').includes('回收站'));
  if (trashTab) trashTab.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  check('切到回收站标签后显示空态', (doc.querySelector('.cb-history__empty')?.textContent || '').includes('回收站是空的'), doc.querySelector('.cb-history__empty')?.textContent);
  check('回收站页脚含清空按钮', [...doc.querySelectorAll('.cb-history__foot .cb-btn')].some((b) => (b.textContent || '').includes('清空回收站')));
  const closeHistory = [...doc.querySelectorAll('.cb-history__head .cb-btn')].find((b) => (b.textContent || '').includes('关闭'));
  if (closeHistory) closeHistory.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  check('关闭后历史面板移除', doc.querySelector('.cb-history') === null);

  console.log('[UI] 曲率手柄与工具栏层级（M4 人工验收 A1/A3 热修）');
  const fs = require('node:fs');
  const path = require('node:path');
  const assetsDir = path.join(__dirname, '..', 'dist', 'assets');
  const cssName = fs.readdirSync(assetsDir).find((name) => name.endsWith('.css'));
  const cssText = cssName ? fs.readFileSync(path.join(assetsDir, cssName), 'utf8') : '';
  const barRule = (cssText.match(/\.cb-free-image__bar\s*\{[^}]*\}/) || [''])[0];
  // M9（A2）：工具条改成贴图片右侧竖排，让出顶部的旋转手柄（原来 top:-60px 与旋转手柄 top:-36px 重叠）
  check(
    '图片工具条改到右侧竖排（不再压住旋转手柄）',
    /left:\s*calc\(100% \+ 10px\)/.test(barRule) && /flex-direction:\s*column/.test(barRule) && /top:\s*0/.test(barRule),
    barRule.slice(0, 160),
  );
  const rotateRule = (cssText.match(/\.cb-img-rotate\s*\{[^}]*\}/) || [''])[0];
  check('旋转手柄仍在图片顶部中心', /top:\s*-36px/.test(rotateRule), rotateRule.slice(0, 120));
  const curveRule = (cssText.match(/\.cb-curve-handle\s*\{[^}]*\}/) || [''])[0];
  check('曲率手柄样式已打包', /z-index:\s*7/.test(curveRule) && /pointer-events:\s*all/.test(curveRule), curveRule.slice(0, 160));
  const firstEdge = doc.querySelector('.react-flow__edge');
  if (firstEdge) firstEdge.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('点击关系后出现曲率手柄', doc.querySelector('.cb-curve-handle') !== null, firstEdge ? firstEdge.getAttribute('class') : 'no-edge');
  const curveHandle = doc.querySelector('.cb-curve-handle');
  if (curveHandle) curveHandle.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  check('曲率手柄可双击复位（不残留控制点）', doc.querySelector('.cb-curve-handle') !== null);

  console.log('[UI] M5-2 过滤与聚焦面板');
  const analysisTab = [...doc.querySelectorAll('.cb-tab')].find((tab) => (tab.textContent || '').trim() === '分析');
  check('左栏有「分析」页签', !!analysisTab);
  if (analysisTab) analysisTab.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('分析面板已渲染', doc.querySelector('.cb-filter') !== null);
  check('三种过滤模式按钮', doc.querySelectorAll('.cb-filter__mode').length === 3, doc.querySelectorAll('.cb-filter__mode').length);
  const personChip = [...doc.querySelectorAll('.cb-filter .cb-chip')].find((chip) => (chip.textContent || '').startsWith('人物'));
  check('实体类型 chip 含「人物」', !!personChip);
  if (personChip) personChip.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('淡化模式：4 个未命中实体变淡', doc.querySelectorAll('.cb-node.is-dim').length === 4, doc.querySelectorAll('.cb-node.is-dim').length);
  check('淡化模式不隐藏实体（仍 6 个）', doc.querySelectorAll('.cb-node').length === 6, doc.querySelectorAll('.cb-node').length);
  check('命中统计显示 2 / 6', (doc.querySelector('.cb-filter__summary')?.textContent || '').includes('2 / 6'), doc.querySelector('.cb-filter__summary')?.textContent);
  const showMode = [...doc.querySelectorAll('.cb-filter__mode')].find((btn) => (btn.textContent || '').includes('只显示命中'));
  if (showMode) showMode.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('只显示命中：隐藏 4 个实体', doc.querySelectorAll('.cb-node').length === 2, doc.querySelectorAll('.cb-node').length);
  const resetBtn = [...doc.querySelectorAll('.cb-filter .cb-btn')].find((btn) => (btn.textContent || '').includes('重置全部筛选'));
  check('重置按钮存在', !!resetBtn);
  if (resetBtn) resetBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('重置后 6 个实体全部恢复', doc.querySelectorAll('.cb-node').length === 6, doc.querySelectorAll('.cb-node').length);
  check('重置后没有淡化节点', doc.querySelectorAll('.cb-node.is-dim').length === 0, doc.querySelectorAll('.cb-node.is-dim').length);
  const focusBtn = [...doc.querySelectorAll('.cb-filter .cb-btn')].find((btn) => (btn.textContent || '').includes('聚焦所选'));
  check('未选中实体时聚焦按钮禁用', !!focusBtn && focusBtn.disabled === true);
  const anyNode = doc.querySelector('.cb-node');
  if (anyNode) anyNode.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const focusBtn2 = [...doc.querySelectorAll('.cb-filter .cb-btn')].find((btn) => (btn.textContent || '').includes('聚焦所选'));
  check('选中实体后聚焦按钮可用', !!focusBtn2 && focusBtn2.disabled === false);
  if (focusBtn2) focusBtn2.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('聚焦后外部实体淡化（2 个）', doc.querySelectorAll('.cb-node.is-dim').length === 2, doc.querySelectorAll('.cb-node.is-dim').length);

  console.log('[UI] M5-3 路径与中心度面板');
  const pathTab = [...doc.querySelectorAll('.cb-subtab')].find((tab) => (tab.textContent || '').includes('路径与中心度'));
  check('分析面板有「路径与中心度」子页签', !!pathTab);
  if (pathTab) pathTab.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('路径面板已渲染', doc.querySelector('.cb-path') !== null);
  const pathSelects = doc.querySelectorAll('.cb-path__field select');
  check('起点与终点两个下拉框', pathSelects.length === 2, pathSelects.length);
  const analyzeBtn = [...doc.querySelectorAll('.cb-path .cb-btn')].find((btn) => (btn.textContent || '').includes('计算路径'));
  check('未选端点时「计算路径」禁用', !!analyzeBtn && analyzeBtn.disabled === true);
  if (pathSelects.length === 2) {
    pathSelects[0].value = 'zhang';
    pathSelects[0].dispatchEvent(new window.Event('change', { bubbles: true }));
    pathSelects[1].value = 'ktv';
    pathSelects[1].dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    const analyzeBtn2 = [...doc.querySelectorAll('.cb-path .cb-btn')].find((btn) => (btn.textContent || '').includes('计算路径'));
    check('选好两端后「计算路径」可用', !!analyzeBtn2 && analyzeBtn2.disabled === false);
    if (analyzeBtn2) analyzeBtn2.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const shortestText = doc.querySelector('.cb-path__shortest')?.textContent || '';
    check('结果区显示最短 2 跳', shortestText.includes('最短 2 跳'), shortestText);
    check('路径列表渲染并高亮在画布上', doc.querySelectorAll('.cb-path__list .cb-path__item').length >= 1 && doc.querySelectorAll('.cb-node.is-path').length >= 2, doc.querySelectorAll('.cb-node.is-path').length);
  }
  const degreeChip = [...doc.querySelectorAll('.cb-path .cb-chip')].find((chip) => (chip.textContent || '') === '度中心度');
  const centralityChips = [...doc.querySelectorAll('.cb-path .cb-chip')].filter((chip) => ['关闭', '度中心度', '中介中心度'].includes((chip.textContent || '').trim()));
  check('中心度三个选项', centralityChips.length === 3, centralityChips.map((chip) => chip.textContent));
  if (degreeChip) degreeChip.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('打开度中心度后出现 6 条排行', doc.querySelectorAll('.cb-path__rank').length === 6, doc.querySelectorAll('.cb-path__rank').length);
  const firstRank = doc.querySelector('.cb-path__rank');
  check('排行首项是张建国', (firstRank?.textContent || '').includes('张建国'), firstRank?.textContent);
  if (firstRank) firstRank.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('点击排行不会崩且定位到该实体', doc.querySelectorAll('.cb-node.is-selected').length === 1, doc.querySelectorAll('.cb-node.is-selected').length);

  console.log('[UI] M5-4 自动布局面板');
  const layoutTab = [...doc.querySelectorAll('.cb-subtab')].find((tab) => (tab.textContent || '').includes('自动布局'));
  check('分析面板有「自动布局」子页签', !!layoutTab);
  if (layoutTab) layoutTab.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('自动布局面板已渲染', doc.querySelector('.cb-layout') !== null);
  const layoutChips = doc.querySelectorAll('.cb-layout .cb-chip');
  check('五种布局类型可选', layoutChips.length === 5, [...layoutChips].map((chip) => chip.textContent));
  const gridChip = [...layoutChips].find((chip) => (chip.textContent || '') === '网格');
  if (gridChip) gridChip.click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  check('切换布局类型后高亮跟随', !!gridChip && gridChip.className.includes('is-active'), gridChip?.className);
  const lockBox = doc.querySelector('.cb-layout .cb-filter__check input');
  check('有「锁定选中的实体」开关', !!lockBox);
  const selectedCountBefore = doc.querySelectorAll('.cb-node.is-selected').length;
  // checkbox 的 React onChange 由 click 触发（jdom 里直接改 checked + change 不生效）
  if (lockBox) lockBox.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const layoutSummary = doc.querySelector('.cb-layout .cb-filter__summary')?.textContent || '';
  check('勾选锁定后摘要显示锁定数量', layoutSummary.includes('锁定 1'), layoutSummary);
  const applyBtn = [...doc.querySelectorAll('.cb-layout .cb-btn')].find((btn) => (btn.textContent || '').includes('应用布局'));
  check('有「应用布局」按钮', !!applyBtn);
  if (applyBtn) applyBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  const layoutStatus = doc.querySelector('.cb-layout__status')?.textContent || '';
  check('应用后提示整理了 5 个实体', layoutStatus.includes('已整理 5 个实体'), layoutStatus);
  check('锁定后画布仍保留 6 个实体', doc.querySelectorAll('.cb-node').length === 6, doc.querySelectorAll('.cb-node').length);
  check('被锁定的实体保持选中状态', doc.querySelectorAll('.cb-node.is-selected').length === selectedCountBefore, selectedCountBefore);

  console.log('[UI] M5-5 时间线与演示视图');
  const viewTabs = [...doc.querySelectorAll('.cb-viewtab')];
  check('顶栏有四个视图切换按钮', viewTabs.length === 4 && viewTabs.some((tab) => tab.textContent === '地图'), viewTabs.map((tab) => tab.textContent));
  const timelineTab = viewTabs.find((tab) => (tab.textContent || '') === '时间线');
  check('视图按钮含「时间线」', !!timelineTab);
  if (timelineTab) timelineTab.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('时间线视图已渲染', doc.querySelector('.cb-timeline') !== null);
  check('时间线有游标滑杆', doc.querySelector('.cb-timeline__scrub') !== null);
  check('按实体类型分泳道', doc.querySelectorAll('.cb-timeline__lane').length >= 1, doc.querySelectorAll('.cb-timeline__lane').length);
  check('时间片渲染在轨道上', doc.querySelectorAll('.cb-timeline__track .cb-timeline__chip').length >= 1, doc.querySelectorAll('.cb-timeline__track .cb-timeline__chip').length);
  check('未排期实体 5 个（演示数据只有事件带时间）', (doc.querySelector('.cb-timeline__footer')?.textContent || '').includes('未排期实体 5 个'), doc.querySelector('.cb-timeline__footer')?.textContent);
  check(
    '每条泳道各有一条轨道',
    doc.querySelectorAll('.cb-timeline__track').length === doc.querySelectorAll('.cb-timeline__lane').length,
    [doc.querySelectorAll('.cb-timeline__track').length, doc.querySelectorAll('.cb-timeline__lane').length],
  );
  const bandRule = (cssText.match(/\.cb-timeline__band\s*\{[^}]*\}/) || [''])[0];
  check('区间条带样式已打包（绝对定位 + 不挡点击）', /position:\s*absolute/.test(bandRule) && /pointer-events:\s*none/.test(bandRule), bandRule.slice(0, 160));
  const presentTab = [...doc.querySelectorAll('.cb-viewtab')].find((tab) => (tab.textContent || '') === '演示');
  check('视图按钮含「演示」', !!presentTab);
  if (presentTab) presentTab.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('演示视图已渲染', doc.querySelector('.cb-present') !== null);
  check('演示有标题与进度', (doc.querySelector('.cb-present__title')?.textContent || '').length > 0 && (doc.querySelector('.cb-present__progress')?.textContent || '').includes('第 1 / 6'), doc.querySelector('.cb-present__progress')?.textContent);
  const nextBtn = [...doc.querySelectorAll('.cb-present__bar .cb-btn')].find((btn) => (btn.textContent || '').includes('下一个'));
  if (nextBtn) nextBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('点「下一个」切到第 2 个实体', (doc.querySelector('.cb-present__progress')?.textContent || '').includes('第 2 / 6'), doc.querySelector('.cb-present__progress')?.textContent);
  check('演示屏展示关联关系', doc.querySelectorAll('.cb-present__related-item').length >= 1, doc.querySelectorAll('.cb-present__related-item').length);
  const prevBtn = [...doc.querySelectorAll('.cb-present__bar .cb-btn')].find((btn) => (btn.textContent || '').includes('上一个'));
  if (prevBtn) prevBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  check('点「上一个」回到第 1 个实体', (doc.querySelector('.cb-present__progress')?.textContent || '').includes('第 1 / 6'), doc.querySelector('.cb-present__progress')?.textContent);
  const toBoard = [...doc.querySelectorAll('.cb-present__bar .cb-btn')].find((btn) => (btn.textContent || '').includes('在画布中查看'));
  check('演示有「在画布中查看」按钮', !!toBoard);
  if (toBoard) toBoard.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  check('回到画布并选中该实体', doc.querySelector('.cb-work__canvas') !== null && doc.querySelectorAll('.cb-node.is-selected').length === 1, doc.querySelectorAll('.cb-node.is-selected').length);

  console.log('[UI] M6 AI 助手面板');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const setInputValue = async (el, value) => {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(120);
    return true;
  };
  check('顶栏有 AI 助手按钮', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').includes('AI 助手')));
  check('可打开 AI 助手面板', await clickByText('.cb-topbar__io .cb-btn', 'AI 助手'));
  check('AI 面板已渲染', doc.querySelector('.cb-ai') !== null);
  check('五个功能页签', doc.querySelectorAll('.cb-ai__tab').length === 5, doc.querySelectorAll('.cb-ai__tab').length);
  check('抽取页声明未采纳不改动画布', (doc.querySelector('.cb-ai__tip')?.textContent || '').includes('未采纳前不会改动画布'));
  check('可载入示例笔录', await clickByText('.cb-ai .cb-btn', '载入示例笔录'));
  check('示例笔录已填入文本框', (doc.querySelector('.cb-ai__input')?.value || '').includes('李梅'), (doc.querySelector('.cb-ai__input')?.value || '').slice(0, 40));
  const aiNodesBefore = doc.querySelectorAll('.cb-node').length;
  check('可抽取建图', await clickByText('.cb-ai .cb-btn', '抽取建图'));
  await sleep(400);
  check('生成待确认清单（≥6 条）', doc.querySelectorAll('.cb-ai__draft').length >= 6, doc.querySelectorAll('.cb-ai__draft').length);
  check(
    '草稿默认全部「待确认」',
    doc.querySelectorAll('.cb-ai__draft.is-pending').length === doc.querySelectorAll('.cb-ai__draft').length,
    [doc.querySelectorAll('.cb-ai__draft.is-pending').length, doc.querySelectorAll('.cb-ai__draft').length],
  );
  check('采纳前画布实体数量不变', doc.querySelectorAll('.cb-node').length === aiNodesBefore, [aiNodesBefore, doc.querySelectorAll('.cb-node').length]);
  check('待核实清单包含手机号', (doc.querySelector('.cb-ai__unresolved')?.textContent || '').includes('手机号'), doc.querySelector('.cb-ai__unresolved')?.textContent);
  check('可计算采纳率', await clickByText('.cb-ai .cb-btn', '计算采纳率'));
  await sleep(200);
  const aiScoreText = doc.querySelector('.cb-ai__score')?.textContent || '';
  const aiScoreRate = Number((aiScoreText.match(/采纳率 (\d+)%/) || [])[1] || 0);
  check('采纳率 ≥70%（门禁）', aiScoreRate >= 70 && aiScoreText.includes('无遗漏'), aiScoreText);
  const firstAcceptBtn = [...doc.querySelectorAll('.cb-ai__draft.is-pending .cb-btn')].find((b) => (b.textContent || '').trim() === '采纳');
  check('单条草稿有「采纳」按钮', !!firstAcceptBtn);
  if (firstAcceptBtn) firstAcceptBtn.click();
  await sleep(250);
  check('单条采纳后状态变为已采纳', doc.querySelectorAll('.cb-ai__draft.is-accepted').length === 1, doc.querySelectorAll('.cb-ai__draft.is-accepted').length);
  check('可全部采纳（一次撤销）', await clickByText('.cb-ai .cb-btn', '全部采纳'));
  await sleep(350);
  check('全部采纳后没有待确认项', doc.querySelectorAll('.cb-ai__draft.is-pending').length === 0, doc.querySelectorAll('.cb-ai__draft.is-pending').length);
  check('采纳后画布新增实体', doc.querySelectorAll('.cb-node').length > aiNodesBefore, [aiNodesBefore, doc.querySelectorAll('.cb-node').length]);

  const aiConflictTab = [...doc.querySelectorAll('.cb-ai__tab')].find((tab) => (tab.textContent || '').trim() === '矛盾审查');
  check('有「矛盾审查」页签', !!aiConflictTab);
  if (aiConflictTab) aiConflictTab.click();
  await sleep(200);
  check('审查页含证据链模板选择', (doc.querySelector('.cb-ai__section')?.textContent || '').includes('证据链模板'));
  check('可运行本地审查', await clickByText('.cb-ai .cb-btn', '运行本地审查'));
  await sleep(300);
  check('冲突结论区已渲染', (doc.querySelector('.cb-ai__body')?.textContent || '').includes('冲突与疑问（'), doc.querySelector('.cb-ai__h3')?.textContent);
  check('证据链审查表五个阶段', doc.querySelectorAll('.cb-ai__chain tbody tr').length === 5, doc.querySelectorAll('.cb-ai__chain tbody tr').length);

  const aiEditTab = [...doc.querySelectorAll('.cb-ai__tab')].find((tab) => (tab.textContent || '').trim() === '自然语言编辑');
  check('有「自然语言编辑」页签', !!aiEditTab);
  if (aiEditTab) aiEditTab.click();
  await sleep(200);
  check('自然语言输入框已就绪', !!doc.querySelector('.cb-ai__input--short'));
  await setInputValue(doc.querySelector('.cb-ai__input--short'), '把李梅和张建国连起来，关系是同伙');
  check('可生成指令预览', await clickByText('.cb-ai .cb-btn', '生成预览'));
  await sleep(300);
  check('预览列出一条命令', doc.querySelectorAll('.cb-ai__preview li').length === 1, doc.querySelectorAll('.cb-ai__preview li').length);
  check('预览标注可执行', doc.querySelectorAll('.cb-ai__preview li.is-ready').length === 1);
  check('预览文案点名「同伙」', (doc.querySelector('.cb-ai__preview')?.textContent || '').includes('同伙'), doc.querySelector('.cb-ai__preview')?.textContent);
  const aiEdgesBefore = doc.querySelectorAll('.react-flow__edge').length;
  check('确认执行按钮存在', await clickByText('.cb-ai .cb-btn', '确认执行（一次撤销）'));
  await sleep(350);
  check('执行后新增一条关系', doc.querySelectorAll('.react-flow__edge').length === aiEdgesBefore + 1, [aiEdgesBefore, doc.querySelectorAll('.react-flow__edge').length]);

  const aiEditTab2 = [...doc.querySelectorAll('.cb-ai__tab')].find((tab) => (tab.textContent || '').trim() === '自然语言编辑');
  if (aiEditTab2) aiEditTab2.click();
  await sleep(200);
  const aiNodesBeforeDelete = doc.querySelectorAll('.cb-node').length;
  await setInputValue(doc.querySelector('.cb-ai__input--short'), '删除李梅');
  check('可预览删除指令', await clickByText('.cb-ai .cb-btn', '生成预览'));
  await sleep(300);
  check('删除指令标注需二次确认', (doc.querySelector('.cb-ai__body')?.textContent || '').includes('含删除操作，需二次确认'), doc.querySelector('.cb-ai__body')?.textContent?.includes('含删除操作'));
  check('删除确认勾选框出现', (doc.querySelector('.cb-ai__check')?.textContent || '').includes('我确认执行删除操作'));
  const aiDeleteConfirm = [...doc.querySelectorAll('.cb-ai .cb-btn')].find((b) => (b.textContent || '').includes('确认执行（一次撤销）'));
  check('未勾选时「确认执行」禁用', !!aiDeleteConfirm && aiDeleteConfirm.disabled === true);
  check('未勾选时画布不变', doc.querySelectorAll('.cb-node').length === aiNodesBeforeDelete, [aiNodesBeforeDelete, doc.querySelectorAll('.cb-node').length]);

  const aiReportTab = [...doc.querySelectorAll('.cb-ai__tab')].find((tab) => (tab.textContent || '').trim() === '报告');
  check('有「报告」页签', !!aiReportTab);
  if (aiReportTab) aiReportTab.click();
  await sleep(200);
  check('报告页说明引用要求', (doc.querySelector('.cb-ai__section')?.textContent || '').includes('[节点:id]'));
  check('可生成报告', await clickByText('.cb-ai .cb-btn', '生成报告'));
  await sleep(400);
  const aiReportText = doc.querySelector('.cb-ai__report')?.textContent || '';
  check('报告已渲染七节', (aiReportText.match(/^## /gm) || []).length === 7, (aiReportText.match(/^## /gm) || []).length);
  check('报告事实句带引用标记', aiReportText.includes('[节点:') || aiReportText.includes('[证据:'));
  check('报告含证据清单与待核实', aiReportText.includes('证据清单') && aiReportText.includes('待核实'));
  check('可导出 Word 与 PDF', ['导出 Word', '导出 PDF'].every((label) => [...doc.querySelectorAll('.cb-ai .cb-btn')].some((b) => (b.textContent || '').includes(label))));

  const aiSettingsTab = [...doc.querySelectorAll('.cb-ai__tab')].find((tab) => (tab.textContent || '').trim() === '设置');
  check('有「设置」页签', !!aiSettingsTab);
  if (aiSettingsTab) aiSettingsTab.click();
  await sleep(200);
  check('三个模型通道选项', doc.querySelectorAll('.cb-ai__provider-option').length === 3, doc.querySelectorAll('.cb-ai__provider-option').length);
  check('默认通道显示完全离线', (doc.querySelector('.cb-ai__privacy')?.textContent || '').includes('完全离线'), doc.querySelector('.cb-ai__privacy')?.textContent);
  const aiProviderRadios = doc.querySelectorAll('.cb-ai__provider-option input');
  if (aiProviderRadios.length === 3) aiProviderRadios[2].click();
  await sleep(200);
  check('远程通道提示数据会离开本机', (doc.querySelector('.cb-ai__privacy')?.textContent || '').includes('远程模型') && (doc.querySelector('.cb-ai__privacy')?.textContent || '').includes('发送到'), doc.querySelector('.cb-ai__privacy')?.textContent);
  check('远程需显式勾选允许', (doc.querySelector('.cb-ai__check')?.textContent || '').includes('允许远程模型'));
  const closeAi = doc.querySelector('.cb-ai .cb-modal__icon');
  if (closeAi) closeAi.click();
  await sleep(250);
  check('关闭后 AI 面板移除', doc.querySelector('.cb-ai') === null);
  check('采纳的实体留在画布上', doc.querySelectorAll('.cb-node').length > aiNodesBefore, [aiNodesBefore, doc.querySelectorAll('.cb-node').length]);


  console.log('[UI] M7 区域锚点 / 假设比较 / AI 生图 / OCR');
  check('图片节点渲染区域锚点', doc.querySelectorAll('.cb-free-image__anchor').length >= 1, doc.querySelectorAll('.cb-free-image__anchor').length);
  const anchorEl = doc.querySelector('.cb-free-image__anchor');
  check('锚点提示绑定到实体', (anchorEl?.getAttribute('title') || '').includes('张建国'), anchorEl?.getAttribute('title'));
  check('顶栏有「假设」按钮', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').trim() === '假设'));
  check('可打开假设面板', await clickByText('.cb-topbar__io .cb-btn', '假设'));
  check('假设面板已渲染', doc.querySelector('.cb-hyp') !== null);
  check('列出演示数据的两条假设', doc.querySelectorAll('.cb-hyp__item').length === 2, doc.querySelectorAll('.cb-hyp__item').length);
  check('两条假设都有支持度分数', doc.querySelectorAll('.cb-hyp__score').length === 2, doc.querySelectorAll('.cb-hyp__score').length);
  check('并排比较表已渲染', doc.querySelectorAll('.cb-hyp__table tbody tr').length >= 3, doc.querySelectorAll('.cb-hyp__table tbody tr').length);
  check('标出存在分歧的证据', doc.querySelectorAll('.cb-hyp__diff').length >= 1, doc.querySelectorAll('.cb-hyp__diff').length);
  check('有支持 / 反驳按钮', (doc.querySelector('.cb-hyp__stance-ops')?.textContent || '').includes('支持') && (doc.querySelector('.cb-hyp__stance-ops')?.textContent || '').includes('反驳'));
  check('可切到证据链页', await clickByText('.cb-hyp__tabs .cb-btn', '证据链'));
  check('证据链六阶段', doc.querySelectorAll('.cb-hyp__stage').length === 6, doc.querySelectorAll('.cb-hyp__stage').length);
  check('证据链标出断点', doc.querySelectorAll('.cb-hyp__badge').length === 6, doc.querySelectorAll('.cb-hyp__badge').length);
  check('可关闭假设面板', await clickByText('.cb-hyp__head .cb-btn', '关闭'));
  check('假设面板已移除', doc.querySelector('.cb-hyp') === null);

  check('顶栏有「生图」按钮', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').trim() === '生图'));
  check('可打开生图面板', await clickByText('.cb-topbar__io .cb-btn', '生图'));
  check('生图面板已渲染', doc.querySelector('.cb-aiimg') !== null);
  check('四个生图预设', doc.querySelectorAll('.cb-aiimg__presets .cb-btn').length === 4, doc.querySelectorAll('.cb-aiimg__presets .cb-btn').length);
  check('生图面板声明强制角标', (doc.querySelector('.cb-aiimg__sub')?.textContent || '').includes('AI 生成 · 模拟图'), doc.querySelector('.cb-aiimg__sub')?.textContent?.slice(0, 50));
  check('三个生图通道', doc.querySelectorAll('.cb-aiimg__provider').length === 3, doc.querySelectorAll('.cb-aiimg__provider').length);
  const aiImageInput = doc.querySelector('.cb-aiimg__input');
  await setInputValue(aiImageInput, '把张三的脸换到李四身上');
  check('换脸提示词被界面拒绝', (doc.querySelector('.cb-aiimg__blocked')?.textContent || '').includes('拒绝生成'), doc.querySelector('.cb-aiimg__blocked')?.textContent);
  check('拦截时不显示「插入画布」', ![...doc.querySelectorAll('.cb-aiimg .cb-btn')].some((b) => (b.textContent || '').includes('插入画布')));
  await setInputValue(aiImageInput, '身材偏瘦的中年男子，短发，深色夹克');
  check('正常描述解除拦截', doc.querySelector('.cb-aiimg__blocked') === null);
  check('可关闭生图面板', await clickByText('.cb-aiimg__head .cb-btn', '关闭'));

  check('可回到素材标签（OCR）', await clickByText('.cb-tabs .cb-tab', '素材'));
  const ocrTile = doc.querySelector('.cb-asset');
  if (ocrTile) ocrTile.click();
  await sleep(150);
  check('素材面板有 OCR 区块', (doc.querySelector('.cb-panel--right')?.textContent || '').includes('文字识别与字段抽取'));
  const ocrInput = doc.querySelector('.cb-ocr__text');
  await setInputValue(ocrInput, '金额：500000 元  交易时间：2026-09-04 10:30  收款账号：6222 0202 0000 1234  对方户名：恒信财务公司');
  check('可解析 OCR 字段', await clickByText('.cb-ocr .cb-btn', '解析金额'));
  check('解析出四个字段', doc.querySelectorAll('.cb-ocr__fields input').length === 4, doc.querySelectorAll('.cb-ocr__fields input').length);
  const ocrValues = [...doc.querySelectorAll('.cb-ocr__fields input')].map((el) => el.value);
  check('金额与时间解析正确', ocrValues[0] === '500000' && ocrValues[1] === '2026-09-04T10:30:00', ocrValues);
  check('账号解析为 16 位以上数字', ocrValues[2] === '6222020200001234', ocrValues[2]);
  check('账号脱敏显示', (doc.querySelector('.cb-ocr__fields')?.textContent || '').includes('6222 **** **** 1234'));
  const ocrNodesBefore = doc.querySelectorAll('.cb-node').length;
  check('可生成证据卡', await clickByText('.cb-ocr .cb-btn', '生成证据卡'));
  await sleep(250);
  check('证据卡已落到画布', doc.querySelectorAll('.cb-node').length === ocrNodesBefore + 1, [ocrNodesBefore, doc.querySelectorAll('.cb-node').length]);

  console.log('[UI] M7 离线地图视图');
  check('可切到地图视图', await clickByText('.cb-viewtab', '地图'));
  check('地图视图已渲染', doc.querySelector('.cb-map') !== null);
  check('带坐标的实体已上图（M9 起演示数据补齐到 5 个）', doc.querySelectorAll('.cb-map__pin').length === 5, doc.querySelectorAll('.cb-map__pin').length);
  check('图例声明离线无瓦片', (doc.querySelector('.cb-map__legend')?.textContent || '').includes('未加载瓦片'), doc.querySelector('.cb-map__legend')?.textContent);
  check('坐标标签可读', (doc.querySelector('.cb-map__coord')?.textContent || '').includes('31.'), doc.querySelector('.cb-map__coord')?.textContent);
  check('可切回画布视图', await clickByText('.cb-viewtab', '画布'));
  check('切回后地图移除', doc.querySelector('.cb-map') === null);

  console.log('[UI] M8 全局搜索 / 打印 / AI 审计');
  check('顶栏有「搜索 Ctrl+K」入口', [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].some((b) => (b.textContent || '').includes('搜索 Ctrl+K')));
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await sleep(200);
  check('Ctrl+K 打开命令面板', doc.querySelector('.cb-palette') !== null);
  check('命令面板输入框已聚焦', doc.activeElement === doc.querySelector('.cb-palette__input'));
  const paletteInput = doc.querySelector('.cb-palette__input');
  await setInputValue(paletteInput, '张建国');
  const paletteHits = [...doc.querySelectorAll('.cb-palette__hit')];
  check('搜索命中实体', paletteHits.length >= 1 && (paletteHits[0].textContent || '').includes('张建国'), paletteHits.slice(0, 2).map((el) => el.textContent));
  check('命中项标出实体类型', (doc.querySelector('.cb-palette__kind')?.textContent || '').includes('实体'), doc.querySelector('.cb-palette__kind')?.textContent);
  if (paletteInput) paletteInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(300);
  check('Enter 打开后命令面板关闭', doc.querySelector('.cb-palette') === null);
  const selectedNode = doc.querySelector('.cb-node.is-selected');
  check('定位到命中实体（画布选中张建国）', !!selectedNode && (selectedNode.textContent || '').includes('张建国'), selectedNode ? selectedNode.textContent?.slice(0, 40) : 'none');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await sleep(200);
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(200);
  check('Esc 关闭命令面板', doc.querySelector('.cb-palette') === null);

  check('可打开导出面板', await clickByText('.cb-topbar__io .cb-btn', '导出'));
  check('导出面板有打印区块', (doc.querySelector('.cb-export__print')?.textContent || '').includes('打印（A4 横向）'), doc.querySelector('.cb-export__print')?.textContent?.slice(0, 40));
  check('打印按钮存在', [...doc.querySelectorAll('.cb-export__print .cb-btn')].some((b) => (b.textContent || '').includes('打印当前画布')));
  check('可关闭导出面板', await clickByText('.cb-export .cb-btn--primary', '完成'));

  check('可打开安全面板', await clickByText('.cb-topbar__io .cb-btn', '安全'));
  check('安全面板已渲染', doc.querySelector('.cb-security') !== null);
  const auditBlock = doc.querySelector('.cb-security__audit');
  check('安全面板有 AI 合规审计区块', (auditBlock?.textContent || '').includes('AI 生成图合规审计'), (auditBlock?.textContent || '').slice(0, 60));
  check('审计区块显示张数与合规数', /AI 生成图 \d+ 张/.test(auditBlock?.textContent || ''), (auditBlock?.textContent || '').slice(0, 80));
  check('可导出审计 Word / Markdown', [...doc.querySelectorAll('.cb-security__audit .cb-btn')].map((b) => (b.textContent || '').trim()).join('/').includes('导出审计 Word'));
  check('可关闭安全面板', await clickByText('.cb-security__head .cb-btn', '关闭'));
  check('安全面板已移除', doc.querySelector('.cb-security') === null);

  check('样式表包含打印媒体查询', /@media\s+print/.test(cssText));
  check('打印时隐藏顶栏与侧栏', /\.cb-topbar/.test(cssText) && /\.cb-print-head/.test(cssText));
  check('打印避免节点跨页截断', /break-inside:\s*avoid/.test(cssText));
  console.log('[UI] M8 界面主题（深浅色 / 高对比）');
  const themeButton = () => [...doc.querySelectorAll('.cb-topbar__io .cb-btn')].find((b) => (b.textContent || '').includes('主题'));
  check('顶栏有主题按钮且显示当前档位', !!themeButton() && (themeButton().textContent || '').includes('默认'), themeButton() ? themeButton().textContent : 'none');
  const htmlEl = doc.documentElement;
  check('初始主题为默认（data-theme=board）', htmlEl.getAttribute('data-theme') === 'board', htmlEl.getAttribute('data-theme'));
  themeButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  check('点击切到深色并写入本地记忆', htmlEl.getAttribute('data-theme') === 'dark' && window.localStorage.getItem('caseboard-theme') === 'dark', htmlEl.getAttribute('data-theme') + ' / ' + window.localStorage.getItem('caseboard-theme'));
  check('按钮文案同步为深色', (themeButton().textContent || '').includes('深色'), themeButton().textContent);
  const gridStyle = (doc.querySelector('.react-flow__background')?.getAttribute('style') || '').toUpperCase();
  check('深色下画布网格换色', gridStyle.includes('3E3934'), gridStyle.slice(0, 160) || 'no background style');
  themeButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  check('再点切到高对比', htmlEl.getAttribute('data-theme') === 'contrast' && (themeButton().textContent || '').includes('高对比'), htmlEl.getAttribute('data-theme'));
  themeButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  check('第三下回到默认', htmlEl.getAttribute('data-theme') === 'board' && window.localStorage.getItem('caseboard-theme') === 'board', htmlEl.getAttribute('data-theme'));
  const srcCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
  check('样式表含深色与高对比变量块', /:root\[data-theme='dark'\]/.test(srcCss) && /--cb-surface:\s*#232120/.test(srcCss) && /:root\[data-theme='contrast'\]/.test(srcCss));
  check('样式表组件层不再写死白底', !/background:\s*#fff\b/i.test(srcCss), ((srcCss.match(/background:\s*#fff\b/gi) || []).length) + ' 处残留');
  console.log('[UI] M9 地图点选 / 新建节点对话框 / tag 连线 / 素材库分组 / 演示联动编辑');
  const m9MapTab = [...doc.querySelectorAll('.cb-viewtab')].find((tab) => (tab.textContent || '') === '地图');
  if (m9MapTab) m9MapTab.click();
  await sleep(350);
  check('地图视图已渲染', doc.querySelector('.cb-map') !== null);
  check('带坐标的实体摆上示意地图', doc.querySelectorAll('.cb-map__pin').length >= 5, doc.querySelectorAll('.cb-map__pin').length);
  check('地图左侧列出没有坐标的实体', doc.querySelectorAll('.cb-map__noitem').length >= 1, doc.querySelectorAll('.cb-map__noitem').length);
  check('每个缺坐标实体都有「点选设坐标」入口', [...doc.querySelectorAll('.cb-map__noitem .cb-link-btn')].some((b) => (b.textContent || '').includes('点选设坐标')), doc.querySelectorAll('.cb-map__noitem .cb-link-btn').length);
  const m9BoardTab = [...doc.querySelectorAll('.cb-viewtab')].find((tab) => (tab.textContent || '') === '画布');
  if (m9BoardTab) m9BoardTab.click();
  await sleep(350);

  const m9Pane = doc.querySelector('.react-flow__pane');
  // React Flow 的空格双击在 jsdom 里给不到完整指针序列，画布容器上还有一路 dblclick 兜底
  if (m9Pane) m9Pane.dispatchEvent(new window.MouseEvent('dblclick', { detail: 2, bubbles: true, cancelable: true }));
  await sleep(300);
  check('双击画布空白弹出「新建节点」对话框', doc.querySelector('.cb-newnode') !== null);
  check('对话框挂在遮罩层里（居中而不是塞进顶栏）', doc.querySelector('.cb-modal__mask .cb-newnode') !== null);
  check('对话框有类型下拉（8 类）与标题输入', doc.querySelectorAll('.cb-newnode select option').length === 8 && doc.querySelector('.cb-newnode input') !== null, doc.querySelectorAll('.cb-newnode select option').length);
  const m9TitleInput = doc.querySelector('.cb-newnode input');
  if (m9TitleInput) await setInputValue(m9TitleInput, 'M9 新建实体');
  check('点「创建」提交新建', await clickByText('.cb-newnode .cb-modal__actions .cb-btn', '创建'));
  await sleep(350);
  check('新建后对话框关闭', doc.querySelector('.cb-newnode') === null);
  check('新建的实体已落到画布并选中', [...doc.querySelectorAll('.cb-node')].some((el) => (el.textContent || '').includes('M9 新建实体')) && doc.querySelectorAll('.cb-node.is-selected').length === 1, doc.querySelectorAll('.cb-node').length);

  check('右栏标签用统一 tag 编辑器', doc.querySelector('.cb-tagedit') !== null);
  check('右栏有「按 tag 自动连线…」入口', [...doc.querySelectorAll('.cb-panel--right .cb-btn')].some((b) => (b.textContent || '').includes('按 tag 自动连线')));
  check('可打开按 tag 自动连线确认面板', await clickByText('.cb-panel--right .cb-btn', '按 tag 自动连线'));
  await sleep(250);
  check('连线确认面板挂在遮罩层里', doc.querySelector('.cb-modal__mask .cb-taglink') !== null);
  check('确认面板列出候选配对', doc.querySelectorAll('.cb-taglink__item').length >= 1, doc.querySelectorAll('.cb-taglink__item').length);
  check('确认面板写明点线语义', (doc.querySelector('.cb-taglink .cb-modal__hint')?.textContent || '').includes('点线'), doc.querySelector('.cb-taglink .cb-modal__hint')?.textContent?.slice(0, 40));
  check('可取消 tag 连线面板', await clickByText('.cb-taglink .cb-btn', '取消'));
  await sleep(250);
  check('tag 连线面板已移除', doc.querySelector('.cb-taglink') === null);

  check('可切到素材标签（分组）', await clickByText('.cb-tabs .cb-tab', '素材'));
  check('素材库有四种分组方式（M10 加「按文件夹」）', doc.querySelectorAll('.cb-assets__groupby .cb-tab').length === 4, doc.querySelectorAll('.cb-assets__groupby .cb-tab').length);
  check('素材库按组渲染', doc.querySelectorAll('.cb-assets__group').length >= 1, doc.querySelectorAll('.cb-assets__group').length);
  check('素材组头显示组名与张数', /张/.test(doc.querySelector('.cb-assets__grouphead')?.textContent || ''), doc.querySelector('.cb-assets__grouphead')?.textContent);
  check('素材库有新建文件夹入口（M10）', doc.querySelector('.cb-assets__folderops input') !== null && [...doc.querySelectorAll('.cb-assets__folderops .cb-link-btn')].some((b) => (b.textContent || '').includes('新建')));

  const m9ImageEl = doc.querySelector('.cb-free-image');
  if (m9ImageEl) m9ImageEl.click();
  await sleep(200);
  check('图片工具条挂在图片右侧', doc.querySelector('.cb-free-image__bar') !== null);
  check('工具条 5 个竖排图标按钮', doc.querySelectorAll('.cb-free-image__bar button').length === 5 && doc.querySelectorAll('.cb-free-image__bar-icon').length === 5, doc.querySelectorAll('.cb-free-image__bar button').length);
  check('锚点可点选对应实体（M9 / T3）', (() => {
    const rule = (cssText.match(/\.cb-free-image__anchor\s*\{[^}]*\}/) || [''])[0];
    return /pointer-events:\s*auto/.test(rule) && doc.querySelectorAll('.cb-free-image__anchor').length >= 1;
  })(), (cssText.match(/\.cb-free-image__anchor\s*\{[^}]*\}/) || [''])[0].slice(0, 160));

  const m9PresentTab = [...doc.querySelectorAll('.cb-viewtab')].find((tab) => (tab.textContent || '') === '演示');
  if (m9PresentTab) m9PresentTab.click();
  await sleep(350);
  check('演示页有联动编辑控件', doc.querySelector('.cb-present__edit') !== null);
  check('联动编辑含标题/状态/备注', doc.querySelectorAll('.cb-present__edit input').length >= 1 && doc.querySelectorAll('.cb-present__edit select').length >= 1 && doc.querySelectorAll('.cb-present__edit textarea').length >= 1, [doc.querySelectorAll('.cb-present__edit input').length, doc.querySelectorAll('.cb-present__edit select').length, doc.querySelectorAll('.cb-present__edit textarea').length]);
  if (m9BoardTab) m9BoardTab.click();
  await sleep(300);

  check('关系线连接点放大到 18px（M10）', (() => {
    const rule = (cssText.match(/\.cb-handle\s*\{[^}]*\}/) || [''])[0];
    return /width:\s*18px/.test(rule) && /height:\s*18px/.test(rule);
  })(), (cssText.match(/\.cb-handle\s*\{[^}]*\}/) || [''])[0].slice(0, 160));
  check('样式表含 M9 新增区块', ['.cb-taglink', '.cb-tagedit', '.cb-geo', '.cb-map__pickbar', '.cb-assets__groupby'].every((sel) => srcCss.includes(sel)), ['.cb-taglink', '.cb-tagedit', '.cb-geo', '.cb-map__pickbar', '.cb-assets__groupby'].filter((sel) => !srcCss.includes(sel)));
  check('样式表不再出现启动密码锁屏样式', !/\.cb-lock\b/.test(srcCss) && !/\.cb-lock__/.test(srcCss));

  console.log('');
  if (failures > 0) {
    console.log('结果：' + failures + ' 项失败');
    process.exit(1);
  }
  console.log('结果：全部通过');
})();
