// 桌面端自检运行器：连跑两轮真实进程，覆盖「建数据 → 关闭 → 重开看数据还在」。
//
// 三条本机沙箱约束决定了它长这样：
//  1) 管道 stdio 被禁止 → detached spawn + stdio 指向文件描述符；
//  2) WebView2 默认用户数据目录不可写 → WEBVIEW2_USER_DATA_FOLDER 指到工作区内
//     （每次换新目录，避免上次残留进程占用报 HRESULT 0x800700AA）；
//  3) 应用进程只能写工作区 → CASEBOARD_DATA_DIR 指到工作区内
//     （真机双击运行时不需要这两个变量，数据在 %APPDATA%\app.caseboard.desktop）。
//
// 用法：node scripts/run-selftest.cjs            两轮都跑
//       CB_PHASES=2 node scripts/run-selftest.cjs 只跑第二轮（沿用已有数据）
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const exe = path.join(repo, 'src-tauri', 'target', 'release', 'caseboard.exe');
const tmp = path.join(repo, '.tmp-esbuild');
const dataDir = process.env.CB_DATA_DIR || path.join(tmp, 'appdata', 'app.caseboard.desktop');
const reportPath = path.join(dataDir, 'selftest.json');
const debugPath = path.join(dataDir, 'debug.log');
const timeoutMs = Number(process.env.CB_SELFTEST_TIMEOUT || 120000);
const phases = (process.env.CB_PHASES || '1,2').split(',').map((value) => Number(value.trim())).filter((value) => value > 0);

fs.mkdirSync(tmp, { recursive: true });
if (!process.env.CB_PHASES) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
fs.mkdirSync(dataDir, { recursive: true });

function dump() {
  console.log('--- debug.log ---');
  try { console.log(fs.readFileSync(debugPath, 'utf8').slice(-6000)); } catch { console.log('(无诊断日志：前端可能根本没执行)'); }
  console.log('--- app log ---');
  const logPath = path.join(tmp, 'selftest-app.log');
  console.log(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-3000) : '(none)');
}

function runPhase(phase) {
  return new Promise((resolve) => {
    try { fs.rmSync(reportPath, { force: true }); } catch {}
    const wv2 = path.join(tmp, 'webview2-' + Date.now());
    fs.mkdirSync(wv2, { recursive: true });
    const logPath = path.join(tmp, 'selftest-phase' + phase + '.log');
    const out = fs.openSync(logPath, 'w');
    const args = ['--selftest'];
    if (phase > 1) args.push('--selftest=' + phase);
    console.log('[phase ' + phase + '] spawn', args.join(' '));
    const child = spawn(exe, args, {
      stdio: ['ignore', out, out],
      detached: true,
      env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: wv2, CASEBOARD_DATA_DIR: dataDir },
    });
    child.unref();
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      if (fs.existsSync(reportPath)) {
        clearInterval(timer);
        const raw = fs.readFileSync(reportPath, 'utf8');
        let report = null;
        try { report = JSON.parse(raw); } catch {}
        const keep = path.join(tmp, 'selftest-phase' + phase + '.json');
        fs.writeFileSync(keep, raw);
        console.log('[phase ' + phase + '] report ' + elapsed + 'ms → ' + keep);
        resolve({ phase, ok: report ? report.ok === true : false, report, raw });
        return;
      }
      let alive = true;
      try { process.kill(child.pid, 0); } catch { alive = false; }
      if (!alive && elapsed > 3000) {
        clearInterval(timer);
        console.log('[phase ' + phase + '] 进程退出但没有报告', elapsed);
        dump();
        resolve({ phase, ok: false, report: null, raw: '' });
        return;
      }
      if (elapsed > timeoutMs) {
        clearInterval(timer);
        console.log('[phase ' + phase + '] 超时', elapsed);
        dump();
        try { child.kill(); } catch {}
        resolve({ phase, ok: false, report: null, raw: '' });
      }
    }, 500);
  });
}

function printReport(result) {
  const report = result.report;
  if (!report) {
    console.log('[phase ' + result.phase + '] 没有报告');
    return;
  }
  console.log('=== 第 ' + result.phase + ' 轮 · ' + (report.ok ? 'PASS' : 'FAIL') + ' · ' + report.checks.length + ' 项 ===');
  for (const check of report.checks) {
    console.log((check.ok ? '  ✓ ' : '  ✗ ') + check.name + ' — ' + check.detail);
  }
  if (report.externalRequests && report.externalRequests.length) {
    console.log('  外呼：' + report.externalRequests.join(' '));
  }
}

(async () => {
  console.log('EXE', fs.existsSync(exe), exe);
  console.log('DATA', dataDir);
  const results = [];
  for (const phase of phases) {
    const result = await runPhase(phase);
    results.push(result);
    printReport(result);
  }
  const failed = results.filter((result) => !result.ok);
  console.log('SUMMARY', results.map((result) => 'phase' + result.phase + '=' + (result.ok ? 'PASS' : 'FAIL')).join(' '));
  process.exit(failed.length ? 3 : 0);
})();
