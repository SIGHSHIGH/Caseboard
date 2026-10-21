import type { OcrFields, OcrParseResult } from '../types';

/** OCR 结构化字段（M7-3）：转账截图 / 票据上最值得进模型的三项 + 对方 */
export const OCR_FIELD_LABELS: Record<keyof OcrFields, string> = {
  amount: '金额',
  time: '时间',
  account: '账号',
  counterparty: '对方户名',
};

const FULL_WIDTH_DIGITS = '０１２３４５６７８９';

/** 全角数字/标点夹到半角；金额与账号识别统一走这一层 */
export function normalizeOcrText(input: string): string {
  let out = '';
  for (const ch of input) {
    const digit = FULL_WIDTH_DIGITS.indexOf(ch);
    if (digit >= 0) {
      out += String(digit);
      continue;
    }
    if (ch === '：') out += ':';
    else if (ch === '．') out += '.';
    else if (ch === '，') out += ',';
    else if (ch === '－' || ch === '—' || ch === '–') out += '-';
    else if (ch === '￥') out += '¥';
    else out += ch;
  }
  return out;
}

function pad2(value: string): string {
  return value.length >= 2 ? value : '0' + value;
}

/** 从一段 OCR 文本里抽金额：优先带「金额/转账/收款」标签的，其次 ¥ 前缀 */
export function parseOcrAmount(text: string): string | null {
  text = normalizeOcrText(text);
  const labeled = text.match(/(?:金额|转账金额|交易金额|汇?款金额|收款金额|付款金额|转账|汇款|收款|付款)[: \t]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)[ \t]*(万元|万|元)?/);
  const raw = labeled ?? text.match(/(?:¥|RMB|人民币)[: \t]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!raw) return null;
  const numberText = raw[1].replace(/,/g, '');
  const unit = raw[2] ?? '';
  let value = Number(numberText);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === '万元' || unit === '万') value = Math.round(value * 10000);
  return String(Math.round(value * 100) / 100);
}

/** 抽时间：支持「2026年9月4日 9时12分」「2026-09-04 09:12」「2026/9/4」等写法 */
export function parseOcrTime(text: string): string | null {
  text = normalizeOcrText(text);
  const match = text.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?(?:[ \tT]*(\d{1,2})[:时](\d{1,2})分?)?/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  if (hour > 23 || minute > 59) return null;
  return match[1] + '-' + pad2(String(month)) + '-' + pad2(String(day)) + 'T' + pad2(String(hour)) + ':' + pad2(String(minute)) + ':00';
}

/** 抽账号：先找「账号/卡号」标签，再退回 16–19 位连续数字 */
export function parseOcrAccount(text: string): string | null {
  text = normalizeOcrText(text);
  const labeled = text.match(/(?:账号|帐号|卡号|账户|转入账号|收款账号)[: \t]*([0-9][0-9 \-]{10,30}[0-9])/);
  const candidate = labeled ? labeled[1] : (text.match(/(?<![0-9])([0-9]{16,19})(?![0-9])/) ?? [])[1];
  if (!candidate) return null;
  const digits = candidate.replace(/[^0-9]/g, '');
  if (digits.length < 16 || digits.length > 19) return null;
  return digits;
}

/** 抽对方户名：标签优先，避免把「转账成功」这类词当成户名 */
export function parseOcrCounterparty(text: string): string | null {
  text = normalizeOcrText(text);
  const match = text.match(/(?:收款方|收款人|对方户名|对方账户名|户名|对方)[: \t]*([\u4e00-\u9fffA-Za-z0-9（）()]{2,24})/);
  if (!match) return null;
  const name = match[1].replace(/[（）()]/g, '').trim();
  if (name.length < 2) return null;
  if (/^(账户|账号|卡号|信息|名称)$/.test(name)) return null;
  return name;
}

/** 账号只显示前四后四，避免截图里的完整卡号泄露到界面 */
export function maskAccount(account: string): string {
  if (account.length <= 8) return account;
  return account.slice(0, 4) + ' **** **** ' + account.slice(-4);
}

/**
 * 确定性 OCR 字段解析：只做结构化，不做识别本身。
 * 识别来源可以是 Tesseract 侧车，也可以是人工抄录/修正后的文本，两者走同一解析器。
 */
export function parseOcrText(input: string): OcrParseResult {
  const text = normalizeOcrText(input || '');
  const fields: OcrFields = {};
  const amount = parseOcrAmount(text);
  if (amount) fields.amount = amount;
  const time = parseOcrTime(text);
  if (time) fields.time = time;
  const account = parseOcrAccount(text);
  if (account) fields.account = account;
  const counterparty = parseOcrCounterparty(text);
  if (counterparty) fields.counterparty = counterparty;
  const missing = (Object.keys(OCR_FIELD_LABELS) as (keyof OcrFields)[]).filter((key) => fields[key] === undefined).map((key) => OCR_FIELD_LABELS[key]);
  const found = 4 - missing.length;
  const confidence = Math.max(0, Math.min(96, 40 + found * 14));
  return { fields, missing, confidence, text };
}

/** 字段转成节点 fields：钱与账号原样保留，不做单位改写（规格 P4 红线） */
export function receiptToNodeFields(result: OcrParseResult): Record<string, string> {
  const fields: Record<string, string> = {};
  if (result.fields.amount !== undefined) fields['金额'] = result.fields.amount + ' 元';
  if (result.fields.time !== undefined) fields['交易时间'] = result.fields.time;
  if (result.fields.account !== undefined) fields['账号'] = result.fields.account;
  if (result.fields.counterparty !== undefined) fields['对方户名'] = result.fields.counterparty;
  return fields;
}

/** 给界面用的一行摘要 */
export function ocrSummary(result: OcrParseResult): string {
  const parts: string[] = [];
  if (result.fields.amount !== undefined) parts.push('金额 ' + result.fields.amount + ' 元');
  if (result.fields.time !== undefined) parts.push('时间 ' + result.fields.time.slice(0, 16).replace('T', ' '));
  if (result.fields.account !== undefined) parts.push('账号 ' + maskAccount(result.fields.account));
  if (result.fields.counterparty !== undefined) parts.push('对方 ' + result.fields.counterparty);
  return parts.length > 0 ? parts.join(' · ') : '未识别到结构化字段';
}
