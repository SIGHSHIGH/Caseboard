/**
 * 启动密码保险库的前端通道（M8 验收 2）。
 *
 * 加密与解密全部在 Rust 侧完成（AES-256-GCM + Argon2id），前端只负责：
 * 记住「是否已解锁」、把密码交给 Rust、解锁成功后再水合数据库。
 * 网页端没有保险库，一律返回未启用，保证 dev 行为不变。
 */
import { invoke } from '@tauri-apps/api/core';

export interface VaultStatus {
  enabled: boolean;
  unlocked: boolean;
  path: string;
}

const OFF: VaultStatus = { enabled: false, unlocked: false, path: '' };

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const vaultService = {
  async status(): Promise<VaultStatus> {
    if (!isDesktop()) return OFF;
    try {
      return await invoke<VaultStatus>('vault_status');
    } catch {
      return OFF;
    }
  },
  async enable(password: string): Promise<VaultStatus> {
    return invoke<VaultStatus>('vault_enable', { password });
  },
  async unlock(password: string): Promise<VaultStatus> {
    return invoke<VaultStatus>('vault_unlock', { password });
  },
  /** 立即锁定：用当前密码重新加密并删除明文库。 */
  async lock(password: string): Promise<VaultStatus> {
    return invoke<VaultStatus>('vault_lock_with_password', { password });
  },
  async disable(password: string): Promise<VaultStatus> {
    return invoke<VaultStatus>('vault_disable', { password });
  },
  async changePassword(oldPassword: string, newPassword: string): Promise<VaultStatus> {
    return invoke<VaultStatus>('vault_change_password', { oldPassword, newPassword });
  },
  /** 只读文件头（十六进制），用于验收时证明磁盘上是密文。 */
  async header(path: string): Promise<string> {
    if (!isDesktop()) return '';
    return invoke<string>('vault_header', { path });
  },
};
