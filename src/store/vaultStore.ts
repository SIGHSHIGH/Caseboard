import { create } from 'zustand';
import { vaultService } from '../services/vault';
import { bootstrapDoc } from './docStore';

export type VaultPhase = 'unknown' | 'locked' | 'open';

interface VaultState {
  phase: VaultPhase;
  enabled: boolean;
  busy: boolean;
  error: string;
  notice: string;
  /** 启动时调用：读状态；未解锁返回 false，调用方不得水合数据库。 */
  boot(): Promise<boolean>;
  unlock(password: string): Promise<boolean>;
  enable(password: string): Promise<boolean>;
  disable(password: string): Promise<boolean>;
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
  lockNow(password: string): Promise<boolean>;
  clearMessages(): void;
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useVaultStore = create<VaultState>((set, get) => ({
  phase: 'unknown',
  enabled: false,
  busy: false,
  error: '',
  notice: '',

  async boot() {
    const status = await vaultService.status();
    const locked = status.enabled && !status.unlocked;
    set({ enabled: status.enabled, phase: locked ? 'locked' : 'open' });
    return !locked;
  },

  async unlock(password) {
    set({ busy: true, error: '' });
    try {
      const status = await vaultService.unlock(password);
      set({ busy: false, enabled: status.enabled, phase: 'open', notice: '已解锁' });
      try {
        await bootstrapDoc();
      } catch (error) {
        console.error('[caseboard] 解锁后水合失败', error);
      }
      return true;
    } catch (error) {
      set({ busy: false, error: messageOf(error) });
      return false;
    }
  },

  async enable(password) {
    set({ busy: true, error: '', notice: '' });
    try {
      const status = await vaultService.enable(password);
      set({ busy: false, enabled: status.enabled, phase: status.unlocked ? 'open' : 'locked', notice: '启动密码已启用' });
      return true;
    } catch (error) {
      set({ busy: false, error: messageOf(error) });
      return false;
    }
  },

  async disable(password) {
    set({ busy: true, error: '', notice: '' });
    try {
      const status = await vaultService.disable(password);
      set({ busy: false, enabled: status.enabled, phase: 'open', notice: '启动密码已关闭' });
      return true;
    } catch (error) {
      set({ busy: false, error: messageOf(error) });
      return false;
    }
  },

  async changePassword(oldPassword, newPassword) {
    set({ busy: true, error: '', notice: '' });
    try {
      const status = await vaultService.changePassword(oldPassword, newPassword);
      set({ busy: false, enabled: status.enabled, notice: '密码已更换，请牢记' });
      return true;
    } catch (error) {
      set({ busy: false, error: messageOf(error) });
      return false;
    }
  },

  async lockNow(password) {
    set({ busy: true, error: '', notice: '' });
    try {
      const status = await vaultService.lock(password);
      set({ busy: false, enabled: status.enabled, phase: status.unlocked ? 'open' : 'locked', notice: '已锁定' });
      return true;
    } catch (error) {
      set({ busy: false, error: messageOf(error) });
      return false;
    }
  },

  clearMessages() {
    if (get().error || get().notice) set({ error: '', notice: '' });
  },
}));
