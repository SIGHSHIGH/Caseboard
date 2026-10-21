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
      "    var toolsEl = document.querySelector('.cb-topbar__tools');",
      "    var ioEl = document.querySelector('.cb-topbar__io');",
      "    console.log('[topbar] tools=' + (toolsEl ? toolsEl.scrollWidth + '/' + toolsEl.clientWidth : 'n/a')",
      "      + ' io=' + (ioEl ? ioEl.scrollWidth + '/' + ioEl.clientWidth : 'n/a'));",
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
