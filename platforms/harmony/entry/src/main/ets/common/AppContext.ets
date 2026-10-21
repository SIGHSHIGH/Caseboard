/**
 * 全局 AbilityContext 持有者。
 * 仅由 EntryAbility.onCreate 写入一次；bridge 侧只读。
 */
import { common } from '@kit.AbilityKit';

export class AppContext {
  private static abilityContext: common.UIAbilityContext | undefined = undefined;

  /**
   * 启动自检阶段号。由 `aa start ... --ps caseboardSelftest 1` 注入 Want 参数，
   * 空串表示普通启动（不跑自检）。仅用于 H0/H1 的可复现验收，不改变正常行为。
   */
  static selftestPhase: string = '';

  static setContext(ctx: common.UIAbilityContext): void {
    AppContext.abilityContext = ctx;
  }

  static getContext(): common.UIAbilityContext {
    const ctx = AppContext.abilityContext;
    if (ctx === undefined) {
      throw new Error('AppContext 未初始化：EntryAbility.onCreate 必须先执行');
    }
    return ctx;
  }
}
