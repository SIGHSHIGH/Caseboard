import { useEffect } from 'react';
import { isApplyingCode, noteGraphChange } from '../../store/codeStore';
import { useDocStore } from '../../store/docStore';

/**
 * M3-4 桥接：图形 → 代码。200ms 防抖，避免拖拽时每帧重建文本；
 * 代码自己引发的 dispatch 会被 isApplyingCode() 过滤，不会回灌。
 */
export function useCodeSyncBridge(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useDocStore.subscribe((state, prev) => {
      if (state.doc === prev.doc) return;
      if (isApplyingCode()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        noteGraphChange();
      }, 200);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
