import type { Command } from './types';

/**
 * 把多条命令合并成一条历史记录（M6）：
 * AI 采纳、自然语言编辑都要「整批一次撤销」，不能给用户留半截状态。
 */
export function composeCommands(label: string, commands: Command[]): Command {
  return {
    label,
    apply(draft) {
      for (const command of commands) command.apply(draft);
    },
  };
}
