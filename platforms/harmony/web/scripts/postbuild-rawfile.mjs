/**
 * ArkWeb 产物收尾（H1）：把 vite 的 dist 变成「能放进 $rawfile 的东西」。
 *
 * 做两件事，都是 `resource://rawfile` 这个非 http 源逼出来的：
 * 1. **剥掉 `crossorigin` 属性**。vite 给 `<script type="module" crossorigin>` 与
 *    `<link ... crossorigin>` 都加了该属性；`resource:` 不是 CORS 协议，带该属性
 *    的 module script 会因「无 CORS 头」被拒，表现为白屏且控制台只有一条
 *    net error。这个属性没有 vite 开关可关，只能构建后处理。
 * 2. **断言相对路径**：`base: './'` 没生效时（有人改回绝对路径），这里直接失败，
 *    不让一个必然白屏的产物被打进 HAP。
 *
 * 另外把产物清单写成 JSON，供 H0 验收 A1/A2 直接读取。
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync } from 'node:fs';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// here = <root>/web/scripts/ ，产物在 <root>/entry/src/main/resources/rawfile
const projectRoot = join(here, '..', '..');
const rawfileDir = join(projectRoot, 'entry', 'src', 'main', 'resources', 'rawfile');

/** 递归列出目录下所有文件（相对路径） */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) out.push(...walk(full));
    else out.push({ full, rel: relative(rawfileDir, full).replace(/\\/g, '/'), size: info.size });
  }
  return out;
}

const problems = [];
const indexPath = join(rawfileDir, 'index.html');
const html = readFileSync(indexPath, 'utf8');

const crossoriginCount = (html.match(/crossorigin/g) ?? []).length;
const patched = html.replace(/\s+crossorigin(=["'][^"']*["'])?/g, '');
writeFileSync(indexPath, patched, 'utf8');

// A2：绝对路径会白屏
const absoluteAttr = patched.match(/(?:src|href)="\/[^"]*"/g) ?? [];
if (absoluteAttr.length > 0) problems.push('index.html 仍有绝对路径：' + absoluteAttr.join(', '));
if (!/src="\.\/assets\//.test(patched)) problems.push('index.html 的入口脚本不是 ./assets/ 相对路径');
if (/(?:src|href)=["']\/assets\//.test(patched)) problems.push('index.html 仍出现 /assets/ 绝对串');

const files = walk(rawfileDir);

// 测试夹具（H4 OCR 验收用）：把 <root>/test-fixtures 拷进 rawfile/test-fixtures。
// 只有 CASEBOARD_TEST_FIXTURES=1 时才拷——发布包里不该带样图。
const fixturesSrc = join(projectRoot, 'test-fixtures');
if (process.env.CASEBOARD_TEST_FIXTURES === '1' && existsSync(fixturesSrc)) {
  const dest = join(rawfileDir, 'test-fixtures');
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(fixturesSrc)) {
    const full = join(fixturesSrc, name);
    if (statSync(full).isFile()) copyFileSync(full, join(dest, name));
  }
}
const bundles = files.filter((file) => file.rel.startsWith('assets/') && file.rel.endsWith('.js'));
if (bundles.length === 0) problems.push('rawfile 下没有 assets/*.js 产物');

const absoluteInBundles = [];
for (const file of bundles) {
  const text = readFileSync(file.full, 'utf8');
  if (text.includes('"/assets/')) absoluteInBundles.push(file.rel);
  // node_modules 里可能带同名字符串，只作提示不作失败
  if (/url\(\s*['"]?\/assets\//.test(text)) absoluteInBundles.push(file.rel + ' (css url)');
}
if (absoluteInBundles.length > 0) problems.push('产物里仍有 /assets/ 绝对引用：' + absoluteInBundles.join(', '));

// public/ocr 必须不存在（Tesseract 已放弃）
const ocrLeftovers = files.filter((file) => /(^|\/)ocr\/|traineddata|tesseract-core-/.test(file.rel));
if (ocrLeftovers.length > 0) problems.push('rawfile 里仍有 Tesseract 资源：' + ocrLeftovers.map((f) => f.rel).join(', '));

const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const mainBundle = bundles.sort((a, b) => b.size - a.size)[0];

const report = {
  ok: problems.length === 0,
  problems,
  rawfileDir,
  fileCount: files.length,
  totalBytes,
  totalMB: Number((totalBytes / 1024 / 1024).toFixed(2)),
  bundleCount: bundles.length,
  mainBundle: mainBundle ? { rel: mainBundle.rel, bytes: mainBundle.size } : null,
  crossoriginRemoved: crossoriginCount,
  indexSha256: createHash('sha256').update(patched).digest('hex').slice(0, 16),
  files: files.map((file) => ({ rel: file.rel, bytes: file.size })),
};

// 报告目录可能不存在（全新 clone 时 .tmp-esbuild 被 .gitignore 忽略），必须先建再写，
// 否则 writeFileSync 报 ENOENT 并让整条验收链在最后一步失败。
const reportDir = join(projectRoot, '.tmp-esbuild');
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, 'rawfile-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ...report, files: undefined }, null, 2));
if (!report.ok) {
  console.error('\n产物不合格，HAP 不应打包。请先修复上面的 problems。');
  process.exit(1);
}
