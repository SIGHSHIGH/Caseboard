// 诊断用：抽出 phase 注入块，统计花括号平衡并定位首次不平衡的行
import fs from 'node:fs';

const file = process.argv[2];
const phase = process.argv[3] ?? '22';
const lines = fs.readFileSync(file, 'utf8').split('\n');

let inBlock = false;
const js = [];
const rowsRaw = lines;
for (let i = 0; i < rowsRaw.length; i++) {
  const m = /^\s*"(.*)",?\s*$/.exec(rowsRaw[i]);
  if (!m) continue;
  const s = m[1];
  if (!inBlock) {
    if (s.includes(`=== '${phase}'`)) inBlock = true;
    continue;
  }
  const nextLine = rowsRaw[i + 1] ?? '';
  if (s.indexOf('// end-of-phase') >= 0 || (s === '    }' && nextLine.trim() === '"  }",')) break;
  js.push(s);
}

const src = js.map((line) => line.replace(/\\\\/g, '\\').replace(/\\"/g, '"')).join('\n');
let balance = 0;
let paren = 0;
const rows = src.split('\n');
rows.forEach((line, index) => {
  for (const ch of line) {
    if (ch === '{') balance += 1;
    if (ch === '}') balance -= 1;
    if (ch === '(') paren += 1;
    if (ch === ')') paren -= 1;
  }
  if (index === rows.length - 1) console.log('最后一行:', JSON.stringify(line), 'brace=', balance, 'paren=', paren);
});
console.log('行数', rows.length, 'brace 平衡', balance, 'paren 平衡', paren);
try {
  // 只编译不执行
  new Function(src);
  console.log('语法 ok');
} catch (error) {
  const text = String(error);
  console.log('语法错误:', text);
}
