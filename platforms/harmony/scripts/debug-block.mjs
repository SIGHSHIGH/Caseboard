// 抽块调试：打印起止行与最后几行
import fs from 'node:fs';

const file = process.argv[2];
const phase = process.argv[3] ?? '15';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const startIdx = lines.findIndex((line) => line.includes(`' === '${phase}') {`));
const isQuoted = (line) => {
  const trimmed = line.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('",');
};
const meaningful = (from) => {
  for (let i = from; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    return trimmed;
  }
  return '';
};
const chunks = [];
for (let i = startIdx + 1; i < lines.length; i++) {
  if (!isQuoted(lines[i])) continue;
  let body = lines[i].trim().slice(1, -2);
  body = body.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
  chunks.push(body);
  if (body === '    }') {
    const next = meaningful(i + 1);
    console.log('候选收尾 at', i + 1, '下一行有效内容:', JSON.stringify(next).slice(0, 60));
    if (next.indexOf("' === '") >= 0 || next === '"  }",') {
      console.log('收尾判定：命中', i + 1);
      break;
    }
    console.log('收尾判定：内部嵌套，继续');
  }
}
console.log('chunks', chunks.length);
console.log('最后三行:', chunks.slice(-3));
