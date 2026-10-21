/**
 * 图片能力：对应桌面 src/services/image.ts 的缩略图与尺寸探测。
 * 桌面侧用 Web Worker(imageWorker.ts) 做缩放，鸿蒙侧交给 @ohos.multimedia.image 原生解码，
 * 顺带省掉那两个 worker 是否能在 resource:// 下启动的依赖。
 */
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { ImageInfoJson } from '../common/Types';
import { PlatformService } from './PlatformService';

export class ImageService {
  static async decodeImageInfo(base64: string): Promise<string> {
    const info: ImageInfoJson = {
      width: 0,
      height: 0,
      mime: '',
      bytes: 0
    };
    if (base64.trim().length === 0) {
      return JSON.stringify(info);
    }
    const bytes: Uint8Array = new util.Base64Helper().decodeSync(base64);
    const source = image.createImageSource(bytes.buffer as ArrayBuffer);
    try {
      const raw = await source.getImageInfo();
      info.width = raw.size.width;
      info.height = raw.size.height;
      info.mime = raw.mimeType ?? '';
      info.bytes = bytes.length;
    } catch (err) {
      PlatformService.log('warn', `[image] 解码失败: ${JSON.stringify(err)}`);
    } finally {
      try {
        source.release();
      } catch (err) {
        // 忽略释放失败
      }
    }
    return JSON.stringify(info);
  }

  /**
   * 等比缩放到最长边 maxDim，输出 JPEG base64。
   * 返回空串表示不需要或无法缩放。
   */
  static async shrinkImage(base64: string, maxDim: number): Promise<string> {
    if (base64.trim().length === 0 || maxDim <= 0) {
      return '';
    }
    const bytes: Uint8Array = new util.Base64Helper().decodeSync(base64);
    const source = image.createImageSource(bytes.buffer as ArrayBuffer);
    let pixelMap: image.PixelMap | undefined = undefined;
    try {
      const raw = await source.getImageInfo();
      const w = raw.size.width;
      const h = raw.size.height;
      if (w <= maxDim && h <= maxDim) {
        return '';
      }
      const scale = maxDim / (w > h ? w : h);
      const targetW = Math.max(1, Math.round(w * scale));
      const targetH = Math.max(1, Math.round(h * scale));
      pixelMap = await source.createPixelMap({
        editable: false,
        desiredSize: { width: targetW, height: targetH },
        desiredPixelFormat: image.PixelMapFormat.RGBA_8888
      });
      const packer = image.createImagePacker();
      const packed: ArrayBuffer = await packer.packToData(pixelMap, {
        format: 'image/jpeg',
        quality: 85
      });
      packer.release();
      return new util.Base64Helper().encodeToStringSync(new Uint8Array(packed));
    } catch (err) {
      PlatformService.log('warn', `[image] 缩放失败: ${JSON.stringify(err)}`);
      return '';
    } finally {
      if (pixelMap !== undefined) {
        try {
          await pixelMap.release();
        } catch (err) {
          // 忽略
        }
      }
      try {
        source.release();
      } catch (err) {
        // 忽略
      }
    }
  }
}
