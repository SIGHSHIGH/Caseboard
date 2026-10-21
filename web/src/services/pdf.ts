/**
 * PDF 抽页（M2-5）：M2 用 pdf.js（Web）先打通链路，M4 换原生 pdfium（D3）。
 * 只在浏览器运行；组件层通过本服务的接口调用，不直接 import pdfjs。
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  page: number;
  width: number;
  height: number;
  blob: Blob;
  /** 预览用 dataURL（列表缩略显示，不进库） */
  previewUrl: string;
}

export class PdfJob {
  private constructor(
    /** pdfjs v6 的销毁入口挂在 loadingTask 上，PDFDocumentProxy 本身已无 destroy() */
    private readonly task: pdfjs.PDFDocumentLoadingTask,
    private readonly doc: pdfjs.PDFDocumentProxy,
    readonly pageCount: number,
    readonly fileName: string,
  ) {}

  static async open(file: File): Promise<PdfJob> {
    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({ data });
    const doc = await task.promise;
    return new PdfJob(task, doc, doc.numPages, file.name);
  }

  /** 渲染指定页为 PNG；长边上限 maxEdge，避免超大页吃掉内存 */
  async renderPage(pageNumber: number, maxEdge = 1600): Promise<RenderedPage> {
    const page = await this.doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxEdge / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((item) => {
          if (item) resolve(item);
          else reject(new Error(`第 ${pageNumber} 页编码失败`));
        }, 'image/png');
      });
      return {
        page: pageNumber,
        width: canvas.width,
        height: canvas.height,
        blob,
        previewUrl: canvas.toDataURL('image/png'),
      };
    } finally {
      page.cleanup();
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.task.destroy();
    } catch {
      // 文档可能已被 pdfjs 自行释放，关闭时静默忽略
    }
  }
}

export const PDF_ACCEPT = 'application/pdf,.pdf';
