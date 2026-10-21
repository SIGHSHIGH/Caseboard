/**
 * 文件能力：对应桌面 src/services/file.ts 的 FileService。
 * 保存/选择器全部走 @ohos.file.picker + @ohos.file.fs，不依赖 Web 的 input/download。
 */
import { picker } from '@kit.CoreFileKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { AppContext } from '../common/AppContext';
import { PickedFileJson } from '../common/Types';
import { PlatformService } from './PlatformService';

export class FileService {
  private static baseName(uri: string): string {
    const clean = uri.split('?')[0];
    const segs = clean.split('/');
    return segs.length === 0 ? uri : segs[segs.length - 1];
  }

  /**
   * 保存 base64 内容到用户选择的位置。
   * suffixChoicesJson 形如 ["文档|.txt,.md"]，为空则不限制后缀。
   * 用户取消返回空串。
   */
  static async saveFile(fileName: string, mimeType: string, base64: string,
    suffixChoicesJson: string): Promise<string> {
    const viewPicker = new picker.DocumentViewPicker(AppContext.getContext());
    const options = new picker.DocumentSaveOptions();
    options.newFileNames = [fileName];
    const choices = suffixChoicesJson.trim();
    if (choices.length > 0) {
      options.fileSuffixChoices = JSON.parse(choices) as string[];
    }
    const uris: string[] = await viewPicker.save(options);
    if (uris.length === 0) {
      return '';
    }
    const target = uris[0];
    const bytes: Uint8Array = new util.Base64Helper().decodeSync(base64);
    const file = fs.openSync(target, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, bytes.buffer as ArrayBuffer);
    } finally {
      fs.closeSync(file);
    }
    PlatformService.log('info', `[file] save ${fileName} -> ${target} (${bytes.length}B, ${mimeType})`);
    return target;
  }

  /** 选择文件，返回 [{name,uri,size}] 的 JSON */
  static async openFile(suffixesJson: string, multiple: boolean): Promise<string> {
    const viewPicker = new picker.DocumentViewPicker(AppContext.getContext());
    const options = new picker.DocumentSelectOptions();
    const suffixes = suffixesJson.trim();
    if (suffixes.length > 0) {
      options.fileSuffixFilters = JSON.parse(suffixes) as string[];
    }
    options.maxSelectNumber = multiple ? 20 : 1;
    const uris: string[] = await viewPicker.select(options);
    const picked: PickedFileJson[] = [];
    for (const uri of uris) {
      let size = 0;
      try {
        size = fs.statSync(uri).size;
      } catch (err) {
        size = 0;
      }
      picked.push({
        name: FileService.baseName(uri),
        uri: uri,
        size: size
      });
    }
    return JSON.stringify(picked);
  }

  /** 读取用户选中的文件内容为 base64 */
  static readPickedFile(uri: string): string {
    if (uri.trim().length === 0) {
      return '';
    }
    const stat = fs.statSync(uri);
    const buf = new ArrayBuffer(stat.size);
    const file = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    try {
      fs.readSync(file.fd, buf);
    } finally {
      fs.closeSync(file);
    }
    return new util.Base64Helper().encodeToStringSync(new Uint8Array(buf));
  }

  /** 选图片（H0 用文档选择器加图片后缀过滤，H2 再换 PhotoViewPicker） */
  static async pickImages(multiple: boolean): Promise<string> {
    return FileService.openFile('["图片|.png,.jpg,.jpeg,.webp,.bmp"]', multiple);
  }
}
