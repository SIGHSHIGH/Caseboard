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
  check('标题含「案情板」', text.includes('案情板'));
  check('左栏 8 个节点类型按钮', doc.querySelectorAll('.cb-type-btn').length === 8, doc.querySelectorAll('.cb-type-btn').length);
  check('每个类型按钮带字段数提示', doc.querySelectorAll('.cb-type-btn__hint').length === 8, doc.querySelectorAll('.cb-type-btn__hint').length);
  check('节点卡片展示模板字段摘要', doc.querySelectorAll('.cb-node__field').length >= 2, doc.querySelectorAll('.cb-node__field').length);
  check('画布渲染 6 个节点', doc.querySelectorAll('.cb-node').length === 6, doc.querySelectorAll('.cb-node').length);
  check('关系线已渲染', doc.querySelectorAll('.react-flow__edge').length === 6, doc.querySelectorAll('.react-flow__edge').length);
  check('线型图例 3 项', doc.querySelectorAll('.cb-legend__item').length === 3, doc.querySelectorAll('.cb-legend__item').length);
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
  check('左栏三个标签', doc.querySelectorAll('.cb-tabs .cb-tab').length === 3, doc.querySelectorAll('.cb-tabs .cb-tab').length);

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

  console.log('');
  if (failures > 0) {
    console.log('结果：' + failures + ' 项失败');
    process.exit(1);
  }
  console.log('结果：全部通过');
})();
