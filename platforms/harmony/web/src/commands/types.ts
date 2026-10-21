import type { Draft } from 'immer';
import type { CaseDoc } from '../types';

/**
 * Command 是唯一写入口（Gate 0-3）：图形端、代码端、AI 端的所有修改
 * 都必须转成 Command，由 store 统一执行、入栈、持久化、广播。
 */
export interface Command {
  /** 中文操作名，用于撤销栈展示与调试 */
  label: string;
  apply(draft: Draft<CaseDoc>): void;
}
