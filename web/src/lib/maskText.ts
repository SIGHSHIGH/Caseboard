/**
 * 文本级脱敏（M8 验收：脱敏导出全链路复核）。
 * 只处理三类高敏号码，保持可读的业务上下文：身份证号、手机号、银行卡号。
 * 与图片马赛克（src/lib/redact.ts）互补：一个改像素，一个改文本。
 */

/** 身份证号：保留前 6 位（地区）与后 4 位，中间 8 位打码。 */
export function maskIdCard(text: string): string {
  return text.replace(/(^|\D)(\d{6})(\d{8})(\d{3}[\dXx])(?!\d)/g, (_all, lead: string, head: string, _middle: string, tail: string) => lead + head + '********' + tail);
}

/** 手机号：保留前 3 后 4（138****8000）。 */
export function maskPhone(text: string): string {
  return text.replace(/(^|\D)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g, (_all, lead: string, head: string, _middle: string, tail: string) => lead + head + '****' + tail);
}

/** 银行卡号：16–19 位连续数字，保留前 4 后 4（6222 **** **** 1234）。 */
export function maskBankCard(text: string): string {
  return text.replace(/(^|\D)(\d{4})(\d{8,11})(\d{4})(?!\d)/g, (_all, lead: string, head: string, middle: string, tail: string) => {
    const groups = Math.max(1, Math.ceil(middle.length / 4));
    const stars = new Array(groups).fill('****').join(' ');
    return lead + head + ' ' + stars + ' ' + tail;
  });
}

/** 依次抹掉身份证、手机、银行卡；已打码的片段不会重复处理。 */
export function maskText(text: string): string {
  if (!text) return '';
  return maskBankCard(maskPhone(maskIdCard(text)));
}
