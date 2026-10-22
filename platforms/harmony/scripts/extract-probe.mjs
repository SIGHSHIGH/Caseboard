// 复刻 check-probe 的抽块逻辑，输出成文件，用于和源 JS 对比
import fs from 'node:fs';

const file = process.argv[2];
const phase = process.argv[3] ?? '22';
const out = process.argv[4] ?? '.tmp-esbuild/extracted.js';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const startIdx = lines.findIndex((line) => line.includes(`' === '${phase}') {`) && line.trim().startsWith('"'));
if (startIdx < 0) {
  console.error('找不到块');
  process.exit(2);
}
const nextMeaningful = (from) => {
  for (let i = from; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;
    return trimmed;
  }
  return '';
};
const chunks = [];
for (let i = startIdx; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('",')) continue;
  let body = trimmed.slice(1, -2);
  body = body.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
  chunks.push(body);
  const isMarker = body.indexOf('// end-of-phase') >= 0;
  const markerNear = lines.slice(i + 1, i + 26).some((line) => line.indexOf('// end-of-phase') >= 0);
  const next = nextMeaningful(i + 1);
  const isLegacyEnd = !markerNear && body === '    }' && (next.indexOf("' === '") >= 0 || next === '"  }",');
  if (isMarker || isLegacyEnd) break;
}
fs.writeFileSync(out, chunks.join('\n'), 'utf8');
console.log(`抽取 ${chunks.length} 行 → ${out}`);
