// 把 phase22.js 的每一行塞进 Index.ets 的 phase=22 注入块（替换旧块）。
// 用法：node splice-phase22.mjs <Index.ets> <phase22.js>
import fs from 'node:fs';

const target = process.argv[2];
const source = process.argv[3];
if (!target || !source) {
  console.error('用法：node splice-phase22.mjs <Index.ets> <phase22.js>');
  process.exit(2);
}

const ets = fs.readFileSync(target, 'utf8').split('\n');
const js = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n').split('\n');

const startMarker = `"    if ('" + phase + "' === '22') {",`;
const start = ets.findIndex((line) => line.includes(startMarker));
if (start < 0) {
  console.error('没找到 phase=22 块起点');
  process.exit(1);
}
// 块终点：收尾行后紧接 `"  }",` 与 `"}catch(e)..."`（注入 JS 内部也有恰好 4 空格的 }，不能只看单行）
let end = -1;
for (let i = start + 1; i < ets.length - 2; i++) {
  const cur = ets[i].trim();
  const isClose = cur === '"    }",' || cur === '"    }// end-of-phase",';
  const nextOuter = ets[i + 1].trim() === '"  }",';
  const afterOuter = ets[i + 2].trim().indexOf('"}catch(e)') >= 0;
  if (isClose && nextOuter && afterOuter) {
    end = i;
    break;
  }
}
if (end < 0) {
  console.error('没找到 phase=22 块终点');
  process.exit(1);
}

// JS 行 → ArkTS 字符串字面量行（转义反斜杠与双引号）
const esc = (line) => line.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const header = '      "    if (' + "'" + '" + phase + "' + "'" + ' === ' + "'22'" + ') {",';
const out = [header];
for (const line of js) {
  if (line.trim() === '') continue;
  out.push(`      "${esc(line)}",`);
}
out.push('      "    }// end-of-phase",');

const next = [...ets.slice(0, start), ...out, ...ets.slice(end + 1)];
fs.writeFileSync(target, next.join('\n'), 'utf8');
console.log(`phase=22 已替换：${end - start + 1} 行 → ${out.length} 行`);
