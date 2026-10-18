// 开发通道自检：起 vite dev + tauri dev，验证 devUrl 加载与 HMR 事件，并留下 pid 供清理。
// 本机 node 是 Electron shim，沙箱禁止带管道 stdio 的子进程，因此一律 spawn + 文件描述符重定向。
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const WS = path.resolve(__dirname, '..');
const TMP = path.join(WS, '.tmp-esbuild');
fs.mkdirSync(TMP, { recursive: true });

const ELECTRON = process.execPath;
const env = Object.assign({}, process.env, {
  ELECTRON_RUN_AS_NODE: '1',
  TMP: TMP,
  TEMP: TMP,
  CARGO_HOME: path.join(WS, '.rust', 'cargo'),
  RUSTUP_HOME: path.join(WS, '.rust', 'rustup'),
  PATH: path.join(WS, '.rust', 'cargo', 'bin') + ';' + (process.env.PATH || ''),
  WEBVIEW2_USER_DATA_FOLDER: path.join(TMP, 'webview2-dev-' + Date.now()),
  CASEBOARD_DATA_DIR: path.join(TMP, 'dev-data'),
});

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function openLog(name) {
  const file = path.join(TMP, name);
  return { fd: fs.openSync(file, 'w'), file: file };
}
function readTail(file, n) {
  try { return fs.readFileSync(file, 'utf8').slice(-(n || 4000)); } catch (e) { return ''; }
}

const pids = [];

async function main() {
  const viteLog = openLog('vite-dev.log');
  const vite = spawn(ELECTRON, [path.join(WS, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5273', '--strictPort'], {
    cwd: WS, env: env, detached: true, stdio: ['ignore', viteLog.fd, viteLog.fd]
  });
  vite.unref();
  pids.push(vite.pid);
  console.log('vite pid ' + vite.pid);

  let up = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:5273/', { signal: AbortSignal.timeout(2000) });
      if (res.ok) { up = true; break; }
    } catch (e) { /* 还在启动 */ }
    await sleep(1000);
  }
  console.log('vite ready ' + up);
  if (!up) { console.log('VITE_ERR ' + readTail(viteLog.file, 1500)); return; }

  const tauriLog = openLog('tauri-dev.log');
  const tauri = spawn(ELECTRON, [path.join(WS, 'scripts', 'tauri-cli.cjs'), 'dev'], {
    cwd: WS, env: env, detached: true, stdio: ['ignore', tauriLog.fd, tauriLog.fd]
  });
  tauri.unref();
  pids.push(tauri.pid);
  console.log('tauri dev pid ' + tauri.pid);

  let ready = false;
  let failure = '';
  const RUNNING = /Running .*caseboard\.exe/;
  for (let i = 0; i < 360; i += 1) {
    const txt = readTail(tauriLog.file, 12000);
    if (RUNNING.test(txt)) { ready = true; break; }
    if (txt.indexOf('error: could not compile') >= 0 || txt.indexOf('error[') >= 0) { failure = txt.slice(-1500); break; }
    await sleep(1000);
  }
  console.log('tauri dev ready ' + ready);
  if (failure) console.log('TAURI_ERR ' + failure);

  await sleep(6000);
  const css = path.join(WS, 'src', 'index.css');
  const before = fs.readFileSync(css, 'utf8');
  let hmr = false;
  try {
    fs.writeFileSync(css, before + '\n/* dev-hmr-probe */\n');
    const HMR = /hmr update|page reload/;
    for (let i = 0; i < 25; i += 1) {
      await sleep(800);
      if (HMR.test(readTail(viteLog.file, 8000))) { hmr = true; break; }
    }
  } finally {
    fs.writeFileSync(css, before);
  }
  console.log('hmr detected ' + hmr);
  console.log('VITE_TAIL ' + readTail(viteLog.file, 1000));
  console.log('TAURI_TAIL ' + readTail(tauriLog.file, 700));
  fs.writeFileSync(path.join(TMP, 'dev-pids.json'), JSON.stringify({ pids: pids, vite: vite.pid, tauri: tauri.pid }));
  console.log('PIDS ' + JSON.stringify(pids));
}

main().catch(function (err) {
  console.error('dev-run failed: ' + (err && err.stack ? err.stack : String(err)));
  process.exitCode = 1;
});
