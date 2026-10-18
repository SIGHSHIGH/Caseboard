/**
 * 文件能力走 service 接口（决策 D3）：M1 用 Web API，M4 换 Tauri dialog/fs，
 * 组件层只依赖本接口，不得直接碰 Blob / a[download]。
 */
export interface PickedFile {
  name: string;
  text: string;
}

export interface FileService {
  downloadText(fileName: string, text: string, mime?: string): void;
  /** 下载二进制（导出带标注的图片、抽页面等） */
  downloadBlob(fileName: string, blob: Blob): void;
  pickTextFile(accept: string): Promise<PickedFile | null>;
  /** 批量选择文件（图片导入向导的入口之一） */
  pickFiles(accept: string, multiple?: boolean): Promise<File[]>;
}

export const fileService: FileService = {
  downloadText(fileName, text, mime = 'application/json;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  },

  downloadBlob(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  },

  async pickTextFile(accept) {
    return new Promise<PickedFile | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        resolve({ name: file.name, text: await file.text() });
      };
      input.click();
    });
  },

  async pickFiles(accept, multiple = true) {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.click();
    });
  },
};
