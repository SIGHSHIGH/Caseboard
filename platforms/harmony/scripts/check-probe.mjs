// 校验 Index.ets 里注入的探针 JS 语法（phase=13 那一段）。
// 拼错一个引号 → 运行时整段探针静默不执行，日志里只会「什么也没有」，非常难查。
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const phase = process.argv[3] ?? '13';
const text = readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);

const startIdx = lines.findIndex((line) => line.includes(`' === '${phase}') {`) && line.trim().startsWith('"'));
if (startIdx < 0) {
  console.error(`找不到 phase=${phase} 的注入块`);
  process.exit(2);
}

const chunks = [];
let endIdx = -1;
// 块内允许夹注释行（它们不进注入文本），遇到收尾的 `"    }",` 才算结束
for (let i = startIdx; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('",')) continue;
  // 去掉外层引号与结尾逗号，再把 TS 字面量里的转义还原成真正的 JS 源码
  let body = trimmed.slice(1, -2);
  body = body.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
  chunks.push(body);
  if (body === '    }') {
    endIdx = i + 1;
    break;
  }
}
if (chunks.length === 0) {
  console.error('注入块没有任何字符串行');
  process.exit(2);
}

const js = chunks.join('\n');
try {
  new Function(js);
} catch (error) {
  console.error(`phase=${phase} 注入 JS 语法错误：${error.message}`);
  const linesOfJs = js.split('\n');
  const m = /line (\d+)/.exec(error.message ?? '');
  if (m) {
    const n = Number(m[1]);
    for (let i = Math.max(0, n - 3); i < Math.min(linesOfJs.length, n + 2); i++) {
      console.error(`${i + 1}: ${linesOfJs[i]}`);
    }
  }
  process.exit(1);
}

console.log(`phase=${phase} 注入 JS 语法 ok：${chunks.length} 行 → ${js.length} 字符（Index.ets:${startIdx + 1}..${endIdx}）`);
