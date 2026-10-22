// 用外置 markdown 片段替换 CHANGELOG 里一段（从 startHeading 到下一个以 '## ' 开头的行之前）。
// 用法：node splice-changelog.mjs <CHANGELOG.md> <fragment.md> <startHeadingPrefix>
import fs from 'node:fs';

const target = process.argv[2];
const fragment = process.argv[3];
const startPrefix = process.argv[4];
if (!target || !fragment || !startPrefix) {
  console.error('用法：node splice-changelog.mjs <CHANGELOG.md> <fragment.md> <startHeadingPrefix>');
  process.exit(2);
}

const lines = fs.readFileSync(target, 'utf8').split('\n');
const frag = fs.readFileSync(fragment, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');

const start = lines.findIndex((line) => line.startsWith(startPrefix));
if (start < 0) {
  console.error(`没找到起点：${startPrefix}`);
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) {
    end = i;
    break;
  }
}

const next = [...lines.slice(0, start), ...frag, '', ...lines.slice(end)];
fs.writeFileSync(target, next.join('\n'), 'utf8');
console.log(`CHANGELOG 已替换：${end - start} 行 → ${frag.length} 行`);
