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
  pickTextFile(accept: string): Promise<PickedFile | null>;
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
};
