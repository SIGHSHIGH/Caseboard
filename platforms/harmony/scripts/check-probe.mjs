// 校验 Index.ets 里注入的探针 JS 语法。
// 拼错一个引号 → 运行时整段探针静默不执行，日志里只会「什么也没有」，非常难查。
//
// 抽块规则（H5.5 踩过的坑）：
//   1. 有显式标记 `// end-of-phase`（splice-phase22.mjs 写的）就认标记，且标记必须出现在下一个相位块头之前；
//   2. 老相位没有标记，退回「`    }` 之后（跳过注释行）紧跟下一相位块头或 try 收尾 `"  }",`」。
//   只看单行 `    }` 会误判——注入 JS 内部也有恰好 `    }` + `  }` 的嵌套收尾。
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

const isQuoted = (line) => {
  const trimmed = line.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('",');
};
const meaningful = (from) => {
  for (let i = from; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    return { index: i, text: trimmed };
  }
  return { index: -1, text: '' };
};

const markerIdx = lines.findIndex((line, i) => i > startIdx && line.indexOf('// end-of-phase') >= 0);
const nextHeader = lines.findIndex((line, i) => i > startIdx && line.trim().startsWith('"') && line.includes("' === '"));
const useMarker = markerIdx >= 0 && (nextHeader < 0 || markerIdx < nextHeader);

const chunks = [];
let endIdx = -1;
for (let i = startIdx; i < lines.length; i++) {
  if (useMarker && i > markerIdx) break;
  if (!isQuoted(lines[i])) continue;
  let body = lines[i].trim().slice(1, -2);
  body = body.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
  chunks.push(body);
  const isMarker = body.indexOf('// end-of-phase') >= 0;
  if (isMarker) {
    endIdx = i + 1;
    break;
  }
  if (!useMarker) {
    const next = meaningful(i + 1).text;
    const isLegacyEnd = body === '    }' && (next.indexOf("' === '") >= 0 || next === '"  }",');
    if (isLegacyEnd) {
      endIdx = i + 1;
      break;
    }
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
