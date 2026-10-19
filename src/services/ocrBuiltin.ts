import { createWorker, OEM, type Worker } from 'tesseract.js';
import { isTauri, readFileBytes } from './platform';

/**
 * 内置 OCR 引擎（M10）：把 Tesseract 的 WASM 内核与中文语言包**打包进本项目**，
 * 装完就有识别能力，不再要求用户另装 tesseract.exe。
 *
 * 资源放在 `public/ocr/`（Vite 原样拷进 dist，Tauri 再内嵌进 exe）：
 *   - `worker.min.js`                tesseract.js 的识别 worker
 *   - `core/tesseract-core-*.wasm.js` 三种 SIMD 变体（WebView2 按 CPU 能力自己挑）
 *   - `lang/{chi_sim,eng}.traineddata.gz` 语言包（best_int 精简版）
 *
 * 全部走同源相对路径：桌面端页面由 `http://tauri.localhost` 提供，`new Worker('/ocr/...')`
 * 与 `fetch('/ocr/...')` 都能直接拿到，离线可用、不发任何外部请求。
 * 系统里另装了 tesseract.exe 时仍优先用它（更快），见 `src/services/ocr.ts`。
 */

export const OCR_BUNDLED_PATHS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/core',
  langPath: '/ocr/lang',
} as const;

/** 内置语言包：简体中文 + 英文（票据/流水里常有英文与数字） */
export const OCR_BUNDLED_LANGS = ['chi_sim', 'eng'] as const;

export interface BuiltinOcrProgress {
  stage: string;
  progress: number;
}

export type BuiltinOcrStatus =
  | { ready: true; engine: 'bundled'; langs: string[] }
  | { ready: false; engine: 'bundled'; reason: string };

let workerPromise: Promise<Worker> | null = null;
let workerRef: Worker | null = null;

function statusText(stage: string): string {
  if (stage === 'loading tesseract core') return '载入识别内核';
  if (stage === 'initializing tesseract') return '初始化引擎';
  if (stage === 'loading language traineddata' || stage.startsWith('loading language')) return '载入语言包';
  if (stage === 'initialized api') return '准备就绪';
  if (stage === 'recognizing text') return '识别文字';
  return stage;
}

async function ensureWorker(onProgress?: (value: BuiltinOcrProgress) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker([...OCR_BUNDLED_LANGS], OEM.LSTM_ONLY, {
      ...OCR_BUNDLED_PATHS,
      // WebView2 里 blob worker 会被自定义协议绕晕，直接用同源脚本路径
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
      logger: (message: { status?: string; progress?: number }) => {
        if (!onProgress || typeof message.status !== 'string') return;
        const progress = typeof message.progress === 'number' ? message.progress : 0;
        onProgress({ stage: statusText(message.status), progress });
      },
    }).then((worker) => {
      workerRef = worker;
      return worker;
    });
    // 初始化失败要让下一次重试能重新来（而不是永远复用 rejected promise）
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** 内置引擎是否可用：只有桌面端（Tauri）才有文件读取能力 */
export function builtinOcrStatus(): BuiltinOcrStatus {
  if (!isTauri()) {
    return { ready: false, engine: 'bundled', reason: '内置 OCR 只在桌面端可用（浏览器里读不到本机原件）' };
  }
  return { ready: true, engine: 'bundled', langs: [...OCR_BUNDLED_LANGS] };
}

/** 预先载入内核与语言包（导入图片后自动 OCR 时可以并行预热，避免用户干等） */
export async function warmupBuiltinOcr(onProgress?: (value: BuiltinOcrProgress) => void): Promise<void> {
  if (!isTauri()) return;
  await ensureWorker(onProgress);
}

/**
 * 用内置引擎识别一张素材原件。
 * 直接把文件字节交给 tesseract（不走 URL），因此不受自定义协议与相对路径限制。
 */
export async function recognizeWithBuiltin(
  path: string,
  onProgress?: (value: BuiltinOcrProgress) => void,
): Promise<string> {
  if (!isTauri()) throw new Error('内置 OCR 只在桌面端可用');
  if (!path) throw new Error('素材没有本机路径，无法识别');
  const worker = await ensureWorker(onProgress);
  const bytes = await readFileBytes(path);
  if (bytes.length === 0) throw new Error('原件读取为空，无法识别');
  const result = await worker.recognize(bytes);
  return (result.data?.text ?? '').trim();
}

/** 释放 worker（切换案件 / 关闭面板时调用，避免一直占着内存与句柄） */
export async function disposeBuiltinOcr(): Promise<void> {
  const worker = workerRef;
  workerRef = null;
  workerPromise = null;
  if (!worker) return;
  try {
    await worker.terminate();
  } catch {
    // 关不掉也不影响后续：下次会新建一个
  }
}
