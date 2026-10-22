// 把一份探针 JS（phase N）整块塞进 Index.ets 的注入数组：
//   已存在 phase=N 的块 → 整块替换；不存在 → 插在最后一个相位块之前。
// 用法：node splice-phase.mjs <Index.ets> <phase.js> <N>
import fs from 'node:fs';

const target = process.argv[2];
const source = process.argv[3];
const phase = process.argv[4];
if (!target || !source || !phase) {
  console.error('用法：node splice-phase.mjs <Index.ets> <phase.js> <N>');
  process.exit(2);
}

const ets = fs.readFileSync(target, 'utf8').split('\n');
const js = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n').split('\n');
const headerOf = (n) => '"    if (\'" + phase + "\' === \'' + n + '\') {",';

// JS 行 → ArkTS 字符串字面量行（转义反斜杠与双引号）
const esc = (line) => line.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const block = [headerOf(phase)];
for (const line of js) {
  if (line.trim() === '') continue;
  block.push(`      "${esc(line)}",`);
}
block.push('      "    }// end-of-phase",');

const header = `      ${headerOf(phase)}`;
let start = ets.findIndex((line) => line.trim() === header.trim());

if (start >= 0) {
  // 优先用显式标记收尾（我们自己写进去的 `"    }// end-of-phase",`），
  // 退回老判据「收尾行 + "  }", + "}catch(e)…"」——后者只在块位于注入数组最后时才成立，
  // 块后面还跟着别的相位时会把后面的块一起吞掉（曾经把 phase 22 整段吃掉）。
  let end = -1;
  for (let i = start + 1; i < ets.length; i++) {
    if (ets[i].trim() === '"    }// end-of-phase",') {
      end = i;
      break;
    }
  }
  if (end < 0) {
    for (let i = start + 1; i < ets.length - 2; i++) {
      const cur = ets[i].trim();
      const isClose = cur === '"    }",';
      if (isClose && ets[i + 1].trim() === '"  }",' && ets[i + 2].trim().indexOf('"}catch(e)') >= 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    console.error(`phase=${phase} 块起点找到但终点没找到`);
    process.exit(1);
  }
  const next = [...ets.slice(0, start), ...block, ...ets.slice(end + 1)];
  fs.writeFileSync(target, next.join('\n'), 'utf8');
  console.log(`phase=${phase} 已整块替换：${end - start + 1} 行 → ${block.length} 行`);
} else {
  // 插到「最后一个相位块」的开头之前，保证各块仍在同一个 try 内
  let anchor = -1;
  for (let i = 0; i < ets.length; i++) {
    if (/^\s*"    if \('/.test(ets[i]) && ets[i].indexOf("' === '") >= 0) anchor = i;
  }
  if (anchor < 0) {
    console.error('没找到任何已有相位块，无法定位插入点');
    process.exit(1);
  }
  const next = [...ets.slice(0, anchor), ...block, ...ets.slice(anchor)];
  fs.writeFileSync(target, next.join('\n'), 'utf8');
  console.log(`phase=${phase} 已插入到第 ${anchor + 1} 行之前：${block.length} 行`);
}
