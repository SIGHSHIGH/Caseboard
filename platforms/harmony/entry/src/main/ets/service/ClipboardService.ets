/**
 * 剪贴板：对应桌面 src/services/clipboard。
 *
 * 权限说明（实测 PermissionDefinitions.json，881 条中查得）：
 *  - ohos.permission.READ_PASTEBOARD 是 grantMode:user_grant、availableLevel:**system_basic**，
 *    since API 11。普通应用（APL normal）声明不了，硬写进 module.json5 会因等级不匹配出问题。
 *  - 所以「读」不声明权限，直接调用；系统会在需要时弹授权/返回错误。
 *    任何异常都吞掉返回空串，让前端降级为手工粘贴 —— 绝不让用户看到红色报错。
 */
import { pasteboard } from '@kit.BasicServicesKit';
import { PlatformService } from './PlatformService';

export class ClipboardService {
  static async copyText(text: string): Promise<void> {
    const data = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text);
    await pasteboard.getSystemPasteboard().setData(data);
  }

  static async pasteText(): Promise<string> {
    try {
      const system = pasteboard.getSystemPasteboard();
      const data = await system.getData();
      if (data.getRecordCount() === 0) {
        return '';
      }
      return data.getPrimaryText();
    } catch (err) {
      PlatformService.log('warn', `[clip] 读取剪贴板失败: ${JSON.stringify(err)}`);
      return '';
    }
  }

  /** 探测剪贴板是否可读（system_basic 权限拿不到时必然 false） */
  static async available(): Promise<boolean> {
    try {
      await pasteboard.getSystemPasteboard().getData();
      return true;
    } catch (err) {
      PlatformService.log('warn', `[clip] paste 不可用: ${JSON.stringify(err)}`);
      return false;
    }
  }
}
