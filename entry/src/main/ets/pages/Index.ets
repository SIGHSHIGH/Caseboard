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
        .width('100%')
        .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F5F5F4')
  }
}
