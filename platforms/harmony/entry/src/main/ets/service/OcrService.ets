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
/** OCR 输入长边上限：超过就等比缩小，避免大图直接把引擎喂到 1001400001 */
const OCR_MAX_EDGE: number = 1600;

export class OcrService {
  /** init 只做一次：失败也记住，别每次识别都重试一遍拖慢交互 */
  private static initPromise: Promise<boolean> | undefined = undefined;

  private static ensureInit(): Promise<boolean> {
    if (OcrService.initPromise === undefined) {
      OcrService.initPromise = textRecognition.init().catch((err: Object) => {
        PlatformService.log('warn', `[ocr] init 失败：${JSON.stringify(err)}`);
        return false;
      });
    }
    return OcrService.initPromise;
  }

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
   *
   * canIUse 只用来给前端做「有没有这个能力」的快速判断，**不拿它当调用前的硬闸**：
   * 实测模拟器上 canIUse('SystemCapability.AI.OCR.TextRecognition') 返回 false，
   * 但原因可能是引擎没起、也可能是机型画像里没写；只有真调一次才知道到底是哪种，
   * 而用户需要看到的是确切原因（801 不支持 / 引擎初始化失败 / …），不是一句「不支持」。
   */
  static async recognize(imageBase64: string, lang: string): Promise<string> {
    const result: OcrResultJson = {
      ok: false,
      text: '',
      lang: lang,
      message: ''
    };
    const syscapOk = OcrService.available();
    if (imageBase64.trim().length === 0) {
      result.message = '图片内容为空';
      return JSON.stringify(result);
    }
    let pixelMap: image.PixelMap | undefined = undefined;
    try {
      // init() 是 5.0.0(12) 才有的显式初始化。不调也能跑在某些机型上，
      // 但模拟器上实测直接 recognizeText 会报 1001400001（Failed to run OCR），先 init 一次更稳。
      await OcrService.ensureInit();
      const bytes: Uint8Array = new util.Base64Helper().decodeSync(imageBase64);
      const source = image.createImageSource(bytes.buffer as ArrayBuffer);
      const info = await source.getImageInfo();
      // 大图先缩：OCR 引擎对输入尺寸敏感，手机拍的 4000px 长边直接喂进去容易 1001400001。
      // 长边压到 1600 以内，按比例缩放，保持宽高比。
      const longEdge = Math.max(info.size.width, info.size.height);
      const decodeOptions: image.DecodingOptions = {
        editable: false,
        desiredPixelFormat: image.PixelMapFormat.RGBA_8888
      };
      if (longEdge > OCR_MAX_EDGE) {
        const ratio = OCR_MAX_EDGE / longEdge;
        decodeOptions.desiredSize = {
          width: Math.round(info.size.width * ratio),
          height: Math.round(info.size.height * ratio)
        };
      }
      // OCR 只接受 RGBA_8888
      pixelMap = await source.createPixelMap(decodeOptions);
      const visionInfo: textRecognition.VisionInfo = {
        pixelMap: pixelMap
      };
      const recognized = await textRecognition.recognizeText(visionInfo);
      result.ok = true;
      result.text = recognized.value;
      result.message = `${recognized.blocks.length} 个文本块`;
    } catch (err) {
      result.ok = false;
      const detail = JSON.stringify(err);
      result.message = syscapOk
        ? `OCR 失败: ${detail}`
        : `本设备没有系统 OCR 能力（canIUse=false）：${detail}`;
      PlatformService.log('warn', `[ocr] ${result.message}`);
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
