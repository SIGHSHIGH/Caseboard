// 校验外置探针 JS 文件的语法，并列出可疑行（反斜杠 / 未闭合引号）
import fs from 'node:fs';

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const rows = src.split('\n');

try {
  new Function(src);
  console.log(`ok：${file} ${rows.length} 行`);
} catch (error) {
  console.log(`语法错误：${error.message}`);
  const m = /line (\d+)/.exec(error.message);
  if (m) {
    const n = Number(m[1]);
    for (let i = Math.max(0, n - 2); i < Math.min(rows.length, n + 1); i++) {
      console.log(`  ${i + 1}: ${rows[i]}`);
    }
  }
}

rows.forEach((line, index) => {
  if (line.includes('\\')) {
    console.log(`含反斜杠 ${index + 1}: ${line.slice(0, 90)}`);
  }
});
