import { fileService } from '../../services/file';
import { imageService } from '../../services/image';
import { importAssets, setCanvasImage } from '../../commands';
import { useDocStore } from '../../store/docStore';

/**
 * 画布背景图：挑一张本地图片 → 存进素材库 → 设为画布底图（M14）。
 * 顶栏「背景」菜单与右栏「案件概览」共用这一处逻辑。
 */
export function useCanvasImagePicker(): () => Promise<void> {
  const dispatch = useDocStore((s) => s.dispatch);
  return async () => {
    try {
      const picked = await fileService.pickFiles('image/*', false);
      if (!picked || picked.length === 0) return;
      const result = await imageService.prepare(picked.slice(0, 1));
      if (result.prepared.length === 0) {
        // ArkWeb 不支持阻塞式 window.alert（静默丢弃），改用 console.error 才能被 hilog 抓到
        console.error('[backdrop] 准备失败：' + (result.failed[0]?.error ?? '图片无法读取'));
        return;
      }
      const saved = await imageService.save(result.prepared, {
        source: 'import',
        zone: 'evidence',
        sourceLabel: '画布背景',
      });
      if (saved.length === 0) return;
      dispatch(importAssets({ assets: saved }));
      dispatch(setCanvasImage(saved[0].id));
    } catch (error) {
      console.error('[backdrop] 导入失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };
}
