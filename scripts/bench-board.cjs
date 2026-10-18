/* M3-5 画布回归：把大文档塞进自动存档，确认画布能把它们全部渲染出来。
   jsdom 没有布局与合成器，等连线稳定的耗时由伪布局回调驱动（300 节点约 8–9 秒），
   因此本脚本只做「能渲染、数量对得上」的回归，不作为性能门禁；性能门禁见 bench-dsl.cjs。 */
const { createHarness, loadAppBundle } = require('./jsdom-harness.cjs');
const { buildDoc } = require('./fixtures.cjs');

const COUNT = Number(process.env.CB_BENCH_NODES || 300);
const LIMIT_MS = 8000;

const { window } = createHarness();
window.localStorage.setItem('caseboard-autosave', JSON.stringify(buildDoc(COUNT)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const started = Date.now();
  await loadAppBundle();
  const mountMs = Date.now() - started;

  const doc = window.document;
  const deadline = Date.now() + 60000;
  let nodes = doc.querySelectorAll('.cb-node').length;
  let edges = doc.querySelectorAll('.react-flow__edge').length;
  while ((nodes < COUNT || edges < COUNT - 1) && Date.now() < deadline) {
    await sleep(50);
    nodes = doc.querySelectorAll('.cb-node').length;
    edges = doc.querySelectorAll('.react-flow__edge').length;
  }
  const totalMs = Date.now() - started;

  console.log('M3-5 画布基准（jsdom，' + COUNT + ' 节点）');
  console.log('  挂载耗时 ' + mountMs + ' ms | 连线稳定耗时 ' + totalMs + ' ms（jsdom 伪布局，仅参考）');
  console.log('  渲染节点 ' + nodes + ' | 渲染连线 ' + edges + ' | 上限 ' + LIMIT_MS + ' ms');
  const ok = nodes === COUNT && edges === COUNT - 1;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' 画布渲染出全部 ' + COUNT + ' 节点与 ' + (COUNT - 1) + ' 条连线');
  console.log(ok ? '结果：基准达标' : '结果：基准未达标');
  process.exit(ok ? 0 : 1);
})();
