/**
 * 案情板 EntryAbility。
 * 唯一职责：把 UIAbilityContext 交给 AppContext（bridge 的所有文件/db/resource 操作都依赖它），
 * 然后把主页面交给 ArkUI。
 */
import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { AppContext } from '../common/AppContext';
import { registerAppScheme } from '../bridge/RawfileScheme';

const DOMAIN: number = 0xC0DE;
const TAG: string = 'CaseBoard';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    AppContext.setContext(this.context);
    // 启动参数：aa start ... --ps caseboardSelftest 1 时进入自检模式（可复现验收用）
    const params: Record<string, Object> | undefined = want.parameters;
    if (params !== undefined) {
      const phase = params['caseboardSelftest'];
      if (phase !== undefined) {
        AppContext.selftestPhase = String(phase);
      }
    }
    hilog.info(DOMAIN, TAG, '[ability] onCreate，context 已注入 selftestPhase=%{public}s',
      AppContext.selftestPhase);
    // 必须在任何 Web 组件创建之前注册自定义 scheme，否则 customizeSchemes 不生效。
    registerAppScheme();
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', '[ability] onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, '[ability] loadContent 失败: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, '%{public}s', '[ability] loadContent 成功');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', '[ability] onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', '[ability] onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', '[ability] onBackground');
  }
}
