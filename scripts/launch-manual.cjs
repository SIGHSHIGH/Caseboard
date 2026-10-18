// 人工验收窗口启动器：脱离沙箱进程独立运行 release exe，把窗口留给用户操作。
// 本机 node 是 Electron shim 且沙箱禁止管道 stdio，因此 stdio 一律指向文件描述符。
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const WS = path.resolve(__dirname, '..');
const TMP = path.join(WS, '.tmp-esbuild');
fs.mkdirSync(TMP, { recursive: true });

const exe = path.join(WS, 'src-tauri', 'target', 'release', 'caseboard.exe');
if (!fs.existsSync(exe)) {
  console.error('找不到 exe：' + exe + '（先跑 node scripts/tauri-cli.cjs build --no-bundle）');
  process.exit(1);
}

const tag = process.argv[2] || 'round2';
const dataDir = path.join(TMP, 'manual-data-' + tag);
const webview = path.join(TMP, 'webview2-manual-' + tag + '-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });

const logPath = path.join(TMP, 'manual-' + tag + '.log');
const fd = fs.openSync(logPath, 'w');
const env = Object.assign({}, process.env, {
  CASEBOARD_DATA_DIR: dataDir,
  WEBVIEW2_USER_DATA_FOLDER: webview,
  TMP: TMP,
  TEMP: TMP,
});
const child = spawn(exe, [], { cwd: WS, env: env, detached: true, stdio: ['ignore', fd, fd] });
child.unref();
console.log('PID ' + child.pid);
console.log('DATA ' + dataDir);
console.log('LOG ' + logPath);
console.log('WEBVIEW2 ' + webview);
