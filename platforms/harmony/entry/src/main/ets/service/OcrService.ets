/**
 * OCR：走 HMS Core Vision Kit（@hms.ai.ocr.textRecognition），不打包 Tesseract。
 * 桌面版 web 模式在 src/services/ocr.ts:77 直接抛「浏览器模式没有 OCR 引擎」，鸿蒙侧必须同步给出
 * 明确的不可用原因，不能让用户静默撞墙。
 */
import { textRecognition } from '@kit.CoreVisionKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { OcrResultJson } from '../common/Types';
import { PlatformService } from './PlatformService';

const OCR_SYSCAP: string = 'SystemCapability.AI.OCR.TextRecognition';

export class OcrService {
  /** 运行时能力探测：canIUse 是全局函数（global.d.ts:374） */
  static available(): boolean {
    try {
      return canIUse(OCR_SYSCAP);
    } catch (err) {
      return false;
    }
  }

  static async supportedLanguages(): Promise<string[]> {
    if (!OcrService.available()) {
      return [];
    }
    try {
      return await textRecognition.getSupportedLanguages();
    } catch (err) {
      return [];
    }
  }

  /**
   * 识别 base64 图片中的文字。
   * 注意：TextRecognitionConfiguration 没有语言字段（只有 isDirectionDetectionSupported），
   * 语言由引擎自动判别，lang 参数仅回填结果以便前端记账。
   */
  static async recognize(imageBase64: string, lang: string): Promise<string> {
    const result: OcrResultJson = {
      ok: false,
      text: '',
      lang: lang,
      message: ''
    };
    if (!OcrService.available()) {
      result.message = '本设备不支持系统 OCR：请改用手工录入';
      return JSON.stringify(result);
    }
    if (imageBase64.trim().length === 0) {
      result.message = '图片内容为空';
      return JSON.stringify(result);
    }
    let pixelMap: image.PixelMap | undefined = undefined;
    try {
      const bytes: Uint8Array = new util.Base64Helper().decodeSync(imageBase64);
      const source = image.createImageSource(bytes.buffer as ArrayBuffer);
      // OCR 只接受 RGBA_8888
      pixelMap = await source.createPixelMap({
        editable: false,
        desiredPixelFormat: image.PixelMapFormat.RGBA_8888
      });
      const visionInfo: textRecognition.VisionInfo = {
        pixelMap: pixelMap
      };
      const recognized = await textRecognition.recognizeText(visionInfo);
      result.ok = true;
      result.text = recognized.value;
      result.message = `${recognized.blocks.length} 个文本块`;
    } catch (err) {
      result.ok = false;
      result.message = `OCR 失败: ${JSON.stringify(err)}`;
      PlatformService.log('warn', result.message);
    } finally {
      if (pixelMap !== undefined) {
        try {
          await pixelMap.release();
        } catch (err) {
          // 释放失败不影响结果
        }
      }
    }
    return JSON.stringify(result);
  }
}
