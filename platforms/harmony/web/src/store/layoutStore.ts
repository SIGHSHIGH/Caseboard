import { create } from 'zustand';
import type { LayoutKind } from '../lib/layout';

interface LayoutStore {
  kind: LayoutKind;
  /** 锁定当前选中的实体，让它们留在原位 */
  lockSelected: boolean;
  /** 最近一次应用布局的结果文案（左栏提示用） */
  status: string;
  setKind: (kind: LayoutKind) => void;
  setLockSelected: (lock: boolean) => void;
  setStatus: (status: string) => void;
}

/** 自动布局的面板状态：不进 Document Model，也不需要撤销（M5-4） */
export const useLayoutStore = create<LayoutStore>((set) => ({
  kind: 'force',
  lockSelected: false,
  status: '',
  setKind: (kind) => set({ kind }),
  setLockSelected: (lockSelected) => set({ lockSelected }),
  setStatus: (status) => set({ status }),
}));
