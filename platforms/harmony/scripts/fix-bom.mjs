/**
 * 给 .ps1 补 UTF-8 BOM。
 *
 * 为什么必须：Windows PowerShell 5.1 读无 BOM 的脚本时按 ANSI(GBK) 解码，
 * 脚本里的中文注释与文案会被解成乱码字节，连带把 `'` `"` 吃掉，
 * 于是报一堆假语法错（"字符串缺少终止符" / "意外的标记 }"），而 pwsh 7 不会。
 * `write`/`edit` 保存文件时都不写 BOM，所以每次改完 .ps1 都要跑这个。
 *
 * 用法：node scripts/fix-bom.mjs <文件…>（不给参数就修本目录下所有 .ps1）
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const targets = args.length > 0
  ? args.map((p) => resolve(p))
  : readdirSync(here).filter((f) => f.endsWith('.ps1')).map((f) => join(here, f));

for (const file of targets) {
  const text = readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    console.log(`BOM ok      ${file}`);
    continue;
  }
  writeFileSync(file, '\uFEFF' + text, 'utf8');
  console.log(`BOM added   ${file}`);
}
