/* M1 UI 冒烟：用 jsdom 挂载打包产物，确认画布真的渲染出节点与连线。 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error('缺少 dist/assets，请先执行构建');
  process.exit(1);
}
const bundle = fs.readdirSync(assetsDir).find((name) => name.startsWith('index-') && name.endsWith('.js'));
if (!bundle) {
  console.error('未找到打包后的 JS');
  process.exit(1);
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:4173/',
  pretendToBeVisual: true,
});
const { window } = dom;

// jsdom 不做布局，React Flow 需要拿到节点尺寸才会计算连线路径。
// 这里用元素内联 style 的宽高伪造一次 resize 回调，让节点被标记为「已测量」。
class ResizeObserverStub {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
  }
  observe(target) {
    this.targets.add(target);
    const size = (value) => {
      const parsed = Number.parseFloat(String(value || ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const isNode = target.classList && target.classList.contains('react-flow__node');
    const width = size(target.style && target.style.width) || (isNode ? NODE_W : 0);
    const height = size(target.style && target.style.height) || (isNode ? NODE_H : 0);
    const rect = { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 };
    setTimeout(() => {
      if (!this.targets.has(target)) return;
      try {
        this.callback([{ target, contentRect: rect, borderBoxSize: [{ inlineSize: width, blockSize: height }], contentBoxSize: [{ inlineSize: width, blockSize: height }] }], this);
      } catch (error) {
        if (!ResizeObserverStub.reported) {
          ResizeObserverStub.reported = true;
          console.log('  WARN ResizeObserver 回调抛错：' + (error && error.message));
        }
      }
    }, 0);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
}

// 把 jsdom 的浏览器全局整体铺到 globalThis（Node 里缺 MutationObserver/DOMParser 等）
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  try {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  } catch {
    /* 只读属性忽略 */
  }
}

// jsdom 未实现 DOMMatrix / DOMMatrixReadOnly，React Flow 用它解析节点 transform。
// 这里提供 2D 仿射矩阵的最小实现，保证零布局环境下至少能算出结构正确的连线。
class DOMMatrixReadOnlyPolyfill {
  constructor(init) {
    let a = 1;
    let b = 0;
    let c = 0;
    let d = 1;
    let e = 0;
    let f = 0;
    if (Array.isArray(init) && init.length >= 6) {
      [a, b, c, d, e, f] = init;
    } else if (init && typeof init === 'object') {
      a = Number.isFinite(init.a) ? init.a : 1;
      b = Number.isFinite(init.b) ? init.b : 0;
      c = Number.isFinite(init.c) ? init.c : 0;
      d = Number.isFinite(init.d) ? init.d : 1;
      e = Number.isFinite(init.e) ? init.e : 0;
      f = Number.isFinite(init.f) ? init.f : 0;
    }
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    this.m11 = a;
    this.m12 = b;
    this.m21 = c;
    this.m22 = d;
    this.m41 = e;
    this.m42 = f;
    this.is2D = true;
    this.isIdentity = a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
  }
  translate(tx = 0, ty = 0) {
    return new DOMMatrixReadOnlyPolyfill([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]);
  }
  scale(sx = 1, sy = sx) {
    return new DOMMatrixReadOnlyPolyfill([this.a * sx, this.b * sy, this.c * sx, this.d * sy, this.e, this.f]);
  }
  multiply() {
    return new DOMMatrixReadOnlyPolyfill([this.a, this.b, this.c, this.d, this.e, this.f]);
  }
  inverse() {
    return new DOMMatrixReadOnlyPolyfill();
  }
  transformPoint(point) {
    const x = point && Number.isFinite(point.x) ? point.x : 0;
    const y = point && Number.isFinite(point.y) ? point.y : 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
}

const NODE_W = 208;
const NODE_H = 108;
const HANDLE_SIZE = 9;

function translateOf(el) {
  const transform = (el.style && el.style.transform) || '';
  const match = /translate(?:3d)?\(\s*(-?[\d.]+)px[,\s]+(-?[\d.]+)px/.exec(transform);
  return match ? { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) } : { x: 0, y: 0 };
}

function absoluteOf(el) {
  let x = 0;
  let y = 0;
  let current = el;
  while (current && current.style) {
    const offset = translateOf(current);
    x += offset.x;
    y += offset.y;
    current = current.parentElement;
  }
  return { x, y };
}

// 测试用伪布局：节点 208×108，连接点按所在边贴到节点外框上。
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const classList = this.classList || { contains: () => false };
  if (classList.contains('react-flow__handle')) {
    const nodeEl = this.closest('.react-flow__node');
    if (nodeEl) {
      const base = absoluteOf(nodeEl);
      const nodeStyle = nodeEl.style || {};
      const nodeW = Number.parseFloat(nodeStyle.width) || NODE_W;
      const nodeH = NODE_H;
      let offsetX = nodeW / 2;
      let offsetY = nodeH / 2;
      if (classList.contains('react-flow__handle-right')) offsetX = nodeW;
      else if (classList.contains('react-flow__handle-left')) offsetX = 0;
      else if (classList.contains('react-flow__handle-top')) offsetY = 0;
      else if (classList.contains('react-flow__handle-bottom')) offsetY = nodeH;
      const x = base.x + offsetX - HANDLE_SIZE / 2;
      const y = base.y + offsetY - HANDLE_SIZE / 2;
      return {
        x,
        y,
        left: x,
        top: y,
        right: x + HANDLE_SIZE,
        bottom: y + HANDLE_SIZE,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        toJSON() {
          return this;
        },
      };
    }
  }
  const isNode = classList.contains('react-flow__node');
  const style = this.style || {};
  const width = Number.parseFloat(style.width) || (isNode ? NODE_W : 0);
  const height = Number.parseFloat(style.height) || (isNode ? NODE_H : 0);
  const origin = isNode ? absoluteOf(this) : { x: 0, y: 0 };
  return {
    x: origin.x,
    y: origin.y,
    left: origin.x,
    top: origin.y,
    right: origin.x + width,
    bottom: origin.y + height,
    width,
    height,
    toJSON() {
      return this;
    },
  };
};

// React Flow 量尺寸用的是 offsetWidth/offsetHeight（jsdom 恒为 0），补齐伪布局值。
const offsetGetter = (axis) => function offsetGet() {
  const isHandle = this.classList && this.classList.contains('react-flow__handle');
  const isNode = this.classList && this.classList.contains('react-flow__node');
  const raw = axis === 'w' ? this.style && this.style.width : this.style && this.style.height;
  const parsed = Number.parseFloat(String(raw || ''));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (isHandle) return HANDLE_SIZE;
  if (isNode) return axis === 'w' ? NODE_W : NODE_H;
  return 0;
};
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get: offsetGetter('w') });
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get: offsetGetter('h') });

const overrides = {
  DOMMatrix: DOMMatrixReadOnlyPolyfill,
  DOMMatrixReadOnly: DOMMatrixReadOnlyPolyfill,
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  ResizeObserver: ResizeObserverStub,
  IntersectionObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
};
for (const [key, value] of Object.entries(overrides)) {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch {
    /* 忽略 */
  }
  // 打包产物里既可能用全局，也可能用 window.xxx，两边都铺上
  try {
    Object.defineProperty(window, key, { value, configurable: true, writable: true });
  } catch {
    /* 忽略 */
  }
}

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
    await import(pathToFileURL(path.join(assetsDir, bundle)).href);
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

  console.log('');
  if (failures > 0) {
    console.log('结果：' + failures + ' 项失败');
    process.exit(1);
  }
  console.log('结果：全部通过');
})();
