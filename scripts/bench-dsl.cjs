/* M3-5 基准：1000 节点文档的「解析 + 画布数据派生」耗时（逻辑链，不含 DOM 渲染）。 */
const path = require('node:path');
const out = path.resolve(__dirname, '..', 'dist-smoke');
const { serializeDoc } = require(path.join(out, 'dsl', 'serialize.js'));
const { parseDsl } = require(path.join(out, 'dsl', 'parse.js'));
const { locateDeclarations } = require(path.join(out, 'dsl', 'locate.js'));
const { diffDocs } = require(path.join(out, 'dsl', 'diff.js'));

const { buildDoc } = require('./fixtures.cjs');

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, value };
}

function bench(count) {
  const doc = buildDoc(count);
  const ser = timed(() => serializeDoc(doc));
  const parsed = timed(() => parseDsl(ser.value));
  const located = timed(() => locateDeclarations(ser.value));
  const diff = timed(() => diffDocs(doc, parsed.value.doc));
  const total = ser.ms + parsed.ms + located.ms;
  return {
    count,
    bytes: ser.value.length,
    nodes: parsed.value.doc.nodes.length,
    edges: parsed.value.doc.edges.length,
    diagnostics: parsed.value.diagnostics.length,
    decls: located.length,
    changes: diff.value.length,
    tSerialize: ser.ms,
    tParse: parsed.ms,
    tLocate: located.ms,
    tDiff: diff.ms,
    total,
  };
}

const LIMIT_MS = 300;
const runs = [1000].map(bench);
let failed = false;
console.log('M3-5 基准（阈值 ' + LIMIT_MS + ' ms = 解析 + 序列化 + 声明定位）');
for (const row of runs) {
  console.log(
    '  节点 ' + row.count +
    ' | ' + (row.bytes / 1024).toFixed(1) + ' KB' +
    ' | 解析 ' + row.tParse.toFixed(1) + ' ms' +
    ' | 序列化 ' + row.tSerialize.toFixed(1) + ' ms' +
    ' | 定位 ' + row.tLocate.toFixed(1) + ' ms' +
    ' | diff ' + row.tDiff.toFixed(1) + ' ms' +
    ' | 合计 ' + row.total.toFixed(1) + ' ms'
  );
  const okShape = row.nodes === row.count && row.edges === row.count - 1 && row.diagnostics === 0 && row.changes === 0;
  const okTime = row.total < LIMIT_MS;
  console.log('  PASS 形状守恒（节点/边/无诊断/无差异）' + (okShape ? '' : ' ← 失败'));
  console.log('  ' + (okTime ? 'PASS' : 'FAIL') + ' 解析链 ' + row.total.toFixed(1) + ' ms < ' + LIMIT_MS + ' ms');
  if (!okShape || !okTime) failed = true;
}
if (failed) {
  console.log('结果：基准未达标');
  process.exit(1);
}
console.log('结果：基准达标');
