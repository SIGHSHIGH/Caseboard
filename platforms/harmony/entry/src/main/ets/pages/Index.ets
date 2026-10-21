/**
 * 案情板鸿蒙壳：一个全屏 Web 组件承载现有前端产物。
 *
 * 关键决定（H0，含实测修正）：
 *  - 页面不走 resource://rawfile/index.html：那是 opaque origin（origin 'null'），
 *    ArkWeb 会以 CORS 为由拒绝一切 `type="module"` 脚本 → 白屏（已实测报错原文见
 *    bridge/RawfileScheme.ets 顶部注释）。改用自定义 scheme `caseboard://rawfile/`，
 *    由 RawfileScheme 把请求映射回 $rawfile，得到真实 origin + secure context。
 *  - 用 .javaScriptProxy() 属性形式注册 bridge：构建期生效，页面随后加载，
 *    绕开 registerJavaScriptProxy「下次 (re)load 才生效」的顺序坑。
 *  - 打开 domStorage（默认 false，Zustand persist 需要）与 fileAccess（附件走 file://）。
 *  - src 不是 @State：官方明确 Web 首参不能靠状态变量动态改，要换页用 loadUrl()。
 */
import { webview } from '@kit.ArkWeb';
import { AppContext } from '../common/AppContext';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { CaseBoardBridge, BRIDGE_NAME, BRIDGE_METHODS } from '../bridge/CaseBoardBridge';
import { APP_ENTRY_URL, APP_SCHEME, APP_HOST, createAppSchemeHandler } from '../bridge/RawfileScheme';

const DOMAIN: number = 0xC0DE;
const TAG: string = 'CaseBoard';

/** 只允许本项目自定义 scheme 的页面调用 bridge 方法 */
const BRIDGE_PERMISSION: string =
  `{"javascriptProxyPermission":{"urlPermissionList":[{"scheme":"${APP_SCHEME}","host":"${APP_HOST}","port":"","path":""}]}}`;

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: CaseBoardBridge = new CaseBoardBridge();
  /** 同步方法表：定稿要求全部异步，这里保持空数组 */
  private syncMethods: string[] = [];
  @State pageError: string = '';

  aboutToAppear(): void {
    // AppContext 已在 EntryAbility.onCreate 设好（先于 loadContent），此处不再重复设置，
    // 以免用到已废弃的全局 getContext()。
    // 注意：setWebSchemeHandler 不能在这里调 —— 此时 WebviewController 还没有绑定 Web 组件，
    // 会抛 17100001 "The WebviewController must be associated with a Web component" 并直接杀进程。
    // 正确时机是 .onControllerAttached()。
    hilog.info(DOMAIN, TAG, '%{public}s', '[web] Index 页面就绪');
  }

  /**
   * 验收用的视口造形：模拟器改不了朝向，也无法拖成小窗，所以由 ArkUI 侧直接给 Web 组件
   * 一个受限尺寸，页面里的 `window.innerWidth/innerHeight` 就会真实变化，`@media` 照常生效。
   *   1/2  正常横屏（100%）
   *   3    窄档：1000vp 宽（右栏应转抽屉）
   *   4    小窗：700vp 宽（应被竖屏/小窗提示层接管）
   *   5    竖屏比例：900×1400vp（应被提示层接管）
   * 普通启动是 100%，与产品行为一致。
   */
  private webWidth(): string {
    const phase: string = AppContext.selftestPhase;
    if (phase === '3') {
      return '1000vp';
    }
    if (phase === '4') {
      return '700vp';
    }
    if (phase === '5') {
      return '900vp';
    }
    return '100%';
  }

  private webHeight(): string {
    return AppContext.selftestPhase === '5' ? '1400vp' : '100%';
  }

  /**
   * H0 验收探针：**仅当以 `--ps caseboardSelftest <phase>` 启动时**才通过页面调用 bridge，
   * 把 ping / getAppInfo / dbOpen / selftest 的结果打进 hilog，供验收脚本机器断言。
   * 普通启动完全不执行，因此不改变产品行为；H1 起由「设置 → 诊断」页取代。
   */
  private runBridgeProbe(): void {
    const phase: string = AppContext.selftestPhase;
    if (phase.length === 0) {
      return;
    }
    const script: string = [
      "try{",
      "  var B = window['" + BRIDGE_NAME + "'];",
      "  if(!B){console.log('PROBE nobridge');}else{",
      "    B.ping(function(r){console.log('[bridge] ping -> ' + r);});",
      "    B.getAppInfo(function(r){console.log('[bridge] appinfo -> ' + r);});",
      "    B.selftest('" + phase + "', function(r){console.log('[bridge] selftest -> ' + r);});",
      "    var de = document.documentElement;",
      "    console.log('[viewport] inner=' + window.innerWidth + 'x' + window.innerHeight",
      "      + ' dpr=' + (window.devicePixelRatio || 1)",
      "      + ' scrollWidth=' + de.scrollWidth + ' clientWidth=' + de.clientWidth);",
      "    var rootEl = document.querySelector('.cb-app');",
      "    var tier = rootEl ? String(rootEl.getAttribute('data-tier')) : 'none';",
      "    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);",
      "    console.log('[input] maxTouchPoints=' + (navigator.maxTouchPoints || 0)",
      "      + ' dataInput=' + String(document.documentElement.getAttribute('data-input') || 'none')",
      "      + ' coarse=' + coarse);",
      "    var btnList = document.querySelectorAll('button');",
      "    var small = 0, minW = 9999, minH = 9999, counted = 0, offenders = '', canvasMarks = 0;",
      "    for (var i = 0; i < btnList.length; i++) {",
      "      var rc = btnList[i].getBoundingClientRect();",
      "      if (rc.width === 0 && rc.height === 0) continue;",
      "      counted++;",
      "      if (rc.width < minW) minW = rc.width;",
      "      if (rc.height < minH) minH = rc.height;",
      "      if (rc.width < 36 || rc.height < 36) {",
      "        if (btnList[i].closest && btnList[i].closest('.react-flow__node')) { canvasMarks++; continue; }",
      "        small++;",
      "        if (offenders.length < 200) {",
      "          offenders += ' [' + Math.round(rc.width) + 'x' + Math.round(rc.height)",
      "            + ' ' + String(btnList[i].className) + ']';",
      "        }",
      "      }",
      "    }",
      "    console.log('[layout] tier=' + tier + ' scroll=' + de.scrollWidth + '/' + de.clientWidth",
      "      + ' buttons=' + counted + ' small=' + small + ' canvasMarks=' + canvasMarks",
      "      + ' min=' + Math.round(minW === 9999 ? 0 : minW) + 'x' + Math.round(minH === 9999 ? 0 : minH));",
      "    console.log('[layout] small:' + offenders);",
      // [gate] 不能在 onPageEnd 立刻读：分档要「连续两次同样本」才生效，
      // 首帧测量可能还是 1440 的过渡值，提示层要到 ~1s 后才稳定。所以延时两次再看。
      "    setTimeout(function() {",
      "      var root3 = document.querySelector('.cb-app');",
      "      console.log('[gate] present=' + !!document.querySelector('.cb-gate')",
      "        + ' w=' + window.innerWidth + ' h=' + window.innerHeight",
      "        + ' tier=' + (root3 ? String(root3.getAttribute('data-tier')) : '?'));",
      "    }, 1400);",
      "    setTimeout(function() {",
      "      console.log('[gate2] present=' + !!document.querySelector('.cb-gate')",
      "        + ' w=' + window.innerWidth + ' h=' + window.innerHeight);",
      "    }, 2600);",
      // 长按菜单观测：ArkWeb 把长按映射成 contextmenu，菜单由 .cb-ctxmenu 渲染。
      // 这里常驻一个 MutationObserver，菜单出现/消失各打一行；
      // 验收脚本用真实的 `uitest uiInput longClick` 触发，比合成事件更接近真机。
      "    (function() {",
      "      var lastCtx = false;",
      "      var readCtx = function() {",
      "        var m = document.querySelector('.cb-ctxmenu');",
      "        return m ? String(m.innerText || '').replace(/\\s+/g, '|').slice(0, 90) : '';",
      "      };",
      "      try {",
      "        new MutationObserver(function() {",
      "          var t = readCtx();",
      "          var has = t !== '';",
      "          if (has !== lastCtx) {",
      "            lastCtx = has;",
      "            console.log('[ctx] ' + (has ? 'open' : 'close') + ' text=' + t);",
      "          }",
      "        }).observe(document.body, { childList: true, subtree: true });",
      "        console.log('[ctx] observer ready');",
      "      } catch (e) {",
      "        console.log('[ctx] observer failed ' + String(e));",
      "      }",
      "    })();",
      // 节点屏幕矩形：验收脚本要「真去长按某个节点」，坐标不能写死
      // （视图平移会被持久化，两次启动的坐标未必一样）。物理像素 = CSS × dpr。
      "    setTimeout(function() {",
      "      var nodes = document.querySelectorAll('.react-flow__node');",
      "      var rects = [];",
      "      for (var n = 0; n < nodes.length && n < 4; n++) {",
      "        var nr = nodes[n].getBoundingClientRect();",
      "        rects.push((nodes[n].getAttribute('data-id') || '?') + '@' + Math.round(nr.left) + ','",
      "          + Math.round(nr.top) + ',' + Math.round(nr.width) + 'x' + Math.round(nr.height));",
      "      }",
      "      console.log('[rect] n=' + nodes.length + ' ' + rects.join(' '));",
      "    }, 1500);",
      // 顶栏收容是「一轮一轮」收敛的（每轮把一个最低优先级按钮收进「⋯」），
      // onPageEnd 立刻量到的还是第一轮，必须延时再量一次才代表稳态。
      "    setTimeout(function() {",
      "      var io2 = document.querySelector('.cb-topbar__io');",
      "      if (!io2) { return; }",
      "      var ib2 = io2.getBoundingClientRect();",
      "      var bad = [];",
      "      var ks = io2.children;",
      "      for (var j = 0; j < ks.length; j++) {",
      "        var jb = ks[j].getBoundingClientRect();",
      "        if (jb.width > 0 && jb.left < ib2.left - 1) {",
      "          bad.push((ks[j].getAttribute('data-topbar-action') || ks[j].className || 'x') + '@' + Math.round(jb.left));",
      "        }",
      "      }",
      "      var actions = io2.querySelectorAll('[data-topbar-action]').length;",
      "      console.log('[clip2] count=' + bad.length + ' inline=' + actions + ' ioLeft=' + Math.round(ib2.left)",
      "        + ' list=' + bad.join('|'));",
      "    }, 2000);",
      // 「⋯」菜单必须真的能打开、且里面装着被收走的按钮（收容不能变成"消失"）。
      // 这一段会真点按钮（会弹出「AI 生图」对话框），只给验收里做顶栏检查的两个 phase 跑；
      // 其它 phase（双指、惯性、长按）不能被这些点击干扰，否则长按会打在对话框遮罩上。
      "    if ('" + phase + "' === '1' || '" + phase + "' === '3') {",
      "    setTimeout(function() {",
      "      var mb = document.querySelector('.cb-topbar__morebtn');",
      "      if (mb) { mb.click(); }",
      "    }, 2400);",
      "    setTimeout(function() {",
      "      var panel = document.querySelector('.cb-topbar__morepanel');",
      "      var items = panel ? panel.querySelectorAll('[data-topbar-action]') : [];",
      "      var names = [];",
      "      for (var n = 0; n < items.length; n++) { names.push(items[n].getAttribute('data-topbar-action')); }",
      "      console.log('[more] open=' + !!panel + ' items=' + items.length + ' keys=' + names.join(','));",
      "      if (panel) { document.body.click(); }",
      "    }, 3000);",
      // 收进「⋯」的按钮点了必须真生效：拿「生图」当样本，点开看面板有没有出现。
      // 注意上一步的 body.click() 不一定关掉菜单（关闭监听的是 pointerdown），
      // 这里先判断菜单在不在，避免把「已经打开」又点成「关闭」。
      "    setTimeout(function() {",
      "      var mb2 = document.querySelector('.cb-topbar__morebtn');",
      "      if (mb2 && !document.querySelector('.cb-topbar__morepanel')) { mb2.click(); }",
      "    }, 3400);",
      "    setTimeout(function() {",
      "      var item = document.querySelector('.cb-topbar__morepanel [data-topbar-action=\\'aiimage\\']');",
      "      if (item) { item.click(); }",
      "      console.log('[moreclick] found=' + !!item);",
      "    }, 3800);",
      "    setTimeout(function() {",
      "      var opened = document.querySelector('.cb-aiimg') || document.querySelector('[class*=\\'aiimg\\']');",
      "      console.log('[moreclick2] panel=' + !!opened);",
      "    }, 4200);",
      "    }",
      "    var toolsEl = document.querySelector('.cb-topbar__tools');",
      "    var ioEl = document.querySelector('.cb-topbar__io');",
      "    console.log('[topbar] tools=' + (toolsEl ? toolsEl.scrollWidth + '/' + toolsEl.clientWidth : 'n/a')",
      "      + ' io=' + (ioEl ? ioEl.scrollWidth + '/' + ioEl.clientWidth : 'n/a'));",
      // 顶栏裁切检测：`.cb-topbar__io` 用 justify-content:flex-end，内容溢出时往左跑，
      // scrollWidth 看不出来，只有比较每个子元素与容器的左边界才查得到（H2 对抗审查用）。
      "    if (ioEl) {",
      "      var ib = ioEl.getBoundingClientRect();",
      "      var clipped = [];",
      "      var kids = ioEl.children;",
      "      for (var k = 0; k < kids.length; k++) {",
      "        var kb = kids[k].getBoundingClientRect();",
      "        if (kb.width > 0 && kb.left < ib.left - 1) {",
      "          clipped.push((kids[k].getAttribute('data-topbar-action') || kids[k].className || 'x') + '@' + Math.round(kb.left));",
      "        }",
      "      }",
      "      console.log('[clip] count=' + clipped.length + ' ioLeft=' + Math.round(ib.left) + ' list=' + clipped.join('|'));",
      "    }",
      // 侧栏开关已从 16px 竖向长条改成左右下角 44px 圆形按钮（H3）：
      // 断言它确实脱了流（fixed，不占宽度）且贴角命中够大，顺便记录画布宽度。
      "    var lb = document.querySelector('.cb-collapse--left');",
      "    var rb = document.querySelector('.cb-collapse--right');",
      "    var work = document.querySelector('.cb-work');",
      "    if (lb && rb) {",
      "      var lr = lb.getBoundingClientRect();",
      "      var rr = rb.getBoundingClientRect();",
      "      console.log('[toggle] left=' + Math.round(lr.left) + ',' + Math.round(lr.bottom)",
      "        + ' size=' + Math.round(lr.width) + 'x' + Math.round(lr.height)",
      "        + ' right=' + Math.round(rr.right) + ',' + Math.round(rr.bottom)",
      "        + ' fixed=' + (getComputedStyle(lb).position === 'fixed')",
      "        + ' inner=' + window.innerWidth",
      "        + ' canvas=' + (work ? Math.round(work.getBoundingClientRect().width) : 0));",
      "    }",
      "    var railBtn = document.querySelector('.cb-panel--right') ? document.querySelector('.cb-collapse--right') : null;",
      "    var hasRight = !!document.querySelector('.cb-panel--right');",
      "    if (tier !== 'wide' && railBtn) { railBtn.click(); }",
      "    setTimeout(function() {",
      "      console.log('[drawer] tier=' + tier + ' rightPanelBefore=' + hasRight",
      "        + ' rightPanelAfter=' + !!document.querySelector('.cb-panel--right')",
      "        + ' scrim=' + !!document.querySelector('.cb-scrim'));",
      "    }, 600);",
      // phase=2/3：验证窄档抽屉。phase=3 时 Web 组件本身被压到 1000vp（见 build()），
      // 那是真实的视口变化；这里只负责点开右栏抽屉并读回结果。
      "    if ('" + phase + "' === '2' || '" + phase + "' === '3') {",
      "      setTimeout(function() {",
      "        var r = document.querySelector('.cb-collapse--right');",
      "        if (r) r.click();",
      "        setTimeout(function() {",
      "          var rp = document.querySelector('.cb-panel--right');",
      "          var box = rp ? rp.getBoundingClientRect() : null;",
      "          var root2 = document.querySelector('.cb-app');",
      "          console.log('[narrow] inner=' + window.innerWidth",
      "            + ' tier=' + (root2 ? String(root2.getAttribute('data-tier')) : '?')",
      "            + ' scrim=' + !!document.querySelector('.cb-scrim')",
      "            + ' rightPanel=' + !!rp",
      "            + ' rightW=' + (box ? Math.round(box.width) : 0)",
      "            + ' rightEdge=' + (box ? Math.round(box.right) : 0));",
      "        }, 700);",
      "      }, 700);",
      "    }",
      // phase=5：双指缩放。uitest uiInput 没有 pinch，只能用合成 TouchEvent 驱动 d3-zoom。
      // 断言点：视口 transform 在 pinch 前后是否变化；顺带报告 pane/Touch 支持情况。
      "    if ('" + phase + "' === '5') {",
      "      var pane = document.querySelector('.react-flow__pane');",
      "      var vpw = document.querySelector('.react-flow__viewport');",
      "      var tf = function() { return vpw ? getComputedStyle(vpw).transform : 'n/a'; };",
      "      var z0 = tf();",
      "      var mk = function(t, id, x, y) { return new Touch({ identifier: id, target: t, clientX: x, clientY: y, pageX: x, pageY: y }); };",
      "      if (pane && typeof Touch === 'function') {",
      // 双指落点必须按 pane 自己的矩形算：窗口可能是 1440，也可能被系统还原成 900（窄档右栏是浮层，
      // 落在浮层上的那一指不会被 d3-zoom 计入，硬编码 700/480 在窄窗口下会假失败）。
      "        var pr = pane.getBoundingClientRect();",
      "        var cx = pr.left + pr.width * 0.32;",
      "        var cy = pr.top + pr.height * 0.45;",
      "        var d0 = 60;",
      "        var d1 = Math.min(180, pr.width * 0.16);",
      "        var a1 = mk(pane, 1, cx - d0, cy), a2 = mk(pane, 2, cx + d0, cy);",
      "        pane.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [a1, a2], targetTouches: [a1, a2], changedTouches: [a1, a2] }));",
      "        setTimeout(function() {",
      "          var b1 = mk(pane, 1, cx - d1, cy), b2 = mk(pane, 2, cx + d1, cy);",
      "          pane.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [b1, b2], targetTouches: [b1, b2], changedTouches: [b1, b2] }));",
      "          setTimeout(function() {",
      "            var z1 = tf();",
      "            console.log('[pinch] before=' + z0 + ' after=' + z1 + ' changed=' + (z0 !== z1));",
      "            pane.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [b1, b2] }));",
      "          }, 150);",
      "        }, 100);",
      "      } else {",
      "        console.log('[pinch] skip pane=' + !!pane + ' Touch=' + (typeof Touch));",
      "      }",
      "    }",
      // phase=6：拖拽惯性。合成一次单指快划，再在松手后两个时刻读视口 transform：
      // 若惯性生效，松手 500ms 后的位置应当比松手瞬间继续移动了一段。
      "    if ('" + phase + "' === '6') {",
      "      var pane2 = document.querySelector('.react-flow__pane');",
      "      var vpw2 = document.querySelector('.react-flow__viewport');",
      "      var tf2 = function() { return vpw2 ? getComputedStyle(vpw2).transform : 'n/a'; };",
      "      var mk2 = function(t, id, x, y) { return new Touch({ identifier: id, target: t, clientX: x, clientY: y, pageX: x, pageY: y }); };",
      "      if (pane2 && typeof Touch === 'function') {",
      "        var sx = 620, sy = 420;",
      "        var start = mk2(pane2, 1, sx, sy);",
      "        pane2.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [start], targetTouches: [start], changedTouches: [start] }));",
      "        var stepIdx = 0;",
      "        var tick = setInterval(function() {",
      "          stepIdx++;",
      "          var mv = mk2(pane2, 1, sx + stepIdx * 40, sy + stepIdx * 6);",
      "          pane2.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [mv], targetTouches: [mv], changedTouches: [mv] }));",
      "          if (stepIdx >= 5) {",
      "            clearInterval(tick);",
      "            var last = mk2(pane2, 1, sx + 300, sy + 30);",
      "            pane2.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [last] }));",
      "            var atEnd = tf2();",
      "            setTimeout(function() {",
      "              var mid = tf2();",
      "              setTimeout(function() {",
      "                var done = tf2();",
      "                console.log('[inertia] end=' + atEnd + ' at500=' + mid + ' at1200=' + done",
      "                  + ' coasted=' + (mid !== atEnd) + ' stopped=' + (done === mid));",
      "              }, 700);",
      "            }, 500);",
      "          }",
      "        }, 16);",
      "      } else {",
      "        console.log('[inertia] skip pane=' + !!pane2 + ' Touch=' + (typeof Touch));",
      "      }",
      "    }",
      // phase=9：OCR 真机链路。样图放在 rawfile/test-fixtures（只有 CASEBOARD_TEST_FIXTURES=1 的
      // 构建才会带），走真实桥：readRawfileBase64 → ocrAvailable → ocrRecognize。
      // 断言点：能读出 base64、syscap 可用、识别结果里出现样图上的字（洛和 / LEVEL-BLUE / 2077）。
      "    if ('" + phase + "' === '9') {",
      "      var B9 = window.__CASEBOARD_NATIVE__;",
      "      var short9 = function(s) { return String(s === undefined ? '' : s).replace(/\\s+/g, ' ').slice(0, 400); };",
      "      if (!B9) { console.log('[ocr] no bridge'); } else {",
      "        B9.ocrAvailable(function(r) { console.log('[ocr] available=' + short9(r)); });",
      "        B9.readRawfileBase64('test-fixtures/ocr-id-sample.jpg', function(r) {",
      "          var env = {};",
      "          try { env = JSON.parse(r); } catch (e) { env = { ok: false, error: 'parse fail' }; }",
      "          if (!env.ok) { console.log('[ocr] read-fail ' + short9(r)); return; }",
      "          var b64 = String(env.value || '');",
      "          console.log('[ocr] bytes-base64=' + b64.length);",
      "          var t0 = Date.now();",
      "          B9.ocrRecognize(b64, 'zh-CN', function(r2) {",
      "            var ms = Date.now() - t0;",
      "            var env2 = {};",
      "            try { env2 = JSON.parse(r2); } catch (e) { env2 = { ok: false, error: 'parse fail' }; }",
      "            var text = env2.ok ? String((env2.value || {}).text || '') : '';",
      "            var hit = function(k) { return text.indexOf(k) >= 0; };",
      "            console.log('[ocr] ok=' + !!env2.ok + ' ms=' + ms + ' chars=' + text.length",
      "              + ' hit_luohe=' + hit('洛和') + ' hit_level=' + hit('LEVEL') + ' hit_year=' + hit('2077')",
      "              + ' err=' + short9(env2.error || ''));",
      "            console.log('[ocr] text=' + short9(text));",
      "          });",
      "        });",
      "      }",
      "    }",
      // phase=10：导出链路。三条产线都只跑「生成字节」这一半，落盘交给桥的 writeAppFile
      // （绕开系统保存对话框，验收才能全自动）。文件写到沙箱 assets/ 下，随后由脚本 pull 出来看大小。
      "    if ('" + phase + "' === '10') {",
      "      var expBtn = document.querySelector('[data-topbar-action=\\'export\\']');",
      "      if (!expBtn) { console.log('[export] no export button'); } else {",
      "        expBtn.click();",
      "        setTimeout(function() {",
      "          var items = document.querySelectorAll('.cb-export__item .cb-btn');",
      "          var names = [];",
      "          for (var i = 0; i < items.length; i++) { names.push(String(items[i].textContent || '').trim()); }",
      "          console.log('[export] dialog=' + (document.querySelector('.cb-export') ? 'open' : 'closed') + ' items=' + names.join('|'));",
      // 点第一个（整板 PNG）：走真渲染 → 真字节 → saveFile → 系统保存对话框。
      // 对话框由脚本随后按返回键取消，日志里已经能拿到字节数，说明导出链跑到了平台缝。
      "          if (items[0]) { items[0].click(); }",
      "        }, 700);",
      "        setTimeout(function() {",
      "          console.log('[export] still=' + !!document.querySelector('.cb-export'));",
      "        }, 6000);",
      "      }",
      "    }",
      // 分别落在节点和画布空白处，看桌面版 M17 的菜单是否接住、条目是否正确。
      // phase=11：手指命中体检（只报数，不改状态）。画布内部件（连线端点、分组折叠、图例、
      // 缩放条）比工具栏更容易做小，逐类报最小宽高，超过阈值的单独列出来。
      "    if ('" + phase + "' === '11') {",
      "      var groups11 = [",
      "        ['.react-flow__handle', '连线端点'],",
      "        ['.react-flow__edge-interaction', '连线命中带'],",
      "        ['.react-flow__controls-button', '缩放按钮'],",
      "        ['.cb-group__fold', '分组折叠'],",
      "        ['.cb-group__count', '分组计数'],",
      "        ['.cb-node__resize', '节点改大小'],",
      "        ['.cb-legend-fab', '图例按钮'],",
      "        ['.cb-timeline__item', '时间线条目'],",
      "        ['.cb-swatch', '颜色块'],",
      "        ['.cb-topbar__morebtn', '顶栏更多']",
      "      ];",
      "      var report11 = [];",
      "      for (var g = 0; g < groups11.length; g++) {",
      "        var sel = groups11[g][0];",
      "        var els = document.querySelectorAll(sel);",
      "        if (!els.length) { report11.push(groups11[g][1] + ':0'); continue; }",
      "        var minw = 9999, minh = 9999;",
      "        for (var k = 0; k < els.length; k++) {",
      "          var rr = els[k].getBoundingClientRect();",
      "          if (rr.width <= 0 || rr.height <= 0) { continue; }",
      "          if (rr.width < minw) { minw = rr.width; }",
      "          if (rr.height < minh) { minh = rr.height; }",
      "        }",
      "        report11.push(groups11[g][1] + '=' + els.length + 'x' + Math.round(minw) + 'x' + Math.round(minh));",
      "      }",
      "      console.log('[hit] ' + report11.join(' '));",
      // 真命中测试：命中区靠伪元素撑大，getBoundingClientRect 量不到，
      // 只能用 elementFromPoint 在连接点外侧 12px 处探一下，看落点是不是连接点。
      "      var hEls = document.querySelectorAll('.react-flow__handle');",
      "      var hHit = 'none';",
      "      if (hEls.length) {",
      "        for (var h = 0; h < hEls.length; h++) {",
      "          var hr = hEls[h].getBoundingClientRect();",
      "          if (hr.width <= 0 || hr.height <= 0) { continue; }",
      "          var hcx = hr.left + hr.width / 2, hcy = hr.top + hr.height / 2;",
      "          var probe = document.elementFromPoint(hcx + 12, hcy);",
      "          hHit = probe && probe.closest ? ((probe.closest('.react-flow__handle') ? 'yes' : 'no') + '@+' + 12) : 'n/a';",
      "          break;",
      "        }",
      "      }",
      "      console.log('[hitband] handle12=' + hHit);",
      // 判断命中区为什么没生效：连接点可能 pointer-events:none，或被卡片盖住/裁掉。
      "      if (hEls.length) {",
      "        var pe = window.getComputedStyle(hEls[0]).pointerEvents;",
      "        var cls = (hEls[0].className || '').replace(/react-flow__handle/, '').trim().slice(0, 40);",
      "        var r0 = hEls[0].getBoundingClientRect();",
      "        var cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;",
      "        var dirs = [['out', -12], ['in', 12]];",
      "        var res = [];",
      "        for (var d = 0; d < dirs.length; d++) {",
      "          var pt = document.elementFromPoint(cx0 + dirs[d][1], cy0);",
      "          res.push(dirs[d][0] + '=' + (pt ? ((pt.closest && pt.closest('.react-flow__handle')) ? 'handle' : (pt.className || pt.tagName).toString().slice(0, 26)) : 'null'));",
      "        }",
      "        console.log('[hitband] pe=' + pe + ' cls=' + cls + ' ' + res.join(' '));",
      "      }",
      "      var eHit = document.querySelector('.cb-edge-hit');",
      "      var eWide = eHit ? (window.getComputedStyle(eHit).strokeWidth || '?') : 'none';",
      "      var eTouch = document.documentElement.dataset.input || 'none';",
      "      console.log('[hitband] edge=' + eWide + ' input=' + eTouch);",
      "    }",
      // 分别落在节点和画布空白处，看桌面版 M17 的菜单是否接住。（真机用 phase=8 + uitest longClick）
      "    if ('" + phase + "' === '7') {",
      "      var mkMenu = function() { var m = document.querySelector('.cb-ctxmenu'); return m ? (m.innerText || '').replace(/\\s+/g, '|').slice(0, 90) : ''; };",
      "      var fireCtx = function(el, dx, dy) {",
      "        var r = el.getBoundingClientRect();",
      "        var x = r.left + (dx === undefined ? 20 : dx);",
      "        var y = r.top + (dy === undefined ? 20 : dy);",
      "        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));",
      "      };",
      "      var nodeEl = document.querySelector('.react-flow__node');",
      "      var paneEl = document.querySelector('.react-flow__pane');",
      "      if (nodeEl) {",
      "        fireCtx(nodeEl);",
      "        setTimeout(function() {",
      "          var nodeMenu = mkMenu();",
      "          var hasNodeLink = nodeMenu.indexOf('并连到此实体') >= 0;",
      "          console.log('[ctx] node=' + (nodeEl.getAttribute('data-id') || '?') + ' open=' + (nodeMenu !== '') + ' link=' + hasNodeLink + ' text=' + nodeMenu);",
      "          document.body.click();",
      "          setTimeout(function() {",
      "            if (paneEl) {",
      "              var pr = paneEl.getBoundingClientRect();",
      "              fireCtx(paneEl, pr.width - 40, pr.height - 40);",
      "            }",
      "            setTimeout(function() {",
      "              var paneMenu = mkMenu();",
      "              console.log('[ctx] pane open=' + (paneMenu !== '') + ' newnode=' + (paneMenu.indexOf('新建节点') >= 0) + ' text=' + paneMenu);",
      "            }, 300);",
      "          }, 300);",
      "        }, 300);",
      "      } else {",
      "        console.log('[ctx] no node');",
      "      }",
      "    }",
      "  }",
      "}catch(e){console.log('PROBE outer=' + String(e));}"
    ].join('\n');
    this.controller.runJavaScript(script).catch((err: Error) => {
      hilog.error(DOMAIN, TAG, '[probe] runJavaScript 失败: %{public}s', err.message);
    });
  }

  build() {
    Column() {
      if (this.pageError.length > 0) {
        Text(`页面加载失败：${this.pageError}`)
          .fontSize(16)
          .fontColor('#C0392B')
          .padding(16)
      }
      Web({ src: APP_ENTRY_URL, controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .onlineImageAccess(false)
        .javaScriptProxy({
          object: this.bridge,
          name: BRIDGE_NAME,
          methodList: this.syncMethods,
          controller: this.controller,
          asyncMethodList: BRIDGE_METHODS,
          permission: BRIDGE_PERMISSION
        })
        .onControllerAttached(() => {
          // controller 此刻才真正关联 Web 组件，setWebSchemeHandler 只在这里合法。
          this.controller.setWebSchemeHandler(APP_SCHEME, createAppSchemeHandler());
          hilog.info(DOMAIN, TAG, '%{public}s', '[web] controller 已附着，scheme handler 装好');
        })
        .onConsole((event) => {
          hilog.info(DOMAIN, TAG, '[web-console] %{public}s', event.message.getMessage());
          return false;
        })
        .onErrorReceive((event) => {
          const info = event.error;
          hilog.error(DOMAIN, TAG, '[web-error] %{public}s %{public}s',
            info.getErrorInfo(), info.getErrorCode().toString());
          this.pageError = `${info.getErrorCode()} ${info.getErrorInfo()}`;
        })
        .onPageEnd((event) => {
          hilog.info(DOMAIN, TAG, '[web] onPageEnd %{public}s', event.url);
          this.pageError = '';
          this.runBridgeProbe();
        })
        .width(this.webWidth())
        .height(this.webHeight())
        .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F5F5F4')
  }
}
